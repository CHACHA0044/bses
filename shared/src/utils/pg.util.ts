/**
 * Postgres connection-string helpers.
 *
 * `pg-connection-string` v2 emits a deprecation warning whenever a connection
 * string contains `sslmode` (except `sslmode=verify-full`). Our PrismaPg
 * clients always set TLS explicitly via the `ssl` config option, so the
 * `sslmode` query parameter is redundant. Removing it silences the one-time
 * startup warning while preserving the exact same TLS behavior
 * (`ssl: { rejectUnauthorized: false }`).
 */
export const withPgSslMode = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    if (url.searchParams.has('sslmode')) {
      url.searchParams.delete('sslmode');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};