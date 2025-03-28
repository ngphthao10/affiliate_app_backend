const express = require('express');
const statsController = require('../controllers/statsController');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

/**
 * @route GET /api/stats/kol/:kolId
 * @desc Get KOL statistics
 * @access Private/Admin
 */
router.get(
    '/kol/:kolId',
    authenticate,
    authorize(['admin']),
    statsController.getKolStats
);

/**
 * @route GET /api/stats/product/:productId
 * @desc Get product statistics
 * @access Private/Admin
 */
router.get(
    '/product/:productId',
    authenticate,
    authorize(['admin']),
    statsController.getProductStats
);

/**
 * @route GET /api/stats/dashboard
 * @desc Get dashboard statistics for a KOL
 * @access Private/Influencer
 */
router.get(
    '/dashboard',
    authenticate,
    authorize(['influencer']),
    statsController.getKolDashboardStats
);

module.exports = router;