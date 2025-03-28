require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key',
    cookieSecret: process.env.COOKIE_SECRET || 'your_cookie_secret_key',
    logLevel: process.env.LOG_LEVEL || 'info'
};