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
        destination: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') + '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
