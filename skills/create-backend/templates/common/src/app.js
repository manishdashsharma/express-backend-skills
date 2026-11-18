import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import config from './config/index.js';
import { logger, errorHandler, notFoundHandler, globalLimiter } from './shared/index.js';
import router from './router/index.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || config.cors.origins.includes(origin)),
  credentials: true,
}));
app.use(globalLimiter);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const startedAt = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      durationMs: Date.now() - startedAt,
      requestId: req.requestId,
    });
  });
  next();
});

app.use(`/${config.apiVersion}`, router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
