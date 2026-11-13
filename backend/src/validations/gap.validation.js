const Joi = require('joi');

const learningPlanQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(10).default(5),
}).unknown(false);

const studentIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^[a-f\d]{24}$/i).required().messages({
    'string.pattern.base': '"id" must be a valid student ID',
  }),
}).unknown(false);

module.exports = { learningPlanQuerySchema, studentIdParamSchema };
