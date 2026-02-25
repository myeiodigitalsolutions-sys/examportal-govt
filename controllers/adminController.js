const User = require('../models/User');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const xlsx = require('xlsx');

const uploadExam = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { title, description, duration } = req.body;
    
    if (!title || !description || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ message: 'Excel file is empty' });
    }

    const questions = data.map((row, index) => {
      // Validate each row
      const question = row.Question || row.question;
      const option1 = row.Option1 || row.option1;
      const option2 = row.Option2 || row.option2;
      const option3 = row.Option3 || row.option3;
      const option4 = row.Option4 || row.option4;
      const correctOption = parseInt(row.CorrectOption || row.correctOption);

      if (!question || !option1 || !option2 || !option3 || !option4 || !correctOption) {
        throw new Error(`Invalid data at row ${index + 2}`);
      }

      if (correctOption < 1 || correctOption > 4) {
        throw new Error(`Correct option must be between 1-4 at row ${index + 2}`);
      }

      return {
        question,
        options: [option1, option2, option3, option4],
        correctOption: correctOption - 1 // Convert to 0-based index
      };
    });

    const exam = new Exam({
      title,
      description,
      duration: parseInt(duration),
      questions,
      createdBy: req.user.id
    });

    await exam.save();
    res.status(201).json({ 
      message: 'Exam uploaded successfully', 
      exam: {
        id: exam._id,
        title: exam.title,
        description: exam.description,
        duration: exam.duration,
        questionsCount: exam.questions.length
      } 
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
};

const getAllStudents = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const students = await User.find({ role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllResults = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = await Result.find()
      .populate('student', 'name email')
      .populate('exam', 'title')
      .sort({ completedAt: -1 });
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteExam = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Soft delete - just mark as inactive
    exam.isActive = false;
    await exam.save();
    
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getExamStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = await Result.find({ exam: req.params.examId });
    
    if (results.length === 0) {
      return res.json({
        totalAttempts: 0,
        averageScore: '0.00',
        highestScore: '0.00',
        lowestScore: '0.00'
      });
    }

    const totalAttempts = results.length;
    const averageScore = results.reduce((sum, r) => sum + r.percentage, 0) / totalAttempts;
    const highestScore = Math.max(...results.map(r => r.percentage));
    const lowestScore = Math.min(...results.map(r => r.percentage));

    res.json({
      totalAttempts,
      averageScore: averageScore.toFixed(2),
      highestScore: highestScore.toFixed(2),
      lowestScore: lowestScore.toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { uploadExam, getAllStudents, getAllResults, deleteExam, getExamStats };