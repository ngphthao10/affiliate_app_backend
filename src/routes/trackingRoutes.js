const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

router.get('/:token', trackingController.trackAffiliateLink);

module.exports = router;