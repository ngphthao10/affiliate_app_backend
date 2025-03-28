const KolAffiliateStats = require('../models/mongodb/kolStats');
const { Influencer, Product } = require('../models/mysql');
const logger = require('../utils/logger');

class StatsController {
    /**
     * Get KOL statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getKolStats(req, res) {
        try {
            const { kolId } = req.params;
            const { startDate, endDate, productId } = req.query;

            // Validate KOL exists
            const influencer = await Influencer.findByPk(kolId);
            if (!influencer) {
                return res.status(404).json({ message: 'Influencer not found' });
            }

            // Build query
            const query = { kol_id: parseInt(kolId) };

            // Add date range if provided
            if (startDate && endDate) {
                query.date = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            // Add product filter if provided
            if (productId) {
                query.product_id = parseInt(productId);
            }

            // Get stats from MongoDB
            const stats = await KolAffiliateStats.find(query).sort({ date: -1 });

            // Calculate aggregated metrics
            const totalClicks = stats.reduce((sum, stat) => sum + stat.clicks, 0);
            const totalPurchases = stats.reduce((sum, stat) => sum + stat.successful_purchases, 0);
            const totalRevenue = stats.reduce((sum, stat) => sum + stat.revenue_generated, 0);
            const totalCommission = stats.reduce((sum, stat) => sum + stat.commission_earned, 0);

            // Calculate overall conversion rate
            const overallConversionRate = totalClicks > 0
                ? (totalPurchases / totalClicks) * 100
                : 0;

            return res.status(200).json({
                success: true,
                data: {
                    kol_id: parseInt(kolId),
                    aggregated: {
                        total_clicks: totalClicks,
                        total_purchases: totalPurchases,
                        total_revenue: totalRevenue,
                        total_commission: totalCommission,
                        overall_conversion_rate: overallConversionRate
                    },
                    daily_stats: stats
                }
            });
        } catch (error) {
            logger.error(`Error in getKolStats: ${error.message}`);
            return res.status(500).json({ message: 'Server error' });
        }
    }

    /**
     * Get product statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getProductStats(req, res) {
        try {
            const { productId } = req.params;
            const { startDate, endDate } = req.query;

            // Validate product exists
            const product = await Product.findByPk(productId);
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            // Build query
            const query = { product_id: parseInt(productId) };

            // Add date range if provided
            if (startDate && endDate) {
                query.date = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            // Get stats from MongoDB
            const stats = await KolAffiliateStats.find(query).sort({ date: -1 });

            // Group by KOL
            const kolStats = {};

            stats.forEach(stat => {
                if (!kolStats[stat.kol_id]) {
                    kolStats[stat.kol_id] = {
                        kol_id: stat.kol_id,
                        clicks: 0,
                        purchases: 0,
                        revenue: 0,
                        commission: 0
                    };
                }

                kolStats[stat.kol_id].clicks += stat.clicks;
                kolStats[stat.kol_id].purchases += stat.successful_purchases;
                kolStats[stat.kol_id].revenue += stat.revenue_generated;
                kolStats[stat.kol_id].commission += stat.commission_earned;
            });

            // Calculate totals
            const totalClicks = stats.reduce((sum, stat) => sum + stat.clicks, 0);
            const totalPurchases = stats.reduce((sum, stat) => sum + stat.successful_purchases, 0);
            const totalRevenue = stats.reduce((sum, stat) => sum + stat.revenue_generated, 0);
            const totalCommission = stats.reduce((sum, stat) => sum + stat.commission_earned, 0);

            return res.status(200).json({
                success: true,
                data: {
                    product_id: parseInt(productId),
                    aggregated: {
                        total_clicks: totalClicks,
                        total_purchases: totalPurchases,
                        total_revenue: totalRevenue,
                        total_commission: totalCommission
                    },
                    kol_stats: Object.values(kolStats),
                    daily_stats: stats
                }
            });
        } catch (error) {
            logger.error(`Error in getProductStats: ${error.message}`);
            return res.status(500).json({ message: 'Server error' });
        }
    }

    /**
     * Get dashboard statistics for a KOL
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getKolDashboardStats(req, res) {
        try {
            const kolId = req.user.id;

            // Get stats for the last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const query = {
                kol_id: kolId,
                date: { $gte: thirtyDaysAgo }
            };

            // Get stats from MongoDB
            const stats = await KolAffiliateStats.find(query).sort({ date: 1 });

            // Group by date and product
            const dailyStats = {};
            const productStats = {};

            stats.forEach(stat => {
                // Format date as YYYY-MM-DD
                const dateStr = stat.date.toISOString().split('T')[0];

                // Daily stats
                if (!dailyStats[dateStr]) {
                    dailyStats[dateStr] = {
                        date: dateStr,
                        clicks: 0,
                        purchases: 0,
                        revenue: 0,
                        commission: 0
                    };
                }

                dailyStats[dateStr].clicks += stat.clicks;
                dailyStats[dateStr].purchases += stat.successful_purchases;
                dailyStats[dateStr].revenue += stat.revenue_generated;
                dailyStats[dateStr].commission += stat.commission_earned;

                // Product stats
                if (!productStats[stat.product_id]) {
                    productStats[stat.product_id] = {
                        product_id: stat.product_id,
                        clicks: 0,
                        purchases: 0,
                        revenue: 0,
                        commission: 0
                    };
                }

                productStats[stat.product_id].clicks += stat.clicks;
                productStats[stat.product_id].purchases += stat.successful_purchases;
                productStats[stat.product_id].revenue += stat.revenue_generated;
                productStats[stat.product_id].commission += stat.commission_earned;
            });

            // Calculate totals
            const totalClicks = stats.reduce((sum, stat) => sum + stat.clicks, 0);
            const totalPurchases = stats.reduce((sum, stat) => sum + stat.successful_purchases, 0);
            const totalRevenue = stats.reduce((sum, stat) => sum + stat.revenue_generated, 0);
            const totalCommission = stats.reduce((sum, stat) => sum + stat.commission_earned, 0);

            // Calculate conversion rate
            const conversionRate = totalClicks > 0
                ? (totalPurchases / totalClicks) * 100
                : 0;

            return res.status(200).json({
                success: true,
                data: {
                    kol_id: kolId,
                    period: '30d',
                    totals: {
                        clicks: totalClicks,
                        purchases: totalPurchases,
                        revenue: totalRevenue,
                        commission: totalCommission,
                        conversion_rate: conversionRate
                    },
                    daily_stats: Object.values(dailyStats),
                    product_stats: Object.values(productStats)
                }
            });
        } catch (error) {
            logger.error(`Error in getKolDashboardStats: ${error.message}`);
            return res.status(500).json({ message: 'Server error' });
        }
    }
}

module.exports = new StatsController();