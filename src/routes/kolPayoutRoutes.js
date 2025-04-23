const express = require('express');
const {
    getPayouts,
    exportPayoutReport,
    generatePayouts,
    updatePayoutStatus,
    getPayoutDetails,
    getInfluencerPayouts,
    getInfluencerPayoutDetails,
    getInfluencerSalesStats,
    getEligiblePayouts
} = require('../controllers/kolPayoutController');
const adminAuth = require('../middlewares/adminAuth');
const kolAuth = require('../middlewares/kolAuth')

const router = express.Router();


router.get('/', adminAuth, getPayouts);
router.get('/eligible', adminAuth, getEligiblePayouts);
router.get('/export', adminAuth, exportPayoutReport);
router.get('/:payout_id', adminAuth, getPayoutDetails);
router.post('/generate', adminAuth, generatePayouts);
router.put('/:payout_id/status', adminAuth, updatePayoutStatus);


router.get('/influencer/payouts', kolAuth, getInfluencerPayouts);
router.get('/influencer/payouts/:payout_id', kolAuth, getInfluencerPayoutDetails);
router.get('/influencer/stats', kolAuth, getInfluencerSalesStats);


module.exports = router;