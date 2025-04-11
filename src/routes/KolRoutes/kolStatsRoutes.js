const express = require('express');
const router = express.Router();
const kolAuth = require('../../middlewares/kolAuth');
const { getKolDashboardStats } = require('../../controllers/KolController/kolStatsController');

// Get KOL dashboard statistics
router.get('/dashboard/:influencerId', kolAuth, getKolDashboardStats);


module.exports = router;