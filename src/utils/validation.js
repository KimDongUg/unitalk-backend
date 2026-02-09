const Joi = require('joi');

const sendOtpSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^\+[1-9]\d{1,14}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +821012345678)',
    }),
});

const verifyOtpSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^\+[1-9]\d{1,14}$/)
    .required(),
  otp: Joi.string().length(6).required(),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  language_code: Joi.string().min(2).max(10),
}).min(1);

const fcmTokenSchema = Joi.object({
  fcm_token: Joi.string().required(),
});

const syncContactsSchema = Joi.object({
  contacts: Joi.array()
    .items(Joi.string().pattern(/^\+[1-9]\d{1,14}$/))
    .min(1)
    .max(1000)
    .required(),
});

const sendMessageSchema = Joi.object({
  conversation_id: Joi.string().uuid().required(),
  text: Joi.string().min(1).max(10000).required(),
});

const readMessagesSchema = Joi.object({
  message_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const messages = error.details.map((d) => d.message);
    return res.status(400).json({ error: 'Validation error', details: messages });
  }
  req.validatedBody = value;
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, { abortEarly: false });
  if (error) {
    const messages = error.details.map((d) => d.message);
    return res.status(400).json({ error: 'Validation error', details: messages });
  }
  req.validatedQuery = value;
  next();
};

module.exports = {
  sendOtpSchema,
  verifyOtpSchema,
  updateUserSchema,
  fcmTokenSchema,
  syncContactsSchema,
  sendMessageSchema,
  readMessagesSchema,
  paginationSchema,
  validate,
  validateQuery,
};
