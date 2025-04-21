const { order, order_item, users, user_address, product, product_inventory, payment, Sequelize } = require('../models/mysql');
const logger = require('../utils/logger');
const Op = Sequelize.Op;

const listOrders = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, search = '',
            status, payment_status, start_date, end_date,
            sort_by = 'creation_at', sort_order = 'DESC'
        } = req.query;

        const whereConditions = {};

        if (search) {
            whereConditions[Op.or] = [
                { order_id: { [Op.like]: `%${search}%` } },
                { '$user.username$': { [Op.like]: `%${search}%` } },
                { '$user.email$': { [Op.like]: `%${search}%` } }
            ];
        }

        if (status && status !== 'All Statuses') {
            whereConditions.status = status.toLowerCase();
        }

        if (start_date && end_date) {
            whereConditions.creation_at = {
                [Op.between]: [new Date(start_date), new Date(end_date)]
            };
        }

        const offset = (page - 1) * limit;

        const totalOrdersCount = await order.count({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email']
                }
            ]
        });

        const validSortFields = ['order_id', 'creation_at', 'total', 'status'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'creation_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const orders = await order.findAll({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'phone_num']
                },
                {
                    model: user_address,
                    as: 'shipping_address',
                    attributes: ['recipient_name', 'address', 'city', 'country']
                },
                {
                    model: payment,
                    as: 'payments',
                    attributes: ['payment_method', 'status', 'amount'],
                    order: [['creation_at', 'DESC']],
                    limit: 1
                }
            ],
            order: [[sortField, sortDirection]],
            limit: parseInt(limit, 10),
            offset: offset
        });

        const formattedOrders = orders.map(order => ({
            id: order.order_id,
            customer: {
                name: order.user.username,
                email: order.user.email,
                phone: order.user.phone_num
            },
            shipping: {
                recipient: order.shipping_address.recipient_name,
                address: order.shipping_address.address,
                city: order.shipping_address.city,
                country: order.shipping_address.country
            },
            total: parseFloat(order.total),
            status: order.status,
            payment_status: order.payments[0]?.status || 'pending',
            payment_method: order.payments[0]?.payment_method,
            created_at: order.creation_at,
            updated_at: order.modified_at
        }));

        res.status(200).json({
            success: true,
            orders: formattedOrders,
            pagination: {
                total: totalOrdersCount,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                pages: Math.ceil(totalOrdersCount / limit)
            }
        });
    } catch (error) {
        logger.error(`Error listing orders: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const orderDetails = await order.findByPk(id, {
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'phone_num']
                },
                {
                    model: user_address,
                    as: 'shipping_address',
                    attributes: ['recipient_name', 'address', 'city', 'country']
                },
                {
                    model: order_item,
                    as: 'order_items',
                    include: [
                        {
                            model: product_inventory,
                            as: 'inventory',
                            include: [
                                {
                                    model: product,
                                    as: 'product',
                                    attributes: ['name', 'sku']
                                }
                            ]
                        }
                    ]
                },
                {
                    model: payment,
                    as: 'payments',
                    attributes: ['payment_method', 'status', 'amount', 'creation_at']
                }
            ]
        });

        if (!orderDetails) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const formattedOrder = {
            order_id: orderDetails.order_id,
            user: {
                username: orderDetails.user.username,
                email: orderDetails.user.email,
                phone_num: orderDetails.user.phone_num
            },
            shipping_address: {
                recipient_name: orderDetails.shipping_address.recipient_name,
                address: orderDetails.shipping_address.address,
                city: orderDetails.shipping_address.city,
                country: orderDetails.shipping_address.country
            },
            items: orderDetails.order_items.map(item => ({
                id: item.order_item_id,
                product_name: item.inventory.product.name,
                sku: item.inventory.product.sku,
                size: item.inventory.size,
                price: parseFloat(item.inventory.price),
                quantity: item.quantity,
                total: parseFloat(item.inventory.price) * item.quantity
            })),
            total: parseFloat(orderDetails.total),
            status: orderDetails.status,
            payment_method: orderDetails.payments[0]?.payment_method,
            payment_status: orderDetails.payments[0]?.status,
            note: orderDetails.note,
            created_at: orderDetails.creation_at,
            updated_at: orderDetails.modified_at
        };

        res.status(200).json({
            success: true,
            order: formattedOrder
        });
    } catch (error) {
        logger.error(`Error getting order details: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order details',
            error: error.message
        });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status'
            });
        }

        const orderDetails = await order.findByPk(id);
        if (!orderDetails) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        await orderDetails.update({
            status: status,
            modified_at: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Order status updated successfully'
        });
    } catch (error) {
        logger.error(`Error updating order status: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            error: error.message
        });
    }
};

const getOrdersByDate = async (req, res) => {
    try {
        const { date } = req.query;
        logger.info(`Fetching orders for date: ${date}`);

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date parameter is required'
            });
        }

        const orders = await order.findAll({
            where: Sequelize.literal(`DATE(\`order\`.\`creation_at\`) = DATE('${date}')`),
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email']
                },
                {
                    model: payment,
                    as: 'payments',
                    attributes: ['status', 'payment_method'],
                    order: [['creation_at', 'DESC']],
                    limit: 1
                }
            ],
            order: [[Sequelize.col('order.creation_at'), 'DESC']]
        });

        logger.info(`Found ${orders.length} orders for date ${date}`);

        const formattedOrders = orders.map(order => ({
            id: order.order_id,
            customer: {
                name: order.user.username,
                email: order.user.email
            },
            total: parseFloat(order.total),
            status: order.status,
            payment_status: order.payments[0]?.status || 'pending',
            payment_method: order.payments[0]?.payment_method || '',
            created_at: order.creation_at
        }));

        res.status(200).json({
            success: true,
            orders: formattedOrders
        });
    } catch (error) {
        logger.error(`Error getting orders by date: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};
module.exports = { listOrders, getOrderDetails, updateOrderStatus, getOrdersByDate };