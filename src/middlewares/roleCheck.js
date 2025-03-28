const logger = require('../utils/logger');

/**
 * Check if user has required role
 * @param {Array|String} requiredRoles - Required role(s) to access the route
 */
exports.checkRole = (requiredRoles) => {
    return (req, res, next) => {
        // Ensure user has been authenticated (auth middleware should run first)
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Convert requiredRoles to array if it's a string
        const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

        // Check if user's role is in the required roles
        if (roles.length > 0 && !roles.includes(req.user.role)) {
            logger.warn(`User ${req.user.id} with role ${req.user.role} tried to access a route requiring roles: ${roles.join(', ')}`);
            return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
        }

        // User has required role, proceed
        next();
    };
};