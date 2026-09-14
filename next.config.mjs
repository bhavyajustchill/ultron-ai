/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.1.100', '192.168.1.*'],
  reactCompiler: true,
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
