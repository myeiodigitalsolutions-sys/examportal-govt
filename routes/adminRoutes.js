const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const Exam = require('../models/Exam');
const User = require('../models/User');
const Result = require('../models/Result');
const xlsx = require('xlsx');

// Configure multer for file uploads with disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    
    // Determine subfolder based on file type or fieldname
    if (file.fieldname === 'images') {
      uploadPath += 'images/';
    } else if (file.fieldname === 'excelFiles') {
      uploadPath += 'excel/';
    } else {
      uploadPath += 'excel/';
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer with file filtering
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'images') {
      // Allow images
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    } else {
      // Allow excel files
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/vnd.oasis.opendocument.spreadsheet', // .ods
        'text/csv' // .csv
      ];
      
      // Also check by file extension
      const allowedExtensions = ['.xlsx', '.xls', '.ods', '.csv'];
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls, .ods, .csv) are allowed.'));
      }
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
      'POST /upload-mcq-exam',
      'POST /upload-exam-with-images',
      'POST /upload-mixed-exam',
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

// ============== EXISTING EXCEL UPLOAD ROUTE ==============
// Exam upload route (Excel)
router.post('/upload-exam', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    // Everything went fine, proceed to controller
    uploadExam(req, res);
  });
});

// Upload MCQ exam (text-based)
router.post('/upload-mcq-exam', async (req, res) => {
  try {
    const { title, description, duration, topics } = req.body;

    if (!title || !description || !duration || !topics) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ message: 'At least one topic is required' });
    }

    const processedTopics = topics.map(topic => {
      if (!topic.name || !Array.isArray(topic.questions) || topic.questions.length === 0) {
        throw new Error('Each topic must have a name and at least one question');
      }

      const processedQuestions = topic.questions.map(q => {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error('Each question must have 4 options');
        }

        q.options.forEach((opt, idx) => {
          if (!opt || opt.trim() === '') {
            throw new Error(`Option ${idx + 1} cannot be empty`);
          }
        });

        if (q.correctOption === undefined || q.correctOption < 0 || q.correctOption > 3) {
          throw new Error('Correct option must be between 0 and 3');
        }

        return {
          question: q.question,
          questionType: 'mcq',
          options: q.options.map(opt => ({ text: opt, type: 'text' })),
          correctOption: q.correctOption
        };
      });

      return {
        name: topic.name,
        questions: processedQuestions
      };
    });

    const exam = new Exam({
      title,
      description,
      duration: parseInt(duration),
      topics: processedTopics,
      createdBy: req.user.id,
      examType: 'mcq',
      createdAt: new Date(),
      isActive: true
    });

    await exam.save();

    res.status(201).json({
      message: 'MCQ exam uploaded successfully',
      exam: {
        _id: exam._id,
        title: exam.title,
        topics: exam.topics.map(t => ({ 
          name: t.name, 
          questionCount: t.questions.length 
        }))
      }
    });
  } catch (error) {
    console.error('Error uploading MCQ exam:', error);
    res.status(500).json({ message: error.message });
  }
});

// Upload exam with images
router.post('/upload-exam-with-images', upload.array('images', 20), async (req, res) => {
  try {
    const { examData } = req.body;
    
    if (!examData) {
      return res.status(400).json({ message: 'Exam data is required' });
    }

    const parsedExamData = JSON.parse(examData);
    const { title, description, duration, topics } = parsedExamData;
    const imageFiles = req.files || [];

    console.log('Received exam data:', { title, description, duration, topicsCount: topics?.length });
    console.log('Received images:', imageFiles.length);

    if (!title || !description || !duration || !topics) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'At least one topic is required' });
    }

    const processedTopics = topics.map((topic, topicIndex) => {
      if (!topic.name || !Array.isArray(topic.questions)) {
        throw new Error(`Topic ${topicIndex + 1} must have a name and questions array`);
      }

      const questions = topic.questions.map((question, qIndex) => {
        const questionType = question.questionType || 'image';
        
        console.log(`Processing question ${qIndex + 1} in topic ${topicIndex + 1}, type: ${questionType}`);

        // For sequence questions
        if (questionType === 'imageSequence') {
          const sequenceImages = imageFiles
            .filter(f => f.originalname.includes(`topic${topicIndex}q${qIndex}seq`))
            .sort((a, b) => {
              const numA = parseInt(a.originalname.match(/seq(\d+)/)?.[1] || '0');
              const numB = parseInt(b.originalname.match(/seq(\d+)/)?.[1] || '0');
              return numA - numB;
            })
            .map(f => f.filename);

          if (sequenceImages.length === 0) {
            throw new Error(`No images uploaded for sequence question ${qIndex + 1} in topic "${topic.name}"`);
          }

          return {
            question: question.question || `Arrange in correct order`,
            questionType: 'imageSequence',
            imageSequence: sequenceImages,
            sequenceOrder: question.sequenceOrder || Array.from({ length: sequenceImages.length }, (_, i) => i),
          };
        }

        // For regular image questions
        const processedQuestion = {
          question: question.question || '',
          questionType: questionType,
          options: [],
          correctOption: question.correctOption !== undefined ? question.correctOption : 0
        };

        // Handle question image
        if (question.imageRequired) {
          const imageFile = imageFiles.find(f => 
            f.originalname.includes(`topic${topicIndex}q${qIndex}_`)
          );
          if (imageFile) {
            processedQuestion.imageUrl = imageFile.filename;
          }
        }

        // Process options
        if (question.options && Array.isArray(question.options)) {
          processedQuestion.options = question.options.map((opt, optIndex) => {
            const option = { type: opt.type || 'text' };
            
            if (opt.type === 'image') {
              const optImageFile = imageFiles.find(f => 
                f.originalname.includes(`topic${topicIndex}q${qIndex}opt${optIndex}_`)
              );
              if (optImageFile) {
                option.imageUrl = optImageFile.filename;
              } else {
                option.text = `Option ${optIndex + 1}`;
                option.type = 'text';
              }
            } else {
              option.text = opt.text || `Option ${optIndex + 1}`;
            }
            
            return option;
          });
        } else {
          processedQuestion.options = [
            { type: 'text', text: 'Option A' },
            { type: 'text', text: 'Option B' },
            { type: 'text', text: 'Option C' },
            { type: 'text', text: 'Option D' }
          ];
        }

        return processedQuestion;
      });

      return {
        name: topic.name,
        questions
      };
    });

    const exam = new Exam({
      title,
      description,
      duration: parseInt(duration),
      topics: processedTopics,
      createdBy: req.user.id,
      examType: 'image',
      createdAt: new Date(),
      isActive: true
    });

    await exam.save();

    res.status(201).json({
      message: 'Image-based exam uploaded successfully',
      exam: {
        _id: exam._id,
        title: exam.title,
        topics: exam.topics.map(t => ({ 
          name: t.name, 
          questionCount: t.questions.length 
        }))
      }
    });
  } catch (error) {
    console.error('Error uploading exam with images:', error);
    cleanupFiles(req.files);
    res.status(500).json({ message: error.message });
  }
});

// ============== NEW MIXED EXAM UPLOAD ROUTE ==============
// Upload mixed exam with all question types
router.post('/upload-mixed-exam', upload.fields([
  { name: 'images', maxCount: 50 },
  { name: 'excelFiles', maxCount: 20 }
]), async (req, res) => {
  try {
    const { examData } = req.body;
    
    if (!examData) {
      return res.status(400).json({ message: 'Exam data is required' });
    }

    const parsedExamData = JSON.parse(examData);
    const { title, description, duration, topics } = parsedExamData;
    const imageFiles = req.files?.images || [];
    const excelFiles = req.files?.excelFiles || [];

    console.log('Received mixed exam data:', { title, description, duration, topicsCount: topics?.length });
    console.log('Received images:', imageFiles.length);
    console.log('Received excel files:', excelFiles.length);

    if (!title || !description || !duration || !topics) {
      cleanupFiles([...imageFiles, ...excelFiles]);
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      cleanupFiles([...imageFiles, ...excelFiles]);
      return res.status(400).json({ message: 'At least one topic is required' });
    }

    const processedTopics = topics.map((topic, topicIndex) => {
      if (!topic.name || !Array.isArray(topic.questions)) {
        throw new Error(`Topic ${topicIndex + 1} must have a name and questions array`);
      }

      const questions = topic.questions.map((question, qIndex) => {
        const questionType = question.questionType || 'mcq';
        
        console.log(`Processing question ${qIndex + 1} in topic ${topicIndex + 1}, type: ${questionType}`);

        // Handle different question types
        switch (questionType) {
          case 'mcq':
            return {
              question: question.question,
              questionType: 'mcq',
              options: question.options.map(opt => ({ text: opt, type: 'text' })),
              correctOption: question.correctOption
            };

          case 'excel':
            // Find the uploaded excel file for this question
            const excelFile = excelFiles.find(f => 
              f.originalname.includes(`topic${topicIndex}q${qIndex}_`)
            );
            
            if (!excelFile) {
              throw new Error(`Excel file not found for question ${qIndex + 1} in topic "${topic.name}"`);
            }

            return {
              question: question.question || 'Excel-based question',
              questionType: 'excel',
              excelFile: excelFile.filename,
              excelFileName: question.excelFileName || excelFile.originalname
            };

          case 'image':
            const processedImageQuestion = {
              question: question.question || '',
              questionType: 'image',
              options: [],
              correctOption: question.correctOption !== undefined ? question.correctOption : 0
            };

            // Handle question image
            if (question.imageRequired) {
              const imageFile = imageFiles.find(f => 
                f.originalname.includes(`topic${topicIndex}q${qIndex}_`)
              );
              if (imageFile) {
                processedImageQuestion.imageUrl = imageFile.filename;
              }
            }

            // Process options
            if (question.options && Array.isArray(question.options)) {
              processedImageQuestion.options = question.options.map((opt, optIndex) => {
                const option = { type: opt.type || 'text' };
                
                if (opt.type === 'image') {
                  const optImageFile = imageFiles.find(f => 
                    f.originalname.includes(`topic${topicIndex}q${qIndex}opt${optIndex}_`)
                  );
                  if (optImageFile) {
                    option.imageUrl = optImageFile.filename;
                  } else {
                    option.text = `Option ${optIndex + 1}`;
                    option.type = 'text';
                  }
                } else {
                  option.text = opt.text || `Option ${optIndex + 1}`;
                }
                
                return option;
              });
            } else {
              processedImageQuestion.options = [
                { type: 'text', text: 'Option A' },
                { type: 'text', text: 'Option B' },
                { type: 'text', text: 'Option C' },
                { type: 'text', text: 'Option D' }
              ];
            }

            return processedImageQuestion;

          case 'imageSequence':
            // Find sequence images for this question
            const sequenceImages = imageFiles
              .filter(f => f.originalname.includes(`topic${topicIndex}q${qIndex}seq`))
              .sort((a, b) => {
                const numA = parseInt(a.originalname.match(/seq(\d+)/)?.[1] || '0');
                const numB = parseInt(b.originalname.match(/seq(\d+)/)?.[1] || '0');
                return numA - numB;
              })
              .map(f => f.filename);

            if (sequenceImages.length === 0) {
              throw new Error(`No images uploaded for sequence question ${qIndex + 1} in topic "${topic.name}"`);
            }

            return {
              question: question.question || 'Arrange in correct order',
              questionType: 'imageSequence',
              imageSequence: sequenceImages,
              sequenceOrder: question.sequenceOrder || Array.from({ length: sequenceImages.length }, (_, i) => i),
            };

          default:
            throw new Error(`Unknown question type: ${questionType}`);
        }
      });

      return {
        name: topic.name,
        questions
      };
    });

    const exam = new Exam({
      title,
      description,
      duration: parseInt(duration),
      topics: processedTopics,
      createdBy: req.user.id,
      examType: 'mixed',
      createdAt: new Date(),
      isActive: true
    });

    await exam.save();

    res.status(201).json({
      message: 'Mixed exam uploaded successfully',
      exam: {
        _id: exam._id,
        title: exam.title,
        examType: exam.examType,
        topics: exam.topics.map(t => ({ 
          name: t.name, 
          questionCount: t.questions.length,
          questionTypes: [...new Set(t.questions.map(q => q.questionType))]
        })),
        totalQuestions: exam.totalQuestions
      }
    });
  } catch (error) {
    console.error('Error uploading mixed exam:', error);
    cleanupFiles([...(req.files?.images || []), ...(req.files?.excelFiles || [])]);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to clean up files
function cleanupFiles(files) {
  if (files && files.length > 0) {
    files.forEach(file => {
      try {
        if (file?.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    });
  }
}

// ============== EXISTING ADMIN ROUTES ==============
// Get all students
router.get('/students', async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all results
router.get('/results', async (req, res) => {
  try {
    const results = await Result.find()
      .populate('student', 'name email')
      .populate('exam', 'title duration examType')
      .sort({ completedAt: -1 });
    res.json(results);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete exam
router.delete('/exams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const hasResults = await Result.exists({ exam: id });
    
    if (hasResults) {
      await Exam.findByIdAndUpdate(id, { isActive: false });
      res.json({ message: 'Exam deactivated successfully' });
    } else {
      await Exam.findByIdAndDelete(id);
      res.json({ message: 'Exam deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get exam statistics
router.get('/exam-stats/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    
    const results = await Result.find({ exam: examId });
    
    if (results.length === 0) {
      return res.json({
        totalAttempts: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        topicWiseAnalysis: []
      });
    }

    const scores = results.map(r => r.percentage);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    const topicAnalysis = {};
    results.forEach(result => {
      if (result.topicWiseScores) {
        result.topicWiseScores.forEach(topic => {
          if (!topicAnalysis[topic.topicName]) {
            topicAnalysis[topic.topicName] = {
              totalPercentage: 0,
              count: 0
            };
          }
          topicAnalysis[topic.topicName].totalPercentage += topic.percentage;
          topicAnalysis[topic.topicName].count++;
        });
      }
    });

    const topicWiseAnalysis = Object.keys(topicAnalysis).map(topicName => ({
      topicName,
      averagePercentage: topicAnalysis[topicName].totalPercentage / topicAnalysis[topicName].count
    }));

    res.json({
      totalAttempts: results.length,
      averageScore: averageScore.toFixed(2),
      highestScore: highestScore.toFixed(2),
      lowestScore: lowestScore.toFixed(2),
      topicWiseAnalysis
    });
  } catch (error) {
    console.error('Error fetching exam stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// Upload exam function (Excel) - remains unchanged
const uploadExam = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { title, description, duration } = req.body;
    
    if (!title || !description || !duration) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
      return res.status(400).json({ message: 'Title, description, and duration are required' });
    }

    let workbook;
    try {
      workbook = xlsx.readFile(req.file.path);
    } catch (parseError) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
      return res.status(400).json({ message: 'Invalid Excel file format' });
    }

    const topics = [];

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      const questions = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row && row.length >= 6 && row[0] && row[0].toString().trim() !== '') {
          const correctOption = parseInt(row[5]);
          if (isNaN(correctOption) || correctOption < 1 || correctOption > 4) {
            continue;
          }

          questions.push({
            question: row[0].toString().trim(),
            questionType: 'text',
            options: [
              { text: (row[1] || '').toString().trim(), type: 'text' },
              { text: (row[2] || '').toString().trim(), type: 'text' },
              { text: (row[3] || '').toString().trim(), type: 'text' },
              { text: (row[4] || '').toString().trim(), type: 'text' }
            ],
            correctOption: correctOption - 1
          });
        }
      }

      if (questions.length > 0) {
        topics.push({
          name: sheetName,
          questions
        });
      }
    });

    if (topics.length === 0) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
      return res.status(400).json({ message: 'No valid questions found in the Excel file' });
    }

    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    const exam = new Exam({
      title,
      description,
      duration: parseInt(duration),
      topics,
      createdBy: req.user.id,
      examType: 'excel',
      createdAt: new Date(),
      isActive: true
    });

    await exam.save();

    res.status(201).json({
      message: 'Exam uploaded successfully',
      exam: {
        _id: exam._id,
        title: exam.title,
        topics: exam.topics.map(t => ({ 
          name: t.name, 
          questionCount: t.questions.length 
        }))
      }
    });
  } catch (error) {
    console.error('Error in uploadExam:', error);
    
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({ message: error.message });
  }
};

module.exports = router;