/**
 * Global error handling middleware
 */
const logger = require('../utils/logger');

/**
 * Error handling middleware
 * Captures errors and sends appropriate response
 */
exports.errorHandler = (err, req, res, next) => {
    // Log the error
    logger.error(`Error: ${err.message}`, { stack: err.stack });

    // Set status code
    const statusCode = err.statusCode || 500;

    // Send response
    res.status(statusCode).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};