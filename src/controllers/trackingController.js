const { influencer_affiliate_link, product, influencer } = require('../models/mysql');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Tracks affiliate link clicks and redirects to the product page
 * @route GET /api/track/:linkId
 * @access Public
 */
exports.trackAffiliateLink = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token || !token.includes('.')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking link'
            });
        }

        // Split the token to get the data and signature parts
        const [encodedData, receivedSignature] = token.split('.');

        // Decode the data part
        const dataString = Buffer.from(encodedData, 'base64').toString();
        const [influencerId, productId, linkId, timestamp] = dataString.split('-');

        // Verify the signature to ensure the link hasn't been tampered with
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.AFFILIATE_SECRET);
        hmac.update(dataString);
        const calculatedSignature = hmac.digest('hex');

        if (calculatedSignature !== receivedSignature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking link signature'
            });
        }

        const now = Date.now();
        const linkAge = now - parseInt(timestamp);
        const maxLinkAge = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

        if (linkAge > maxLinkAge) {
            return res.status(400).json({
                success: false,
                message: 'Tracking link has expired'
            });
        }

        // Find the affiliate link in the database to verify it exists
        const affiliateLink = await influencer_affiliate_link.findOne({
            where: { link_id: linkId },
            include: [
                {
                    model: product,
                    as: 'product',
                    attributes: ['product_id']
                },
                {
                    model: influencer,
                    as: 'influencer',
                    attributes: ['influencer_id']
                }
            ]
        });

        if (!affiliateLink) {
            return res.status(404).json({
                success: false,
                message: 'Affiliate link not found'
            });
        }

        // Get required IDs for tracking
        const product_id = affiliateLink.product.product_id;
        const influencer_id = affiliateLink.influencer.influencer_id;

        // Set cookies for attribution (14 days expiration)
        const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
        const cookieOptions = {
            maxAge: TWO_WEEKS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        };

        res.cookie('affiliate_link_id', linkId, cookieOptions);
        res.cookie('influencer_id', influencer_id, cookieOptions);
        res.cookie('product_id', product_id, cookieOptions);

        // Track the click in MongoDB
        try {
            const KolAffiliateStats = mongoose.model('KolAffiliateStats');

            // Find today's stats document or create a new one
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to beginning of day

            let stats = await KolAffiliateStats.findOne({
                kol_id: influencer_id,
                product_id: product_id,
                date: {
                    $gte: today,
                    $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            });

            if (stats) {
                // Update existing stats
                await KolAffiliateStats.updateOne(
                    { _id: stats._id },
                    { $inc: { clicks: 1 } }
                );
            } else {
                // Create new stats for today
                await KolAffiliateStats.create({
                    kol_id: influencer_id,
                    product_id: product_id,
                    date: today,
                    clicks: 1,
                    successful_purchases: 0
                });
            }

            logger.info(`Tracked click for link ID: ${linkId}, influencer: ${influencer_id}, product: ${product_id}`);
        } catch (error) {
            // Log error but continue with redirect
            logger.error(`Error tracking click: ${error.message}`);
        }

        // Redirect to the product page
        const baseUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        const redirectUrl = `${baseUrl}/product/${product_id}`;

        return res.redirect(redirectUrl);

    } catch (error) {
        logger.error(`Error in affiliate link tracking: ${error.message}`, { stack: error.stack });

        // If something goes wrong, redirect to homepage
        const baseUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        return res.redirect(baseUrl);
    }
};