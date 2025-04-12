const jwt = require('jsonwebtoken');
const { users, roles, user_role } = require('../models/mysql');
const logger = require('../utils/logger');

const customerAuth = async (req, res, next) => {
    try {
        const token = req.headers.token || req.headers.authorization?.split(' ')[1];
        if (!token) return next('no_token'); // Gửi lỗi cho hàm ngoài

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
        if (!decoded || !decoded.id) return next('invalid_token');

        const user = await users.findByPk(decoded.id);
        if (!user || user.status !== 'active') return next('invalid_user');

        const userRoles = await user_role.findAll({ where: { user_id: user.user_id } });
        const roleIds = userRoles.map(ur => ur.role_id);
        const roleList = await roles.findAll({ where: { role_id: roleIds } });

        const isCustomer = roleList.some(role => role.role_name === 'customer');
        if (!isCustomer) return next('not_customer');

        req.user = user;
        req.user_id = user.user_id;
        req.roles = roleList;
        return next(); // success
    } catch (error) {
        return next('auth_error'); // đẩy lỗi ra ngoài
    }
};


module.exports = customerAuth;
