const { influencer_tier } = require('../models/mysql');
const logger = require('../utils/logger');

exports.listTiers = async (req, res) => {
    try {
        const tiers = await influencer_tier.findAll({
            order: [['min_successful_purchases', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: tiers
        });
    } catch (error) {
        logger.error(`Error listing KOL tiers: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL tiers',
            error: error.message
        });
    }
};

exports.getTier = async (req, res) => {
    try {
        const { id } = req.params;

        const tier = await influencer_tier.findByPk(id);

        if (!tier) {
            return res.status(404).json({
                success: false,
                message: 'Tier not found'
            });
        }

        res.status(200).json({
            success: true,
            data: tier
        });
    } catch (error) {
        logger.error(`Error getting KOL tier: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL tier',
            error: error.message
        });
    }
};

exports.createTier = async (req, res) => {
    try {
        const { tier_name, min_successful_purchases, commission_rate } = req.body;

        if (!tier_name || !min_successful_purchases || !commission_rate) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (isNaN(min_successful_purchases) || min_successful_purchases < 0) {
            return res.status(400).json({
                success: false,
                message: "Minimum successful purchases must be a non-negative number"
            });
        }

        if (isNaN(commission_rate) || commission_rate < 0 || commission_rate > 30) {
            return res.status(400).json({
                success: false,
                message: "Commission rate must be between 0 and 30"
            });
        }

        const existingTier = await influencer_tier.findOne({
            where: {
                tier_name: tier_name.trim()
            }
        });

        if (existingTier) {
            return res.status(400).json({
                success: false,
                message: "A tier with this name already exists"
            });
        }
        const newTier = await influencer_tier.create({
            tier_name: tier_name.trim(),
            min_successful_purchases: parseInt(min_successful_purchases),
            commission_rate: parseFloat(commission_rate)
        });

        res.status(201).json({
            success: true,
            message: 'KOL tier created successfully',
            data: newTier
        });
    } catch (error) {
        logger.error(`Error creating KOL tier: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to create KOL tier',
            error: error.message
        });
    }
};

exports.updateTier = async (req, res) => {
    try {
        const { id } = req.params;
        const { tier_name, min_successful_purchases, commission_rate } = req.body;

        const tier = await influencer_tier.findByPk(id);
        if (!tier) {
            return res.status(404).json({
                success: false,
                message: 'Tier not found'
            });
        }

        if (min_successful_purchases !== undefined) {
            if (isNaN(min_successful_purchases) || min_successful_purchases < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Minimum successful purchases must be a non-negative number"
                });
            }
        }

        if (commission_rate !== undefined) {
            if (isNaN(commission_rate) || commission_rate < 0 || commission_rate > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Commission rate must be between 0 and 100"
                });
            }
        }

        await tier.update({
            tier_name: tier_name || tier.tier_name,
            min_successful_purchases: min_successful_purchases !== undefined ? parseInt(min_successful_purchases) : tier.min_successful_purchases,
            commission_rate: commission_rate !== undefined ? parseFloat(commission_rate) : tier.commission_rate
        });

        res.status(200).json({
            success: true,
            message: 'KOL tier updated successfully',
            data: tier
        });
    } catch (error) {
        logger.error(`Error updating KOL tier: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update KOL tier',
            error: error.message
        });
    }
};

exports.deleteTier = async (req, res) => {
    try {
        const { id } = req.params;

        const tier = await influencer_tier.findByPk(id);
        if (!tier) {
            return res.status(404).json({
                success: false,
                message: 'Tier not found'
            });
        }

        const influencerCount = await tier.countInfluencers();
        if (influencerCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete tier that is being used by influencers'
            });
        }

        await tier.destroy();

        res.status(200).json({
            success: true,
            message: 'KOL tier deleted successfully'
        });
    } catch (error) {
        logger.error(`Error deleting KOL tier: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to delete KOL tier',
            error: error.message
        });
    }
};