const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  // Common fields
  question: {
    type: String,
    trim: true,
    // Required for text/mcq questions, optional for pure image/sequence questions
    required: function () {
      return ['text', 'mcq'].includes(this.questionType);
    }
  },

  questionType: {
    type: String,
    enum: ['text', 'mcq', 'image', 'imageSequence', 'excel'],
    default: 'text',
    required: true
  },

  // For single image question (e.g. "What is shown in this picture?")
  imageUrl: {
    type: String,
    trim: true,
    // e.g. "uploads/images/1740123456789-photo.jpg"
  },

  // For image sequence / arrange-in-order questions
  imageSequence: [{
    type: String,
    trim: true
    // e.g. ["uploads/images/seq-1.jpg", "uploads/images/seq-2.jpg", ...]
  }],

  // Correct order for imageSequence questions (0-based indices)
  sequenceOrder: [{
    type: Number,
    min: 0
    // example: [2, 0, 3, 1] means third image → first → fourth → second
  }],

  // For excel-based questions
  excelFile: {
    type: String,
    trim: true
    // e.g. "uploads/excel/1740123456789-file.xlsx"
  },

  excelFileName: {
    type: String,
    trim: true
  },

  // Options (used in text, mcq, image questions)
  options: [{
    text: {
      type: String,
      trim: true
    },
    imageUrl: {
      type: String,
      trim: true
      // e.g. "uploads/images/option-a-1740123456789.jpg"
    },
    type: {
      type: String,
      enum: ['text', 'image'],
      default: 'text'
    }
  }],

  // Correct answer for single-choice questions (0-based index)
  correctOption: {
    type: Number,
    min: 0,
    // Required for text, mcq, image (single correct choice)
    required: function () {
      return ['text', 'mcq', 'image'].includes(this.questionType);
    }
  },

  // Optional metadata (useful for images)
  metadata: {
    width: Number,
    height: Number,
    format: String,           // jpg, png, webp, etc.
    size: Number,             // in bytes
    uploadedAt: Date
  },

  // Optional – explanation shown after submission
  explanation: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  _id: true
});

const topicSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 120
  },

  questions: [questionSchema]
}, {
  _id: true
});

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 200
  },

  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },

  duration: {
    type: Number,
    required: true,
    min: 1,           // in minutes
    max: 300
  },

  examType: {
    type: String,
    enum: ['excel', 'mcq', 'image', 'mixed'],
    default: 'excel'
  },

  topics: [topicSchema],

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // Useful for analytics / future features
  totalQuestions: {
    type: Number,
    default: 0
  },

  // When exam becomes available (optional)
  startDate: Date,

  // When exam stops being available (optional)
  endDate: Date

}, {
  timestamps: true
});

// Pre-save hook: auto-calculate totalQuestions
examSchema.pre('save', function (next) {
  if (this.isModified('topics')) {
    this.totalQuestions = this.topics.reduce((sum, topic) => {
      return sum + (topic.questions?.length || 0);
    }, 0);
  }
  next();
});

// Virtual for convenience
examSchema.virtual('questionCountByTopic').get(function () {
  return this.topics.map(topic => ({
    topic: topic.name,
    count: topic.questions.length
  }));
});

module.exports = mongoose.model('Exam', examSchema);