const express = require('express');
const {
    getReviews,
    getUserReviews,
    getReviewById,
    updateReviewStatus,
    getReviewStatistics,
    deleteReview,
    addReview, checkReviewExists
} = require('../controllers/reviewController');
const adminAuth = require('../middlewares/adminAuth');
const customerAuth = require('../middlewares/customerAuth');
const router = express.Router();

router.get('/', adminAuth, getReviews);
router.get('/statistics', adminAuth, getReviewStatistics);
router.get('/list', getUserReviews);
router.get('/:id', adminAuth, getReviewById);
router.put('/:id/status', adminAuth, updateReviewStatus);

router.delete('/:id', adminAuth, deleteReview);
router.post('/add', customerAuth, addReview);
router.get('/check-review/:orderItemId', customerAuth, checkReviewExists);

module.exports = router;