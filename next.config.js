/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['replicate.com', 'replicate.delivery'],
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
  },
}

module.exports = nextConfig