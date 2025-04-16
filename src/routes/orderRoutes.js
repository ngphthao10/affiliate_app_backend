const express = require('express');
const {
    listOrders,
    getOrderDetails,
    updateOrderStatus,
    getOrdersByDate
} = require('../controllers/orderController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

router.get('/list', adminAuth, listOrders);
router.get('/details/:id', adminAuth, getOrderDetails);
router.put('/status/:id', adminAuth, updateOrderStatus);
router.get('/by-date', adminAuth, getOrdersByDate);

module.exports = router;