const Result = require('../models/Result');
const Exam = require('../models/Exam');

const submitExam = async (req, res) => {
  try {
    const { answers, questionOrder } = req.body;
    const exam = await Exam.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Check if already submitted
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
          percentage: existingResult.percentage,
          topicWiseScores: existingResult.topicWiseScores
        }
      });
    }

    // Flatten all questions with topic information (in the order they were presented)
    const allQuestions = [];
    exam.topics.forEach((topic, topicIndex) => {
      topic.questions.forEach((question, questionIndex) => {
        allQuestions.push({
          topicIndex,
          topicName: topic.name,
          questionIndex,
          correctOption: question.correctOption
        });
      });
    });

    // Calculate score and prepare answer details
    let score = 0;
    const answerDetails = [];
    const topicWiseStats = {};

    // Initialize topic-wise stats
    exam.topics.forEach((topic, topicIndex) => {
      topicWiseStats[topicIndex] = {
        topicName: topic.name,
        score: 0,
        totalQuestions: topic.questions.length,
        questions: []
      };
    });

    answers.forEach(answer => {
      // Since questions are presented in topic order, the questionOrder array
      // is just [0,1,2,3,...] because we're not shuffling across topics
      const questionInfo = allQuestions[answer.questionIndex];
      const isCorrect = answer.selectedOption === questionInfo.correctOption;
      
      if (isCorrect && answer.selectedOption !== -1) score++;
      
      answerDetails.push({
        questionIndex: answer.questionIndex,
        selectedOption: answer.selectedOption,
        isCorrect: isCorrect && answer.selectedOption !== -1,
        topicIndex: questionInfo.topicIndex,
        topicName: questionInfo.topicName
      });

      // Update topic-wise stats
      if (isCorrect && answer.selectedOption !== -1) {
        topicWiseStats[questionInfo.topicIndex].score++;
      }
    });

    // Calculate topic-wise percentages
    const topicWiseScores = Object.values(topicWiseStats).map(topic => ({
      topicName: topic.topicName,
      score: topic.score,
      totalQuestions: topic.totalQuestions,
      percentage: (topic.score / topic.totalQuestions) * 100
    }));

    const totalQuestions = allQuestions.length;
    const percentage = (score / totalQuestions) * 100;

    const result = new Result({
      student: req.user.id,
      exam: exam._id,
      score,
      totalQuestions,
      percentage,
      topicWiseScores,
      answers: answerDetails,
      questionOrder: Array.from({ length: totalQuestions }, (_, i) => i) // Simple order
    });

    await result.save();

    res.json({
      message: 'Exam submitted successfully',
      score,
      totalQuestions,
      percentage,
      topicWiseScores
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRankings = async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.examId })
      .populate('student', 'name')
      .sort({ percentage: -1, score: -1, completedAt: 1 })
      .limit(50);
    
    const rankings = results.map((result, index) => ({
      rank: index + 1,
      studentName: result.student.name,
      score: result.score,
      totalQuestions: result.totalQuestions,
      percentage: result.percentage.toFixed(2),
      topicWiseScores: result.topicWiseScores,
      completedAt: result.completedAt
    }));
    
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyResults = async (req, res) => {
  try {
    const results = await Result.find({ student: req.user.id })
      .populate('exam', 'title description duration topics')
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

    if (result) {
      return res.json({
        completed: true,
        result: {
          score: result.score,
          totalQuestions: result.totalQuestions,
          percentage: result.percentage,
          topicWiseScores: result.topicWiseScores,
          completedAt: result.completedAt
        }
      });
    }

    res.json({ completed: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { 
  submitExam, 
  getRankings, 
  getMyResults, 
  checkExamStatus 
};