const Joi = require('joi');

const contextSchema = Joi.object({
  routeKey: Joi.string().default('other'),
  role: Joi.string().optional(),
  lastIntent: Joi.string().optional(),
  draftType: Joi.string().optional(),
  fields: Joi.object().optional(),
  language: Joi.string().optional(),
  tone: Joi.string().optional(),
  selectedTaskId: Joi.string().optional(),
  // Add more allowed context keys as needed
}).unknown(true); // Allow additional context fields

const assistantSchema = Joi.object({
  mode: Joi.string().valid('help','tasks','draft','general').required(),
  message: Joi.string().min(2).max(2000).required(),
  context: contextSchema.required(),
});

exports.validateAssistantInput = (body) => {
  return assistantSchema.validate(body, { abortEarly: false });
};
