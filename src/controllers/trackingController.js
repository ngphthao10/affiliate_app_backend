const trackingService = require('../services/trackingService');
const { InfluencerAffiliateLink, Product } = require('../models/mysql');
const logger = require('../utils/logger');

/**
 * Controller for affiliate tracking
 */
class TrackingController {
    /**
     * Track affiliate link click and set tracking cookie
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async trackClick(req, res) {
        try {
            const { linkId } = req.params;

            // Validate link exists
            const affiliateLink = await InfluencerAffiliateLink.findByPk(linkId, {
                include: [{ model: Product, as: 'product' }]
            });

            if (!affiliateLink) {
                return res.status(404).json({ message: 'Affiliate link not found' });
            }

            // Extract tracking data from request
            const trackingData = {
                user_agent: req.headers['user-agent'],
                ip_address: req.ip,
                referer: req.headers.referer,
                utm_source: req.query.utm_source,
                utm_medium: req.query.utm_medium,
                utm_campaign: req.query.utm_campaign,
                country: req.query.country || 'unknown',
                city: req.query.city || 'unknown'
            };

            // Track the click
            await trackingService.trackClick(linkId, trackingData);

            // Set tracking cookie
            res.cookie('kol_affiliate', linkId, trackingService.getCookieSettings());

            // Redirect to product page or return success
            if (req.query.redirect === 'true' && affiliateLink.product) {
                return res.redirect(`/products/${affiliateLink.product.product_id}`);
            }

            return res.status(200).json({
                success: true,
                message: 'Click tracked successfully',
                product: affiliateLink.product ? {
                    id: affiliateLink.product.product_id,
                    name: affiliateLink.product.name,
                    url: `/products/${affiliateLink.product.product_id}`
                } : null
            });
        } catch (error) {
            logger.error(`Error in trackClick: ${error.message}`);
            return res.status(500).json({ message: 'Server error' });
        }
    }

    /**
     * Manually track a purchase for an affiliate
     * Admin only endpoint
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async trackPurchase(req, res) {
        try {
            const { linkId } = req.params;
            const { amount, orderId } = req.body;

            if (!amount || isNaN(parseFloat(amount))) {
                return res.status(400).json({ message: 'Valid purchase amount is required' });
            }

            // Validate link exists
            const affiliateLink = await InfluencerAffiliateLink.findByPk(linkId);
            if (!affiliateLink) {
                return res.status(404).json({ message: 'Affiliate link not found' });
            }

            // Track the purchase
            const trackingData = {
                orderId,
                country: req.body.country || 'unknown',
                city: req.body.city || 'unknown'
            };

            await trackingService.trackPurchase(linkId, parseFloat(amount), trackingData);

            return res.status(200).json({
                success: true,
                message: 'Purchase tracked successfully'
            });
        } catch (error) {
            logger.error(`Error in trackPurchase: ${error.message}`);
            return res.status(500).json({ message: 'Server error' });
        }
    }

    /**
     * Get tracking cookie from request
     * @param {Object} req - Express request object
     * @returns {String|null} Affiliate link ID or null
     */
    getTrackingCookie(req) {
        return req.cookies?.kol_affiliate || null;
    }
}

module.exports = new TrackingController();