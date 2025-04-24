const { order, order_item, users, user_address, product, product_inventory, payment, Sequelize, sequelize, influencer_affiliate_link } = require('../models/mysql');
const logger = require('../utils/logger');
const Op = Sequelize.Op;
const mongoose = require('mongoose')

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

const getOrdersByDate = async (req, res) => {
    try {
        const {
            date,
            page = 1,
            limit = 10,
            search = '',
            status,
            payment_status
        } = req.query;

        const offset = (page - 1) * limit;

        logger.info(`Fetching orders for date: ${date}, page: ${page}, limit: ${limit}`);

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date parameter is required'
            });
        }

        // Build the where conditions
        const whereConditions = {};

        // Add date condition
        whereConditions.creation_at = {
            [Op.between]: [
                new Date(`${date}T00:00:00`),
                new Date(`${date}T23:59:59`)
            ]
        };

        // Add search condition
        if (search) {
            whereConditions[Op.or] = [
                { order_id: { [Op.like]: `%${search}%` } },
                { '$user.username$': { [Op.like]: `%${search}%` } },
                { '$user.email$': { [Op.like]: `%${search}%` } }
            ];
        }

        // Add status filter if provided
        if (status && status !== 'All Statuses') {
            whereConditions.status = status.toLowerCase();
        }

        // Count query with all filters
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

        // Main query to fetch orders
        const orders = await order.findAll({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'phone_num', 'first_name', 'last_name']
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
            order: [['creation_at', 'DESC']],
            limit: parseInt(limit, 10),
            offset: offset
        });

        // Filter by payment status in memory if needed
        let filteredOrders = orders;
        if (payment_status && payment_status !== 'All Payment Statuses') {
            filteredOrders = orders.filter(order => {
                const latestPayment = order.payments && order.payments.length > 0 ? order.payments[0] : null;
                return latestPayment && latestPayment.status.toLowerCase() === payment_status.toLowerCase();
            });
        }

        logger.info(`Found ${filteredOrders.length} orders for date ${date} matching filters`);

        const formattedOrders = filteredOrders.map(order => ({
            id: order.order_id,
            customer: {
                name: order.user.first_name + ' ' + order.user.last_name,
                email: order.user.email,
                phone: order.user.phone_num
            },
            shipping: order.shipping_address ? {
                recipient: order.shipping_address.recipient_name,
                address: order.shipping_address.address,
                city: order.shipping_address.city,
                country: order.shipping_address.country
            } : null,
            total: parseFloat(order.total),
            status: order.status,
            payment_status: order.payments && order.payments.length > 0 ? order.payments[0].status : 'pending',
            payment_method: order.payments && order.payments.length > 0 ? order.payments[0].payment_method : '',
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
        logger.error(`Error getting orders by date: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

const updateOrderStatus = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { status } = req.body; // Get status from body

        const orderId = id;

        if (!orderId || !status) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: orderId and status are required',
            });
        }

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
        if (!validStatuses.includes(status)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Invalid order status',
            });
        }

        const orderDetails = await order.findByPk(orderId, { transaction });
        if (!orderDetails) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        // Get previous status before update
        const previousStatus = orderDetails.status;

        // Check if we're cancelling or returning an order
        const isReturnOrCancel = ['cancelled', 'returned'].includes(status);
        const wasReturnOrCancel = ['cancelled', 'returned'].includes(previousStatus);

        if (isReturnOrCancel && !wasReturnOrCancel) {
            // We're changing to cancelled/returned for the first time
            logger.info(`Order ${orderId} is being ${status}, updating inventory quantities`);

            // Get order items to restore inventory
            const items = await order_item.findAll({
                where: { order_id: orderId },
                include: [
                    {
                        model: product_inventory,
                        as: 'inventory'
                    }
                ],
                transaction
            });

            // Loop through items and update inventory
            for (const item of items) {
                if (item.inventory) {
                    // Add the quantity back to inventory
                    await product_inventory.increment(
                        'quantity',
                        {
                            by: item.quantity,
                            where: { inventory_id: item.inventory_id }
                        },
                        { transaction }
                    );

                    logger.info(`Returned ${item.quantity} units to inventory_id ${item.inventory_id}`);

                    // Check if we need to update the out_of_stock status on the product
                    const inventory = await product_inventory.findByPk(item.inventory_id, { transaction });
                    if (inventory) {
                        // Check if this was the only inventory item for this product that was out of stock
                        const productInvCount = await product_inventory.count({
                            where: {
                                product_id: inventory.product_id,
                                quantity: { [Op.gt]: 0 }
                            },
                            transaction
                        });

                        if (productInvCount > 0) {
                            // There is at least one inventory item for this product with quantity > 0
                            // Update the product's out_of_stock status to false
                            await product.update(
                                { out_of_stock: false },
                                {
                                    where: { product_id: inventory.product_id },
                                    transaction
                                }
                            );

                            logger.info(`Updated out_of_stock to false for product_id ${inventory.product_id}`);
                        }
                    }
                }
            }
        } else if (!isReturnOrCancel && wasReturnOrCancel) {
            // We're changing from cancelled/returned to another status
            // We should remove inventory quantities again
            logger.info(`Order ${orderId} is changing from ${previousStatus} to ${status}, adjusting inventory quantities`);

            // Use the stored procedure to update inventory
            await sequelize.query(
                'CALL update_inventory_on_order(:orderId, :status)',
                {
                    replacements: { orderId, status },
                    transaction,
                }
            );
        }

        // Update the order status
        await orderDetails.update({
            status: status,
            modified_at: new Date(),
        }, { transaction });

        // Only increment KOL stats when status changes to 'delivered'
        if (status === 'delivered' && previousStatus !== 'delivered') {
            logger.info(`Order ${orderId} has been delivered, incrementing KOL stats`);

            // Find all order items with affiliate links
            const orderItems = await order_item.findAll({
                where: {
                    order_id: orderId,
                    link_id: { [Op.ne]: null } // Only items with affiliate links
                },
                transaction
            });

            // Update KOL stats for each item with an affiliate link
            for (const item of orderItems) {
                if (item.link_id) {
                    // Get the product_id and influencer_id from the link
                    const link = await influencer_affiliate_link.findByPk(item.link_id, {
                        attributes: ['influencer_id', 'product_id'],
                        transaction
                    });

                    if (link && link.influencer_id && link.product_id) {
                        await updateKolStats(link.influencer_id, link.product_id);
                        logger.info(`Incremented KOL stats for order ${orderId}: influencer ${link.influencer_id}, product ${link.product_id}`);
                    }
                }
            }
        }

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Order status updated successfully',
        });
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error updating order status: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            error: error.message,
        });

    }
};

const updateKolStats = async (influencerId, productId) => {
    try {
        if (!influencerId || !productId) {
            return;
        }

        const KolAffiliateStats = mongoose.model('KolAffiliateStats');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await KolAffiliateStats.updateOne(
            {
                kol_id: influencerId,
                product_id: productId,
                date: {
                    $gte: today,
                    $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            },
            { $inc: { successful_purchases: 1 } },
            { upsert: true }
        );

        logger.info(`KOL stats incremented for influencer ${influencerId}, product ${productId}`);
    } catch (error) {
        logger.error(`Error updating KOL stats: ${error.message}`, { stack: error.stack });
    }
};

module.exports = { listOrders, getOrderDetails, updateOrderStatus, getOrdersByDate };