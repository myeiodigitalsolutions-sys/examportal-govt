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
    const sheetNames = workbook.SheetNames;
    
    if (sheetNames.length === 0) {
      return res.status(400).json({ message: 'Excel file has no sheets' });
    }

    const topics = [];

    // Process each sheet as a topic
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet);

      if (data.length === 0) {
        continue; // Skip empty sheets
      }

      const questions = data.map((row, index) => {
        // Validate each row (case-insensitive column names)
        const question = row.Question || row.question || row.QUESTIONS || row.questions;
        const option1 = row.Option1 || row.option1 || row.OPTION1;
        const option2 = row.Option2 || row.option2 || row.OPTION2;
        const option3 = row.Option3 || row.option3 || row.OPTION3;
        const option4 = row.Option4 || row.option4 || row.OPTION4;
        const correctOption = parseInt(row.CorrectOption || row.correctOption || row.CORRECTOPTION || row['Correct Option']);

        if (!question || !option1 || !option2 || !option3 || !option4) {
          throw new Error(`Missing question or options at row ${index + 2} in sheet "${sheetName}"`);
        }

        if (isNaN(correctOption) || correctOption < 1 || correctOption > 4) {
          throw new Error(`Correct option must be between 1-4 at row ${index + 2} in sheet "${sheetName}"`);
        }

        return {
          question: String(question).trim(),
          options: [
            String(option1).trim(),
            String(option2).trim(),
            String(option3).trim(),
            String(option4).trim()
          ],
          correctOption: correctOption - 1 // Convert to 0-based index
        };
      });

      if (questions.length > 0) {
        topics.push({
          name: sheetName,
          questions
        });
      }
    }

    if (topics.length === 0) {
      return res.status(400).json({ message: 'No valid questions found in any sheet' });
    }

    const exam = new Exam({
      title,
      description,
      duration: parseInt(duration),
      topics,
      createdBy: req.user.id
    });

    await exam.save();
    
    // Calculate total questions across all topics
    const totalQuestions = topics.reduce((sum, topic) => sum + topic.questions.length, 0);

    res.status(201).json({ 
      message: 'Exam uploaded successfully', 
      exam: {
        id: exam._id,
        title: exam.title,
        description: exam.description,
        duration: exam.duration,
        topics: topics.map(t => ({ name: t.name, questionCount: t.questions.length })),
        totalQuestions
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
      .populate('exam', 'title topics')
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
        lowestScore: '0.00',
        topicWiseAnalysis: []
      });
    }

    const totalAttempts = results.length;
    const averageScore = results.reduce((sum, r) => sum + r.percentage, 0) / totalAttempts;
    const highestScore = Math.max(...results.map(r => r.percentage));
    const lowestScore = Math.min(...results.map(r => r.percentage));

    // Topic-wise analysis
    const topicWiseAnalysis = [];
    
    if (results[0].topicWiseScores && results[0].topicWiseScores.length > 0) {
      const topicStats = {};
      
      // Aggregate topic-wise scores
      results.forEach(result => {
        if (result.topicWiseScores) {
          result.topicWiseScores.forEach(topic => {
            if (!topicStats[topic.topicName]) {
              topicStats[topic.topicName] = {
                topicName: topic.topicName,
                totalPercentage: 0,
                totalScore: 0,
                totalQuestions: 0,
                count: 0
              };
            }
            topicStats[topic.topicName].totalPercentage += topic.percentage;
            topicStats[topic.topicName].totalScore += topic.score;
            topicStats[topic.topicName].totalQuestions += topic.totalQuestions;
            topicStats[topic.topicName].count++;
          });
        }
      });

      // Calculate averages
      Object.values(topicStats).forEach(stat => {
        topicWiseAnalysis.push({
          topicName: stat.topicName,
          averagePercentage: (stat.totalPercentage / stat.count).toFixed(2),
          totalAttempts: stat.count,
          totalScore: stat.totalScore,
          totalQuestions: stat.totalQuestions,
          averageScore: (stat.totalScore / stat.count).toFixed(2)
        });
      });
    }

    res.json({
      totalAttempts,
      averageScore: averageScore.toFixed(2),
      highestScore: highestScore.toFixed(2),
      lowestScore: lowestScore.toFixed(2),
      topicWiseAnalysis
    });
  } catch (error) {
    console.error('Error fetching exam stats:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { 
  uploadExam, 
  getAllStudents, 
  getAllResults, 
  deleteExam, 
  getExamStats 
};