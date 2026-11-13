const express = require('express');
const gapController = require('../controllers/gap.controller');
const authenticate = require('../middlewares/auth');
const restrictTo = require('../middlewares/role');
const validate = require('../middlewares/validate');
const { sanitizeMongoParams } = require('../middlewares/sanitizeMongoInput');
const { classroomIdParamSchema } = require('../validations/classroom.validation');
const {
  learningPlanQuerySchema,
  studentIdParamSchema,
} = require('../validations/gap.validation');

const router = express.Router();
router.param('id', sanitizeMongoParams);

/**
 * @swagger
 * /classrooms/{id}/gaps:
 *   get:
 *     summary: Get classroom concept gaps ranked by occurrence count (teacher only)
 *     tags: [Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Gaps grouped by concept and sorted by total occurrences }
 *       400: { description: Invalid classroom ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller does not teach this classroom }
 *       404: { description: Classroom not found }
 */
router.get(
  '/classrooms/:id/gaps',
  authenticate,
  restrictTo('teacher'),
  validate(classroomIdParamSchema, 'params'),
  gapController.getClassroomGaps
);

/**
 * @swagger
 * /students/{id}/gaps:
 *   get:
 *     summary: Get a student's concept gaps (the student or their classroom teacher)
 *     tags: [Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Gaps grouped by concept and sorted by total occurrences }
 *       400: { description: Invalid student ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller is neither this student nor their teacher }
 */
router.get(
  '/students/:id/gaps',
  authenticate,
  restrictTo('student', 'teacher'),
  validate(studentIdParamSchema, 'params'),
  gapController.getStudentGaps
);

/**
 * @swagger
 * /students/{id}/learning-plan:
 *   get:
 *     summary: Rank a student's concept gaps and request learning tips
 *     tags: [Learning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 10, default: 5 }
 *     responses:
 *       200:
 *         description: Ranked gaps and optional AI-generated study tips
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   required: [ranked, plan, aiAvailable]
 *                   properties:
 *                     ranked:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [concept, severity, occurrences, daysSinceLastSeen, priority]
 *                         properties:
 *                           concept: { type: string }
 *                           severity: { type: string, enum: [low, medium, high] }
 *                           occurrences: { type: integer }
 *                           daysSinceLastSeen: { type: number }
 *                           priority: { type: number }
 *                     plan:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [concept, tip, practice_question]
 *                         properties:
 *                           concept: { type: string }
 *                           tip: { type: string }
 *                           practice_question: { type: string }
 *                     aiAvailable: { type: boolean }
 *       400: { description: Invalid student ID or limit }
 *       401: { description: Authentication required }
 *       403: { description: Caller is neither this student nor their teacher }
 */
router.get(
  '/students/:id/learning-plan',
  authenticate,
  restrictTo('student', 'teacher'),
  validate(studentIdParamSchema, 'params'),
  validate(learningPlanQuerySchema, 'query'),
  gapController.getStudentLearningPlan
);

module.exports = router;
