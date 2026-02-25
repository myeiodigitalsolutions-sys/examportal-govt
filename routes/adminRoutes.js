const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const {
  uploadExam,
  getAllStudents,
  getAllResults,
  deleteExam,
  getExamStats
} = require('../controllers/adminController');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

router.post('/upload-exam', authenticateToken, upload.single('file'), uploadExam);
router.get('/students', authenticateToken, getAllStudents);
router.get('/results', authenticateToken, getAllResults);
router.delete('/exams/:id', authenticateToken, deleteExam);
router.get('/exam-stats/:examId', authenticateToken, getExamStats);

module.exports = router;