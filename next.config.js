/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'nft-cdn.alchemy.com' },
      { protocol: 'https', hostname: '*.g.alchemy.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    // Each distinct (url, w, q) triple is a separately billed transformation.
    // Leaving q unrestricted lets one source image be re-optimized 100 times,
    // so pin it to the single quality the app actually renders at.
    qualities: [75],
    // Default is 60s, which lets an attacker re-trigger optimization every
    // minute for the same URL. 31 days keeps optimized output cached instead.
    minimumCacheTTL: 2678400,
  },
  webpack: (config) => {
    // MetaMask SDK requires @react-native-async-storage which doesn't exist in web context
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
  async redirects() {
    return [
      // Collection mint closed; the route was renamed to /booa/gallery.
      // Keep this 301 so external links / bookmarks still resolve.
      { source: '/booa/mint', destination: '/booa/gallery', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              "frame-src 'self' https://challenges.cloudflare.com https:",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
