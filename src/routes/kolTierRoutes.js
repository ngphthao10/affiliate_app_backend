const express = require('express');
const { listTiers, getTier, createTier, updateTier, deleteTier } = require('../controllers/kolTierController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

router.get('/list', adminAuth, listTiers);
router.get('/:id', adminAuth, getTier);
router.post('/create', adminAuth, createTier);
router.put('/update/:id', adminAuth, updateTier);
router.delete('/delete/:id', adminAuth, deleteTier);

module.exports = router;    