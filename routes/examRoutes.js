const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getAllExams, getExamById } = require('../controllers/examController');

router.get('/exams', authenticateToken, getAllExams);
router.get('/exams/:id', authenticateToken, getExamById);

module.exports = router;