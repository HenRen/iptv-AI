/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Provider artwork is proxied through /api/image so that we never make the
  // browser talk to an arbitrary (often plain-HTTP) provider host directly.
  images: { unoptimized: true },
  experimental: {
    // Playlists can be tens of megabytes when uploaded as a file.
    serverActions: { bodySizeLimit: '64mb' },
  },
};

export default nextConfig;
