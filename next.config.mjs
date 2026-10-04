/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.1.100', '192.168.1.*'],
  /* config options here */
  reactCompiler: true,
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
