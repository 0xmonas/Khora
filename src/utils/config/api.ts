export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  ENDPOINTS: {
    GENERATE: '/api/generate',
    GENERATE_IMAGE: '/api/generate-image',
    GENERATE_PROMPT: '/api/generate-prompt',
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
  },
} as const;