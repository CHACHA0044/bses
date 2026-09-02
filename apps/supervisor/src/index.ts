import 'dotenv/config';
import { createLogger } from '@bses/shared';
import { ChildManager, type ServiceStatus } from './child';
import { buildGatewayEnv, buildServiceEnv, getServices, type ServiceSpec } from './services';

const logger = createLogger({ service: 'supervisor' });

interface SupervisorOptions {
  healthProbePort?: number;
}

/**
 * The BSES Backend Supervisor.
 *
 * Runs every logical backend service as an isolated Node child process inside a
 * SINGLE Render Web Service. Only the gateway child binds the public port
 * (process.env.PORT, 0.0.0.0); all other services bind 127.0.0.1 loopback
 * ports and are reachable only through the gateway's HTTP proxy.
 *
 * Responsibilities:
 *   - Fork each child with the right cwd + env.
 *   - Verify readiness via loopback /health instead of relying on a magic delay.
 *   - Detect crashes and restart ONLY the affected service (exponential backoff,
 *     crash-loop protection).
 *   - Forward child stdout/stderr into the supervisor's own logs (prefixed).
 *   - Graceful shutdown (SIGTERM/SIGINT) of all children.
 */
class Supervisor {
  public readonly children: ChildManager[] = [];

  private shuttingDown = false;
  private startedAt = Date.now();

  public async start(): Promise<void> {
    const env = process.env;
    const services = getServices(env);

    // Guard against internal port collisions (public PORT vs loopback ports).
    this.validatePorts(services, env['PORT']);

    logger.info('[STARTUP] BSES Backend supervisor starting', {
      node: process.version,
      env: env['NODE_ENV'] ?? 'development',
      publicPort: env['PORT'] ?? 'not-set (uses gateway default 3000)',
      services: services.map((s) => ({ name: s.name, port: s.port, isGateway: s.isGateway })),
    });

    const gatewayEnv = buildGatewayEnv(env, services);
    const nonGatewaySpecs = services.filter((s) => !s.isGateway);
    const gatewaySpec = services.find((s) => s.isGateway);

    const readyPromises: Promise<void>[] = [];

    // Launch internal microservices (auth, consumer, document, notification) first
    for (const spec of nonGatewaySpecs) {
      let resolveReady: () => void;
      const readyPromise = new Promise<void>((res) => {
        resolveReady = res;
      });
      readyPromises.push(readyPromise);

      const manager = new ChildManager({
        spec,
        env: buildServiceEnv(env, spec),
        onReady: (name) => {
          logger.info(`[STARTUP] ${name} service initialized`);
          resolveReady();
        },
        onStateChange: () => this.pushStatusToGateway(),
        onMessage: (pid, message) => this.handleGatewayRequest(pid, message),
      });
      this.children.push(manager);
      manager.start();
    }

    // Wait until internal microservices are ready (or up to 30s timeout) before launching Gateway
    logger.info('[STARTUP] Initializing internal microservices before launching public Gateway...');
    await Promise.race([
      Promise.all(readyPromises),
      new Promise<void>((res) => setTimeout(res, 30_000)),
    ]);

    if (gatewaySpec) {
      logger.info('[STARTUP] Internal microservices ready. Launching public Gateway...');
      const manager = new ChildManager({
        spec: gatewaySpec,
        env: gatewayEnv,
        onReady: (name) => logger.info(`[STARTUP] ${name} service initialized`),
        onStateChange: () => this.pushStatusToGateway(),
        onMessage: (pid, message) => this.handleGatewayRequest(pid, message),
      });
      this.children.push(manager);
      manager.start();
    }

    this.installSignalHandlers();
    this.installHeartbeat();
  }

  /** Periodically re-syncs status to the gateway so /health/services stays current. */
  private installHeartbeat(): void {
    const heartbeat = setInterval(() => {
      if (this.shuttingDown) return;
      this.pushStatusToGateway();
    }, 15_000);
    heartbeat.unref();
  }

  /**
   * Replies to an explicit status request from the gateway child (used on the
   * gateway's first health check before any push/state-change has occurred).
   */
  public handleGatewayRequest(childId: number, message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const msg = message as { type?: string };
    if (msg.type !== 'GATEWAY_REQUESTS_STATUS') return;
    const child = this.children.find((c) => c.getChild()?.pid === childId);
    if (!child) return;
    try {
      child.getChild()?.send({ type: 'SUPERVISOR_STATUS', payload: this.getHealthOverview() });
    } catch {
      /* channel closing */
    }
  }

  /**
   * Sends the current aggregated health overview to the gateway child over IPC
   * so its public /health/services endpoint can surface supervisor + per-service
   * status without opening any additional ports.
   */
  private pushStatusToGateway(): void {
    const gateway = this.children.find((c) => c.status.name === 'gateway');
    const child = gateway?.getChild();
    if (!child) return;
    try {
      child.send({ type: 'SUPERVISOR_STATUS', payload: this.getHealthOverview() });
    } catch {
      // IPC channel may not be open yet or is closing; the gateway falls back
      // to live-upstream probing when no supervisor status has been received.
    }
  }

  private validatePorts(services: ServiceSpec[], publicPortRaw: string | undefined): void {
    const publicPort = publicPortRaw ? Number(publicPortRaw) : undefined;
    // Only non-gateway (loopback) ports participate in collision checks.
    // The gateway's own port IS the public port — it can never collide with itself.
    const internalPorts = services.filter((s) => !s.isGateway).map((s) => s.port);
    if (publicPort && Number.isFinite(publicPort)) {
      const conflict = internalPorts.find((p) => p === publicPort);
      if (conflict) {
        logger.error(
          `[STARTUP] Public port (${publicPort}) collides with an internal service port (${conflict}). Configure a different PORT or INTERNAL_PORT_* values and redeploy.`,
        );
        process.exit(1);
      }
    }
    const seen = new Set<number>();
    for (const p of internalPorts) {
      if (seen.has(p)) {
        logger.error(`[STARTUP] Duplicate internal port ${p} assigned to multiple services. Configure INTERNAL_PORT_* values.`);
        process.exit(1);
      }
      seen.add(p);
    }
  }

  private installSignalHandlers(): void {
    const shutdown = (signal: string): void => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      logger.info(`[SHUTDOWN] ${signal} received — gracefully stopping all services`);

      for (const child of this.children) {
        child.shutdown();
      }

      // Allow children a grace period to exit cleanly, then force-exit the
      // supervisor regardless of stragglers so Render sees a clean stop.
      setTimeout(() => {
        logger.info('[SHUTDOWN] supervisor exiting');
        process.exit(0);
      }, 12_000);
      setTimeout(() => {
        logger.warn('[SHUTDOWN] forcing exit after grace period');
        process.exit(0);
      }, 15_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /** Aggregated health status for the gateway's /health/services endpoint. */
  public getHealthOverview(): {
    supervisor: { pid: number; uptimeSeconds: number; state: string };
    services: ServiceStatus[];
  } {
    return {
      supervisor: {
        pid: process.pid,
        uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
        state: this.shuttingDown ? 'stopping' : 'running',
      },
      services: this.children.map((c) => c.status),
    };
  }
}

const supervisor = new Supervisor();

supervisor.start().catch((err: unknown) => {
  logger.error('[STARTUP] Supervisor failed to start', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});