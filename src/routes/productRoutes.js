const express = require('express');
const {
    listProducts,
    addProduct,
    removeProduct,
    singleProduct
} = require('../controllers/productController');
const upload = require('../middlewares/multer');
const auth = require('../middlewares/auth');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

// Public routes
router.get('/list', listProducts);
router.post('/single', singleProduct);

// Admin routes (protected)
router.post(
    '/add',
    adminAuth,
    upload.fields([
        { name: 'image1', maxCount: 1 },
        { name: 'image2', maxCount: 1 },
        { name: 'image3', maxCount: 1 },
        { name: 'image4', maxCount: 1 }
    ]),
    addProduct
);

router.post('/remove', adminAuth, removeProduct);

module.exports = router;