const express = require('express');
const {
    listProducts,
    getProduct,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteProductImage,
    listBestSellers, filterProducts, listAll
} = require('../controllers/productController');
const upload = require('../middlewares/multer');
const adminAuth = require('../middlewares/adminAuth');
const customerAuth = require('../middlewares/customerAuth');
const router = express.Router();
const customerOrAdminAuth=require('../middlewares/customerOrAdminAuth');
// All routes are protected with adminAuth
router.get('/list', listProducts);
router.get('/details/:id', getProduct);
router.get('/edit/:id', adminAuth, getProduct);  // Uses same handler as details
router.get('/best-sellers', listBestSellers);
router.get('/filterProducts', filterProducts);
router.get('/listAll', listAll)
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