import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET || (isProd ? '' : 'dev-only-secret-change-me');
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dishpatch',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Comma separated list of allowed browser origins (used for both CORS and Socket.IO)
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  demoPassword: {
    customer: process.env.DEMO_CUSTOMER_PASSWORD || 'Customer@123',
    owner: process.env.DEMO_OWNER_PASSWORD || 'Owner@12345',
    rider: process.env.DEMO_RIDER_PASSWORD || 'Rider@12345',
  },
};
