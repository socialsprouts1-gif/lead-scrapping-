const express = require('express');
const router = express.Router();

// In-memory settings store (persists for process lifetime; extend with DB if needed)
let runtimeSettings = {
  delayMin: parseInt(process.env.SCRAPE_DELAY_MIN, 10) || 2000,
  delayMax: parseInt(process.env.SCRAPE_DELAY_MAX, 10) || 8000,
  maxWorkers: parseInt(process.env.MAX_WORKERS, 10) || 3,
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
  maxRequestsPerDomain: parseInt(process.env.MAX_REQUESTS_PER_DOMAIN, 10) || 50,
  hunterApiKey: process.env.HUNTER_API_KEY || '',
  proxyList: process.env.PROXY_LIST || '',
};

// GET /api/settings
router.get('/', (req, res) => {
  // Redact API keys in response
  const safe = { ...runtimeSettings, hunterApiKey: runtimeSettings.hunterApiKey ? '***configured***' : '' };
  res.json(safe);
});

// POST /api/settings
router.post('/', (req, res) => {
  const allowed = ['delayMin', 'delayMax', 'maxWorkers', 'requestTimeout', 'maxRequestsPerDomain', 'hunterApiKey', 'proxyList'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  // Validate numeric fields
  const numericFields = ['delayMin', 'delayMax', 'maxWorkers', 'requestTimeout', 'maxRequestsPerDomain'];
  for (const field of numericFields) {
    if (updates[field] !== undefined) {
      const val = parseInt(updates[field], 10);
      if (isNaN(val) || val < 0) return res.status(400).json({ error: `${field} must be a positive number` });
      updates[field] = val;
    }
  }

  if (updates.delayMin !== undefined && updates.delayMax !== undefined && updates.delayMin > updates.delayMax) {
    return res.status(400).json({ error: 'delayMin must be <= delayMax' });
  }

  runtimeSettings = { ...runtimeSettings, ...updates };
  const safe = { ...runtimeSettings, hunterApiKey: runtimeSettings.hunterApiKey ? '***configured***' : '' };
  res.json({ message: 'Settings updated', settings: safe });
});

module.exports = router;
