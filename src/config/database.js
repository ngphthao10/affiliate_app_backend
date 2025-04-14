const { Sequelize } = require('sequelize');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// MySQL configuration
const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DATABASE || 'ecommerce_db',
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    timezone: '+07:00', // Múi giờ khi lưu dữ liệu
    dialectOptions: {
        timezone: '+07:00', // Múi giờ khi kết nối đến MySQL
        dateStrings: true, // Lưu thời gian dưới dạng chuỗi để tránh chuyển đổi
        typeCast: true, // Đảm bảo Sequelize không tự động chuyển đổi thời gian
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