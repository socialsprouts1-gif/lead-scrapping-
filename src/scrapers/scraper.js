const { v4: uuidv4 } = require('uuid');
const { randomDelay } = require('../utils/delay');
const { deduplicateLeads } = require('../utils/deduplicator');
const logger = require('../utils/logger');

let Job, Lead;

function getModels() {
  if (!Job) Job = require('../models/Job');
  if (!Lead) Lead = require('../models/Lead');
  return { Job, Lead };
}

/**
 * ScrapingManager - orchestrates scraping jobs
 */
class ScrapingManager {
  constructor() {
    this.jobQueue = new Map(); // jobId -> job metadata
    this.activeWorkers = 0;
    this.MAX_WORKERS = parseInt(process.env.MAX_WORKERS, 10) || 3;
  }

  /**
   * Start a new scraping job
   * @param {string} jobId
   * @param {string} profession
   * @param {string} location
   * @param {string} source - 'google-maps'|'yellow-pages'|'yelp'|'bbb'|'all'
   * @returns {Promise<void>}
   */
  async startJob(jobId, profession, location, source) {
    const { Job: JobModel } = getModels();

    // Update job to running
    await JobModel.findOneAndUpdate(
      { jobId },
      { status: 'running', startedAt: new Date(), progress: 0 },
      { new: true }
    );

    this.jobQueue.set(jobId, { profession, location, source, status: 'running' });

    // Run asynchronously (don't block the caller)
    this._executeJob(jobId, profession, location, source).catch((err) => {
      logger.error(`Job ${jobId} failed with uncaught error: ${err.message}`);
    });
  }

  /**
   * Execute the scraping job
   * @private
   */
  async _executeJob(jobId, profession, location, source) {
    const { Job: JobModel } = getModels();

    try {
      this.activeWorkers++;
      logger.info(`Starting job ${jobId}: ${profession} in ${location} via ${source}`);

      const sources = source === 'all'
        ? ['google-maps', 'yellow-pages', 'yelp', 'bbb']
        : [source];

      let totalFound = 0;
      let totalSaved = 0;
      const errors = [];
      const progressPerSource = Math.floor(90 / sources.length);

      for (let i = 0; i < sources.length; i++) {
        const currentSource = sources[i];
        const baseProgress = i * progressPerSource;

        try {
          logger.info(`Job ${jobId}: Running ${currentSource} scraper...`);

          const progressCallback = async (scraperProgress, found) => {
            const overallProgress = Math.min(
              90,
              baseProgress + Math.floor((scraperProgress / 100) * progressPerSource)
            );
            await JobModel.findOneAndUpdate(
              { jobId },
              { progress: overallProgress, totalFound: totalFound + found }
            );
          };

          const leads = await this.runScraper(jobId, profession, location, currentSource, progressCallback);
          totalFound += leads.length;

          // Deduplicate and save leads
          const uniqueLeads = await deduplicateLeads(
            leads.map((l) => ({ ...l, jobId, profession }))
          );

          const saved = await this._saveLeads(uniqueLeads);
          totalSaved += saved;

          logger.info(
            `Job ${jobId}: ${currentSource} - Found ${leads.length}, saved ${saved} (${leads.length - saved} duplicates)`
          );

          // Update progress
          await JobModel.findOneAndUpdate(
            { jobId },
            {
              progress: Math.min(90, baseProgress + progressPerSource),
              totalFound,
              totalSaved,
            }
          );

          // Delay between different sources
          if (i < sources.length - 1) {
            await randomDelay(2000, 5000);
          }
        } catch (err) {
          const errorMsg = `${currentSource}: ${err.message}`;
          errors.push(errorMsg);
          logger.error(`Job ${jobId} - ${errorMsg}`);

          await JobModel.findOneAndUpdate({ jobId }, { $push: { errors: errorMsg } });
        }
      }

      // Mark job completed
      await JobModel.findOneAndUpdate(
        { jobId },
        {
          status: errors.length === sources.length ? 'failed' : 'completed',
          progress: 100,
          totalFound,
          totalSaved,
          completedAt: new Date(),
          errors,
        }
      );

      this.jobQueue.delete(jobId);
      logger.info(
        `Job ${jobId} completed: found=${totalFound}, saved=${totalSaved}, errors=${errors.length}`
      );
    } catch (err) {
      logger.error(`Job ${jobId} fatal error: ${err.message}`);

      await JobModel.findOneAndUpdate(
        { jobId },
        {
          status: 'failed',
          progress: 100,
          completedAt: new Date(),
          $push: { errors: err.message },
        }
      ).catch(() => {});

      this.jobQueue.delete(jobId);
    } finally {
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
    }
  }

  /**
   * Run a specific scraper and return leads
   * @param {string} jobId
   * @param {string} profession
   * @param {string} location
   * @param {string} source
   * @param {Function} progressCallback
   * @returns {Promise<Object[]>}
   */
  async runScraper(jobId, profession, location, source, progressCallback) {
    switch (source) {
      case 'google-maps': {
        const { scrapeGoogleMaps } = require('./googleMaps');
        return await scrapeGoogleMaps(profession, location, progressCallback);
      }
      case 'yellow-pages': {
        const { scrapeYellowPages } = require('./yellowPages');
        return await scrapeYellowPages(profession, location, progressCallback);
      }
      case 'yelp': {
        const { scrapeYelp } = require('./yelp');
        return await scrapeYelp(profession, location, progressCallback);
      }
      case 'bbb': {
        const { scrapeBBB } = require('./bbb');
        return await scrapeBBB(profession, location, progressCallback);
      }
      default:
        throw new Error(`Unknown source: ${source}`);
    }
  }

  /**
   * Save leads to MongoDB
   * @param {Object[]} leads
   * @returns {Promise<number>} Number of leads saved
   */
  async _saveLeads(leads) {
    const { Lead: LeadModel } = getModels();
    let saved = 0;

    for (const lead of leads) {
      try {
        const doc = new LeadModel({
          businessName: lead.businessName,
          ownerName: lead.ownerName || '',
          email: lead.email || '',
          emails: lead.emails || [],
          phone: lead.phone || '',
          phones: lead.phones || [],
          website: lead.website || '',
          address: lead.address || '',
          city: lead.city || '',
          state: lead.state || '',
          zip: lead.zip || '',
          profession: lead.profession,
          category: lead.category || '',
          rating: lead.rating != null ? Number(lead.rating) : null,
          reviewCount: lead.reviewCount != null ? Number(lead.reviewCount) : null,
          employeeCount: lead.employeeCount || null,
          source: lead.source,
          verified: false,
          contacted: false,
          status: 'new',
          notes: lead.notes || '',
          jobId: lead.jobId || '',
        });

        await doc.save();
        saved++;
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate key error — already exists
          logger.debug(`Duplicate lead skipped: ${lead.businessName}`);
        } else {
          logger.warn(`Error saving lead "${lead.businessName}": ${err.message}`);
        }
      }
    }

    return saved;
  }

  /**
   * Get job status from DB
   * @param {string} jobId
   * @returns {Promise<Object|null>}
   */
  async getJobStatus(jobId) {
    const { Job: JobModel } = getModels();
    return await JobModel.findOne({ jobId }).lean();
  }

  /**
   * Check if we have capacity for more workers
   * @returns {boolean}
   */
  hasCapacity() {
    return this.activeWorkers < this.MAX_WORKERS;
  }
}

// Export singleton instance
const scrapingManager = new ScrapingManager();
module.exports = scrapingManager;
