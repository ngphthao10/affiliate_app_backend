const express = require('express');
const {
    getReviews,
    getReviewById,
    updateReviewStatus,
    getReviewStatistics,
    deleteReview
} = require('../controllers/reviewController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

// All routes are protected with adminAuth
router.get('/', adminAuth, getReviews);
router.get('/statistics', adminAuth, getReviewStatistics);
router.get('/:id', adminAuth, getReviewById);
router.put('/:id/status', adminAuth, updateReviewStatus);
router.delete('/:id', adminAuth, deleteReview);

module.exports = router;