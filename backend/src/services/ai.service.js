const Joi = require('joi');
const { aiServiceUrl, aiServiceKey } = require('../config/env');
const ApiError = require('../utils/ApiError');

const SERVICE_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 2;
const analysisSchema = Joi.object({
  answer: Joi.string().trim().min(1).required(),
  gaps: Joi.array()
    .items(
      Joi.object({
        concept: Joi.string().trim().min(1).required(),
        severity: Joi.string().valid('low', 'medium', 'high').required(),
      }).unknown(false)
    )
    .required(),
}).unknown(false);
const learningPlanSchema = Joi.object({
  ranked: Joi.array().items(
    Joi.object({
      concept: Joi.string().trim().min(1).max(80).required(),
      severity: Joi.string().valid('low', 'medium', 'high').required(),
      occurrences: Joi.number().integer().min(1).required(),
      priority: Joi.number().min(0).required(),
    }).unknown(false)
  ).required(),
  plan: Joi.array().items(
    Joi.object({
      concept: Joi.string().trim().min(1).max(80).required(),
      tip: Joi.string().trim().min(1).required(),
      practice_question: Joi.string().trim().min(1).required(),
    }).unknown(false)
  ).required(),
}).unknown(false);

class RetryableServiceError extends Error {
  constructor(message) {
    super(message);
    this.retryable = true;
  }
}

class ServiceResponseError extends Error {}

const validateResponse = (response, schema) => {
  const { error, value } = schema.validate(response, {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    throw new ServiceResponseError('AI service returned an invalid response');
  }

  return value;
};

const createMockAnalysis = ({ subject, topic }) => validateResponse({
  answer: `[Mock response] Here is an explanation of "${topic}" in ${subject}.`,
  gaps: [{ concept: topic, severity: 'medium' }],
}, analysisSchema);

const requestService = async (path, payload, responseSchema) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);
  const serviceUrl = `${aiServiceUrl.replace(/\/+$/, '')}${path}`;
  const headers = { 'Content-Type': 'application/json' };

  if (aiServiceKey) headers.Authorization = `Bearer ${aiServiceKey}`;

  try {
    let response;
    try {
      response = await fetch(serviceUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error.name === 'AbortError'
        ? 'AI service request timed out'
        : 'Could not reach the AI service';
      throw new RetryableServiceError(message);
    }

    if (response.status >= 500) {
      throw new RetryableServiceError('AI service is temporarily unavailable');
    }
    if (!response.ok) {
      throw new ServiceResponseError(`AI service rejected the request (${response.status})`);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') {
        throw new RetryableServiceError('AI service request timed out');
      }
      if (!(error instanceof SyntaxError)) {
        throw new RetryableServiceError('Could not read the AI service response');
      }
      throw new ServiceResponseError('AI service returned malformed JSON');
    }

    return validateResponse(result, responseSchema);
  } finally {
    clearTimeout(timeout);
  }
};

const checkHealth = async () => {
  if (!aiServiceUrl) return 'mock';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  const headers = {};
  if (aiServiceKey) headers.Authorization = `Bearer ${aiServiceKey}`;

  try {
    const response = await fetch(
      `${aiServiceUrl.replace(/\/+$/, '')}/health`,
      { method: 'GET', headers, signal: controller.signal }
    );
    return response.ok ? 'up' : 'down';
  } catch (error) {
    return 'down';
  } finally {
    clearTimeout(timeout);
  }
};

const requestWithRetry = async (path, payload, responseSchema, operation) => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestService(path, payload, responseSchema);
    } catch (error) {
      if (error.retryable && attempt + 1 < MAX_ATTEMPTS) continue;

      throw new ApiError(502, `${operation} failed: ${error.message}`);
    }
  }

  throw new ApiError(502, `${operation} failed`);
};

const analyzeDoubt = async ({ subject, topic, text }) => {
  if (!aiServiceUrl) return createMockAnalysis({ subject, topic });
  return requestWithRetry(
    '/analyze',
    { subject, topic, text },
    analysisSchema,
    'AI analysis'
  );
};

const generateLearningPlan = async (payload) => {
  if (!aiServiceUrl) return null;
  return requestWithRetry(
    '/learning/plan',
    payload,
    learningPlanSchema,
    'AI learning plan'
  );
};

module.exports = { analyzeDoubt, generateLearningPlan, checkHealth };
