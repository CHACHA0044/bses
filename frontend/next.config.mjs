/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Bundle-optimize large icon/lib imports: individual named imports get
  // their own chunks instead of the whole package (cuts first-load JS).
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // The catch-all API proxy lives at `src/app/api/[...path]/route.ts` and
  // forwards `/api/*` to the gateway server-side while preserving
  // cookies both ways. We deliberately do NOT use rewrites() here because
  // Next.js rewrites silently strip Set-Cookie / Cookie headers, which
  // would still leave the user with a session the middleware can't see.
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
