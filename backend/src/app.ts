import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import router from './routes';
import errorHandler from './middlewares/errorHandler';
import { rateLimiter } from './middlewares/rateLimiter';
import { originGuard } from './middlewares/originGuard';
import { sendError } from './utils/apiResponse';
import { config, ResponseCodes, ErrorCodes } from './config/constants';

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

const corsOptions: cors.CorsOptions = {
  // Exactly one allowed origin, never '*' with credentials. Requests with no Origin header
  // (same-origin via the dev proxy, curl, health checks) are not cross-origin, so they pass;
  // any other origin gets no CORS headers at all.
  origin: (origin, callback) => callback(null, !origin || origin === config.clientOrigin),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
};

// Middleware stack — order follows the mern-stack-project skill.
app.use(cors(corsOptions));
app.use(helmet());
app.use(rateLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// CSRF layer 1: state-changing requests must come from our own origin (layer 2 is in hasToken).
app.use('/api', originGuard);

// Routes
app.use('/api', router);

// 404 handler — after all routes
app.use((req, res) => {
  sendError(res, {
    statusCode: ResponseCodes.NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    code: ErrorCodes.NOT_FOUND,
  });
});

// Global error handler — always last
app.use(errorHandler);

export default app;
