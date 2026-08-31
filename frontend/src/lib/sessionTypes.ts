/**
 * Shared types for the server-resolved session (RSC) → client seed handoff.
 *
 * Deliberately free of any `next/headers` / server-only imports so both the
 * server helpers (`lib/server.ts`) and the client `SessionProvider` can import
 * these types without polluting the client bundle.
 */

export interface ServerUser {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  email: string;
  username: string;
  mobile?: string;
  caNumber?: string;
  meterNumber?: string;
  role: 'CONSUMER' | 'ADMIN' | 'SUPER_ADMIN';
  status: string;
}

export type ServerSession =
  /** Resolved on the server from the auth-service — safe to seed the client. */
  | { status: 'authenticated'; user: ServerUser }
  /** No auth cookies at all — confirmed guest, no network needed. */
  | { status: 'unauthenticated' }
  /**
   * Cookies present but the server could not validate (network blip, gateway
   * down, expired access token). The client MUST resolve this itself so the
   * refresh interceptor gets a chance — never seed from an unknown session.
   */
  | { status: 'unknown' };
