const { createObjectCsvWriter } = require('csv-writer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

/**
 * Fields to export for leads
 */
const EXPORT_FIELDS = [
  { id: 'businessName', title: 'Business Name' },
  { id: 'ownerName', title: 'Owner Name' },
  { id: 'email', title: 'Email' },
  { id: 'emails', title: 'All Emails' },
  { id: 'phone', title: 'Phone' },
  { id: 'phones', title: 'All Phones' },
  { id: 'website', title: 'Website' },
  { id: 'address', title: 'Address' },
  { id: 'city', title: 'City' },
  { id: 'state', title: 'State' },
  { id: 'zip', title: 'ZIP' },
  { id: 'profession', title: 'Profession' },
  { id: 'category', title: 'Category' },
  { id: 'rating', title: 'Rating' },
  { id: 'reviewCount', title: 'Review Count' },
  { id: 'employeeCount', title: 'Employee Count' },
  { id: 'source', title: 'Source' },
  { id: 'status', title: 'Status' },
  { id: 'verified', title: 'Verified' },
  { id: 'contacted', title: 'Contacted' },
  { id: 'notes', title: 'Notes' },
  { id: 'jobId', title: 'Job ID' },
  { id: 'scrapedDate', title: 'Scraped Date' },
];

/**
 * Flatten a lead object for export (arrays become comma-separated strings)
 * @param {Object} lead
 * @returns {Object}
 */
function flattenLead(lead) {
  const obj = lead.toObject ? lead.toObject() : { ...lead };
  return {
    businessName: obj.businessName || '',
    ownerName: obj.ownerName || '',
    email: obj.email || '',
    emails: Array.isArray(obj.emails) ? obj.emails.join('; ') : '',
    phone: obj.phone || '',
    phones: Array.isArray(obj.phones) ? obj.phones.join('; ') : '',
    website: obj.website || '',
    address: obj.address || '',
    city: obj.city || '',
    state: obj.state || '',
    zip: obj.zip || '',
    profession: obj.profession || '',
    category: obj.category || '',
    rating: obj.rating != null ? obj.rating : '',
    reviewCount: obj.reviewCount != null ? obj.reviewCount : '',
    employeeCount: obj.employeeCount != null ? obj.employeeCount : '',
    source: obj.source || '',
    status: obj.status || '',
    verified: obj.verified ? 'Yes' : 'No',
    contacted: obj.contacted ? 'Yes' : 'No',
    notes: obj.notes || '',
    jobId: obj.jobId || '',
    scrapedDate: obj.scrapedDate ? new Date(obj.scrapedDate).toISOString() : '',
  };
}

/**
 * Export leads to CSV file
 * @param {Object[]} leads - Array of lead documents
 * @param {string} filePath - Output file path
 * @returns {Promise<string>} Path to created file
 */
async function exportToCSV(leads, filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: EXPORT_FIELDS,
    });

    const records = leads.map(flattenLead);
    await csvWriter.writeRecords(records);

    logger.info(`Exported ${leads.length} leads to CSV: ${filePath}`);
    return filePath;
  } catch (err) {
    logger.error('CSV export error:', err.message);
    throw err;
  }
}

/**
 * Export leads to Excel (xlsx) file
 * @param {Object[]} leads - Array of lead documents
 * @param {string} filePath - Output file path
 * @returns {Promise<string>} Path to created file
 */
async function exportToExcel(leads, filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Lead Scraper';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Leads', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Define columns
    worksheet.columns = EXPORT_FIELDS.map((field) => ({
      header: field.title,
      key: field.id,
      width: getColumnWidth(field.id),
    }));

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Add data rows
    const records = leads.map(flattenLead);
    records.forEach((record, idx) => {
      const row = worksheet.addRow(record);
      // Alternate row colors
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFF' },
        };
      }
    });

    // Auto-filter on header
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: EXPORT_FIELDS.length },
    };

    await workbook.xlsx.writeFile(filePath);

    logger.info(`Exported ${leads.length} leads to Excel: ${filePath}`);
    return filePath;
  } catch (err) {
    logger.error('Excel export error:', err.message);
    throw err;
  }
}

/**
 * Export leads to JSON string
 * @param {Object[]} leads - Array of lead documents
 * @returns {string} JSON string
 */
function exportToJSON(leads) {
  const records = leads.map((lead) => {
    const obj = lead.toObject ? lead.toObject() : { ...lead };
    // Remove internal Mongoose fields
    delete obj.__v;
    return obj;
  });
  return JSON.stringify(records, null, 2);
}

/**
 * Get appropriate column width for Excel
 * @param {string} fieldId
 * @returns {number}
 */
function getColumnWidth(fieldId) {
  const widths = {
    businessName: 30,
    ownerName: 20,
    email: 28,
    emails: 35,
    phone: 18,
    phones: 25,
    website: 35,
    address: 35,
    city: 18,
    state: 12,
    zip: 12,
    profession: 20,
    category: 20,
    rating: 10,
    reviewCount: 14,
    employeeCount: 16,
    source: 16,
    status: 14,
    verified: 12,
    contacted: 12,
    notes: 40,
    jobId: 38,
    scrapedDate: 22,
  };
  return widths[fieldId] || 18;
}

module.exports = { exportToCSV, exportToExcel, exportToJSON };
