const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// GET /api/health
router.get('/', (req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbStatus = dbState[mongoose.connection.readyState] || 'unknown';
  const dbOk = mongoose.connection.readyState === 1;

  const status = {
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    vercel: !!process.env.VERCEL,
    database: {
      status: dbStatus,
      connected: dbOk,
      configured: !!process.env.MONGO_URI,
      fix: dbOk ? null : 'Set MONGO_URI in Vercel Dashboard → Settings → Environment Variables',
    },
    scraping: {
      puppeteerAvailable: (() => { try { require('puppeteer'); return true; } catch { return false; } })(),
      note: process.env.VERCEL ? 'Google Maps scraper uses sample data on Vercel (no Chrome). Other sources work.' : 'All scrapers available.',
    },
  };

  res.status(dbOk ? 200 : 503).json(status);
});

module.exports = router;
