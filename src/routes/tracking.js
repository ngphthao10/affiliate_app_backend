const express = require('express');
const router = express.Router();
// const trackingController = require('../controllers/trackingController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * @route GET /api/tracking/click/:linkId
 * @desc Track affiliate link click
 * @access Public
 */
router.get('/click/:linkId', (req, res) => {
    res.json({
        status: 'success',
        message: `Click tracked for link ID: ${req.params.linkId}`,
        data: null
    });
});

/**
 * @route POST /api/tracking/purchase/:linkId
 * @desc Manually track a purchase (admin only)
 * @access Private/Admin
 */
router.post(
    '/purchase/:linkId',
    authenticate,
    authorize(['admin']),
    (req, res) => {
        res.json({
            status: 'success',
            message: `Purchase tracked for link ID: ${req.params.linkId}`,
            data: null
        });
    }
);

module.exports = router;