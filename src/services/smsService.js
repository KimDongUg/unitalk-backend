const config = require('../config/env');
const logger = require('../utils/logger');

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient && config.twilio.accountSid && config.twilio.authToken) {
    const twilio = require('twilio');
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

const smsService = {
  async sendOtp(phone, otp) {
    const client = getTwilioClient();

    if (!client) {
      // Development fallback: log OTP to console
      logger.warn(`[DEV] OTP for ${phone}: ${otp}`);
      return { success: true, dev: true };
    }

    try {
      const message = await client.messages.create({
        body: `[UniTalk] Your verification code is: ${otp}. Valid for 5 minutes.`,
        from: config.twilio.phoneNumber,
        to: phone,
      });

      logger.info(`SMS sent to ${phone}, SID: ${message.sid}`);
      return { success: true, sid: message.sid };
    } catch (error) {
      logger.error('SMS send error:', error);
      throw new Error('Failed to send SMS');
    }
  },

  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },
};

module.exports = smsService;
