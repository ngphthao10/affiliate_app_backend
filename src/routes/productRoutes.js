const express = require('express');
const {
    listProducts,
    getProduct,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteProductImage
} = require('../controllers/productController');
const upload = require('../middlewares/multer');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

// All routes are protected with adminAuth
router.get('/list', adminAuth, listProducts);
router.get('/details/:id', adminAuth, getProduct);
router.get('/edit/:id', adminAuth, getProduct);  // Uses same handler as details

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

router.put(
    '/update/:id',
    adminAuth,
    upload.fields([
        { name: 'image1', maxCount: 1 },
        { name: 'image2', maxCount: 1 },
        { name: 'image3', maxCount: 1 },
        { name: 'image4', maxCount: 1 }
    ]),
    updateProduct
);

router.delete('/:id', adminAuth, deleteProduct);
router.delete('/image/:imageId', adminAuth, deleteProductImage);

module.exports = router;