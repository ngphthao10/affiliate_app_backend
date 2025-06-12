const { Sequelize } = require('sequelize');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// MySQL configuration
const mysqlConfig = {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    username: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    timezone: '+07:00',
    dialectOptions: {
        timezone: '+07:00',
        dateStrings: true,
        typeCast: true,
    },
};

// MongoDB configuration
const mongoConfig = {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/kol_stats',
    options: {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
};

module.exports = {
    mysqlConfig,
    mongoConfig
};