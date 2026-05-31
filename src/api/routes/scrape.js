const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const mongoose = require('mongoose');

const Job = require('../../models/Job');
const scrapingManager = require('../../scrapers/scraper');
const { validateScrapeRequest } = require('../../utils/validator');
const logger = require('../../utils/logger');

/**
 * POST /api/scrape
 * Start a new scraping job
 */
router.post('/', async (req, res) => {
  try {
    // Check DB connection first — gives a clear error instead of a generic 500
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: 'Database not connected. Please set MONGO_URI in your Vercel environment variables.',
        fix: 'Vercel Dashboard → Your Project → Settings → Environment Variables → Add MONGO_URI',
        docs: 'Get a free MongoDB at https://mongodb.com/cloud/atlas',
      });
    }

    const { profession, location, source } = req.body;

    // Validate inputs
    const { valid, errors } = validateScrapeRequest(profession, location, source);
    if (!valid) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Check worker capacity
    if (!scrapingManager.hasCapacity()) {
      return res.status(429).json({
        error: 'Maximum concurrent scraping jobs reached. Please wait for a job to complete.',
        activeWorkers: scrapingManager.activeWorkers,
        maxWorkers: scrapingManager.MAX_WORKERS,
      });
    }

    const jobId = uuidv4();
    const cleanProfession = profession.trim();
    const cleanLocation = location.trim();
    const cleanSource = source.trim();

    // Create Job record in DB
    const job = new Job({
      jobId,
      profession: cleanProfession,
      location: cleanLocation,
      source: cleanSource,
      status: 'pending',
      progress: 0,
      totalFound: 0,
      totalSaved: 0,
      errors: [],
    });

    await job.save();
    logger.info(`Created scraping job ${jobId}: ${cleanProfession} in ${cleanLocation} via ${cleanSource}`);

    // Start scraping asynchronously
    scrapingManager.startJob(jobId, cleanProfession, cleanLocation, cleanSource).catch((err) => {
      logger.error(`Failed to start job ${jobId}: ${err.message}`);
    });

    return res.status(201).json({
      jobId,
      message: 'Scraping started',
      profession: cleanProfession,
      location: cleanLocation,
      source: cleanSource,
    });
  } catch (err) {
    logger.error('Error creating scrape job:', err.message);
    return res.status(500).json({ error: 'Failed to start scraping job', detail: err.message });
  }
});

module.exports = router;
