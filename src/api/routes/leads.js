const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');

const Lead = require('../../models/Lead');
const { exportToCSV, exportToExcel, exportToJSON } = require('../../utils/exporter');
const { validateEmail, validatePhone, validateUrl, verifyEmailDomain } = require('../../extractors/dataValidator');
const logger = require('../../utils/logger');

/**
 * Build MongoDB filter from query params
 */
function buildFilter(query) {
  const filter = {};

  if (query.profession) {
    filter.profession = { $regex: query.profession, $options: 'i' };
  }
  if (query.location) {
    filter.$or = [
      { city: { $regex: query.location, $options: 'i' } },
      { state: { $regex: query.location, $options: 'i' } },
      { address: { $regex: query.location, $options: 'i' } },
    ];
  }
  if (query.source) {
    filter.source = query.source;
  }
  if (query.status) {
    filter.status = query.status;
  }
  if (query.jobId) {
    filter.jobId = query.jobId;
  }
  if (query.search) {
    const searchRegex = { $regex: query.search, $options: 'i' };
    filter.$or = [
      { businessName: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { address: searchRegex },
      { city: searchRegex },
    ];
  }
  if (query.hasEmail === 'true') {
    filter.email = { $exists: true, $ne: '' };
  }
  if (query.hasPhone === 'true') {
    filter.phone = { $exists: true, $ne: '' };
  }

  return filter;
}

/**
 * GET /api/leads
 * List leads with filtering, pagination, sorting
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const sortField = req.query.sort || 'scrapedDate';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };

    const filter = buildFilter(req.query);

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Lead.countDocuments(filter),
    ]);

    const pages = Math.ceil(total / limit);

    return res.json({
      leads,
      total,
      page,
      limit,
      pages,
    });
  } catch (err) {
    logger.error('Error fetching leads:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve leads' });
  }
});

/**
 * POST /api/leads/export
 * Export leads to file format
 * NOTE: must come before /:id route to avoid conflict
 */
router.post('/export', async (req, res) => {
  try {
    const { format = 'csv', filters = {} } = req.body;

    const validFormats = ['csv', 'excel', 'json'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid format. Must be one of: ${validFormats.join(', ')}` });
    }

    const filter = buildFilter(filters);

    // Fetch all matching leads (stream for large sets)
    const leads = await Lead.find(filter).sort({ scrapedDate: -1 }).lean();

    logger.info(`Exporting ${leads.length} leads as ${format}`);

    if (format === 'json') {
      const jsonStr = exportToJSON(leads);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="leads-${Date.now()}.json"`
      );
      return res.send(jsonStr);
    }

    // Create temp file for CSV/Excel
    const tmpDir = os.tmpdir();
    const ext = format === 'excel' ? 'xlsx' : 'csv';
    const tmpFile = path.join(tmpDir, `leads-${Date.now()}.${ext}`);

    if (format === 'csv') {
      await exportToCSV(leads, tmpFile);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="leads-${Date.now()}.csv"`
      );
    } else if (format === 'excel') {
      await exportToExcel(leads, tmpFile);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="leads-${Date.now()}.xlsx"`
      );
    }

    // Stream file to response
    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);

    // Cleanup temp file after sending
    fileStream.on('end', () => {
      fs.unlink(tmpFile, () => {});
    });
    fileStream.on('error', (err) => {
      logger.error('File stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream export file' });
      }
    });
  } catch (err) {
    logger.error('Export error:', err.message);
    return res.status(500).json({ error: 'Failed to export leads' });
  }
});

/**
 * POST /api/leads/verify
 * Verify one or more leads' data (email, phone, website format)
 */
router.post('/verify', async (req, res) => {
  try {
    const { ids } = req.body; // array of lead ObjectIds, or omit to verify all

    const filter = ids && Array.isArray(ids) && ids.length > 0 ? { _id: { $in: ids } } : {};
    const leads = await Lead.find(filter).lean();

    const results = leads.map((lead) => {
      const checks = {
        emailValid: lead.email ? validateEmail(lead.email) : null,
        emailDomainOk: lead.email ? verifyEmailDomain(lead.email) : null,
        phoneValid: lead.phone ? validatePhone(lead.phone) : null,
        websiteValid: lead.website ? validateUrl(lead.website) : null,
      };
      const passed = Object.values(checks).filter((v) => v === false).length === 0;
      return { id: lead._id, businessName: lead.businessName, checks, passed };
    });

    // Mark verified on leads that passed all checks
    const passedIds = results.filter((r) => r.passed).map((r) => r.id);
    if (passedIds.length > 0) {
      await Lead.updateMany({ _id: { $in: passedIds } }, { $set: { verified: true } });
    }

    return res.json({ verified: passedIds.length, total: leads.length, results });
  } catch (err) {
    logger.error('Verify error:', err.message);
    return res.status(500).json({ error: 'Failed to verify leads' });
  }
});

/**
 * GET /api/leads/:id
 * Get a single lead by MongoDB ID
 */
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).lean();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.json(lead);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }
    logger.error('Error fetching lead:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve lead' });
  }
});

/**
 * PUT /api/leads/:id
 * Update a lead's status, notes, contacted
 */
router.put('/:id', async (req, res) => {
  try {
    const allowedFields = ['status', 'notes', 'contacted', 'verified', 'ownerName', 'email', 'phone', 'website'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Validate status if provided
    const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'rejected'];
    if (updates.status && !validStatuses.includes(updates.status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.json(lead);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('Error updating lead:', err.message);
    return res.status(500).json({ error: 'Failed to update lead' });
  }
});

/**
 * DELETE /api/leads/:id
 * Delete a lead
 */
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id).lean();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.json({ message: 'Lead deleted successfully', id: req.params.id });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }
    logger.error('Error deleting lead:', err.message);
    return res.status(500).json({ error: 'Failed to delete lead' });
  }
});

module.exports = router;
