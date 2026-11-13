const mongoose = require('mongoose');
const aiService = require('./ai.service');
const logger = require('../utils/logger');

const getHealth = async () => {
  const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
  let aiServiceStatus;
  try {
    aiServiceStatus = await aiService.checkHealth();
  } catch (error) {
    logger.warn('AI health check failed:', error.message);
    aiServiceStatus = 'down';
  }
  return {
    status: db === 'up' && aiServiceStatus !== 'down' ? 'ok' : 'degraded',
    db,
    aiService: aiServiceStatus,
  };
};

module.exports = { getHealth };
