/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@futuremode/shared'],
  experimental: {
    typedRoutes: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
  },
  // Allow API routes to be hit from non-localhost origins during LAN testing.
  // Production should set this to the real public domain.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.10.44',
    '0.0.0.0',
  ],
};

export default nextConfig;
