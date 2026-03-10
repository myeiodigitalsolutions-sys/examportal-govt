const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const { authenticateToken } = require('../middleware/auth');

// Get student's results
router.get('/my-results', authenticateToken, async (req, res) => {
  try {
    const results = await Result.find({ student: req.user.id })
      .populate('exam', 'title description duration')
      .sort({ completedAt: -1 });
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get rankings for an exam
router.get('/rankings/:examId', authenticateToken, async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.examId })
      .populate('student', 'name')
      .sort({ percentage: -1 })
      .limit(10);
    
    const rankings = results.map((result, index) => ({
      rank: index + 1,
      studentName: result.student.name,
      score: result.score,
      totalQuestions: result.totalQuestions,
      percentage: result.percentage.toFixed(2),
      completedAt: result.completedAt,
      topicWiseScores: result.topicWiseScores
    }));
    
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;