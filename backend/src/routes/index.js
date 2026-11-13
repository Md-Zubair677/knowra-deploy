const express = require('express');
const healthController = require('../controllers/health.controller');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/classrooms', require('./classroom.routes'));
router.use('/doubts', require('./doubt.routes'));
router.use('/', require('./gap.routes'));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API health
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API, database, and AI-service health
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   required: [status, db, aiService]
 *                   properties:
 *                     status: { type: string, enum: [ok, degraded] }
 *                     db: { type: string, enum: [up, down] }
 *                     aiService: { type: string, enum: [mock, up, down] }
 */
router.get('/health', healthController.getHealth);

module.exports = router;