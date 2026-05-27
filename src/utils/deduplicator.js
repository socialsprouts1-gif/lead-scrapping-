const logger = require('./logger');

let Lead;

/**
 * Lazy-load Lead model to avoid circular deps
 */
function getLeadModel() {
  if (!Lead) {
    Lead = require('../models/Lead');
  }
  return Lead;
}

/**
 * Check if a lead already exists in the database.
 * Checks by phone number first, then by businessName + city combination.
 *
 * @param {Object} lead - Lead object to check
 * @returns {Promise<{ isDuplicate: boolean, existingLead: Object|null }>}
 */
async function deduplicateLead(lead) {
  try {
    const LeadModel = getLeadModel();
    const query = [];

    // Check by phone (primary dedup key)
    if (lead.phone && lead.phone.trim()) {
      const cleanPhone = lead.phone.replace(/[\s\-\(\)\+\.]/g, '');
      if (cleanPhone.length >= 7) {
        query.push({ phone: { $regex: cleanPhone.slice(-7), $options: 'i' } });
      }
    }

    // Check by email
    if (lead.email && lead.email.trim()) {
      query.push({ email: lead.email.trim().toLowerCase() });
    }

    // Check by business name + city
    if (lead.businessName && lead.businessName.trim()) {
      const nameQuery = {
        businessName: { $regex: `^${escapeRegex(lead.businessName.trim())}$`, $options: 'i' },
      };
      if (lead.city && lead.city.trim()) {
        nameQuery.city = { $regex: `^${escapeRegex(lead.city.trim())}$`, $options: 'i' };
      }
      query.push(nameQuery);
    }

    if (query.length === 0) {
      return { isDuplicate: false, existingLead: null };
    }

    const existingLead = await LeadModel.findOne({ $or: query }).lean();

    if (existingLead) {
      logger.debug(`Duplicate lead found: ${lead.businessName} (existing id: ${existingLead._id})`);
      return { isDuplicate: true, existingLead };
    }

    return { isDuplicate: false, existingLead: null };
  } catch (err) {
    logger.error('Error during deduplication:', err.message);
    // On error, assume not duplicate to avoid data loss
    return { isDuplicate: false, existingLead: null };
  }
}

/**
 * Escape special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Batch deduplicate an array of leads
 * @param {Object[]} leads
 * @returns {Promise<Object[]>} Filtered array with duplicates removed
 */
async function deduplicateLeads(leads) {
  const uniqueLeads = [];
  const seenPhones = new Set();
  const seenEmails = new Set();
  const seenNames = new Set();

  for (const lead of leads) {
    // In-memory dedup within this batch
    const phone = lead.phone ? lead.phone.replace(/[\s\-\(\)\+\.]/g, '').slice(-7) : null;
    const email = lead.email ? lead.email.toLowerCase() : null;
    const nameCity = `${(lead.businessName || '').toLowerCase()}::${(lead.city || '').toLowerCase()}`;

    if (phone && seenPhones.has(phone)) continue;
    if (email && seenEmails.has(email)) continue;
    if (seenNames.has(nameCity)) continue;

    // Check against database
    const { isDuplicate } = await deduplicateLead(lead);
    if (isDuplicate) continue;

    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    seenNames.add(nameCity);

    uniqueLeads.push(lead);
  }

  return uniqueLeads;
}

module.exports = { deduplicateLead, deduplicateLeads };
