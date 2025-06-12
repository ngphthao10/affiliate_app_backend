const express = require('express');
const { placeOrder, placeOrderStripe, placeOrderMomo, allOrders, userOrders, updateStatus, verifyStripe, verifyMomo, getOrderItems, testReadCookies, cancelOrder } = require('../controllers/order1Controller.js');
const adminAuth = require('../middlewares/adminAuth.js');
const authUser = require('../middlewares/customerAuth.js');

const orderRouter = express.Router();

// Admin Features
orderRouter.post('/list', adminAuth, allOrders);
orderRouter.post('/status', adminAuth, updateStatus);

// Payment Features
orderRouter.post('/place', authUser, placeOrder);
orderRouter.post('/stripe', authUser, placeOrderStripe);
orderRouter.post('/momo', authUser, placeOrderMomo);

// User Feature 
orderRouter.post('/userorders', authUser, userOrders);
orderRouter.get('/items/:orderId', authUser, getOrderItems);
// Verify payment
orderRouter.post('/verifyStripe', authUser, verifyStripe);
orderRouter.post('/verifyMomo', authUser, verifyMomo);
// Trong file routes của bạn
orderRouter.post('/place', testReadCookies, authUser, placeOrder);
orderRouter.post('/cancel-order', authUser, cancelOrder);
module.exports = orderRouter; 