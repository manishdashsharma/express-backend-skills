import 'dotenv/config';

const toInt = (value, fallback) => parseInt(value, 10) || fallback;
const toList = (value) => (value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  appName: process.env.APP_NAME || 'App',
  port: toInt(process.env.PORT, 5000),
  apiVersion: process.env.API_VERSION || 'v1',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  database: {
    url: process.env.DATABASE_URL,
    readUrl: process.env.DATABASE_READ_URL,
    poolMax: toInt(process.env.DATABASE_POOL_MAX, 10),
  },

  mongo: {
    uri: process.env.MONGODB_URI,
    maxPoolSize: 10,
  },

  redis: {
    urls: toList(process.env.REDIS_URLS),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  session: {
    refreshReuseGraceMs: 10000,
  },

  cookie: {
    refreshName: process.env.REFRESH_COOKIE_NAME || 'rt',
    path: '/v1/auth',
    secure: env === 'production',
    sameSite: 'strict',
    maxAgeMs: toInt(process.env.REFRESH_COOKIE_MAX_AGE_MS, 604800000),
  },

  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== undefined
      ? process.env.RATE_LIMIT_ENABLED === 'true'
      : env !== 'development',
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxRequests: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 300),
    authWindowMs: toInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 900000),
    authMaxRequests: toInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10),
    writeMaxRequests: toInt(process.env.RATE_LIMIT_WRITE_MAX_REQUESTS, 60),
    readMaxRequests: toInt(process.env.RATE_LIMIT_READ_MAX_REQUESTS, 240),
    aiWindowMs: toInt(process.env.RATE_LIMIT_AI_WINDOW_MS, 600000),
    aiMaxRequests: toInt(process.env.RATE_LIMIT_AI_MAX_REQUESTS, 20),
  },

  bcrypt: {
    rounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  },

  cors: {
    origins: toList(process.env.CORS_ORIGIN).length > 0
      ? toList(process.env.CORS_ORIGIN)
      : [process.env.CLIENT_URL || 'http://localhost:5173'],
  },

  ai: {
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    modelPool: toList(process.env.AI_MODEL_POOL),
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
    keyEncryptionSecret: process.env.AI_KEY_ENCRYPTION_SECRET,
    allowPrivateHosts: process.env.ALLOW_PRIVATE_AI_HOSTS === 'true',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = requiredEnvVars.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export default config;
