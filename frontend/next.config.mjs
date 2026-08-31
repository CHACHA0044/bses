/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Bundle-optimize large icon/lib imports: individual named imports get
  // their own chunks instead of the whole package (cuts first-load JS).
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // NEXT_PUBLIC_API_URL already ends with '/api' (e.g. http://localhost:3000/api),
        // so appending '/:path*' avoids the double '/api/api/...' produced by
        // concatenating the old '/api/:path*' suffix.
        destination: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api') + '/:path*',
      },
    ];
  },
};

export default nextConfig;
