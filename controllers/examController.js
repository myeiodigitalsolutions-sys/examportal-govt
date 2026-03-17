const Exam = require('../models/Exam');
const Result = require('../models/Result');
const { shuffleArray } = require('../utils/shuffle');

const getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({ isActive: true })
      .select('-topics.questions.correctOption -topics.questions.imageSequence -topics.questions.sequenceOrder')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    const formattedExams = exams.map(exam => ({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      examType: exam.examType,
      topics: exam.topics.map(t => ({ 
        name: t.name, 
        questionCount: t.questions.length,
        questionTypes: [...new Set(t.questions.map(q => q.questionType))]
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

    // ────────────────────────────────────────────────────────────────
    // Base URL for serving static files (adjust in production)
    const baseUrl = process.env.BASE_URL || 'https://examportal-govt.onrender.com/api';
    const imagePrefix = `${baseUrl}/uploads/images/`;
    const excelPrefix = `${baseUrl}/uploads/excel/`;
    // ────────────────────────────────────────────────────────────────

    const randomizedQuestions = [];
    const questionOrder = [];
    const allQuestionsInfo = [];

    exam.topics.forEach((topic, topicIndex) => {
      const topicQuestionIndices = Array.from(
        { length: topic.questions.length }, 
        (_, i) => i
      );
      
      const shuffledTopicIndices = shuffleArray(topicQuestionIndices);
      
      shuffledTopicIndices.forEach((originalIndex, positionInTopic) => {
        const question = topic.questions[originalIndex];
        
        const preparedQuestion = {
          _id: question._id,
          questionType: question.questionType,
          topicName: topic.name,
          topicIndex: topicIndex,
          originalIndex: originalIndex,
          displayOrderInTopic: positionInTopic
        };

        switch (question.questionType) {
          case 'text':
          case 'mcq':
            preparedQuestion.question = question.question;
            preparedQuestion.options = question.options.map(opt => ({
              text: opt.text,
              type: opt.type || 'text',
              imageUrl: opt.imageUrl
                ? (opt.imageUrl.startsWith('http')
                    ? opt.imageUrl
                    : `${imagePrefix}${opt.imageUrl}`)
                : null
            }));
            break;
          
          case 'image':
            preparedQuestion.question = question.question || 'Identify the image';

            // Add full image URL
            if (question.imageUrl) {
              preparedQuestion.imageUrl = question.imageUrl.startsWith('http')
                ? question.imageUrl
                : `${imagePrefix}${question.imageUrl}`;
            }

            preparedQuestion.options = question.options.map(opt => ({
              text: opt.text || '',
              type: opt.type || 'text',
              imageUrl: opt.imageUrl
                ? (opt.imageUrl.startsWith('http')
                    ? opt.imageUrl
                    : `${imagePrefix}${opt.imageUrl}`)
                : null
            }));
            break;

          case 'excel':
            preparedQuestion.question = question.question || 'Excel-based question';
            preparedQuestion.excelFile = question.excelFile
              ? (question.excelFile.startsWith('http')
                  ? question.excelFile
                  : `${excelPrefix}${question.excelFile}`)
              : null;
            preparedQuestion.excelFileName = question.excelFileName;
            break;
          
          case 'imageSequence':
            preparedQuestion.question = question.question || 'Arrange in correct order';
            preparedQuestion.imageSequence = question.imageSequence.map(img =>
              img.startsWith('http') ? img : `${imagePrefix}${img}`
            );
            preparedQuestion.displaySequence = shuffleArray([...question.imageSequence]).map(img =>
              img.startsWith('http') ? img : `${imagePrefix}${img}`
            );
            preparedQuestion.correctOrder = question.sequenceOrder;
            break;

          default:
            break;
        }

        randomizedQuestions.push(preparedQuestion);

        allQuestionsInfo.push({
          topicIndex,
          topicName: topic.name,
          originalIndex,
          questionType: question.questionType,
          correctOption: question.correctOption,
          sequenceOrder: question.sequenceOrder,
          _id: question._id
        });
      });

      questionOrder.push({
        topicName: topic.name,
        questionCount: topic.questions.length,
        startIndex: randomizedQuestions.length - topic.questions.length,
        questionTypes: [...new Set(topic.questions.map(q => q.questionType))]
      });
    });

    res.json({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      examType: exam.examType,
      topics: exam.topics.map(t => ({ 
        name: t.name, 
        questionCount: t.questions.length,
        questionTypes: [...new Set(t.questions.map(q => q.questionType))]
      })),
      questions: randomizedQuestions,
      questionOrder: randomizedQuestions.map((_, index) => index),
      topicOrder: questionOrder,
      allQuestionsInfo
    });
  } catch (error) {
    console.error('Error in getExamById:', error);
    res.status(500).json({ message: error.message });
  }
};

const submitExam = async (req, res) => {
  try {
    const { examId, answers, timeSpent } = req.body;
    const studentId = req.user.id;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const existingResult = await Result.findOne({
      student: studentId,
      exam: examId
    });

    if (existingResult) {
      return res.status(400).json({ message: 'You have already submitted this exam' });
    }

    let totalScore = 0;
    const topicWiseScores = [];
    const questionResults = [];

    const topicQuestions = {};
    exam.topics.forEach((topic, topicIndex) => {
      topicQuestions[topicIndex] = {
        name: topic.name,
        total: topic.questions.length,
        correct: 0,
        questions: []
      };
    });

    answers.forEach((answer, index) => {
      const questionInfo = exam.allQuestionsInfo?.[index] || 
                          exam.topics.flatMap((t, ti) => 
                            t.questions.map((q, qi) => ({
                              topicIndex: ti,
                              originalIndex: qi,
                              questionType: q.questionType,
                              correctOption: q.correctOption,
                              sequenceOrder: q.sequenceOrder
                            }))
                          )[index];

      if (questionInfo) {
        const isCorrect = evaluateAnswer(answer, questionInfo);
        
        if (isCorrect) {
          totalScore++;
          if (topicQuestions[questionInfo.topicIndex]) {
            topicQuestions[questionInfo.topicIndex].correct++;
          }
        }

        questionResults.push({
          questionIndex: index,
          isCorrect,
          studentAnswer: answer,
          topicIndex: questionInfo.topicIndex
        });
      }
    });

    Object.keys(topicQuestions).forEach(topicIndex => {
      const topic = topicQuestions[topicIndex];
      if (topic.total > 0) {
        topicWiseScores.push({
          topicName: topic.name,
          score: topic.correct,
          totalQuestions: topic.total,
          percentage: (topic.correct / topic.total) * 100
        });
      }
    });

    const result = new Result({
      student: studentId,
      exam: examId,
      score: totalScore,
      totalQuestions: exam.topics.reduce((sum, t) => sum + t.questions.length, 0),
      percentage: (totalScore / exam.topics.reduce((sum, t) => sum + t.questions.length, 0)) * 100,
      topicWiseScores,
      answers: questionResults,
      timeSpent,
      completedAt: new Date()
    });

    await result.save();

    res.json({
      message: 'Exam submitted successfully',
      result: {
        score: result.score,
        totalQuestions: result.totalQuestions,
        percentage: result.percentage,
        topicWiseScores: result.topicWiseScores
      }
    });
  } catch (error) {
    console.error('Error submitting exam:', error);
    res.status(500).json({ message: error.message });
  }
};

const evaluateAnswer = (answer, questionInfo) => {
  switch (questionInfo.questionType) {
    case 'text':
    case 'image':
    case 'mcq':
      return answer.selectedOption === questionInfo.correctOption;
    
    case 'imageSequence':
      return JSON.stringify(answer.sequence) === JSON.stringify(questionInfo.sequenceOrder);
    
    case 'excel':
      return answer.selectedOption === questionInfo.correctOption;
    
    default:
      return false;
  }
};

module.exports = { 
  getAllExams, 
  getExamById,
  submitExam 
};