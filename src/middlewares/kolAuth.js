const jwt = require('jsonwebtoken');
const { users, influencer } = require('../models/mysql');
const logger = require('../utils/logger');

const kolAuth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.headers.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.json({
                success: false,
                message: 'No authentication token, access denied'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');

        if (!decoded || !decoded.id) {
            return res.json({
                success: false,
                message: 'Invalid token format'
            });
        }

        // Check if user exists and is an influencer
        const user = await users.findByPk(decoded.id, {
            include: [{
                model: influencer,
                as: 'influencer',
                required: true
            }]
        });

        if (!user) {
            return res.json({
                success: false,
                message: 'Invalid token or not an influencer'
            });
        }

        if (user.status !== 'active' || user.influencer.status !== 'active') {
            return res.json({
                success: false,
                message: 'Your account is not active'
            });
        }

        // Add user and influencer info to request object
        req.user = user;
        req.userId = user.user_id;
        req.influencer = user.influencer;
        req.influencerId = user.influencer.influencer_id;

        next();
    } catch (error) {
        logger.error(`KOL Authentication error: ${error.message}`);

        if (error.name === 'TokenExpiredError') {
            return res.json({
                success: false,
                message: 'Token expired, please login again'
            });
        }

        return res.json({
            success: false,
            message: 'Invalid token, authentication failed'
        });
    }
};

module.exports = kolAuth;