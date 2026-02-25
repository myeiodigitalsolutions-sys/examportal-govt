const Exam = require('../models/Exam');
const Result = require('../models/Result');
const { shuffleArray } = require('../utils/shuffle');

const getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({ isActive: true })
      .select('-questions.correctOption')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (!exam.isActive) {
      return res.status(404).json({ message: 'Exam is no longer available' });
    }

    // Check if student already has a result
    const existingResult = await Result.findOne({
      student: req.user.id,
      exam: exam._id
    });

    if (existingResult) {
      return res.status(400).json({ 
        message: 'You have already completed this exam',
        completed: true,
        result: {
          score: existingResult.score,
          totalQuestions: existingResult.totalQuestions,
          percentage: existingResult.percentage,
          completedAt: existingResult.completedAt
        }
      });
    }

    // Create randomized order for new attempt
    const questionOrder = Array.from({ length: exam.questions.length }, (_, i) => i);
    const shuffledOrder = shuffleArray(questionOrder);
    
    const randomizedQuestions = shuffledOrder.map(index => ({
      question: exam.questions[index].question,
      options: exam.questions[index].options,
      originalIndex: index
    }));

    res.json({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      questions: randomizedQuestions,
      questionOrder: shuffledOrder
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getAllExams, getExamById };