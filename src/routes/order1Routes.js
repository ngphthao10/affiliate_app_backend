const express = require('express');
const { placeOrder, placeOrderStripe, placeOrderMomo, allOrders, userOrders, updateStatus, verifyStripe, verifyMomo } = require('../controllers/order1Controller.js');
const adminAuth = require('../middlewares/adminAuth.js');
const authUser = require('../middlewares/customerAuth.js');

const orderRouter = express.Router();

// Admin Features
orderRouter.post('/list', adminAuth, allOrders);
orderRouter.post('/status', adminAuth, updateStatus);

// Payment Features
orderRouter.post('/place', authUser, placeOrder);
orderRouter.post('/stripe', authUser, placeOrderStripe);
orderRouter.post('/momo', authUser, placeOrderMomo); // Thay /razorpay thành /momo và placeOrderRazorpay thành placeOrderMomo

// User Feature 
orderRouter.post('/userorders', authUser, userOrders);

// Verify payment
orderRouter.post('/verifyStripe', authUser, verifyStripe);
orderRouter.post('/verifyMomo', authUser, verifyMomo); // Thay /verifyRazorpay thành /verifyMomo và verifyRazorpay thành verifyMomo

module.exports = orderRouter; // Sửa "module.exports = router" thành "module.exports = orderRouter" để đồng bộ với tên biến