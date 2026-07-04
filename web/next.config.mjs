/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not use "standalone" on Vercel — it can break API routes (405).
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/icons/moneybag.png',
      },
    ];
  },
};

export default nextConfig;
