const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const customerAuth = require('../middlewares/customerAuth');

router.use(customerAuth)
router.post('/add', cartController.addToCart);

router.get('/', cartController.getCart);

router.put('/update', cartController.updateCartItem);

router.delete('/:cart_item_id', cartController.removeCartItem);

module.exports = router;