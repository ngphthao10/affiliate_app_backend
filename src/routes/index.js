const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'E-commerce with KOL affiliate marketing API',
        version: '1.0.0'
    });
});

module.exports = router;