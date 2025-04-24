const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Sequelize = require('sequelize')
const { users, influencer, roles, user_role,influencer_social_link } = require('../models/mysql');
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
const registerInfluencer = async (req, res) => {
    try {
      const { user_id, status, status_reason, tier_id, social_link } = req.body;
  
      // Kiểm tra thông tin đầu vào
      if (!user_id || !status || !tier_id || !social_link || !social_link.platform || !social_link.profile_link) {
        logger.warn('Thiếu thông tin cần thiết khi đăng ký KOL:', { user_id, status, tier_id, social_link });
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin.' });
      }
  
      // Kiểm tra xem người dùng đã đăng ký KOL chưa
      const existingInfluencer = await influencer.findOne({ where: { user_id } });
      if (existingInfluencer) {
        logger.warn('Người dùng đã đăng ký KOL:', { user_id });
        return res.status(400).json({ success: false, message: 'Bạn đã đăng ký KOL rồi.' });
      }
  
      // Kiểm tra xem user_id có tồn tại trong bảng users không
      const user = await users.findByPk(user_id);
      if (!user) {
        logger.warn('Không tìm thấy người dùng:', { user_id });
        return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
      }
  
      // Thêm bản ghi vào bảng influencer
      const newInfluencer = await influencer.create({
        user_id,
        status: status || 'pending', // Mặc định là pending
        status_reason: status_reason || null,
        tier_id: tier_id || 1, // Mặc định là 1 (hạng thường)
        modified_at: new Date(),
      });
  
      // Thêm bản ghi vào bảng influencer_social_link
      await influencer_social_link.create({
        influencer_id: newInfluencer.influencer_id,
        platform: social_link.platform,
        profile_link: social_link.profile_link,
      });
  
      logger.info('Đăng ký KOL thành công:', { user_id, influencer_id: newInfluencer.influencer_id });
      return res.status(200).json({ success: true, message: 'Đăng ký KOL thành công! Vui lòng chờ xét duyệt.' });
    } catch (error) {
      logger.error('Lỗi khi đăng ký KOL:', error);
      return res.status(500).json({ success: false, message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
    }
  };
  
  // Gán vai trò cho người dùng (ví dụ: vai trò KOL)
  const assignRole = async (req, res) => {
    try {
      const { user_id, role_id } = req.body;
  
      // Kiểm tra thông tin đầu vào
      if (!user_id || !role_id) {
        logger.warn('Thiếu thông tin khi gán vai trò:', { user_id, role_id });
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp user_id và role_id.' });
      }
  
      // Kiểm tra xem user_id có tồn tại không
      const user = await users.findByPk(user_id);
      if (!user) {
        logger.warn('Không tìm thấy người dùng:', { user_id });
        return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
      }
  
      // Kiểm tra xem vai trò đã được gán chưa
      const existingRole = await user_role.findOne({ where: { user_id, role_id } });
      if (existingRole) {
        logger.warn('Vai trò đã được gán:', { user_id, role_id });
        return res.status(400).json({ success: false, message: 'Vai trò này đã được gán cho người dùng.' });
      }
  
      // Thêm bản ghi vào bảng user_role
      await user_role.create({
        user_id,
        role_id,
      });
  
      logger.info('Gán vai trò thành công:', { user_id, role_id });
      return res.status(200).json({ success: true, message: 'Gán vai trò thành công!' });
    } catch (error) {
      logger.error('Lỗi khi gán vai trò:', error);
      return res.status(500).json({ success: false, message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
    }
  };
  const checkUserRole = async (req, res) => {
    try {
      const { user_id, role_id } = req.query; // Get user_id and role_id from query parameters
      console.log('Request parameters:', { user_id, role_id });
      // Validate input
      if (!user_id) {
        return res.status(400).json({ success: false, message: 'User ID is required.' });
      }
      if (!role_id) {
        return res.status(400).json({ success: false, message: 'Role ID is required.' });
      }
      const userIdNumber = parseInt(user_id);
      const roleIdNumber = parseInt(role_id);
      console.log('Parsed values:', { userIdNumber, roleIdNumber });
      if (isNaN(userIdNumber)) {
        return res.status(400).json({ success: false, message: 'User ID must be a valid number.' });
      }
      if (isNaN(roleIdNumber)) {
        return res.status(400).json({ success: false, message: 'Role ID must be a valid number.' });
      }
      // Check if the user has the specified role in the user_role collection
      const userRole = await user_role.findOne({ 
        where: {
            user_id: userIdNumber,
            role_id: roleIdNumber,
          },
      });
      console.log('Query result:', userRole ? userRole.toJSON() : null);
      return res.status(200).json({
        success: true,
        hasRole: !!userRole, // true if role exists, false otherwise
      });
    } catch (error) {
      console.error('Error checking user role:', error);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  };
module.exports = { registerUser, loginUser, adminLogin, kolLogin,getUser,updateUser,changePassword,registerInfluencer,assignRole,checkUserRole };