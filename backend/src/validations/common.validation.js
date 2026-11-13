const Joi = require('joi');

const emptyBodySchema = Joi.object({}).default({}).unknown(false);

module.exports = { emptyBodySchema };
