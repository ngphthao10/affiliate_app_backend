const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Sequelize = require('sequelize')
const { users, influencer, roles, user_role } = require('../models/mysql');
const logger = require('../utils/logger');
const validator = require('validator');
require('dotenv').config();

const createToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET || 'your_jwt_secret_key',
        { expiresIn: '7d' }
    );
};

const registerUser = async (req, res) => {
    try {
        const { first_name,last_name,phone_num, email, password } = req.body;

        if (!email || !password || !first_name ||!last_name || !phone_num) {
            return res.json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (!validator.isEmail(email)) {
            return res.json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        if (password.length < 6) {
            return res.json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        const existingUser = await users.findOne({ where: { email } });
        if (existingUser) {
            return res.json({
                success: false,
                message: "User with this email already exists"
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await users.create({
            username: email,
            first_name,
            last_name,
            phone_num,
            email,
            password_hash: hashedPassword,
            status: 'active'
        });

        const customerRole = await roles.findOne({ where: { role_name: 'customer' } });
        if (customerRole) {
            await user_role.create({
                user_id: user.user_id,
                role_id: customerRole.role_id
            });
        }

        const token = createToken(user.user_id);

        return res.json({
            success: true,
            token,
            user: {
                id: user.user_id,
                name: user.first_name,
                email: user.email
            }
        });

    } catch (error) {
        logger.error(`Registration error: ${error.message}`, { stack: error.stack });
        return res.json({
            success: false,
            message: "Registration failed. Please try again."
        });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({
                success: false,
                message: "Email and password are required"
            });
        }

        const user = await users.findOne({ where: { email } });
        if (!user) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        if (user.status !== 'active') {
            return res.json({
                success: false,
                message: "Your account is not active. Please contact support."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const token = createToken(user.user_id);

        return res.json({
            success: true,
            token,
            user: {
                id: user.user_id,
                name: user.first_name,
                email: user.email
            }
        });

    } catch (error) {
        logger.error(`Login error: ${error.message}`, { stack: error.stack });
        return res.json({
            success: false,
            message: "Login failed. Please try again."
        });
    }
};

const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(email, password)
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            const token = jwt.sign(email + password, process.env.JWT_SECRET);
            res.json({ success: true, token });
        } else {
            res.json({ success: false, message: "Invalid credentials" });
        }
    } catch (error) {
        logger.error(`Admin login error: ${error.message}`, { stack: error.stack });
        res.json({ success: false, message: error.message });
    }
};

const kolLogin = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.json({
                success: false,
                message: "Login identifier and password are required"
            });
        }

        const user = await users.findOne({
            where: {
                [Sequelize.Op.or]: [
                    { username: identifier },
                    { email: identifier },
                    { phone_num: identifier }
                ]
            },
            include: [
                {
                    model: influencer,
                    as: 'influencer',
                    required: true
                },
                {
                    model: roles,
                    as: 'role_id_roles',
                    through: {
                        model: user_role,
                        attributes: []
                    },
                    where: { role_name: 'influencer' },
                    required: true
                }
            ]
        });

        if (!user) {
            return res.json({
                success: false,
                message: "Invalid credentials or not an influencer account"
            });
        }

        if (user.status !== 'active') {
            return res.json({
                success: false,
                message: "Your account is not active. Please contact support."
            });
        }

        if (user.influencer.status !== 'active') {
            return res.json({
                success: false,
                message: `Your influencer account is ${user.influencer.status}. Please contact support.`
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const token = createToken(user.user_id);

        return res.json({
            success: true,
            token,
            user: {
                id: user.user_id,
                username: user.username,
                name: user.first_name + ' ' + user.last_name,
                email: user.email,
                phone: user.phone_num,
                influencer_id: user.influencer.influencer_id,
                influencer_status: user.influencer.status,
                tier_id: user.influencer.tier_id
            }
        });

    } catch (error) {
        logger.error(`KOL Login error: ${error.message}`, { stack: error.stack });
        return res.json({
            success: false,
            message: "Login failed. Please try again."
        });
    }
};
const getUser = async (req, res) => {
    try {
        const userId = req.user_id; // Giả định user_id được lấy từ token qua middleware

        const user = await users.findByPk(userId, {
            attributes: [
                'user_id', 'username', 'first_name', 'last_name',
                'email', 'phone_num', 'status', 'status_reason',
                'creation_at', 'modified_at'
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            user: {
                id: user.user_id,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone_num: user.phone_num,
                status: user.status,
                status_reason: user.status_reason,
                creation_at: user.creation_at,
                modified_at: user.modified_at
            }
        });

    } catch (error) {
        logger.error(`Error getting user: ${error.message}`, { stack: error.stack });
        return res.status(500).json({
            success: false,
            message: "Failed to fetch user details",
            error: error.message
        });
    }
};

// Cập nhật thông tin người dùng
const updateUser = async (req, res) => {
    try {
        const userId = req.user_id; // Giả định user_id được lấy từ token qua middleware
        const { first_name, last_name, phone_num, password } = req.body;

        // Kiểm tra mật khẩu hiện tại
        if (!password) {
            return res.json({
                success: false,
                message: "Current password is required to update profile"
            });
        }

        const user = await users.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        // Kiểm tra và cập nhật các trường
        const updatedData = {};
        if (first_name) updatedData.first_name = first_name;
        if (last_name) updatedData.last_name = last_name;
        if (phone_num) {
            if (!validator.isMobilePhone(phone_num, 'any')) {
                return res.json({
                    success: false,
                    message: "Please enter a valid phone number"
                });
            }
            updatedData.phone_num = phone_num;
        }

        await users.update(updatedData, { where: { user_id: userId } });

        const updatedUser = await users.findByPk(userId);
        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: {
                id: updatedUser.user_id,
                first_name: updatedUser.first_name,
                last_name: updatedUser.last_name,
                phone_num: updatedUser.phone_num,
                email: updatedUser.email
            }
        });

    } catch (error) {
        logger.error(`Error updating user: ${error.message}`, { stack: error.stack });
        return res.status(500).json({
            success: false,
            message: "Failed to update profile",
            error: error.message
        });
    }
};

// Thay đổi mật khẩu
const changePassword = async (req, res) => {
    try {
        const userId = req.user_id; // Giả định user_id được lấy từ token qua middleware
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.json({
                success: false,
                message: "Current password and new password are required"
            });
        }

        if (new_password.length < 6) {
            return res.json({
                success: false,
                message: "New password must be at least 6 characters long"
            });
        }

        const user = await users.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            return res.json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await users.update(
            { password_hash: hashedPassword },
            { where: { user_id: userId } }
        );

        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });

    } catch (error) {
        logger.error(`Error changing password: ${error.message}`, { stack: error.stack });
        return res.status(500).json({
            success: false,
            message: "Failed to change password",
            error: error.message
        });
    }
};
module.exports = { registerUser, loginUser, adminLogin, kolLogin,getUser,updateUser,changePassword };