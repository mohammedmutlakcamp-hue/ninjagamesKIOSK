/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: async () => 'v10-0-2-' + Date.now(),
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

module.exports = nextConfig;
