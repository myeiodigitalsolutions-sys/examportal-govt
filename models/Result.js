const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  answers: [{
    questionIndex: Number,
    selectedOption: Number
  }],
  questionOrder: [Number],
  score: Number,
  totalQuestions: Number,
  percentage: Number,
  completedAt: { type: Date, default: Date.now }
});

// Ensure one student can only attempt an exam once
resultSchema.index({ student: 1, exam: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);