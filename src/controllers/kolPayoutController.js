const {
    kol_payout,
    influencer,
    users,
    influencer_affiliate_link,
    order_item,
    order,
    product,
    influencer_tier,
    product_inventory,
    Sequelize,
    sequelize
} = require('../models/mysql');
const logger = require('../utils/logger');
const XLSX = require('xlsx');
const Op = Sequelize.Op;
const mongoose = require('mongoose')

/**
 * Get all payouts with filtering and pagination
 */
exports.getPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = 'all',
            start_date,
            end_date,
            sort_by = 'payout_date',
            sort_order = 'DESC'
        } = req.query;

        // Build where conditions
        const whereConditions = {};

        if (status !== 'all') {
            whereConditions.payment_status = status;
        }

        // Add date range if provided
        if (start_date && end_date) {
            whereConditions.payout_date = {
                [Op.between]: [start_date, end_date]
            };
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get total count and stats for each status
        const statsWhereConditions = {};
        if (start_date && end_date) {
            statsWhereConditions.payout_date = {
                [Op.between]: [start_date, end_date]
            };
        }

        const [
            totalStats,
            pendingStats,
            completedStats,
            failedStats
        ] = await Promise.all([
            // Get total stats
            kol_payout.findOne({
                where: statsWhereConditions,
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'total_payouts'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
                ],
                raw: true
            }),
            // Get pending stats
            kol_payout.findOne({
                where: {
                    ...statsWhereConditions,
                    payment_status: 'pending'
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            }),
            // Get completed stats
            kol_payout.findOne({
                where: {
                    ...statsWhereConditions,
                    payment_status: 'completed'
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            }),
            // Get failed stats
            kol_payout.findOne({
                where: {
                    ...statsWhereConditions,
                    payment_status: 'failed'
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            })
        ]);

        const statusStats = {
            total_payouts: parseInt(totalStats.total_payouts) || 0,
            total_amount: parseFloat(totalStats.total_amount) || 0,
            pending_count: parseInt(pendingStats.count) || 0,
            pending_amount: parseFloat(pendingStats.amount) || 0,
            completed_count: parseInt(completedStats.count) || 0,
            completed_amount: parseFloat(completedStats.amount) || 0,
            failed_count: parseInt(failedStats.count) || 0,
            failed_amount: parseFloat(failedStats.amount) || 0
        };

        // Build user search conditions for KOL name/email
        const userSearchConditions = {};
        if (search) {
            userSearchConditions[Op.or] = [
                { username: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } }
            ];
        }

        // Fetch payouts with relations
        const payouts = await kol_payout.findAll({
            where: whereConditions,
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [{
                        model: users,
                        as: 'user',
                        where: search ? userSearchConditions : {},
                        attributes: ['username', 'email', 'first_name', 'last_name']
                    }]
                }
            ],
            order: [[sort_by, sort_order]],
            limit: parseInt(limit),
            offset: offset
        });

        // Get total count for pagination
        const totalCount = await kol_payout.count({
            where: whereConditions,
            include: [{
                model: influencer,
                as: 'kol',
                include: [{
                    model: users,
                    as: 'user',
                    where: search ? userSearchConditions : {}
                }]
            }]
        });

        res.status(200).json({
            success: true,
            payouts: payouts,
            stats: statusStats,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error getting KOL payouts: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL payouts',
            error: error.message
        });
    }
};

/**
 * Generate payouts for influencers based on sales through their affiliate links
 * This would typically be run on a schedule (e.g., monthly) or triggered manually by admin
 */
exports.generatePayouts = async (req, res) => {
    try {
        const { start_date, end_date, influencer_id } = req.body;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required for generating payouts'
            });
        }

        // Begin transaction
        const result = await sequelize.transaction(async (t) => {
            // Build where conditions for orders
            const orderWhereConditions = {
                creation_at: {
                    [Op.between]: [start_date, end_date]
                },
                status: {
                    [Op.in]: ['delivered', 'completed'] // Only consider completed orders
                }
            };

            // If specific influencer is requested, add condition
            const influencerCondition = influencer_id ? { influencer_id } : {};

            // In the generatePayouts function, update the orderItems query to include the inventory model:

            const orderItems = await order_item.findAll({
                include: [
                    {
                        model: order,
                        as: 'order',
                        where: orderWhereConditions,
                        attributes: ['order_id', 'total', 'status', 'creation_at']
                    },
                    {
                        model: influencer_affiliate_link,
                        as: 'link',
                        where: influencerCondition,
                        include: [
                            {
                                model: influencer,
                                as: 'influencer',
                                include: [
                                    {
                                        model: influencer_tier,
                                        as: 'tier',
                                        attributes: ['tier_id', 'tier_name', 'commission_rate']
                                    }
                                ]
                            },
                            {
                                model: product,
                                as: 'product',
                                attributes: ['product_id', 'name', 'commission_rate']
                            }
                        ]
                    },
                    // Add this to include the product_inventory model
                    {
                        model: product_inventory,
                        as: 'inventory',
                        attributes: ['inventory_id', 'price', 'quantity']
                    }
                ],
                transaction: t
            });

            // Group by influencer_id to calculate total commissions
            const influencerCommissions = {};

            for (const item of orderItems) {
                const influencerId = item.link.influencer_id;
                const itemPrice = item.inventory?.price || 0;
                const itemTotal = parseFloat(item.quantity) * parseFloat(itemPrice);

                // Calculate commission using both tier rate and product-specific rate
                const tierCommissionRate = parseFloat(item.link.influencer.tier.commission_rate) / 100;
                const productCommissionRate = parseFloat(item.link.product.commission_rate || 0) / 100;

                // Combined commission rate (product rate takes precedence if available)
                const effectiveCommissionRate = productCommissionRate > 0 ? productCommissionRate : tierCommissionRate;

                // Calculate commission amount
                const commissionAmount = itemTotal * effectiveCommissionRate;

                if (!influencerCommissions[influencerId]) {
                    influencerCommissions[influencerId] = {
                        influencer: item.link.influencer,
                        totalCommission: 0,
                        orderCount: 0,
                        orders: new Set()
                    };
                }

                influencerCommissions[influencerId].totalCommission += commissionAmount;
                influencerCommissions[influencerId].orders.add(item.order_id);
            }

            // Create payout records for each influencer
            const payouts = [];

            for (const [influencerId, data] of Object.entries(influencerCommissions)) {
                if (data.totalCommission <= 0) continue;

                const payout = await kol_payout.create({
                    kol_id: influencerId,
                    total_amount: data.totalCommission.toFixed(2),
                    payment_status: 'pending',
                    payout_date: new Date(),
                    created_at: new Date(),
                    modified_at: new Date()
                }, { transaction: t });

                payouts.push({
                    payout_id: payout.payout_id,
                    kol_id: influencerId,
                    kol_name: `${data.influencer.user?.first_name || ''} ${data.influencer.user?.last_name || ''}`.trim(),
                    total_amount: payout.total_amount,
                    order_count: data.orders.size
                });
            }

            return {
                payouts,
                totalPayouts: payouts.length,
                totalAmount: payouts.reduce((sum, p) => sum + parseFloat(p.total_amount), 0)
            };
        });

        res.status(200).json({
            success: true,
            message: `Successfully generated ${result.totalPayouts} payouts totaling ${result.totalAmount.toFixed(2)}`,
            payouts: result.payouts
        });

    } catch (error) {
        logger.error(`Error generating KOL payouts: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to generate KOL payouts',
            error: error.message
        });
    }
};

/**
 * Update payout status (for admin to mark as completed/failed)
 */
exports.updatePayoutStatus = async (req, res) => {
    try {
        const { payout_id } = req.params;
        const { payment_status, notes } = req.body;

        if (!payout_id) {
            return res.status(400).json({
                success: false,
                message: 'Payout ID is required'
            });
        }

        if (!['pending', 'completed', 'failed'].includes(payment_status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment status'
            });
        }

        const payout = await kol_payout.findByPk(payout_id);

        if (!payout) {
            return res.status(404).json({
                success: false,
                message: 'Payout not found'
            });
        }

        // Update payout status
        await payout.update({
            payment_status,
            notes: notes || null,
            modified_at: new Date()
        });

        res.status(200).json({
            success: true,
            message: `Payout #${payout_id} status updated to ${payment_status}`,
            payout: {
                payout_id: payout.payout_id,
                kol_id: payout.kol_id,
                total_amount: payout.total_amount,
                payment_status: payout.payment_status,
                payout_date: payout.payout_date,
                notes: payout.notes
            }
        });

    } catch (error) {
        logger.error(`Error updating KOL payout status: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update KOL payout status',
            error: error.message
        });
    }
};

/**
 * Get payout details by ID
 */
exports.getPayoutDetails = async (req, res) => {
    try {
        const { payout_id } = req.params;

        if (!payout_id) {
            return res.status(400).json({
                success: false,
                message: 'Payout ID is required'
            });
        }

        const payout = await kol_payout.findByPk(payout_id, {
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [
                        {
                            model: users,
                            as: 'user',
                            attributes: ['username', 'email', 'first_name', 'last_name', 'phone_num']
                        },
                        {
                            model: influencer_tier,
                            as: 'tier',
                            attributes: ['tier_id', 'tier_name', 'commission_rate']
                        }
                    ]
                }
            ]
        });

        if (!payout) {
            return res.status(404).json({
                success: false,
                message: 'Payout not found'
            });
        }

        const relatedOrders = await order.findAll({
            include: [
                {
                    model: order_item,
                    as: 'order_items',
                    include: [
                        {
                            model: influencer_affiliate_link,
                            as: 'link',
                            where: {
                                influencer_id: payout.kol_id
                            }
                        }
                    ]
                }
            ],
            where: {
                creation_at: {
                    [Op.lte]: payout.created_at
                },
                status: {
                    [Op.in]: ['delivered', 'completed']
                }
            },
            // logging: console.log,
            order: [['creation_at', 'DESC']],
            limit: 50
        });

        res.status(200).json({
            success: true,
            payout: {
                payout_id: payout.payout_id,
                kol_id: payout.kol_id,
                kol_name: `${payout.kol.user.first_name || ''} ${payout.kol.user.last_name || ''}`.trim(),
                kol_username: payout.kol.user.username,
                kol_email: payout.kol.user.email,
                kol_phone: payout.kol.user.phone_num,
                tier_name: payout.kol.tier.tier_name,
                commission_rate: payout.kol.tier.commission_rate,
                total_amount: payout.total_amount,
                payment_status: payout.payment_status,
                payout_date: payout.payout_date,
                notes: payout.notes,
                created_at: payout.created_at,
                modified_at: payout.modified_at,
                related_orders: relatedOrders.map(order => ({
                    order_id: order.order_id,
                    total: order.total,
                    status: order.status,
                    creation_at: order.creation_at,
                    items_count: order.order_items.length
                }))
            }
        });

    } catch (error) {
        logger.error(`Error getting KOL payout details: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL payout details',
            error: error.message
        });
    }
};

/**
 * Export payout report as Excel file
 */
exports.exportPayoutReport = async (req, res) => {
    try {
        const { start_date, end_date, status = 'all' } = req.query;

        // Validate date range
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required for export'
            });
        }

        // Build where conditions
        const whereConditions = {
            payout_date: {
                [Op.between]: [start_date, end_date]
            }
        };

        if (status !== 'all') {
            whereConditions.payment_status = status;
        }

        // Fetch all payouts for the date range
        const payouts = await kol_payout.findAll({
            where: whereConditions,
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [{
                        model: users,
                        as: 'user',
                        attributes: ['username', 'email', 'first_name', 'last_name']
                    }]
                }
            ],
            order: [['payout_date', 'DESC']]
        });

        // Transform data for export
        const exportData = payouts.map(payout => ({
            'Payout ID': payout.payout_id,
            'KOL Name': `${payout.kol.user.first_name || ''} ${payout.kol.user.last_name || ''}`.trim(),
            'Username': payout.kol.user.username,
            'Email': payout.kol.user.email,
            'Amount': payout.total_amount,
            'Status': payout.payment_status,
            'Payout Date': payout.payout_date,
            'Notes': payout.notes || ''
        }));

        // Create workbook and add data
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Add summary worksheet
        const summaryData = [
            ['KOL Payout Report'],
            [`Period: ${start_date} to ${end_date}`],
            [''],
            ['Status', 'Count', 'Total Amount'],
            ['Pending', payouts.filter(p => p.payment_status === 'pending').length,
                payouts.filter(p => p.payment_status === 'pending')
                    .reduce((sum, p) => sum + parseFloat(p.total_amount), 0)],
            ['Completed', payouts.filter(p => p.payment_status === 'completed').length,
                payouts.filter(p => p.payment_status === 'completed')
                    .reduce((sum, p) => sum + parseFloat(p.total_amount), 0)],
            ['Failed', payouts.filter(p => p.payment_status === 'failed').length,
                payouts.filter(p => p.payment_status === 'failed')
                    .reduce((sum, p) => sum + parseFloat(p.total_amount), 0)],
            ['Total', payouts.length,
                payouts.reduce((sum, p) => sum + parseFloat(p.total_amount), 0)]
        ];

        const ws_summary = XLSX.utils.aoa_to_sheet(summaryData);

        // Add worksheets to workbook
        XLSX.utils.book_append_sheet(wb, ws_summary, 'Summary');
        XLSX.utils.book_append_sheet(wb, ws, 'Payout Details');

        // Generate file name
        const fileName = `kol_payouts_${start_date}_to_${end_date}.xlsx`;

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        // Write to response
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.send(buffer);

    } catch (error) {
        logger.error(`Error exporting KOL payout report: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to export KOL payout report',
            error: error.message
        });
    }
};

/**
 * Get payouts for a specific influencer (for KOL's own dashboard)
 */
exports.getInfluencerPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = 'all',
            start_date,
            end_date,
            sort_by = 'payout_date',
            sort_order = 'DESC'
        } = req.query;

        // Ensure the user is actually an influencer
        const user_id = req.user.user_id;

        // Find the influencer record
        const influencerRecord = await influencer.findOne({
            where: { user_id }
        });

        if (!influencerRecord) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. User is not an influencer.'
            });
        }

        const influencer_id = influencerRecord.influencer_id;

        // Build where conditions
        const whereConditions = {
            kol_id: influencer_id
        };

        if (status !== 'all') {
            whereConditions.payment_status = status;
        }

        // Add date range if provided
        if (start_date && end_date) {
            whereConditions.payout_date = {
                [Op.between]: [start_date, end_date]
            };
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get stats for this influencer
        const [
            totalStats,
            pendingStats,
            completedStats,
            failedStats
        ] = await Promise.all([
            // Get total stats
            kol_payout.findOne({
                where: {
                    ...whereConditions,
                    payout_date: start_date && end_date ? { [Op.between]: [start_date, end_date] } : undefined
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'total_payouts'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
                ],
                raw: true
            }),
            // Get pending stats
            kol_payout.findOne({
                where: {
                    ...whereConditions,
                    payment_status: 'pending',
                    payout_date: start_date && end_date ? { [Op.between]: [start_date, end_date] } : undefined
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            }),
            // Get completed stats
            kol_payout.findOne({
                where: {
                    ...whereConditions,
                    payment_status: 'completed',
                    payout_date: start_date && end_date ? { [Op.between]: [start_date, end_date] } : undefined
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            }),
            // Get failed stats
            kol_payout.findOne({
                where: {
                    ...whereConditions,
                    payment_status: 'failed',
                    payout_date: start_date && end_date ? { [Op.between]: [start_date, end_date] } : undefined
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            })
        ]);

        const statusStats = {
            total_payouts: parseInt(totalStats?.total_payouts) || 0,
            total_amount: parseFloat(totalStats?.total_amount) || 0,
            pending_count: parseInt(pendingStats?.count) || 0,
            pending_amount: parseFloat(pendingStats?.amount) || 0,
            completed_count: parseInt(completedStats?.count) || 0,
            completed_amount: parseFloat(completedStats?.amount) || 0,
            failed_count: parseInt(failedStats?.count) || 0,
            failed_amount: parseFloat(failedStats?.amount) || 0
        };

        // Fetch payouts with relations
        const payouts = await kol_payout.findAll({
            where: whereConditions,
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [{
                        model: users,
                        as: 'user',
                        attributes: ['username', 'email', 'first_name', 'last_name']
                    }]
                }
            ],
            order: [[sort_by, sort_order]],
            limit: parseInt(limit),
            offset: offset
        });

        // Get total count for pagination
        const totalCount = await kol_payout.count({
            where: whereConditions
        });

        res.status(200).json({
            success: true,
            payouts: payouts,
            stats: statusStats,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error getting influencer payouts: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch influencer payouts',
            error: error.message
        });
    }
};

/**
 * Get payout details by ID (for the KOL's own dashboard)
 */
exports.getInfluencerPayoutDetails = async (req, res) => {
    try {
        const { payout_id } = req.params;
        const user_id = req.user.user_id;

        if (!payout_id) {
            return res.status(400).json({
                success: false,
                message: 'Payout ID is required'
            });
        }

        // Find the influencer record
        const influencerRecord = await influencer.findOne({
            where: { user_id }
        });

        if (!influencerRecord) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. User is not an influencer.'
            });
        }

        const payout = await kol_payout.findByPk(payout_id, {
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [
                        {
                            model: users,
                            as: 'user',
                            attributes: ['username', 'email', 'first_name', 'last_name', 'phone_num']
                        },
                        {
                            model: influencer_tier,
                            as: 'tier',
                            attributes: ['tier_id', 'tier_name', 'commission_rate']
                        }
                    ]
                }
            ]
        });

        if (!payout) {
            return res.status(404).json({
                success: false,
                message: 'Payout not found'
            });
        }

        // Check if this payout belongs to the requesting user
        if (payout.kol_id !== influencerRecord.influencer_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. This payout belongs to another influencer.'
            });
        }

        // Get related orders that contributed to this payout
        // Find orders within the period that used this KOL's affiliate links
        const relatedOrders = await order.findAll({
            include: [
                {
                    model: order_item,
                    as: 'order_items',
                    include: [
                        {
                            model: influencer_affiliate_link,
                            as: 'link',
                            where: {
                                influencer_id: payout.kol_id
                            },
                            include: [
                                {
                                    model: product,
                                    as: 'product',
                                    attributes: ['product_id', 'name']
                                }
                            ]
                        },
                        {
                            model: product_inventory,
                            as: 'inventory',
                            attributes: ['price']
                        }
                    ]
                }
            ],
            where: {
                creation_at: {
                    [Op.lte]: payout.created_at
                },
                status: {
                    [Op.in]: ['delivered', 'completed']
                }
            },
            order: [['creation_at', 'DESC']],
            limit: 50
        });

        // Process order items to calculate commission per order
        const ordersWithCommission = relatedOrders.map(order => {
            let totalCommission = 0;
            let productName = '';

            // Calculate commission for each order item
            order.order_items.forEach(item => {
                if (!item.link || !item.inventory) return;

                const itemPrice = parseFloat(item.inventory.price) || 0;
                const itemTotal = parseFloat(item.quantity) * itemPrice;

                // Get tier commission rate or product-specific rate
                const tierCommissionRate = parseFloat(payout.kol.tier.commission_rate) / 100;
                const productCommissionRate = parseFloat(item.link.product.commission_rate || 0) / 100;

                // Use product rate if available, otherwise use tier rate
                const effectiveCommissionRate = productCommissionRate > 0 ? productCommissionRate : tierCommissionRate;

                // Add to total commission for this order
                totalCommission += itemTotal * effectiveCommissionRate;

                // Get product name (use first product if multiple)
                if (!productName && item.link.product) {
                    productName = item.link.product.name;
                }
            });

            return {
                order_id: order.order_id,
                total: order.total,
                status: order.status,
                creation_at: order.creation_at,
                items_count: order.order_items.length,
                product_name: productName || 'Multiple Items',
                commission: totalCommission.toFixed(2)
            };
        });

        res.status(200).json({
            success: true,
            payout: {
                payout_id: payout.payout_id,
                kol_id: payout.kol_id,
                kol_name: `${payout.kol.user.first_name || ''} ${payout.kol.user.last_name || ''}`.trim(),
                kol_username: payout.kol.user.username,
                kol_email: payout.kol.user.email,
                kol_phone: payout.kol.user.phone_num,
                tier_name: payout.kol.tier.tier_name,
                commission_rate: payout.kol.tier.commission_rate,
                total_amount: payout.total_amount,
                payment_status: payout.payment_status,
                payout_date: payout.payout_date,
                notes: payout.notes,
                created_at: payout.created_at,
                modified_at: payout.modified_at,
                related_orders: ordersWithCommission
            }
        });

    } catch (error) {
        logger.error(`Error getting influencer payout details: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payout details',
            error: error.message
        });
    }
};

/**
 * Get sales statistics for an influencer
 */
exports.getInfluencerSalesStats = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const user_id = req.user.user_id;

        // Find the influencer record
        const influencerRecord = await influencer.findOne({
            where: { user_id },
            include: [
                {
                    model: influencer_tier,
                    as: 'tier',
                    attributes: ['commission_rate']
                }
            ]
        });

        if (!influencerRecord) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. User is not an influencer.'
            });
        }

        const influencer_id = influencerRecord.influencer_id;

        // Validate date range
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        // Find all completed orders through this influencer's affiliate links
        const orderItems = await order_item.findAll({
            include: [
                {
                    model: order,
                    as: 'order',
                    where: {
                        creation_at: {
                            [Op.between]: [start_date, end_date]
                        },
                        status: {
                            [Op.in]: ['delivered', 'completed']
                        }
                    },
                    attributes: ['order_id', 'total', 'creation_at']
                },
                {
                    model: influencer_affiliate_link,
                    as: 'link',
                    where: {
                        influencer_id: influencer_id
                    },
                    include: [
                        {
                            model: product,
                            as: 'product',
                            attributes: ['product_id', 'name', 'commission_rate']
                        }
                    ]
                },
                {
                    model: product_inventory,
                    as: 'inventory',
                    attributes: ['price', 'quantity']
                }
            ]
        });

        // Calculate total sales and commission
        let totalOrders = new Set();
        let totalAmount = 0;
        let commissionEarned = 0;

        orderItems.forEach(item => {
            if (!item.inventory) return;

            totalOrders.add(item.order_id);
            const itemTotal = parseFloat(item.quantity) * parseFloat(item.inventory.price || 0);
            totalAmount += itemTotal;

            // Calculate commission
            const tierCommissionRate = parseFloat(influencerRecord.tier.commission_rate) / 100;
            const productCommissionRate = parseFloat(item.link.product.commission_rate || 0) / 100;

            // Use product-specific rate if available, otherwise use tier rate
            const effectiveRate = productCommissionRate > 0 ? productCommissionRate : tierCommissionRate;
            commissionEarned += itemTotal * effectiveRate;
        });

        // Get click data from MongoDB (if available)
        let clickCount = 0;
        try {
            const KolAffiliateStats = require('../models/mongodb/kolStats');
            if (mongoose && mongoose.connection.readyState === 1) {
                // Only attempt to query MongoDB if connection is established
                const clickStats = await KolAffiliateStats.aggregate([
                    {
                        $match: {
                            kol_id: influencer_id,
                            date: {
                                $gte: new Date(start_date),
                                $lte: new Date(end_date)
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total_clicks: { $sum: "$clicks" }
                        }
                    }
                ]);

                if (clickStats.length > 0) {
                    clickCount = clickStats[0].total_clicks;
                }
            }
        } catch (mongoError) {
            logger.error(`Error fetching MongoDB click stats: ${mongoError.message}`);
            // Continue even if MongoDB query fails
        }

        res.status(200).json({
            success: true,
            stats: {
                total_orders: totalOrders.size,
                total_amount: totalAmount.toFixed(2),
                commission_earned: commissionEarned.toFixed(2),
                clicks: clickCount
            }
        });

    } catch (error) {
        logger.error(`Error getting influencer sales stats: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sales statistics',
            error: error.message
        });
    }
};