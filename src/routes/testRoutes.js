// testRoutes.js
const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

router.get('/purchase-page', testController.showTestPurchasePage);
router.post('/simulate-purchase', testController.simulatePurchase);

module.exports = router;