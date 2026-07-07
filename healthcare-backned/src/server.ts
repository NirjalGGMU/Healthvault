import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import express, { Application, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import connectDB from './config/db';
import logger from './config/logger';
import { globalLimiter } from './middleware/rateLimiter';
import { ipAccessControl } from './middleware/ipAccessControl';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import appointmentRoutes from './routes/appointmentRoutes';
import adminRoutes from './routes/adminRoutes';

const app: Application = express();

//  Security middleware 
app.use(helmet());
// httpOnly cookie auth requires a concrete origin + credentials (wildcard '*' is not allowed)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser()); // parse the httpOnly JWT cookie
app.use(mongoSanitize()); // NoSQL injection prevention
app.use(ipAccessControl); // hard IP block list + allow-list, checked before any rate limiting
app.use(globalLimiter); // Global rate limit: 100 req / 15 min

//  HTTP request logging (Winston) 
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(
      `HTTP ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
      { ip: req.ip }
    );
  });
  next();
});

//  Static file serving (uploaded avatars) 
// Relaxed only for this route: the frontend (different origin/port) needs to
// render these images in <img> tags, which the default same-origin CORP blocks.
app.use(
  '/uploads',
  helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
  express.static(path.join(__dirname, '../uploads'))
);

// ---------- Routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'HealthVault API' });
});

// ---------- 404 handler ----------
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

// ---------- Global error handler ----------
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Multer validation errors (bad file type, too large) are client errors, not 500s
  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err.message === 'Invalid file type: only images are allowed') {
    res.status(400).json({ message: err.message });
    return;
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, {
    stack: err.stack,
  });
  res.status(500).json({ message: 'Internal server error' });
});

//  Startup 
const PORT = parseInt(process.env.PORT || '5000', 10);

const startServer = async (): Promise<void> => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`HealthVault API listening on port ${PORT}`);
  });
};

void startServer();

export default app;