/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source rather than a build output,
  // so Next compiles them with the app. One less build step between an edit
  // to the catalogue and seeing it on screen.
  transpilePackages: ['@streamwise/core', '@streamwise/server'],
  // Provider artwork is proxied through /api/image so that we never make the
  // browser talk to an arbitrary (often plain-HTTP) provider host directly.
  images: { unoptimized: true },
  experimental: {
    // Playlists can be tens of megabytes when uploaded as a file.
    serverActions: { bodySizeLimit: '64mb' },
  },
};

export default nextConfig;
