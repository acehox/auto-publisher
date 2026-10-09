// Imported first so the repo-root env file is loaded into `process.env` before
// Auth.js reads AUTH_SECRET itself. The whole monorepo shares one env file and
// one validated schema — the web app has no env file of its own.
import { env } from '@ap/config';
import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      issuer: 'https://discord.com',
      authorization: { params: { scope: 'identify guilds' } },
    }),
  ],
  // The dashboard always runs behind a reverse proxy in Docker with
  // NODE_ENV=production, where Auth.js otherwise refuses to infer its own URL
  // and throws `UntrustedHost`. Setting it here rather than via AUTH_TRUST_HOST
  // keeps it off the self-hoster's env surface entirely — Auth.js documents the
  // config flag as the equivalent, and names Docker as the case for it. Safe
  // because Discord rejects any redirect_uri outside the registered allowlist.
  trustHost: true,
  pages: {
    error: '/dashboard',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 3, // 3 days
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile?.id) {
        token.id = profile.id;
      }
      if (profile?.username) {
        token.username = profile.username as string;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.username = token.username as string;
      return session;
    },
  },
});
