const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const adminAuth = require('../middlewares/adminAuth');


router.get('/', categoryController.getAllCategories);
router.get('/subcategories', adminAuth, categoryController.getAllSubCategories);
router.get('/:parentId/subcategories', adminAuth, categoryController.getSubCategories);

router.post('/', adminAuth, categoryController.createCategory);
router.post('/subcategory', adminAuth, categoryController.createSubCategory);
router.delete('/:id', adminAuth, categoryController.deleteCategory);
router.delete('/subcategory/:id', adminAuth, categoryController.deleteSubCategory);

module.exports = router;