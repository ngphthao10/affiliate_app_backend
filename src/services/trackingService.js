const KolAffiliateStats = require('../models/mongodb/kolStats');
const { InfluencerAffiliateLink } = require('../models/mysql');
const logger = require('../utils/logger');

/**
 * Tracking service for KOL affiliate links
 */
class TrackingService {
    /**
     * Track a click on an affiliate link
     * @param {String} linkId - Affiliate link ID
     * @param {Object} trackingData - Additional tracking data
     */
    async trackClick(linkId, trackingData = {}) {
        try {
            // Find affiliate link in MySQL
            const affiliateLink = await InfluencerAffiliateLink.findByPk(linkId);
            if (!affiliateLink) {
                logger.warn(`Attempted to track click for non-existent link ID: ${linkId}`);
                return null;
            }

            // Extract data
            const { influencer_id, product_id } = affiliateLink;
            const {
                user_agent,
                ip_address,
                referer,
                utm_source,
                utm_medium,
                utm_campaign,
                country,
                city
            } = trackingData;

            // Get current date for statistics
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const hour_of_day = now.getHours();
            const day_of_week = now.getDay();

            // Update or create stats document in MongoDB
            const stats = await KolAffiliateStats.findOneAndUpdate(
                {
                    kol_id: influencer_id,
                    product_id,
                    date
                },
                {
                    $inc: { clicks: 1 },
                    $set: {
                        hour_of_day,
                        day_of_week,
                        country,
                        city,
                        utm_source,
                        utm_medium,
                        utm_campaign
                    }
                },
                {
                    upsert: true,
                    new: true
                }
            );

            logger.info(`Tracked click for KOL ${influencer_id}, product ${product_id}`);
            return stats;
        } catch (error) {
            logger.error(`Error tracking click: ${error.message}`);
            // Still return success to the client even if tracking fails
            return null;
        }
    }

    /**
     * Track a successful purchase through an affiliate link
     * @param {String} linkId - Affiliate link ID
     * @param {Number} amount - Purchase amount
     * @param {Object} trackingData - Additional tracking data
     */
    async trackPurchase(linkId, amount, trackingData = {}) {
        try {
            // Find affiliate link in MySQL
            const affiliateLink = await InfluencerAffiliateLink.findByPk(linkId, {
                include: [{
                    model: 'Influencer',
                    as: 'influencer',
                    include: [{
                        model: 'InfluencerTier',
                        as: 'tier'
                    }]
                }]
            });

            if (!affiliateLink) {
                logger.warn(`Attempted to track purchase for non-existent link ID: ${linkId}`);
                return null;
            }

            // Extract data
            const { influencer_id, product_id } = affiliateLink;
            const commission_rate = affiliateLink.influencer?.tier?.commission_rate || 0.1; // Default 10%
            const commission_earned = amount * commission_rate;

            // Get current date for statistics
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Update or create stats document in MongoDB
            const stats = await KolAffiliateStats.findOneAndUpdate(
                {
                    kol_id: influencer_id,
                    product_id,
                    date
                },
                {
                    $inc: {
                        successful_purchases: 1,
                        revenue_generated: amount,
                        commission_earned
                    },
                    $set: {
                        country: trackingData.country,
                        city: trackingData.city
                    }
                },
                {
                    upsert: true,
                    new: true
                }
            );

            // Calculate conversion rate after update
            if (stats.clicks > 0) {
                stats.conversion_rate = (stats.successful_purchases / stats.clicks) * 100;
                await stats.save();
            }

            logger.info(`Tracked purchase for KOL ${influencer_id}, product ${product_id}, amount ${amount}`);
            return stats;
        } catch (error) {
            logger.error(`Error tracking purchase: ${error.message}`);
            // Still return success to the client even if tracking fails
            return null;
        }
    }

    /**
     * Get cookie settings for tracking
     */
    getCookieSettings() {
        return {
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        };
    }
}

module.exports = new TrackingService();