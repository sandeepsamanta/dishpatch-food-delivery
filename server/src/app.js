import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import api from './routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct client IPs behind Render/Heroku-style proxies
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / curl (no Origin header) and configured browser origins.
        if (!origin || env.clientUrls.includes(origin)) return cb(null, true);
        cb(null, false);
      },
    })
  );
  app.use(express.json({ limit: '100kb' }));
  if (env.nodeEnv !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
