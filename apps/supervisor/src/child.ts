import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import http from 'http';
import { createLogger } from '@bses/shared';
import type { ServiceSpec } from './services';
import { healthUrl } from './services';

const logger = createLogger({ service: 'supervisor' });

export type ServiceState =
  | 'starting'
  | 'running'
  | 'restarting'
  | 'stopped';

export interface ServiceStatus {
  name: string;
  state: ServiceState;
  port: number;
  pid: number | null;
  restarts: number;
  lastStartedAt: number | null;
  uptimeSeconds: number | null;
  ready: boolean;
}

interface ChildManagerOptions {
  spec: ServiceSpec;
  /** Env to pass to the child (already patched for the gateway). */
  env: NodeJS.ProcessEnv;
  /** Base URL used to determine readiness (loopback /health). */
  onStateChange?: (status: ServiceStatus) => void;
  /** Called after the child is confirmed ready (called once per start). */
  onReady?: (name: string) => void;
  /** Called with any IPC message the child sends back to the supervisor. */
  onMessage?: (pid: number, message: unknown) => void;
}

const DEFAULT_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const CRASH_LOOP_WINDOW_MS = 5 * 60 * 1000;
const MAX_RESTARTS_IN_WINDOW = 10;
/** Longer pause once the crash-loop limit is hit to stop hammering the system. */
const CRASH_LOOP_PAUSE_MS = 60_000;
const READY_POLL_INTERVAL_MS = 500;
const READY_TIMEOUT_MS = 60_000;
const SHUTDOWN_WAIT_MS = 10_000;

const REASON_NORMAL = 0;

/**
 * Manages one logical service as a forked Node child process. Responsible for
 * spawning, streaming logs to the supervisor output, detecting unready/unhealthy
 * exits, and restarting with exponential backoff + crash-loop protection.
 */
export class ChildManager {
  public readonly status: ServiceStatus;

  private child: ChildProcess | null = null;
  private readonly options: ChildManagerOptions;
  private backoffMs = DEFAULT_BACKOFF_MS;
  private restartTimestamps: number[] = [];
  private shuttingDown = false;
  private readyStartedAt = 0;
  private readyTimer: NodeJS.Timeout | null = null;

  constructor(options: ChildManagerOptions) {
    this.options = options;
    this.status = {
      name: options.spec.name,
      state: 'starting',
      port: options.spec.port,
      pid: null,
      restarts: 0,
      lastStartedAt: null,
      uptimeSeconds: null,
      ready: false,
    };
  }

  public start(): void {
    if (this.shuttingDown) return;
    this.updateState('starting');

    // spec.entry is relative to the monorepo root; resolve to an absolute path
    // because `fork` resolves module paths against the parent process.cwd().
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const entryPath = path.resolve(repoRoot, this.options.spec.entry);

    let child: ChildProcess;
    try {
      child = fork(entryPath, {
        cwd: this.options.spec.cwd,
        env: this.options.env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        serialization: 'advanced',
      });
    } catch (err) {
      logger.error(`[supervisor] failed to fork ${this.options.spec.name}`, {
        error: err instanceof Error ? err.message : String(err),
        entry: entryPath,
        cwd: this.options.spec.cwd,
      });
      this.scheduleRestart('fork-error');
      return;
    }

    this.child = child;
    this.status.pid = child.pid ?? null;
    this.status.lastStartedAt = Date.now();
    this.status.uptimeSeconds = 0;

    logger.info(`[supervisor] ${this.options.spec.name} starting`, {
      pid: child.pid,
      port: this.options.spec.port,
      cwd: this.options.spec.cwd,
      entry: entryPath,
    });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      try {
        const line = chunk.replace(/\r?\n$/, '');
        if (line.trim()) console.log(`[${this.options.spec.name}] ${line}`);
      } catch {
        /* ignore malformed chunk */
      }
    });
    child.stderr?.on('data', (chunk: string) => {
      try {
        const line = chunk.replace(/\r?\n$/, '');
        if (line.trim()) console.error(`[${this.options.spec.name}] ${line}`);
      } catch {
        /* ignore malformed chunk */
      }
    });

    child.on('error', (err) => {
      logger.error(`[supervisor] ${this.options.spec.name} process error`, {
        error: err.message,
      });
    });

    child.on('message', (message: unknown) => {
      this.options.onMessage?.(child.pid ?? 0, message);
    });

    child.on('exit', (code: number | null, signal: string | null) => {
      this.child = null;
      this.status.pid = null;
      this.status.ready = false;
      this.status.uptimeSeconds = null;
      this.clearReadyTimer();

      if (this.shuttingDown) {
        this.updateState('stopped');
        logger.info(`[supervisor] ${this.options.spec.name} exited during shutdown`, {
          code,
          signal,
        });
        return;
      }

      logger.warn(`[supervisor] ${this.options.spec.name} exited`, {
        code,
        signal,
        restarts: this.status.restarts,
      });
      this.scheduleRestart(`exit:${code ?? signal ?? 'unknown'}`);
    });

    this.watchForReady();
  }

  private watchForReady(): void {
    this.clearReadyTimer();
    this.readyStartedAt = Date.now();
    this.readyTimer = setInterval(async () => {
      if (this.shuttingDown || !this.child) {
        this.clearReadyTimer();
        return;
      }
      if (await this.isHealthy()) {
        this.clearReadyTimer();
        this.status.ready = true;
        this.backoffMs = DEFAULT_BACKOFF_MS; // reset only after confirmed healthy
        this.updateState('running');
        this.status.uptimeSeconds = 0;
        this.options.onReady?.(this.options.spec.name);
      } else if (Date.now() - this.readyStartedAt > READY_TIMEOUT_MS) {
        // Never became ready within timeout — a hung service. Restart it.
        this.clearReadyTimer();
        logger.error(`[supervisor] ${this.options.spec.name} did not become ready within ${READY_TIMEOUT_MS}ms; restarting`, {
          port: this.options.spec.port,
        });
        this.killChild();
        this.scheduleRestart('ready-timeout');
      }
    }, READY_POLL_INTERVAL_MS);
  }

  private async isHealthy(): Promise<boolean> {
    return new Promise((resolve) => {
      const url = healthUrl(this.options.spec.port);
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.on('error', () => resolve(false));
    });
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearInterval(this.readyTimer);
      this.readyTimer = null;
    }
  }

  private updateState(state: ServiceState): void {
    // Track fresh-start uptime for health reporting.
    if (state === 'running') {
      this.status.uptimeSeconds = 0;
    }
    this.status.state = state;
    this.options.onStateChange?.(this.status);
  }

  /**
   * Sends SIGTERM and terminates with SIGKILL after a grace period if needed.
   * Used during supervisor shutdown and hung-service restart.
   */
  public killChild(): void {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    // Hard-kill fallback in case the child ignores SIGTERM.
    setTimeout(() => {
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, SHUTDOWN_WAIT_MS).unref();
  }

  private scheduleRestart(reason: string): void {
    if (this.shuttingDown) return;
    this.recordRestart();

    if (this.inCrashLoop()) {
      const pause = CRASH_LOOP_PAUSE_MS;
      logger.error(
        `[supervisor] ${this.options.spec.name} exceeded ${MAX_RESTARTS_IN_WINDOW} restarts in ${CRASH_LOOP_WINDOW_MS / 60000}min — pausing for ${pause / 1000}s before next attempt`,
        { reason, restarts: this.status.restarts },
      );
      this.updateState('restarting');
      this.backoffMs = MAX_BACKOFF_MS; // hold at max after crash-loop
      const timer = setTimeout(() => this.start(), pause);
      timer.unref();
      return;
    }

    const backoff = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);

    this.updateState('restarting');
    logger.warn(`[supervisor] ${this.options.spec.name} restart scheduled in ${backoff}ms`, {
      reason,
      backoffMs: backoff,
      restarts: this.status.restarts,
    });

    const timer = setTimeout(() => this.start(), backoff);
    timer.unref();
  }

  private recordRestart(): void {
    const now = Date.now();
    this.restartTimestamps.push(now);
    this.restartTimestamps = this.restartTimestamps.filter(
      (t) => now - t < CRASH_LOOP_WINDOW_MS,
    );
    this.status.restarts = this.restartTimestamps.length;
    if (this.status.uptimeSeconds !== null) this.status.uptimeSeconds = 0;
  }

  private inCrashLoop(): boolean {
    return this.restartTimestamps.length >= MAX_RESTARTS_IN_WINDOW;
  }

  /** Called when the supervisor receives SIGTERM/SIGINT. */
  public shutdown(): void {
    this.shuttingDown = true;
    this.clearReadyTimer();
    this.updateState('stopped');
    if (this.child) {
      logger.info(`[supervisor] shutting down ${this.options.spec.name}`, {
        pid: this.child.pid,
      });
      this.killChild();
    }
  }

  public getChild(): ChildProcess | null {
    return this.child;
  }

  /** True if child is running and confirmed healthy via loopback /health. */
  public isHealthyStatus(): boolean {
    return this.status.state === 'running' && this.status.ready && this.child !== null;
  }
}