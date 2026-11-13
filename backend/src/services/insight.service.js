const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const Classroom = require('../models/Classroom');
const ConceptGap = require('../models/ConceptGap');
const Doubt = require('../models/Doubt');

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const getClassroomInsights = async (teacherId, classroomId, now = new Date()) => {
  const objectId = new mongoose.Types.ObjectId(classroomId);
  const [classroom] = await Classroom.aggregate([
    { $match: { _id: objectId } },
    {
      $project: {
        teacher: 1,
        activeStudents: { $size: { $ifNull: ['$students', []] } },
      },
    },
  ]);

  if (!classroom) throw new ApiError(404, 'Classroom not found');
  if (classroom.teacher.toString().toLowerCase() !== teacherId.toLowerCase()) {
    throw new ApiError(403, 'You do not have permission to access this classroom');
  }

  const [doubtMetrics, topGaps, studentsNeedingAttention] = await Promise.all([
    Doubt.aggregate([
      { $match: { classroom: objectId } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    ConceptGap.aggregate([
      { $match: { classroom: objectId } },
      {
        $group: {
          _id: '$conceptKey',
          concept: { $first: '$concept' },
          totalOccurrences: { $sum: '$occurrences' },
          students: { $addToSet: '$student' },
        },
      },
      {
        $project: {
          _id: 0,
          concept: 1,
          totalOccurrences: 1,
          studentCount: { $size: '$students' },
        },
      },
      { $sort: { totalOccurrences: -1, concept: 1 } },
      { $limit: 5 },
    ]),
    ConceptGap.aggregate([
      { $match: { classroom: objectId } },
      {
        $addFields: {
          severityWeight: {
            $switch: {
              branches: [
                { case: { $eq: ['$severity', 'high'] }, then: 3 },
                { case: { $eq: ['$severity', 'medium'] }, then: 2 },
              ],
              default: 1,
            },
          },
          lastSeenAt: { $ifNull: ['$updatedAt', '$createdAt'] },
        },
      },
      {
        $addFields: {
          priority: {
            $multiply: [
              '$severityWeight',
              '$occurrences',
              {
                $divide: [
                  1,
                  {
                    $add: [
                      1,
                      {
                        $divide: [
                          {
                            $max: [
                              0,
                              {
                                $divide: [
                                  { $subtract: [now, '$lastSeenAt'] },
                                  MILLISECONDS_PER_DAY,
                                ],
                              },
                            ],
                          },
                          14,
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$student',
          score: { $sum: '$priority' },
        },
      },
      { $sort: { score: -1, _id: 1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      {
        $project: {
          _id: 0,
          name: '$student.name',
          score: 1,
        },
      },
    ]),
  ]);

  const countsByStatus = { pending: 0, answered: 0, failed: 0 };
  for (const { _id, count } of (doubtMetrics[0]?.byStatus || [])) {
    countsByStatus[_id] = count;
  }

  return {
    totalDoubts: doubtMetrics[0]?.total[0]?.count || 0,
    doubtsByStatus: countsByStatus,
    activeStudents: classroom.activeStudents,
    topGaps,
    studentsNeedingAttention,
  };
};

module.exports = { getClassroomInsights };
