const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
    },
    ownerName: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // optional
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email format',
      },
    },
    emails: {
      type: [String],
      default: [],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    phones: {
      type: [String],
      default: [],
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    state: {
      type: String,
      trim: true,
      default: '',
    },
    zip: {
      type: String,
      trim: true,
      default: '',
    },
    profession: {
      type: String,
      required: [true, 'Profession is required'],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: '',
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    reviewCount: {
      type: Number,
      min: 0,
      default: null,
    },
    employeeCount: {
      type: Number,
      min: 0,
      default: null,
    },
    source: {
      type: String,
      enum: ['google-maps', 'yellow-pages', 'yelp', 'bbb', 'linkedin', 'direct'],
      required: true,
    },
    scrapedDate: {
      type: Date,
      default: Date.now,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    contacted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'converted', 'rejected'],
      default: 'new',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    jobId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for deduplication
leadSchema.index({ businessName: 1, city: 1, source: 1 });
leadSchema.index({ phone: 1 }, { sparse: true });
leadSchema.index({ email: 1 }, { sparse: true });
leadSchema.index({ status: 1 });
leadSchema.index({ scrapedDate: -1 });

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
