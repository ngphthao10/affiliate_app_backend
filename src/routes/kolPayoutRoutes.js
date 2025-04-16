const express = require('express');
const {
    getPayouts,
    exportPayoutReport,
    generatePayouts,
    updatePayoutStatus,
    getPayoutDetails,
    getInfluencerPayouts,
    getInfluencerPayoutDetails,
    getInfluencerSalesStats
} = require('../controllers/kolPayoutController');
const adminAuth = require('../middlewares/adminAuth');
const kolAuth = require('../middlewares/kolAuth')

const router = express.Router();

router.get('/list', adminAuth, getPayouts);
router.get('/export', adminAuth, exportPayoutReport);
router.post('/generate', adminAuth, generatePayouts);
router.patch('/:payout_id/status', adminAuth, updatePayoutStatus);
router.get('/:payout_id', adminAuth, getPayoutDetails);

router.get('/influencer/payouts', kolAuth, getInfluencerPayouts);
router.get('/influencer/payouts/:payout_id', kolAuth, getInfluencerPayoutDetails);
router.get('/influencer/stats', kolAuth, getInfluencerSalesStats);

module.exports = router;