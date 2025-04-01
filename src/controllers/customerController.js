const db = require('../models/mysql');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

exports.listCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status, start_date, end_date, sort_by = 'creation_at', sort_order = 'DESC' } = req.query;

        // Build filter conditions
        const whereConditions = {};
        const Op = db.Sequelize.Op;

        // Search in username, first_name, last_name, email or phone
        if (search) {
            whereConditions[Op.or] = [
                { username: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone_num: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by status
        if (status && status !== 'all') {
            whereConditions.status = status;
        }

        // Filter by creation date range
        if (start_date || end_date) {
            whereConditions.creation_at = {};

            if (start_date) {
                whereConditions.creation_at[Op.gte] = new Date(start_date);
            }

            if (end_date) {
                // Set end date to the end of the day
                const endDateTime = new Date(end_date);
                endDateTime.setHours(23, 59, 59, 999);
                whereConditions.creation_at[Op.lte] = endDateTime;
            }
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Validate sort parameters
        const validSortFields = ['username', 'email', 'status', 'creation_at', 'modified_at'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'creation_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Find customers with Sequelize
        const { count, rows: customers } = await db.users.findAndCountAll({
            include: [
                {
                    model: db.user_role,
                    as: 'user_roles',
                    include: [
                        {
                            model: db.roles,
                            as: 'role',
                            where: { role_name: 'customer' }
                        }
                    ]
                }
            ],
            where: whereConditions,
            order: [[sortField, sortDirection]],
            limit: parseInt(limit, 10),
            offset: offset,
            distinct: true
        });

        // Return customers with pagination info
        res.status(200).json({
            success: true,
            customers: customers.map(customer => ({
                user_id: customer.user_id,
                username: customer.username,
                first_name: customer.first_name,
                last_name: customer.last_name,
                email: customer.email,
                phone_num: customer.phone_num,
                status: customer.status,
                status_reason: customer.status_reason,
                creation_at: customer.creation_at,
                modified_at: customer.modified_at
            })),
            pagination: {
                total: count,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        logger.error(`Error listing customers: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customers',
            error: error.message
        });
    }
};
/**
 * Lấy thông tin chi tiết của khách hàng
 */
exports.getCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Customer ID is required"
            });
        }

        // Find customer with all related information
        const customer = await db.users.findByPk(id, {
            attributes: [
                'user_id', 'username', 'first_name', 'last_name',
                'email', 'phone_num', 'status', 'status_reason',
                'creation_at', 'modified_at'
            ],
            include: [
                {
                    model: db.user_role,
                    as: 'user_roles',
                    include: [
                        {
                            model: db.roles,
                            as: 'role',
                            attributes: ['role_id', 'role_name', 'description']
                        }
                    ]
                },
                {
                    model: db.user_address,
                    as: 'user_addresses',
                    attributes: [
                        'address_id', 'recipient_name', 'phone_num',
                        'address', 'city', 'country', 'is_default',
                        'creation_at', 'modified_at'
                    ]
                },
                {
                    model: db.order,
                    as: 'orders',
                    attributes: ['order_id', 'total', 'status', 'creation_at', 'modified_at'],
                    order: [['creation_at', 'DESC']],
                    limit: 10
                }
            ]
        });

        // Check if customer exists
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Format the response
        const formattedCustomer = {
            user_id: customer.user_id,
            username: customer.username,
            first_name: customer.first_name,
            last_name: customer.last_name,
            email: customer.email,
            phone_num: customer.phone_num,
            status: customer.status,
            status_reason: customer.status_reason,
            creation_at: customer.creation_at,
            modified_at: customer.modified_at,
            roles: customer.user_roles.map(ur => ({
                role_id: ur.role.role_id,
                role_name: ur.role.role_name,
                description: ur.role.description
            })),
            addresses: customer.user_addresses,
            orders: customer.orders
        };

        res.status(200).json({
            success: true,
            customer: formattedCustomer
        });
    } catch (error) {
        logger.error(`Error getting customer: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customer details',
            error: error.message
        });
    }
};
/**
 * Cập nhật thông tin khách hàng
 */
exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            first_name,
            last_name,
            email,
            phone_num,
            status,
            status_reason
        } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Customer ID is required"
            });
        }

        // Find the customer
        const customer = await db.users.findByPk(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Validate email if provided
        if (email && email !== customer.email) {
            const existingEmail = await db.users.findOne({
                where: {
                    email,
                    user_id: { [Op.ne]: id }
                }
            });

            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Email already in use by another account"
                });
            }
        }

        // Validate status and reason
        if (status && status !== 'active' && !status_reason) {
            return res.status(400).json({
                success: false,
                message: "Status reason is required when status is not active"
            });
        }

        // Update customer data
        const updateData = {};

        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (email !== undefined) updateData.email = email;
        if (phone_num !== undefined) updateData.phone_num = phone_num;
        if (status !== undefined) updateData.status = status;
        if (status_reason !== undefined) updateData.status_reason = status_reason;

        updateData.modified_at = new Date();

        // Update the customer record
        await db.users.update(updateData, {
            where: { user_id: id }
        });

        // Get updated customer data
        const updatedCustomer = await db.users.findByPk(id, {
            attributes: { exclude: ['password_hash'] }
        });

        res.status(200).json({
            success: true,
            customer: updatedCustomer
        });
    } catch (error) {
        logger.error(`Error updating customer: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update customer',
            error: error.message
        });
    }
};

/**
 * Thay đổi trạng thái tài khoản khách hàng
 */
exports.changeCustomerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Customer ID is required"
            });
        }

        if (!status || !['active', 'suspended', 'banned'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Valid status is required (active, suspended, or banned)"
            });
        }

        // Require reason for suspending or banning
        if (status !== 'active' && !reason) {
            return res.status(400).json({
                success: false,
                message: "Reason is required when suspending or banning a customer"
            });
        }

        // Check if customer exists and update status
        const [affectedCount] = await db.users.update(
            {
                status: status,
                status_reason: status === 'active' ? null : reason,
                modified_at: new Date()
            },
            {
                where: { user_id: id }
            }
        );

        if (affectedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        res.status(200).json({
            success: true,
            message: `Customer status changed to ${status} successfully`
        });
    } catch (error) {
        logger.error(`Error changing customer status: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to change customer status',
            error: error.message
        });
    }
};

/**
 * Delete customer account
 */
exports.deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Customer ID is required"
            });
        }

        // Use transaction for delete operations
        await db.sequelize.transaction(async (t) => {
            // Find the customer first to ensure they exist
            const customer = await db.users.findByPk(id, { transaction: t });

            if (!customer) {
                throw new Error('Customer not found');
            }

            // Delete associated user roles
            await db.user_role.destroy({
                where: { user_id: id },
                transaction: t
            });

            // Delete associated user addresses
            await db.user_address.destroy({
                where: { user_id: id },
                transaction: t
            });

            // Optionally, you might want to handle related orders or other data
            // depending on your business logic

            // Delete the user
            await customer.destroy({ transaction: t });
        });

        res.status(200).json({
            success: true,
            message: "Customer account deleted successfully"
        });
    } catch (error) {
        // Check if the error is from our custom throw
        if (error.message === 'Customer not found') {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        logger.error(`Error deleting customer: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to delete customer account',
            error: error.message
        });
    }
};