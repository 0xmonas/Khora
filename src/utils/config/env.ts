export const getEnvVar = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export const ENV = {
  ANTHROPIC_API_KEY: getEnvVar('ANTHROPIC_API_KEY'),
  REPLICATE_API_TOKEN: getEnvVar('REPLICATE_API_TOKEN'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
} as const;