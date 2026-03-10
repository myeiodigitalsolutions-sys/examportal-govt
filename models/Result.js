const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  answers: [{
    questionIndex: Number,
    selectedOption: Number,
    isCorrect: Boolean,
    topicIndex: Number,
    topicName: String
  }],
  questionOrder: [Number],
  score: Number,
  totalQuestions: Number,
  percentage: Number,
  topicWiseScores: [{
    topicName: String,
    score: Number,
    totalQuestions: Number,
    percentage: Number
  }],
  completedAt: { type: Date, default: Date.now }
});

// Ensure one student can only attempt an exam once
resultSchema.index({ student: 1, exam: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);