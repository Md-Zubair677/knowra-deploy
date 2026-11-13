const dotenv = require('dotenv');

dotenv.config();

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
const defaultClientUrls = [
  'http://localhost:5173',
  'https://ai-powered-personalized-doubt-solvi-puce.vercel.app',
];
const clientUrls = [
  ...new Set([
    ...defaultClientUrls,
    ...(process.env.CLIENT_URL || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
  ]),
];

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  aiServiceUrl: process.env.AI_SERVICE_URL || '',
  aiServiceKey: process.env.AI_SERVICE_KEY || '',
  clientUrls,
};