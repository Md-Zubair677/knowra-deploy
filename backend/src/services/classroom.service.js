const { randomInt } = require('crypto');
const ApiError = require('../utils/ApiError');
const Classroom = require('../models/Classroom');
const Doubt = require('../models/Doubt');
const User = require('../models/User');

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 6;
const MAX_JOIN_CODE_ATTEMPTS = 5;

const generateJoinCode = () =>
  Array.from(
    { length: JOIN_CODE_LENGTH },
    () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]
  ).join('');

const isJoinCodeDuplicate = (error) =>
  error.code === 11000
  && (
    error.keyPattern?.joinCode
    || error.keyValue?.joinCode
    || error.message?.includes('joinCode')
  );

const createClassroom = async (teacherId, { name, subject }) => {
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await Classroom.create({
        name,
        subject,
        teacher: teacherId,
        students: [],
        joinCode: generateJoinCode(),
      });
    } catch (error) {
      if (!isJoinCodeDuplicate(error)) throw error;
    }
  }

  throw new ApiError(503, 'Could not generate a unique classroom join code; please try again');
};

const joinClassroom = async (studentId, joinCode) => {
  const classroom = await Classroom.findOneAndUpdate(
    { joinCode, students: { $ne: studentId } },
    { $addToSet: { students: studentId } },
    { returnDocument: 'after', runValidators: true }
  );

  if (classroom) return classroom;

  const existingClassroom = await Classroom.findOne({ joinCode });
  if (!existingClassroom) throw new ApiError(404, 'Classroom not found for this join code');
  throw new ApiError(409, 'You have already joined this classroom');
};

const getClassrooms = async (userId, role) => {
  let filter;
  if (role === 'teacher') {
    filter = { teacher: userId };
  } else if (role === 'student') {
    filter = { students: userId };
  } else {
    throw new ApiError(403, 'You do not have permission to access classrooms');
  }

  return Classroom.find(filter).sort({ createdAt: -1 });
};

const getClassroomById = async (userId, role, classroomId) => {
  if (!/^[a-f\d]{24}$/i.test(classroomId)) {
    throw new ApiError(400, 'Invalid classroom ID');
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new ApiError(404, 'Classroom not found');

  const isTeacher = role === 'teacher'
    && classroom.teacher.toString().toLowerCase() === userId.toLowerCase();
  const isJoinedStudent = role === 'student'
    && classroom.students.some(
      (studentId) => studentId.toString().toLowerCase() === userId.toLowerCase()
    );

  if (!isTeacher && !isJoinedStudent) {
    throw new ApiError(403, 'You do not have permission to access this classroom');
  }

  return classroom;
};

const getClassroomStudents = async (teacherId, classroomId) => {
  if (!/^[a-f\d]{24}$/i.test(classroomId)) {
    throw new ApiError(400, 'Invalid classroom ID');
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  if (classroom.teacher.toString().toLowerCase() !== teacherId.toLowerCase()) {
    throw new ApiError(403, 'You do not have permission to access this classroom');
  }

  const [students, doubtCounts] = await Promise.all([
    User.find({ _id: { $in: classroom.students } }).select('name email').lean(),
    Doubt.aggregate([
      { $match: { classroom: classroom._id, student: { $in: classroom.students } } },
      { $group: { _id: '$student', doubtCount: { $sum: 1 } } },
    ]),
  ]);
  const countByStudentId = new Map(
    doubtCounts.map(({ _id, doubtCount }) => [_id.toString(), doubtCount])
  );

  return students
    .map((student) => ({
      _id: student._id,
      name: student.name,
      email: student.email,
      doubtCount: countByStudentId.get(student._id.toString()) || 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const leaveClassroom = async (studentId, classroomId) => {
  if (!/^[a-f\d]{24}$/i.test(classroomId)) {
    throw new ApiError(400, 'Invalid classroom ID');
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  const isMember = classroom.students.some(
    (memberId) => memberId.toString().toLowerCase() === studentId.toLowerCase()
  );
  if (!isMember) throw new ApiError(409, 'You have not joined this classroom');

  const updatedClassroom = await Classroom.findOneAndUpdate(
    { _id: classroomId, students: studentId },
    { $pull: { students: studentId } },
    { returnDocument: 'after' }
  );
  if (!updatedClassroom) {
    throw new ApiError(409, 'You have already left this classroom');
  }
  return updatedClassroom;
};

const regenerateJoinCode = async (teacherId, classroomId) => {
  if (!/^[a-f\d]{24}$/i.test(classroomId)) {
    throw new ApiError(400, 'Invalid classroom ID');
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  if (classroom.teacher.toString().toLowerCase() !== teacherId.toLowerCase()) {
    throw new ApiError(403, 'You do not have permission to access this classroom');
  }

  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateJoinCode();
    if (joinCode === classroom.joinCode) continue;

    try {
      const updatedClassroom = await Classroom.findOneAndUpdate(
        { _id: classroomId, teacher: teacherId, joinCode: { $ne: joinCode } },
        { $set: { joinCode } },
        { returnDocument: 'after', runValidators: true }
      );
      if (updatedClassroom) return updatedClassroom;
    } catch (error) {
      if (!isJoinCodeDuplicate(error)) throw error;
    }
  }

  throw new ApiError(503, 'Could not generate a unique classroom join code; please try again');
};

module.exports = {
  createClassroom,
  joinClassroom,
  getClassrooms,
  getClassroomById,
  getClassroomStudents,
  leaveClassroom,
  regenerateJoinCode,
};
