const express = require('express');
const router = express.Router();
const Lead = require('../../models/Lead');
const Job = require('../../models/Job');
const logger = require('../../utils/logger');

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    const [totalLeads, totalJobs, bySource, byStatus, byProfession, recentJobs] = await Promise.all([
      Lead.countDocuments(),
      Job.countDocuments(),
      Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Lead.aggregate([{ $group: { _id: '$profession', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      Job.find().sort({ createdAt: -1 }).limit(5).select('profession location source status totalFound completedAt'),
    ]);

    const verifiedCount = await Lead.countDocuments({ verified: true });
    const contactedCount = await Lead.countDocuments({ contacted: true });
    const withEmailCount = await Lead.countDocuments({ email: { $ne: null, $ne: '' } });

    res.json({
      totals: { leads: totalLeads, jobs: totalJobs, verified: verifiedCount, contacted: contactedCount, withEmail: withEmailCount },
      bySource: bySource.map((s) => ({ source: s._id || 'unknown', count: s.count })),
      byStatus: byStatus.map((s) => ({ status: s._id || 'unknown', count: s.count })),
      topProfessions: byProfession.map((p) => ({ profession: p._id || 'unknown', count: p.count })),
      recentJobs,
    });
  } catch (err) {
    logger.error('Stats error:', err.message);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
});

module.exports = router;
