const express = require('express');
const {
    getProducts,
    generateAffiliateLink
} = require('../../controllers/KolController/commissionController');
const kolAuth = require('../../middlewares/kolAuth');

const router = express.Router();

router.use(kolAuth);

router.get('/products', getProducts);

router.post('/generate-link', generateAffiliateLink);

module.exports = router;