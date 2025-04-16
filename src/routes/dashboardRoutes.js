const express = require('express');
const {
    getDashboardStats,
    getRevenueData,
    getTopProducts,
    getKOLPerformance,
    getCustomerStats
} = require('../controllers/dashboardController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

router.get('/stats', adminAuth, getDashboardStats);
router.get('/revenue', adminAuth, getRevenueData);
router.get('/top-products', adminAuth, getTopProducts);
router.get('/kol-performance', adminAuth, getKOLPerformance);
router.get('/customer-stats', adminAuth, getCustomerStats);

module.exports = router;