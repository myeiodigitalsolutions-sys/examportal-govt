const Exam = require('../models/Exam');
const Result = require('../models/Result');
const { shuffleArray } = require('../utils/shuffle');

const getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({ isActive: true })
      .select('-topics.questions.correctOption')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    // Format response to show topic counts
    const formattedExams = exams.map(exam => ({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      topics: exam.topics.map(t => ({ 
        name: t.name, 
        questionCount: t.questions.length 
      })),
      totalQuestions: exam.topics.reduce((sum, t) => sum + t.questions.length, 0),
      createdBy: exam.createdBy,
      createdAt: exam.createdAt,
      isActive: exam.isActive
    }));
    
    res.json(formattedExams);
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
          topicWiseScores: existingResult.topicWiseScores,
          completedAt: existingResult.completedAt
        }
      });
    }

    // Process each topic separately - shuffle questions WITHIN each topic
    const randomizedQuestions = [];
    const questionOrder = []; // This will store the order of questions as they appear
    const allQuestionsInfo = [];

    exam.topics.forEach((topic, topicIndex) => {
      // Create array of indices for this topic's questions
      const topicQuestionIndices = Array.from(
        { length: topic.questions.length }, 
        (_, i) => i
      );
      
      // Shuffle the indices for this topic only
      const shuffledTopicIndices = shuffleArray(topicQuestionIndices);
      
      // Add shuffled questions from this topic to the main list
      shuffledTopicIndices.forEach((originalIndex, positionInTopic) => {
        const question = topic.questions[originalIndex];
        
        randomizedQuestions.push({
          question: question.question,
          options: question.options,
          topicName: topic.name,
          topicIndex: topicIndex,
          originalIndex: originalIndex,
          displayTopicIndex: topicIndex, // Keep track of which topic this belongs to
          displayOrderInTopic: positionInTopic // Order within the topic
        });

        // Store info for answer validation
        allQuestionsInfo.push({
          topicIndex,
          topicName: topic.name,
          originalIndex,
          correctOption: question.correctOption
        });
      });

      // Add topic separator in questionOrder (optional - for frontend tracking)
      questionOrder.push({
        topicName: topic.name,
        questionCount: topic.questions.length,
        startIndex: randomizedQuestions.length - topic.questions.length
      });
    });

    // Create a flat list of question order for the frontend
    const flatQuestionOrder = randomizedQuestions.map((_, index) => index);

    res.json({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      topics: exam.topics.map(t => ({ 
        name: t.name, 
        questionCount: t.questions.length 
      })),
      questions: randomizedQuestions,
      questionOrder: flatQuestionOrder, // Flat array for answer submission
      topicOrder: questionOrder, // Topic grouping info for frontend
      allQuestionsInfo
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getAllExams, getExamById };