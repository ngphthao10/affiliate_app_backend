'use strict';

const { Sequelize } = require('sequelize');
const logger = require('../../utils/logger');
const { mysqlConfig } = require('../../config/database');
const initModels = require('./init-models');

// Create Sequelize instance
const sequelize = new Sequelize(
    mysqlConfig.database,
    mysqlConfig.username,
    mysqlConfig.password,
    {
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        dialect: mysqlConfig.dialect,
        logging: mysqlConfig.logging,
        pool: mysqlConfig.pool,
        timezone:mysqlConfig.timezone
    }
);

// Initialize models
const models = initModels(sequelize);

// Test database connection
const testConnection = async () => {
    try {
        await sequelize.authenticate();
        logger.info('MySQL connection established successfully.');
        return true;
    } catch (error) {
        logger.error('Unable to connect to MySQL database:', error);
        throw error;
    }
};

// Export models and Sequelize instances
module.exports = { ...models, sequelize, Sequelize, testConnection };