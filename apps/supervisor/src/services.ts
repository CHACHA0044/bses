import path from 'path';

/**
 * Registry of every logical backend service that the supervisor launches as an
 * isolated child process within a single Render Web Service.
 *
 * NOTE: The auth, consumer, and notification services run INSIDE a single
 * merged process (`merged`) to stay inside the free-tier 512 MB budget. The
 * merged process binds three loopback ports (INSIDE_PORT_AUTH/CONSUMER/
 * NOTIFICATION) on 127.0.0.1 — one per embedded app — while sharing a single
 * Prisma client / pg Pool. document stays isolated (OCR is memory-heavy) and
 * gateway is the only public entry.
 */
export interface ServiceSpec {
  /** Unique logical name. Used in logs, health reporting, and env var naming. */
  name: string;
  /**
   * Compiled entrypoint (JS) relative to the monorepo root that is forked.
   * Each package builds its `src/server.ts` to `dist/server.js` via `tsc`.
   */
  entry: string;
  /** Primary loopback port used for readiness / health checks. */
  port: number;
  /**
   * Additional loopback ports the same child process binds (merged services).
   * Present so port collision validation and gateway env can reach every app.
   */
  ports?: number[];
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

const toPort = (raw: string | undefined, fallback: number): number =>
  raw && Number.isFinite(Number(raw)) ? Number(raw) : fallback;

/**
 * Default specs, with ports overridable via INTERNAL_PORT_<NAME> env vars.
 * `merged` aggregates the auth (3010), consumer (3011), and notification (3013)
 * apps into one process but still exposes each embedded app on its own port so
 * the gateway proxy table and internal `*_SERVICE_URL` values remain unchanged.
 */
export const getServices = (env: NodeJS.ProcessEnv = process.env): ServiceSpec[] => {
  const authPort = toPort(env['INTERNAL_PORT_AUTH'], 3010);
  const consumerPort = toPort(env['INTERNAL_PORT_CONSUMER'], 3011);
  const notificationPort = toPort(env['INTERNAL_PORT_NOTIFICATION'], 3013);
  const documentPort = toPort(env['INTERNAL_PORT_DOCUMENT'], 3012);

  const specs: ServiceSpec[] = [
    {
      name: 'gateway',
      entry: path.join('apps', 'gateway', 'dist', 'server.js'),
      port: 3000,
      cwd: path.join(repoRoot, 'apps', 'gateway'),
      isGateway: true,
    },
    {
      name: 'merged',
      entry: path.join('services', 'merged-service', 'dist', 'server.js'),
      port: authPort,
      ports: [authPort, consumerPort, notificationPort],
      cwd: path.join(repoRoot, 'services', 'merged-service'),
      isGateway: false,
    },
    {
      name: 'document',
      entry: path.join('services', 'document-service', 'dist', 'server.js'),
      port: documentPort,
      cwd: path.join(repoRoot, 'services', 'document-service'),
      isGateway: false,
    },
  ];

  return specs.map((spec) => {
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
  const merged = envFor.get('merged');
  const document = envFor.get('document');

  const mergedPorts = merged ? merged.ports ?? [merged.port] : [];

  return {
    ...env,
    PORT: gateway?.port ? (env['PORT'] ?? String(gateway.port)) : env['PORT'],
    AUTH_SERVICE_URL: merged
      ? loopback(mergedPorts[0] ?? merged.port)
      : env['AUTH_SERVICE_URL'],
    CONSUMER_SERVICE_URL: merged
      ? loopback(mergedPorts[1] ?? merged.port)
      : env['CONSUMER_SERVICE_URL'],
    NOTIFICATION_SERVICE_URL: merged
      ? loopback(mergedPorts[2] ?? merged.port)
      : env['NOTIFICATION_SERVICE_URL'],
    DOCUMENT_SERVICE_URL: document
      ? loopback(documentPort(services, env))
      : env['DOCUMENT_SERVICE_URL'],
  };
};

/** Loopback health URL for a given service port. */
export const healthUrl = (port: number): string => loopback(port) + '/health';

/**
 * Builds the environment for a NON-gateway child: it must bind its private
 * loopback port, not Render's globally-injected PUBLIC `PORT`. Every other env
 * var is inherited so each service validates its own required variables.
 *
 * Note: for a merged service the primary `PORT` is the first embedded app's
 * port; the embedded apps are reached through INTERNAL_PORT_AUTH/CONSUMER/
 * NOTIFICATION which are already part of the inherited environment.
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

// Internal helper to keep the document upstream aligned with inherited overrides.
function documentPort(services: ServiceSpec[], env: NodeJS.ProcessEnv): number {
  const document = services.find((s) => s.name === 'document');
  if (document) return document.port;
  return toPort(env['INTERNAL_PORT_DOCUMENT'], 3012);
}