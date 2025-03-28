const jwt = require('jsonwebtoken');
const { User } = require('../models/mysql');
const logger = require('../utils/logger');

// Middleware to authenticate user
const auth = async (req, res, next) => {
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

        // Check if user exists
        const user = await User.findByPk(decoded.id);

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.status !== 'active') {
            return res.json({
                success: false,
                message: 'Your account is not active'
            });
        }

        // Add user to request object
        req.user = user;
        req.userId = user.user_id;

        next();
    } catch (error) {
        logger.error(`Authentication error: ${error.message}`);

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

module.exports = auth;