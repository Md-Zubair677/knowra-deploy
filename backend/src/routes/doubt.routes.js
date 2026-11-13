const express = require('express');
const doubtController = require('../controllers/doubt.controller');
const authenticate = require('../middlewares/auth');
const restrictTo = require('../middlewares/role');
const { doubtCreationLimiter } = require('../middlewares/rateLimiter');
const validate = require('../middlewares/validate');
const { emptyBodySchema } = require('../validations/common.validation');
const { sanitizeMongoParams } = require('../middlewares/sanitizeMongoInput');
const {
  createDoubtSchema,
  doubtIdParamSchema,
} = require('../validations/doubt.validation');

const router = express.Router();
router.param('id', sanitizeMongoParams);

/**
 * @swagger
 * /doubts:
 *   post:
 *     summary: Submit a doubt for a joined classroom (students only)
 *     tags: [Doubts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classroomId, subject, topic, text]
 *             properties:
 *               classroomId: { type: string, example: 507f1f77bcf86cd799439011 }
 *               subject: { type: string, example: Computer Science }
 *               topic: { type: string, example: Linked lists }
 *               text: { type: string, maxLength: 2000, example: How does a linked list differ from an array? }
 *     responses:
 *       201: { description: Doubt submitted and AI analysis completed }
 *       400: { description: Invalid request data }
 *       401: { description: Authentication required }
 *       403: { description: Student is not a member of this classroom }
 *       502: { description: AI analysis failed; the doubt is saved for retry }
 *       404: { description: Classroom not found }
 *       429: { description: Too many doubt submissions }
 */
router.post(
  '/',
  authenticate,
  restrictTo('student'),
  doubtCreationLimiter,
  validate(createDoubtSchema),
  doubtController.createDoubt
);

/**
 * @swagger
 * /doubts:
 *   get:
 *     summary: List the current student's doubts or the teacher's classroom doubts
 *     tags: [Doubts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classroomId
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, answered, failed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200: { description: Paginated doubts }
 *       400: { description: Invalid pagination parameters }
 *       401: { description: Authentication required }
 */
router.get('/', authenticate, doubtController.getDoubts);

/**
 * @swagger
 * /doubts/{id}:
 *   get:
 *     summary: Get a doubt if you own it or teach its classroom
 *     tags: [Doubts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Doubt details }
 *       400: { description: Invalid doubt ID }
 *       401: { description: Authentication required }
 *       403: { description: Not the doubt owner or classroom teacher }
 *       404: { description: Doubt not found }
 */
router.get(
  '/:id',
  authenticate,
  validate(doubtIdParamSchema, 'params'),
  doubtController.getDoubtById
);

/**
 * @swagger
 * /doubts/{id}/retry:
 *   post:
 *     summary: Retry AI analysis for an owned failed doubt
 *     tags: [Doubts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *     responses:
 *       200: { description: Analysis retry completed }
 *       400: { description: Invalid doubt ID }
 *       401: { description: Authentication required }
 *       403: { description: Caller does not own this doubt }
 *       404: { description: Doubt not found }
 *       409: { description: Doubt is not in failed status }
 *       502: { description: AI analysis failed; doubt remains available for retry }
 */
router.post(
  '/:id/retry',
  authenticate,
  restrictTo('student'),
  validate(doubtIdParamSchema, 'params'),
  validate(emptyBodySchema),
  doubtController.retryDoubt
);

module.exports = router;
