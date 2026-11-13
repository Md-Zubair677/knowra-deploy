const express = require('express');
const classroomController = require('../controllers/classroom.controller');
const authenticate = require('../middlewares/auth');
const restrictTo = require('../middlewares/role');
const validate = require('../middlewares/validate');
const { sanitizeMongoParams } = require('../middlewares/sanitizeMongoInput');
const { emptyBodySchema } = require('../validations/common.validation');
const {
  createClassroomSchema,
  joinClassroomSchema,
  classroomIdParamSchema,
} = require('../validations/classroom.validation');

const router = express.Router();
router.param('id', sanitizeMongoParams);

/**
 * @swagger
 * /classrooms:
 *   post:
 *     summary: Create a classroom (teachers only)
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, subject]
 *             properties:
 *               name: { type: string, example: Biology 101 }
 *               subject: { type: string, example: Biology }
 *     responses:
 *       201: { description: Classroom created with a unique join code }
 *       400: { description: Invalid classroom data }
 *       401: { description: Authentication required }
 *       403: { description: Teachers only }
 */
router.post(
  '/',
  authenticate,
  restrictTo('teacher'),
  validate(createClassroomSchema),
  classroomController.createClassroom
);

/**
 * @swagger
 * /classrooms/join:
 *   post:
 *     summary: Join a classroom by join code (students only)
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [joinCode]
 *             properties:
 *               joinCode: { type: string, example: ABC234 }
 *     responses:
 *       200: { description: Joined classroom }
 *       400: { description: Invalid join code }
 *       401: { description: Authentication required }
 *       403: { description: Students only }
 *       404: { description: Classroom not found }
 *       409: { description: Already joined this classroom }
 */
router.post(
  '/join',
  authenticate,
  restrictTo('student'),
  validate(joinClassroomSchema),
  classroomController.joinClassroom
);

/**
 * @swagger
 * /classrooms:
 *   get:
 *     summary: List classrooms belonging to the authenticated user
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Teacher-owned or student-joined classrooms }
 *       401: { description: Authentication required }
 */
router.get('/', authenticate, classroomController.getClassrooms);

/**
 * @swagger
 * /classrooms/{id}/insights:
 *   get:
 *     summary: Get aggregate learning insights for an owned classroom
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *     responses:
 *       200:
 *         description: Doubt, student, concept-gap, and attention metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 message: { type: string }
 *                 data: { $ref: '#/components/schemas/Insights' }
 *       400: { description: Invalid classroom ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller does not teach this classroom }
 *       404: { description: Classroom not found }
 */
router.get(
  '/:id/insights',
  authenticate,
  restrictTo('teacher'),
  validate(classroomIdParamSchema, 'params'),
  classroomController.getClassroomInsights
);

/**
 * @swagger
 * /classrooms/{id}/students:
 *   get:
 *     summary: List students enrolled in an owned classroom
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *     responses:
 *       200: { description: Student names, emails, and classroom doubt counts }
 *       400: { description: Invalid classroom ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller does not teach this classroom }
 *       404: { description: Classroom not found }
 */
router.get(
  '/:id/students',
  authenticate,
  restrictTo('teacher'),
  validate(classroomIdParamSchema, 'params'),
  classroomController.getClassroomStudents
);

/**
 * @swagger
 * /classrooms/{id}/leave:
 *   delete:
 *     summary: Leave a joined classroom (students only)
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *     responses:
 *       200: { description: Student removed from the classroom; past doubts are retained }
 *       400: { description: Invalid classroom ID }
 *       401: { description: Authentication required }
 *       403: { description: Students only }
 *       404: { description: Classroom not found }
 *       409: { description: Student has not joined the classroom }
 */
router.delete(
  '/:id/leave',
  authenticate,
  restrictTo('student'),
  validate(classroomIdParamSchema, 'params'),
  validate(emptyBodySchema),
  classroomController.leaveClassroom
);

/**
 * @swagger
 * /classrooms/{id}/regenerate-code:
 *   post:
 *     summary: Generate a new unique classroom join code (owner teacher only)
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *     responses:
 *       200: { description: Classroom returned with its new join code }
 *       400: { description: Invalid classroom ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller does not teach this classroom }
 *       404: { description: Classroom not found }
 *       503: { description: Could not generate a unique join code }
 */
router.post(
  '/:id/regenerate-code',
  authenticate,
  restrictTo('teacher'),
  validate(classroomIdParamSchema, 'params'),
  validate(emptyBodySchema),
  classroomController.regenerateJoinCode
);

/**
 * @swagger
 * /classrooms/{id}:
 *   get:
 *     summary: Get a classroom as its teacher or a joined student
 *     tags: [Classrooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *     responses:
 *       200: { description: Classroom details }
 *       400: { description: Invalid classroom ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller does not own or belong to this classroom }
 *       404: { description: Classroom not found }
 */
router.get(
  '/:id',
  authenticate,
  validate(classroomIdParamSchema, 'params'),
  classroomController.getClassroomById
);

module.exports = router;
