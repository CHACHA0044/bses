import path from 'path';

/**
 * Registry of every logical backend service that the supervisor launches as an
 * isolated child process within a single Render Web Service.
 *
 * Adding a new logical service (6, 7, 8, ...) later requires only:
 *   1. Adding an entry here (name, compiled entrypoint, loopback port, cwd).
 *   2. Adding a proxy row + the corresponding service runtime in the gateway
 *      proxy table (already structured to accept additional upstreams).
 *   3. Re-deploying the SAME Render web service.
 */
export interface ServiceSpec {
  /** Unique logical name. Used in logs, health reporting, and env var naming. */
  name: string;
  /**
   * Compiled entrypoint (JS) relative to the monorepo root that is forked.
   * Each package builds its `src/server.ts` to `dist/server.js` via `tsc`.
   */
  entry: string;
  /** Loopback port this service binds (127.0.0.1 only — never public). */
  port: number;
  /**
   * Working directory for the child. Important because document-service's OCR
   * resolves `assets/eng.traineddata.gz` relative to process.cwd(), and each
   * service resolves its `.env`/config relative to its own folder.
   */
  cwd: string;
  /**
   * The gateway is the only child bound to the public Render port
   * (process.env.PORT) on 0.0.0.0. All other services must bind strictly to
   * 127.0.0.1.
   */
  isGateway: boolean;
}

const repoRoot = path.resolve(__dirname, '../../..');

const loopback = (port: number): string => `http://127.0.0.1:${port}`;

/** Default specs, with ports overridable via INTERNAL_PORT_<NAME> env vars. */
export const getServices = (env: NodeJS.ProcessEnv = process.env): ServiceSpec[] => {
  const specs: ServiceSpec[] = [
    {
      name: 'gateway',
      entry: path.join('apps', 'gateway', 'dist', 'server.js'),
      port: 3000,
      cwd: path.join(repoRoot, 'apps', 'gateway'),
      isGateway: true,
    },
    {
      name: 'auth',
      entry: path.join('services', 'auth-service', 'dist', 'server.js'),
      port: 3010,
      cwd: path.join(repoRoot, 'services', 'auth-service'),
      isGateway: false,
    },
    {
      name: 'consumer',
      entry: path.join('services', 'consumer-service', 'dist', 'server.js'),
      port: 3011,
      cwd: path.join(repoRoot, 'services', 'consumer-service'),
      isGateway: false,
    },
    {
      name: 'document',
      entry: path.join('services', 'document-service', 'dist', 'server.js'),
      port: 3012,
      cwd: path.join(repoRoot, 'services', 'document-service'),
      isGateway: false,
    },
    {
      name: 'notification',
      entry: path.join('services', 'notification-service', 'dist', 'server.js'),
      port: 3013,
      cwd: path.join(repoRoot, 'services', 'notification-service'),
      isGateway: false,
    },
  ];

  return specs.map((spec) => {
    const key = `INTERNAL_PORT_${spec.name.toUpperCase()}`;
    const raw = env[key];
    if (spec.isGateway) {
      // The gateway is the public entry: it must bind Render's injected PORT
      // (0.0.0.0) when present, falling back to its spec port (3000) locally.
      const publicPort = env['PORT'];
      const port =
        publicPort && Number.isFinite(Number(publicPort)) && Number(publicPort) > 0
          ? Number(publicPort)
          : spec.port;
      return { ...spec, port };
    }
    if (raw && Number.isFinite(Number(raw))) {
      return { ...spec, port: Number(raw) };
    }
    return spec;
  });
};

/**
 * The gateway is the only public entry. In supervisor mode its upstream
 * `*_SERVICE_URL` vars MUST point at the loopback ports of the in-process child
 * services — they are never external URLs. The public `PORT` env (Render) is
 * passed through unchanged so the gateway binds 0.0.0.0:PORT.
 */
export const buildGatewayEnv = (
  env: NodeJS.ProcessEnv,
  services: ServiceSpec[],
): NodeJS.ProcessEnv => {
  const envFor = new Map(services.map((s) => [s.name, s]));
  const gateway = envFor.get('gateway');

  return {
    ...env,
    PORT: gateway?.port ? (env['PORT'] ?? String(gateway.port)) : env['PORT'],
    AUTH_SERVICE_URL: services.find((s) => s.name === 'auth')
      ? loopback(services.find((s) => s.name === 'auth')!.port)
      : env['AUTH_SERVICE_URL'],
    CONSUMER_SERVICE_URL: services.find((s) => s.name === 'consumer')
      ? loopback(services.find((s) => s.name === 'consumer')!.port)
      : env['CONSUMER_SERVICE_URL'],
    DOCUMENT_SERVICE_URL: services.find((s) => s.name === 'document')
      ? loopback(services.find((s) => s.name === 'document')!.port)
      : env['DOCUMENT_SERVICE_URL'],
    NOTIFICATION_SERVICE_URL: services.find((s) => s.name === 'notification')
      ? loopback(services.find((s) => s.name === 'notification')!.port)
      : env['NOTIFICATION_SERVICE_URL'],
  };
};

/** Loopback health URL for a given service port. */
export const healthUrl = (port: number): string => loopback(port) + '/health';

/**
 * Builds the environment for a NON-gateway child: it must bind its private
 * loopback port, not Render's globally-injected PUBLIC `PORT`. Every other env
 * var is inherited so each service validates its own required variables.
 */
export const buildServiceEnv = (
  env: NodeJS.ProcessEnv,
  spec: ServiceSpec,
): NodeJS.ProcessEnv => {
  if (spec.isGateway) return buildGatewayEnv(env, [spec]);
  return {
    ...env,
    PORT: String(spec.port),
  };
};