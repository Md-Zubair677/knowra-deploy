const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const Classroom = require('../models/Classroom');
const ConceptGap = require('../models/ConceptGap');
const aiService = require('./ai.service');
const logger = require('../utils/logger');

const isValidId = (id) => /^[a-f\d]{24}$/i.test(id);
const severityWeights = { low: 1, medium: 2, high: 3 };
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const rankLearningGaps = (gaps, now, limit) => {
  const nowMs = new Date(now).getTime();

  return gaps.map((gap) => {
    const lastSeenMs = new Date(gap.updatedAt || gap.createdAt).getTime();
    const daysSinceLastSeen = Math.max(0, (nowMs - lastSeenMs) / MILLISECONDS_PER_DAY);
    const severityWeight = severityWeights[gap.severity];
    const priority = severityWeight
      * gap.occurrences
      / (1 + daysSinceLastSeen / 14);

    return {
      concept: gap.concept,
      severity: gap.severity,
      occurrences: gap.occurrences,
      daysSinceLastSeen,
      priority,
    };
  })
    .sort((left, right) =>
      right.priority - left.priority
      || left.concept.localeCompare(right.concept)
    )
    .slice(0, limit);
};

const aggregateGaps = (filter) => ConceptGap.aggregate([
  { $match: filter },
  {
    $group: {
      _id: '$conceptKey',
      concept: { $first: '$concept' },
      totalOccurrences: { $sum: '$occurrences' },
      students: { $addToSet: '$student' },
      severityRank: {
        $max: {
          $switch: {
            branches: [
              { case: { $eq: ['$severity', 'high'] }, then: 3 },
              { case: { $eq: ['$severity', 'medium'] }, then: 2 },
            ],
            default: 1,
          },
        },
      },
    },
  },
  {
    $project: {
      _id: 0,
      concept: 1,
      totalOccurrences: 1,
      studentCount: { $size: '$students' },
      severity: {
        $switch: {
          branches: [
            { case: { $eq: ['$severityRank', 3] }, then: 'high' },
            { case: { $eq: ['$severityRank', 2] }, then: 'medium' },
          ],
          default: 'low',
        },
      },
    },
  },
  { $sort: { totalOccurrences: -1, concept: 1 } },
]);

const recordDoubtGaps = async (doubt, gaps) => {
  const uniqueGaps = new Map();
  const severityRank = { low: 1, medium: 2, high: 3 };

  for (const { concept, severity } of gaps) {
    const displayName = concept.replace(/\s+/g, ' ').trim().slice(0, 80).trim();
    const key = displayName.toLowerCase();
    const current = uniqueGaps.get(key);
    if (!current) {
      uniqueGaps.set(key, { concept: displayName, conceptKey: key, severity });
    } else if (severityRank[severity] > severityRank[current.severity]) {
      uniqueGaps.set(key, { ...current, severity });
    }
  }

  const recordedGaps = await Promise.all(
    [...uniqueGaps.values()].map(async ({ concept, conceptKey, severity }) => {
      const filter = { student: doubt.student, conceptKey };
      const update = {
        $setOnInsert: {
          classroom: doubt.classroom,
          student: doubt.student,
          subject: doubt.subject,
          concept,
          conceptKey,
          prerequisiteOf: doubt.topic,
          severity,
        },
        $inc: { occurrences: 1 },
        $addToSet: { doubts: doubt._id },
      };
      const options = {
        returnDocument: 'after',
        upsert: true,
        runValidators: true,
      };

      let gap;
      try {
        gap = await ConceptGap.findOneAndUpdate(filter, update, options);
      } catch (error) {
        if (error.code !== 11000) throw error;
        gap = await ConceptGap.findOneAndUpdate(filter, update, {
          ...options,
          upsert: false,
        });
      }

      const rankExpression = {
        $switch: {
          branches: [
            { case: { $eq: ['$severity', 'high'] }, then: 3 },
            { case: { $eq: ['$severity', 'medium'] }, then: 2 },
            { case: { $eq: ['$severity', 'low'] }, then: 1 },
          ],
          default: 0,
        },
      };
      return ConceptGap.findOneAndUpdate(
        filter,
        [{
          $set: {
            severity: {
              $cond: [
                { $gte: [severityRank[severity], rankExpression] },
                severity,
                '$severity',
              ],
            },
          },
        }],
        { returnDocument: 'after', updatePipeline: true }
      ).then((updatedGap) => updatedGap || gap);
    })
  );

  return recordedGaps;
};

const getClassroomGaps = async (teacherId, classroomId) => {
  if (!isValidId(classroomId)) throw new ApiError(400, 'Invalid classroom ID');

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  if (classroom.teacher.toString().toLowerCase() !== teacherId.toLowerCase()) {
    throw new ApiError(403, 'You do not have permission to access this classroom');
  }

  return aggregateGaps({ classroom: new mongoose.Types.ObjectId(classroomId) });
};

const getStudentGaps = async (requesterId, requesterRole, studentId) => {
  if (!isValidId(studentId)) throw new ApiError(400, 'Invalid student ID');

  let filter = { student: new mongoose.Types.ObjectId(studentId) };

  if (requesterRole === 'student') {
    if (requesterId.toLowerCase() !== studentId.toLowerCase()) {
      throw new ApiError(403, 'You do not have permission to access this student');
    }
  } else if (requesterRole === 'teacher') {
    const classrooms = await Classroom.find({
      teacher: requesterId,
      students: studentId,
    }).select('_id');

    if (classrooms.length === 0) {
      throw new ApiError(403, 'You do not have permission to access this student');
    }

    filter = {
      ...filter,
      classroom: { $in: classrooms.map(({ _id }) => _id) },
    };
  } else {
    throw new ApiError(403, 'You do not have permission to access student gaps');
  }

  return aggregateGaps(filter);
};

const getStudentLearningPlan = async (requesterId, requesterRole, studentId, limit) => {
  if (!isValidId(studentId)) throw new ApiError(400, 'Invalid student ID');

  let filter = { student: new mongoose.Types.ObjectId(studentId) };

  if (requesterRole === 'student') {
    if (requesterId.toLowerCase() !== studentId.toLowerCase()) {
      throw new ApiError(403, 'You do not have permission to access this student');
    }
  } else if (requesterRole === 'teacher') {
    const classrooms = await Classroom.find({
      teacher: requesterId,
      students: studentId,
    }).select('_id');

    if (classrooms.length === 0) {
      throw new ApiError(403, 'You do not have permission to access this student');
    }

    filter = {
      ...filter,
      classroom: { $in: classrooms.map(({ _id }) => _id) },
    };
  } else {
    throw new ApiError(403, 'You do not have permission to access student learning plans');
  }

  const gaps = await ConceptGap.find(filter)
    .select('concept severity occurrences updatedAt createdAt')
    .lean();
  const ranked = rankLearningGaps(gaps, new Date(), limit);
  const request = {
    gaps: ranked.map((gap) => ({
      concept: gap.concept,
      severity: gap.severity,
      occurrences: gap.occurrences,
      days_since_last_seen: gap.daysSinceLastSeen,
    })),
    limit,
  };

  try {
    const generatedPlan = await aiService.generateLearningPlan(request);
    return {
      ranked,
      plan: generatedPlan ? generatedPlan.plan : [],
      aiAvailable: Boolean(generatedPlan),
    };
  } catch (error) {
    logger.warn('AI learning plan unavailable:', error.message);
    return { ranked, plan: [], aiAvailable: false };
  }
};

module.exports = {
  recordDoubtGaps,
  getClassroomGaps,
  getStudentGaps,
  rankLearningGaps,
  getStudentLearningPlan,
};
