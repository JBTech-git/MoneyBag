/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not use "standalone" on Vercel — it can break API routes (405).
  // Use standalone only for Docker / VPS deploys.
};

export default nextConfig;
