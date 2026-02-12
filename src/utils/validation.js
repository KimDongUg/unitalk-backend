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
  code: Joi.string().length(6).required(),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  language_code: Joi.string().min(2).max(10),
}).min(1);

const updateProfileSchema = Joi.object({
  nickname: Joi.string().min(1).max(100),
  nativeLang: Joi.string().min(2).max(10),
  targetLang: Joi.string().min(2).max(10),
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

const syncContactsSchemaV2 = Joi.object({
  userId: Joi.string().uuid().required(),
  phoneHashes: Joi.array()
    .items(Joi.string().hex().length(64))
    .min(1)
    .max(1000)
    .required(),
});

const sendMessageSchema = Joi.object({
  conversation_id: Joi.string().uuid().required(),
  text: Joi.string().min(1).max(10000).required(),
});

const createChatRoomSchema = Joi.object({
  userId: Joi.string().uuid(),
  otherUserId: Joi.string().uuid(),
  groupId: Joi.string().uuid(),
}).or('groupId', 'otherUserId');

const sendChatMessageSchema = Joi.object({
  text: Joi.string().min(1).max(10000).required(),
  user: Joi.object({
    _id: Joi.string().uuid().required(),
  }).required(),
  senderLang: Joi.string().min(2).max(10).required(),
});

const registerSchema = Joi.object({
  nickname: Joi.string().min(2).max(100).required(),
  password: Joi.string().min(6).max(100).required(),
  universityId: Joi.string().uuid().required(),
  viewLang: Joi.string().min(2).max(10).default('en'),
  inputLang: Joi.string().min(2).max(10),
});

const loginSchema = Joi.object({
  nickname: Joi.string().min(1).max(100).required(),
  password: Joi.string().min(1).max(100).required(),
});

const universitySearchSchema = Joi.object({
  search: Joi.string().max(200).allow(''),
  country: Joi.string().max(10),
});

const groupListSchema = Joi.object({
  universityId: Joi.string().uuid().required(),
  category: Joi.string().max(50),
});

const createGroupSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(1000).allow(''),
  universityId: Joi.string().uuid().required(),
  category: Joi.string().max(50).default('general'),
  isPublic: Joi.boolean().default(true),
});

const announcementSchema = Joi.object({
  content: Joi.string().min(1).max(10000).required(),
  senderLang: Joi.string().min(2).max(10).required(),
});

const loginWithDeviceSchema = Joi.object({
  nickname: Joi.string().min(1).max(100).required(),
  password: Joi.string().min(1).max(100).required(),
  deviceType: Joi.string().valid('mobile', 'pc', 'tablet').default('mobile'),
  deviceName: Joi.string().max(100),
});

const qrVerifySchema = Joi.object({
  qrToken: Joi.string().required(),
});

const readMessagesSchema = Joi.object({
  message_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const pageBasedPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
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
  updateProfileSchema,
  fcmTokenSchema,
  syncContactsSchema,
  syncContactsSchemaV2,
  sendMessageSchema,
  createChatRoomSchema,
  sendChatMessageSchema,
  readMessagesSchema,
  paginationSchema,
  pageBasedPaginationSchema,
  registerSchema,
  loginSchema,
  universitySearchSchema,
  groupListSchema,
  createGroupSchema,
  announcementSchema,
  loginWithDeviceSchema,
  qrVerifySchema,
  validate,
  validateQuery,
};
