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

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/vnd.oasis.opendocument.spreadsheet', // .ods
      'text/csv' // .csv
    ];
    
    // Also check by file extension
    const allowedExtensions = ['.xlsx', '.xls', '.ods', '.csv'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

// Public test route (no auth required for testing)
router.get('/ping', (req, res) => {
  res.json({ 
    message: 'Admin routes are working!', 
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /upload-exam',
      'GET /students',
      'GET /results',
      'DELETE /exams/:id',
      'GET /exam-stats/:examId'
    ]
  });
});

// Apply authentication and admin check to all protected routes
router.use(authenticateToken);
router.use(isAdmin);

// Exam upload route
router.post('/upload-exam', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      // An unknown error occurred
      return res.status(400).json({ message: err.message });
    }
    // Everything went fine, proceed to controller
    uploadExam(req, res);
  });
});

// Other admin routes
router.get('/students', getAllStudents);
router.get('/results', getAllResults);
router.delete('/exams/:id', deleteExam);
router.get('/exam-stats/:examId', getExamStats);

module.exports = router;