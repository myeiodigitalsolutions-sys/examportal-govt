const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { 
  submitExam, 
  getRankings, 
  getMyResults,
  checkExamStatus 
} = require('../controllers/resultController');

router.post('/exams/:id/submit', authenticateToken, submitExam);
router.get('/rankings/:examId', authenticateToken, getRankings);
router.get('/my-results', authenticateToken, getMyResults);
router.get('/exam-status/:examId', authenticateToken, checkExamStatus);

module.exports = router;