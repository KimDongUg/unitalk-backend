const { Translate } = require('@google-cloud/translate').v2;
const crypto = require('crypto');
const cacheService = require('./cacheService');
const config = require('../config/env');
const logger = require('../utils/logger');

let translateClient = null;

function getTranslateClient() {
  if (!translateClient && config.google.apiKey) {
    translateClient = new Translate({ key: config.google.apiKey });
  }
  return translateClient;
}

const translationService = {
  hashText(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  },

  async translateText(text, targetLang, sourceLang = null) {
    // Check cache first
    const cacheKey = `trans:${this.hashText(text)}:${targetLang}`;
    const cached = await cacheService.getRaw(cacheKey);

    if (cached) {
      logger.debug(`Translation cache hit: ${cacheKey}`);
      return cached;
    }

    const client = getTranslateClient();
    if (!client) {
      // Development fallback: return original text with a marker
      logger.warn('[DEV] Translation API not configured, returning original text');
      return `[${targetLang}] ${text}`;
    }

    try {
      const options = { to: targetLang };
      if (sourceLang) {
        options.from = sourceLang;
      }

      const [translation] = await client.translate(text, options);

      // Cache for 24 hours
      await cacheService.setRaw(cacheKey, translation, 86400);

      logger.debug(`Translated "${text.substring(0, 50)}..." to ${targetLang}`);
      return translation;
    } catch (error) {
      logger.error('Translation error:', error);
      throw new Error('Translation failed');
    }
  },

  async detectLanguage(text) {
    const client = getTranslateClient();
    if (!client) {
      return 'en';
    }

    try {
      const [detection] = await client.detect(text);
      return detection.language;
    } catch (error) {
      logger.error('Language detection error:', error);
      return null;
    }
  },
};

module.exports = translationService;
