const Result = require('../models/Result');
const Exam = require('../models/Exam');

const submitExam = async (req, res) => {
  try {
    const { answers, questionOrder } = req.body;
    const exam = await Exam.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (!exam.isActive) {
      return res.status(400).json({ message: 'This exam is no longer active' });
    }

    // Check if student already submitted
    const existingResult = await Result.findOne({
      student: req.user.id,
      exam: exam._id
    });

    if (existingResult) {
      return res.status(400).json({ 
        message: 'You have already submitted this exam',
        result: {
          score: existingResult.score,
          totalQuestions: existingResult.totalQuestions,
          percentage: existingResult.percentage
        }
      });
    }

    // Validate answers array
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: 'Invalid answers format' });
    }

    // Calculate score using original indices
    let score = 0;
    answers.forEach((answer) => {
      const originalIndex = answer.questionIndex;
      if (originalIndex >= 0 && originalIndex < exam.questions.length) {
        if (exam.questions[originalIndex].correctOption === answer.selectedOption) {
          score++;
        }
      }
    });

    const percentage = (score / exam.questions.length) * 100;

    const result = new Result({
      student: req.user.id,
      exam: exam._id,
      answers,
      questionOrder: questionOrder || [],
      score,
      totalQuestions: exam.questions.length,
      percentage
    });

    await result.save();

    res.json({
      message: 'Exam submitted successfully',
      score,
      totalQuestions: exam.questions.length,
      percentage: percentage.toFixed(2)
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You have already submitted this exam' });
    }
    res.status(500).json({ message: error.message });
  }
};

const getRankings = async (req, res) => {
  try {
    const rankings = await Result.find({ exam: req.params.examId })
      .populate('student', 'name email')
      .sort({ percentage: -1, completedAt: 1 })
      .limit(10);

    const formattedRankings = rankings.map((result, index) => ({
      rank: index + 1,
      studentName: result.student?.name || 'Unknown',
      email: result.student?.email,
      score: result.score,
      totalQuestions: result.totalQuestions,
      percentage: result.percentage.toFixed(2),
      completedAt: result.completedAt
    }));

    res.json(formattedRankings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyResults = async (req, res) => {
  try {
    const results = await Result.find({ student: req.user.id })
      .populate('exam', 'title description')
      .sort({ completedAt: -1 });

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkExamStatus = async (req, res) => {
  try {
    const result = await Result.findOne({
      student: req.user.id,
      exam: req.params.examId
    });

    res.json({
      completed: !!result,
      result: result ? {
        score: result.score,
        totalQuestions: result.totalQuestions,
        percentage: result.percentage,
        completedAt: result.completedAt
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { submitExam, getRankings, getMyResults, checkExamStatus };