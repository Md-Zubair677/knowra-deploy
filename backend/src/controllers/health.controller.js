const healthService = require('../services/health.service');
const { sendResponse } = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getHealth = asyncHandler(async (req, res) => {
  const health = await healthService.getHealth();
  sendResponse(res, 200, 'API is running', health);
});

module.exports = { getHealth };
