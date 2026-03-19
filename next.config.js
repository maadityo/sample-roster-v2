/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Aktifkan instrumentation.ts agar secret bisa di-load saat server start
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

module.exports = nextConfig;
