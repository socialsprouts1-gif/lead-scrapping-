const express = require('express');
const router = express.Router();

const Job = require('../../models/Job');
const logger = require('../../utils/logger');

/**
 * GET /api/jobs
 * List recent jobs (last 20)
 */
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({ jobs, total: jobs.length });
  } catch (err) {
    logger.error('Error listing jobs:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve jobs' });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get a specific job's status and progress
 */
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const job = await Job.findOne({ jobId }).lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json(job);
  } catch (err) {
    logger.error('Error getting job:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve job' });
  }
});

module.exports = router;
