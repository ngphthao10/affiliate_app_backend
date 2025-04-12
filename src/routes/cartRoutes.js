// routes/cart.js
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const customerAuth = require('../middlewares/customerAuth');
// Thêm sản phẩm vào giỏ hàng
router.use(customerAuth)
router.post('/add', cartController.addToCart);

// Lấy thông tin giỏ hàng
router.get('/', cartController.getCart);

// Cập nhật số lượng sản phẩm trong giỏ hàng
router.put('/update', cartController.updateCartItem);

// Xóa sản phẩm khỏi giỏ hàng
router.delete('/:cart_item_id', cartController.removeCartItem);

module.exports = router;