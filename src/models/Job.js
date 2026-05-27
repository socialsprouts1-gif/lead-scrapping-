const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    profession: {
      type: String,
      required: [true, 'Profession is required'],
      trim: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    source: {
      type: String,
      required: [true, 'Source is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalFound: {
      type: Number,
      default: 0,
    },
    totalSaved: {
      type: Number,
      default: 0,
    },
    errors: {
      type: [String],
      default: [],
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// Index for listing recent jobs
jobSchema.index({ createdAt: -1 });

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
