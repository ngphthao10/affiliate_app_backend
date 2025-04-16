const express = require('express');
const router = express.Router();
const kolAuth = require('../../middlewares/kolAuth');
const kolReportController = require('../../controllers/KolController/kolReportController');

router.get('/report/:influencerId', kolAuth, async (req, res) => {
    try {
        const { influencerId } = req.params;
        const { start_date, end_date, product_id, group_by } = req.query;

        if (req.influencerId !== parseInt(influencerId)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                details: 'You can only access your own reports'
            });
        }

        const report = await kolReportController.generateKolConversionReport({
            kolId: parseInt(influencerId),
            startDate: start_date,
            endDate: end_date,
            productId: product_id ? parseInt(product_id) : undefined,
            groupBy: group_by || 'month'
        });

        return res.json(report);
    } catch (error) {
        console.error('Error in KOL report route:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate report',
            details: error.message
        });
    }
});

module.exports = router;