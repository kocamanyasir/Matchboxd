/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "puppeteer-extra",
      "puppeteer-extra-plugin-stealth",
      "puppeteer",
      "clone-deep",
      "merge-deep"
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a.ltrbxd.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's.ltrbxd.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.ltrbxd.com',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
