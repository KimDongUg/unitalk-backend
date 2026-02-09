const translationService = require('../services/translationService');

const translationController = {
  async translate(req, res, next) {
    try {
      const { text, target_language, source_language } = req.body;

      if (!text || !target_language) {
        return res.status(400).json({ error: 'text and target_language are required' });
      }

      const translated = await translationService.translateText(
        text,
        target_language,
        source_language || null
      );

      res.json({
        original_text: text,
        translated_text: translated,
        target_language,
      });
    } catch (error) {
      next(error);
    }
  },

  async detectLanguage(req, res, next) {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }

      const language = await translationService.detectLanguage(text);

      res.json({ language });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = translationController;
