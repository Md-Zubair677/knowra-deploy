const gapService = require('../services/gap.service');
const { sendResponse } = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getClassroomGaps = asyncHandler(async (req, res) => {
  const gaps = await gapService.getClassroomGaps(req.user.id, req.params.id);
  sendResponse(res, 200, 'Classroom concept gaps retrieved successfully', gaps);
});

const getStudentGaps = asyncHandler(async (req, res) => {
  const gaps = await gapService.getStudentGaps(
    req.user.id,
    req.user.role,
    req.params.id
  );
  sendResponse(res, 200, 'Student concept gaps retrieved successfully', gaps);
});

const getStudentLearningPlan = asyncHandler(async (req, res) => {
  const learningPlan = await gapService.getStudentLearningPlan(
    req.user.id,
    req.user.role,
    req.params.id,
    req.query.limit
  );
  sendResponse(res, 200, 'Student learning plan retrieved successfully', learningPlan);
});

module.exports = { getClassroomGaps, getStudentGaps, getStudentLearningPlan };
