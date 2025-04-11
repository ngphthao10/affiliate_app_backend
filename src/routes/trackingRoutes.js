const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

/**
 * @route GET /api/track/:token
 * @desc Track affiliate link clicks and redirect to product page using secure token
 * @access Public
 */
router.get('/:token', trackingController.trackAffiliateLink);

module.exports = router;