const express = require('express');
const router = express.Router();
// const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * @route POST /api/payments
 * @desc Create a new payment
 * @access Private
 */
router.post('/', authenticate, (req, res) => {
    res.json({
        status: 'success',
        message: 'Payment created',
        data: null
    });
});

/**
 * @route GET /api/payments/payouts
 * @desc Get payouts for the current influencer
 * @access Private/Influencer
 */
router.get('/payouts', authenticate, authorize(['influencer']), (req, res) => {
    res.json({
        status: 'success',
        message: 'Payouts endpoint',
        data: []
    });
});

module.exports = router;