require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('path');
const logger = require('./src/utils/logger');

const scrapeRoutes = require('./src/api/routes/scrape');
const leadsRoutes = require('./src/api/routes/leads');
const jobsRoutes = require('./src/api/routes/jobs');
const statsRoutes = require('./src/api/routes/stats');
const settingsRoutes = require('./src/api/routes/settings');
const healthRoutes = require('./src/api/routes/health');
const rateLimiter = require('./src/api/middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || process.env.mongo_url || 'mongodb+srv://leadscrapper:lead%401234@cluster0.jueqlaf.mongodb.net/leads?retryWrites=true&w=majority&appName=Cluster0';

// Security & utility middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from src/public
app.use(express.static(path.join(__dirname, 'src/public')));

// Lazy MongoDB connection — works for both serverless and traditional deployments
let dbConnected = false;
let dbError = null;

async function ensureDBConnected() {
  if (dbConnected || mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    dbConnected = true;
    dbError = null;
    logger.info('Connected to MongoDB');
  } catch (err) {
    dbError = err.message;
    logger.warn('MongoDB connection failed:', err.message);
  }
}

// Export dbError so health route can read it
module.exports.getDbError = () => dbError;

// Connect DB before every API request (cached after first success)
app.use('/api', async (req, res, next) => {
  await ensureDBConnected();
  next();
});

// Apply rate limiter to API routes
app.use('/api', rateLimiter);

// Mount API routes
app.use('/api/health', healthRoutes);
app.use('/api/scrape', scrapeRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'src/public/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start HTTP server only when running directly (not on Vercel serverless)
if (!process.env.VERCEL && require.main === module) {
  ensureDBConnected().then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`Dashboard: http://localhost:${PORT}`);
    });

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}

// Vercel (and tests) use the exported app directly
module.exports = app;
