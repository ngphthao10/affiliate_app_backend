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
        const { name, email, password } = req.body;

        if (!email || !password || !name) {
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
            first_name: name,
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

module.exports = { registerUser, loginUser, adminLogin, kolLogin };