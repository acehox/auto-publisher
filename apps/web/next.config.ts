import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // Self-contained server bundle for the Docker image. Tracing must start at
  // the monorepo root or the `@ap/*` workspace packages are left out.
  output: 'standalone',
  outputFileTracingRoot: path.join(here, '../..'),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/help',
        destination: '/how-it-works',
        permanent: true,
      },
    ];
  },
  experimental: {
    // Client Router Cache reuse for dynamic routes (default 0 = refetch every
    // navigation). 60s makes returning to an already-opened guild instant with
    // no server hop, per-browser so there is no cross-user exposure. Mutations
    // call router.refresh() which busts this cache, so edits still reflect
    // immediately; the invite-return refresh (useRefreshOnReturn) keeps the
    // guild list fresh.
    staleTimes: {
      dynamic: 60,
    },
  },
};

// Plugins are named as strings, not imported: Turbopack runs the MDX pipeline in
// Rust and cannot receive JS functions. Options must stay serializable.
// remark-gfm for tables (the imprint block is one); rehype-slug for heading ids,
// which the cross-references between documents depend on.
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: ['rehype-slug'],
  },
});

export default withMDX(nextConfig);
