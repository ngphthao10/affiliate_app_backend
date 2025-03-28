require('dotenv').config();
const app = require('./src/app');
const { sequelize, testConnection } = require('./src/models/mysql');
const { connectMongoDB } = require('./src/models/mongodb');
const logger = require('./src/utils/logger');
const env = require('./src/config/env');

const PORT = env.port;

// Start the server
const startServer = async () => {
    try {
        // Connect to MySQL
        await testConnection();

        // Connect to MongoDB
        await connectMongoDB();

        // Start Express server
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the server
startServer();