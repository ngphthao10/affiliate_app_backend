const express = require('express');
const {
    getPayouts,
    exportPayoutReport
} = require('../controllers/kolPayoutController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

// All routes are protected with adminAuth
router.get('/list', adminAuth, getPayouts);
router.get('/export', adminAuth, exportPayoutReport);

module.exports = router;