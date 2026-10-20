import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is required for database connection
const connectionString = process.env.DATABASE_URL!;

/** Hosts that serve no TLS: the local Supabase CLI stack and a compose-internal Postgres. */
const LOCAL_DATABASE_HOSTS = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|db)[:/]/;

/**
 * TLS is forced here in code, not in the connection string, because three defaults line
 * up to produce a silently plaintext connection: Supabase does not enforce SSL on the
 * direct/pooler connection, postgres.js defaults to `ssl: false`, and `?sslmode=require`
 * is not a postgres.js option — an unrecognised search param is forwarded to the server
 * as a connection parameter rather than enabling TLS. An unencrypted connection works
 * fine, so nothing would surface the mistake.
 *
 * `'require'` encrypts but leaves `rejectUnauthorized: false`, defeating passive
 * eavesdropping and not an active man-in-the-middle. `'verify-full'` needs Supabase's CA
 * bundled and checked against a real connection, so it is deliberately not set blind.
 */
const client = postgres(connectionString, {
  ssl: LOCAL_DATABASE_HOSTS.test(connectionString) ? false : 'require',
  // The default prints every notice as multi-line non-JSON: migrations raise one per skipped
  // `IF NOT EXISTS` on each start. Errors still throw.
  onnotice: () => {},
});

export const db = drizzle(client, { schema });
