const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { mongoConfig } = require('../../config/database');

/**
 * Connect to MongoDB
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
const connectMongoDB = async () => {
    try {
        await mongoose.connect(mongoConfig.uri, mongoConfig.options);

        logger.info('MongoDB connection established successfully');

        // Handle connection events
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected, attempting to reconnect');
        });

        mongoose.connection.on('error', (err) => {
            logger.error(`MongoDB connection error: ${err}`);
        });

        // Load all models
        require('./kolStats');

        return mongoose.connection;
    } catch (error) {
        logger.error(`Error connecting to MongoDB: ${error.message}`);
        // In development, we might want to continue even if MongoDB is not available
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
        return null;
    }
};

module.exports = { connectMongoDB };