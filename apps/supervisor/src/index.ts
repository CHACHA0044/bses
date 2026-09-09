import 'dotenv/config';
import { createLogger, getMemorySnapshot } from '@bses/shared';
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
 */
class Supervisor {
  public readonly children: ChildManager[] = [];

  private shuttingDown = false;
  private startedAt = Date.now();

  public async start(): Promise<void> {
    const env = process.env;
    const services = getServices(env);

    this.validatePorts(services, env['PORT']);

    const portStr = env['PORT'] ?? '3000';
    const envStr = env['NODE_ENV'] ?? 'development';

    logger.info('🚀 BSES Backend starting');
    logger.info(`🔧 Environment: ${envStr}`);
    logger.info(`🌐 Gateway port: ${portStr}`);

    const gatewayEnv = buildGatewayEnv(env, services);
    const nonGatewaySpecs = services.filter((s) => !s.isGateway);
    const gatewaySpec = services.find((s) => s.isGateway);

    const readyPromises: Promise<void>[] = [];

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
          logger.info(`✅ ${name} ready`);
          resolveReady();
        },
        onStateChange: () => this.pushStatusToGateway(),
        onMessage: (pid, message) => this.handleGatewayRequest(pid, message),
      });
      this.children.push(manager);
      manager.start();
    }

    logger.info('🧩 Starting internal services...');
    await Promise.race([
      Promise.all(readyPromises),
      new Promise<void>((res) => setTimeout(res, 30_000)),
    ]);

    if (gatewaySpec) {
      logger.info('🌐 Launching gateway...');
      const manager = new ChildManager({
        spec: gatewaySpec,
        env: gatewayEnv,
        onReady: (name) => logger.info(`✅ ${name} ready`),
        onStateChange: () => this.pushStatusToGateway(),
        onMessage: (pid, message) => this.handleGatewayRequest(pid, message),
      });
      this.children.push(manager);
      manager.start();
    }

    this.installSignalHandlers();
    this.installHeartbeat();
  }

  private installHeartbeat(): void {
    const heartbeat = setInterval(() => {
      if (this.shuttingDown) return;
      this.pushStatusToGateway();
      this.logCombinedMemory();
    }, 15_000);
    heartbeat.unref();
  }

  /**
   * Compact memory log: 🧠 Memory | total=316MB | supervisor=57MB | merged=179MB | gateway=80MB
   * Escalates to ⚠️/🚨 at high usage thresholds.
   */
  private logCombinedMemory(): void {
    const ext = process.memoryUsage();
    const childRssMb = this.children.reduce((total, c) => {
      const rss = c.getRssBytes();
      return rss > 0 ? total + rss : total;
    }, 0);
    const superRssMb = Math.round((ext.rss / 1024 / 1024) * 10) / 10;
    const childRssTotalMb = Math.round((childRssMb / 1024 / 1024) * 10) / 10;
    const totalMb = Math.round((superRssMb + childRssTotalMb) * 10) / 10;

    const childParts = this.children
      .filter((c) => c.getRssBytes() > 0)
      .map((c) => `${c.status.name}=${Math.max(0, Math.round((c.getRssBytes() / 1024 / 1024) * 10) / 10)}MB`)
      .join(' | ');

    const parts = [`total=${totalMb}MB`, `supervisor=${superRssMb}MB`];
    if (childParts) parts.push(childParts);

    const usageRatio = totalMb / 512;
    if (usageRatio >= 0.95) {
      logger.error(`🚨 Memory critical | ${parts.join(' | ')} | cap=512MB`);
    } else if (usageRatio >= 0.85) {
      logger.warn(`⚠️ Memory high | ${parts.join(' | ')} | cap=512MB`);
    } else {
      logger.info(`🧠 Memory | ${parts.join(' | ')}`);
    }
  }

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

  private pushStatusToGateway(): void {
    const gateway = this.children.find((c) => c.status.name === 'gateway');
    const child = gateway?.getChild();
    if (!child) return;
    try {
      child.send({ type: 'SUPERVISOR_STATUS', payload: this.getHealthOverview() });
    } catch {
      /* IPC channel may not be open yet */
    }
  }

  private validatePorts(services: ServiceSpec[], publicPortRaw: string | undefined): void {
    const publicPort = publicPortRaw ? Number(publicPortRaw) : undefined;
    const internalPorts = services
      .filter((s) => !s.isGateway)
      .flatMap((s) => (s.ports && s.ports.length > 0 ? s.ports : [s.port]));
    if (publicPort && Number.isFinite(publicPort)) {
      const conflict = internalPorts.find((p) => p === publicPort);
      if (conflict) {
        logger.error(`❌ Port conflict | public=${publicPort} collides with internal=${conflict}`);
        process.exit(1);
      }
    }
    const seen = new Set<number>();
    for (const p of internalPorts) {
      if (seen.has(p)) {
        logger.error(`❌ Duplicate internal port ${p}`);
        process.exit(1);
      }
      seen.add(p);
    }
  }

  private installSignalHandlers(): void {
    const logSignal = (signal: string): void => {
      logger.info(`📡 ${signal} received — keeping all services running 24/7`);
    };

    process.on('SIGTERM', () => logSignal('SIGTERM'));
    process.on('SIGINT', () => logSignal('SIGINT'));
  }

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
  logger.error(`❌ Supervisor failed to start | error=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});