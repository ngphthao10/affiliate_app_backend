const express = require('express');
const router = express.Router();
// const cartController = require('../controllers/cartController');
const { authenticate } = require('../middlewares/auth');

/**
 * @route GET /api/cart
 * @desc Get cart for the current user
 * @access Private
 */
router.get('/', authenticate, (req, res) => {
    res.json({
        status: 'success',
        message: 'Cart endpoint',
        data: {
            items: []
        }
    });
});

/**
 * @route POST /api/cart/items
 * @desc Add item to cart
 * @access Private
 */
router.post('/items', authenticate, (req, res) => {
    res.json({
        status: 'success',
        message: 'Item added to cart',
        data: null
    });
});

module.exports = router;