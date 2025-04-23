const {
    product,
    product_inventory,
    order,
    order_item,
    payment,
    influencer,
    influencer_affiliate_link,
    users,
    influencer_tier, Sequelize
} = require('../models/mysql');
const KolStats = require('../models/mongodb/kolStats');
const logger = require('../utils/logger');
const dayjs = require('dayjs');
const Op = Sequelize.Op;

exports.getDashboardStats = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const startDate = start_date ? dayjs(start_date).startOf('day') : dayjs().subtract(7, 'day').startOf('day');
        const endDate = end_date ? dayjs(end_date).endOf('day') : dayjs().endOf('day');

        const orderStats = await order.findAll({
            where: {
                creation_at: {
                    [Op.between]: [startDate.toDate(), endDate.toDate()]
                },
                status: {
                    [Op.notIn]: ['cancelled', 'returned']
                }
            },
            attributes: [
                [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'total_orders'],
                [Sequelize.fn('SUM', Sequelize.col('total')), 'total_revenue']
            ],
            raw: true
        });

        const prevStartDate = startDate.subtract(startDate.diff(endDate, 'day'), 'day');
        const prevEndDate = startDate.subtract(1, 'millisecond');

        const prevOrderStats = await order.findAll({
            where: {
                creation_at: {
                    [Op.between]: [prevStartDate.toDate(), prevEndDate.toDate()]
                },
                status: {
                    [Op.notIn]: ['cancelled', 'returned']
                }
            },
            attributes: [
                [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'total_orders'],
                [Sequelize.fn('SUM', Sequelize.col('total')), 'total_revenue']
            ],
            raw: true
        });

        const totalRevenue = orderStats[0].total_revenue || 0;
        const prevRevenue = prevOrderStats[0].total_revenue || 0;
        const revenueChange = prevRevenue ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        const totalOrders = orderStats[0].total_orders || 0;
        const prevOrders = prevOrderStats[0].total_orders || 0;
        const ordersChange = prevOrders ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;

        const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
        const prevAvgOrderValue = prevOrders ? prevRevenue / prevOrders : 0;
        const avgOrderChange = prevAvgOrderValue ? ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100 : 0;

        const totalVisitors = 1000; // Placeholder
        const prevVisitors = 950; // Placeholder
        const conversionRate = totalVisitors ? (totalOrders / totalVisitors) * 100 : 0;
        const prevConversionRate = prevVisitors ? (prevOrders / prevVisitors) * 100 : 0;
        const conversionChange = prevConversionRate ? ((conversionRate - prevConversionRate) / prevConversionRate) * 100 : 0;

        res.json({
            success: true,
            data: {
                total_revenue: totalRevenue,
                revenue_change: revenueChange,
                total_orders: totalOrders,
                orders_change: ordersChange,
                avg_order_value: avgOrderValue,
                avg_order_change: avgOrderChange,
                conversion_rate: conversionRate,
                conversion_change: conversionChange
            }
        });

    } catch (error) {
        logger.error('Error getting dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getRevenueData = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const startDate = start_date ? dayjs(start_date).startOf('day') : dayjs().subtract(7, 'day').startOf('day');
        const endDate = end_date ? dayjs(end_date).endOf('day') : dayjs().endOf('day');

        const dailyStats = await order.findAll({
            where: {
                creation_at: {
                    [Op.between]: [startDate.toDate(), endDate.toDate()]
                },
                status: {
                    [Op.notIn]: ['cancelled', 'returned']
                }
            },
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('creation_at')), 'date'],
                [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'orders'],
                [Sequelize.fn('SUM', Sequelize.col('total')), 'revenue']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('creation_at'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('creation_at')), 'ASC']],
            raw: true
        });

        res.json({
            success: true,
            data: dailyStats
        });

    } catch (error) {
        logger.error('Error getting revenue data:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getTopProducts = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const startDate = start_date ? dayjs(start_date).startOf('day') : dayjs().subtract(7, 'day').startOf('day');
        const endDate = end_date ? dayjs(end_date).endOf('day') : dayjs().endOf('day');

        const topProducts = await order_item.findAll({
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('order_item.quantity')), 'sales'],
                [Sequelize.literal('SUM(order_item.quantity * price)'), 'revenue']
            ],
            include: [
                {
                    model: product_inventory,
                    as: 'inventory',
                    attributes: ['product_id'],
                    required: true,
                    include: [{
                        model: product,
                        as: 'product',
                        attributes: ['name'],
                        required: true
                    }]
                },
                {
                    model: order,
                    as: 'order',
                    attributes: [],
                    required: true,
                    where: {
                        creation_at: {
                            [Op.between]: [startDate.toDate(), endDate.toDate()]
                        },
                        status: {
                            [Op.notIn]: ['cancelled', 'returned']
                        }
                    }
                }
            ],
            group: ['inventory.product_id', 'inventory.product.name', 'inventory.product.product_id'],
            order: [[Sequelize.literal('revenue'), 'DESC']],
            limit: 5,
            raw: true,
            nest: true
        });

        res.json({
            success: true,
            data: topProducts.map(item => ({
                name: item.inventory.product.name,
                sales: parseInt(item.sales),
                revenue: parseFloat(item.revenue)
            }))
        });

    } catch (error) {
        logger.error('Error getting top products:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getKOLPerformance = async (req, res) => {
    try {
        const { start_date, end_date, sort_by = 'commission' } = req.query;
        const startDate = start_date ? dayjs(start_date).startOf('day') : dayjs().subtract(30, 'day').startOf('day');
        const endDate = end_date ? dayjs(end_date).endOf('day') : dayjs().endOf('day');

        // Get basic KOL information
        const kolPerformance = await influencer.findAll({
            attributes: [
                'influencer_id',
                [Sequelize.col('user.username'), 'name'],
                [Sequelize.col('user.first_name'), 'first_name'],
                [Sequelize.col('user.last_name'), 'last_name'],
                [Sequelize.col('tier.commission_rate'), 'tier_commission_rate']
            ],
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: [],
                    required: true
                },
                {
                    model: influencer_tier,
                    as: 'tier',
                    attributes: [],
                    required: true
                }
            ],
            raw: true
        });

        const detailedStats = await Promise.all(
            kolPerformance.map(async (kol) => {
                const displayName = kol.first_name && kol.last_name
                    ? `${kol.first_name} ${kol.last_name}`
                    : kol.name;

                // Get click data from MongoDB
                const clicksData = await KolStats.aggregate([
                    {
                        $match: {
                            kol_id: parseInt(kol.influencer_id),
                            date: {
                                $gte: startDate.toDate(),
                                $lte: endDate.toDate()
                            }
                        }
                    },
                    {
                        $group: {
                            _id: "$kol_id",
                            total_clicks: { $sum: "$clicks" }
                        }
                    }
                ]);

                const clicks = clicksData.length > 0 ? clicksData[0].total_clicks : 0;

                // Get order items with product commission rates
                const orderItems = await order_item.findAll({
                    include: [
                        {
                            model: influencer_affiliate_link,
                            as: 'link',
                            required: true,
                            where: {
                                influencer_id: kol.influencer_id
                            },
                            include: [
                                {
                                    model: product,
                                    as: 'product',
                                    attributes: ['commission_rate']
                                }
                            ]
                        },
                        {
                            model: order,
                            as: 'order',
                            required: true,
                            where: {
                                creation_at: {
                                    [Op.between]: [startDate.toDate(), endDate.toDate()]
                                },
                                status: {
                                    [Op.notIn]: ['cancelled', 'returned']
                                }
                            }
                        },
                        {
                            model: product_inventory,
                            as: 'inventory',
                            attributes: ['price']
                        }
                    ]
                });

                // Calculate commission based on both product and tier rates
                let totalSales = 0;
                let productCommission = 0;
                let tierCommission = 0;
                const uniqueOrders = new Set();

                orderItems.forEach(item => {
                    const itemPrice = parseFloat(item.inventory?.price || 0);
                    const itemTotal = parseFloat(item.quantity) * itemPrice;
                    totalSales += itemTotal;

                    // Track unique orders
                    uniqueOrders.add(item.order_id);

                    // Get commission rates (as percentages)
                    const tierCommissionRate = parseFloat(kol.tier_commission_rate || 0) / 100;
                    const productCommissionRate = parseFloat(item.link.product?.commission_rate || 0) / 100;

                    // Calculate and add commissions
                    productCommission += itemTotal * productCommissionRate;
                    tierCommission += itemTotal * tierCommissionRate;
                });

                // Total commission is the sum of both commission types
                const totalCommission = productCommission + tierCommission;
                const orders = uniqueOrders.size;

                return {
                    id: kol.influencer_id,
                    name: displayName,
                    clicks,
                    orders,
                    sales: totalSales,
                    commission: {
                        product: productCommission,
                        tier: tierCommission,
                        total: totalCommission
                    },
                    conversion_rate: clicks > 0 ? (orders / clicks) * 100 : 0
                };
            })
        );

        // Sort by the specified field (using total commission if sort_by is 'commission')
        const sortedStats = [...detailedStats]
            .sort((a, b) => {
                if (sort_by === 'commission') {
                    return b.commission.total - a.commission.total;
                }
                return b[sort_by] - a[sort_by];
            })
            .slice(0, 5);

        // Calculate totals
        const totals = sortedStats.reduce(
            (acc, kol) => ({
                clicks: acc.clicks + kol.clicks,
                orders: acc.orders + kol.orders,
                sales: acc.sales + kol.sales,
                commission: {
                    product: acc.commission.product + kol.commission.product,
                    tier: acc.commission.tier + kol.commission.tier,
                    total: acc.commission.total + kol.commission.total
                }
            }),
            { clicks: 0, orders: 0, sales: 0, commission: { product: 0, tier: 0, total: 0 } }
        );

        const avgConversionRate = totals.clicks > 0 ? (totals.orders / totals.clicks) * 100 : 0;

        // Format response data
        const formattedStats = sortedStats.map(kol => ({
            id: kol.id,
            name: kol.name,
            clicks: kol.clicks,
            orders: kol.orders,
            sales: parseFloat(kol.sales.toFixed(2)),
            commission: {
                product: parseFloat(kol.commission.product.toFixed(2)),
                tier: parseFloat(kol.commission.tier.toFixed(2)),
                total: parseFloat(kol.commission.total.toFixed(2))
            },
            conversion_rate: parseFloat(kol.conversion_rate.toFixed(2))
        }));

        res.json({
            success: true,
            data: {
                kols: formattedStats,
                totals: {
                    clicks: totals.clicks,
                    orders: totals.orders,
                    sales: parseFloat(totals.sales.toFixed(2)),
                    commission: {
                        product: parseFloat(totals.commission.product.toFixed(2)),
                        tier: parseFloat(totals.commission.tier.toFixed(2)),
                        total: parseFloat(totals.commission.total.toFixed(2))
                    },
                    conversion_rate: parseFloat(avgConversionRate.toFixed(2))
                }
            }
        });
    } catch (error) {
        logger.error('Error getting KOL performance data:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
exports.getCustomerStats = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const startDate = start_date ? dayjs(start_date).startOf('day') : dayjs().subtract(7, 'day').startOf('day');
        const endDate = end_date ? dayjs(end_date).endOf('day') : dayjs().endOf('day');

        const customerStats = await order.findAll({
            attributes: [
                'user_id',
                [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'order_count'],
                [Sequelize.fn('MIN', Sequelize.col('creation_at')), 'first_order'],
                [Sequelize.fn('SUM', Sequelize.col('total')), 'total_spent']
            ],
            where: {
                creation_at: {
                    [Op.between]: [startDate.toDate(), endDate.toDate()]
                },
                status: {
                    [Op.notIn]: ['cancelled', 'returned']
                }
            },
            group: ['user_id'],
            raw: true
        });

        const totalCustomers = customerStats.length;

        const newCustomers = customerStats.filter(c => {
            const firstOrderDate = dayjs(c.first_order);
            return firstOrderDate.isAfter(startDate) || firstOrderDate.isSame(startDate) &&
                (firstOrderDate.isBefore(endDate) || firstOrderDate.isSame(endDate));
        }).length;

        const returningCustomers = totalCustomers - newCustomers;

        const totalRevenue = customerStats.reduce((sum, c) => sum + parseFloat(c.total_spent || 0), 0);
        const averageOrderValue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

        const periodLength = endDate.diff(startDate, 'day');
        const prevEndDate = startDate.subtract(1, 'day');
        const prevStartDate = prevEndDate.subtract(periodLength, 'day');

        const prevCustomerStats = await order.findAll({
            attributes: [
                'user_id',
                [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'order_count']
            ],
            where: {
                creation_at: {
                    [Op.between]: [prevStartDate.toDate(), prevEndDate.toDate()]
                },
                status: {
                    [Op.notIn]: ['cancelled', 'returned']
                }
            },
            group: ['user_id'],
            raw: true
        });

        const prevTotalCustomers = prevCustomerStats.length;
        const customerGrowth = prevTotalCustomers ?
            ((totalCustomers - prevTotalCustomers) / prevTotalCustomers) * 100 : 0;

        const retentionRate = totalCustomers > 0 ?
            (returningCustomers / totalCustomers) * 100 : 0;

        res.json({
            success: true,
            data: {
                total_customers: totalCustomers,
                new_customers: newCustomers,
                returning_customers: returningCustomers,
                average_order_value: averageOrderValue.toFixed(2),
                customer_growth: customerGrowth.toFixed(2),
                retention_rate: retentionRate.toFixed(2),
                insights: {
                    retention_rate: retentionRate.toFixed(2),
                    growth_rate: customerGrowth.toFixed(2),
                }
            }
        });

    } catch (error) {
        logger.error('Error getting customer stats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};