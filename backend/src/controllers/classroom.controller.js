const classroomService = require('../services/classroom.service');
const insightService = require('../services/insight.service');
const { sendResponse } = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createClassroom = asyncHandler(async (req, res) => {
  const classroom = await classroomService.createClassroom(req.user.id, req.body);
  sendResponse(res, 201, 'Classroom created successfully', classroom);
});

const joinClassroom = asyncHandler(async (req, res) => {
  const classroom = await classroomService.joinClassroom(
    req.user.id,
    req.body.joinCode
  );
  sendResponse(res, 200, 'Joined classroom successfully', classroom);
});

const getClassrooms = asyncHandler(async (req, res) => {
  const classrooms = await classroomService.getClassrooms(
    req.user.id,
    req.user.role
  );
  sendResponse(res, 200, 'Classrooms retrieved successfully', classrooms);
});

const getClassroomById = asyncHandler(async (req, res) => {
  const classroom = await classroomService.getClassroomById(
    req.user.id,
    req.user.role,
    req.params.id
  );
  sendResponse(res, 200, 'Classroom retrieved successfully', classroom);
});

const getClassroomInsights = asyncHandler(async (req, res) => {
  const insights = await insightService.getClassroomInsights(req.user.id, req.params.id);
  sendResponse(res, 200, 'Classroom insights retrieved successfully', insights);
});

const getClassroomStudents = asyncHandler(async (req, res) => {
  const students = await classroomService.getClassroomStudents(
    req.user.id,
    req.params.id
  );
  sendResponse(res, 200, 'Classroom students retrieved successfully', students);
});

const leaveClassroom = asyncHandler(async (req, res) => {
  const classroom = await classroomService.leaveClassroom(req.user.id, req.params.id);
  sendResponse(res, 200, 'Left classroom successfully', classroom);
});

const regenerateJoinCode = asyncHandler(async (req, res) => {
  const classroom = await classroomService.regenerateJoinCode(
    req.user.id,
    req.params.id
  );
  sendResponse(res, 200, 'Classroom join code regenerated successfully', classroom);
});

module.exports = {
  createClassroom,
  joinClassroom,
  getClassrooms,
  getClassroomById,
  getClassroomInsights,
  getClassroomStudents,
  leaveClassroom,
  regenerateJoinCode,
};
