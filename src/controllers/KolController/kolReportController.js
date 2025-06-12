const {
    order_item,
    influencer_affiliate_link,
    influencer,
    product,
    product_inventory,
    users,
    influencer_tier,
    Sequelize
} = require('../../models/mysql');
const logger = require('../../utils/logger');
const moment = require('moment');

const Op = Sequelize.Op;

exports.generateKolConversionReport = async (options = {}) => {
    try {
        const {
            kolId, startDate, endDate = new Date(), productId, groupBy = 'month'
        } = options;

        if (!kolId) {
            return {
                success: false,
                error: 'Missing required parameter',
                details: 'KOL ID is required'
            };
        }

        const dateFilter = {};
        if (startDate) {
            dateFilter[Op.gte] = moment(startDate).startOf('day').toDate();
        }
        if (endDate) {
            dateFilter[Op.lte] = moment(endDate).endOf('day').toDate();
        }

        const whereConditions = {
            link_id: { [Op.not]: null },
        };
        if (Object.keys(dateFilter).length > 0) {
            whereConditions.creation_at = dateFilter;
        }

        const orderItems = await order_item.findAll({
            where: whereConditions,
            include: [
                {
                    model: influencer_affiliate_link,
                    as: 'link',
                    required: true,
                    include: [
                        {
                            model: influencer,
                            as: 'influencer',
                            required: true,
                            where: { influencer_id: kolId },
                            include: [
                                {
                                    model: users,
                                    as: 'user',
                                    attributes: ['username', 'first_name', 'last_name']
                                },
                                {
                                    model: influencer_tier,
                                    as: 'tier',
                                    attributes: ['tier_name', 'commission_rate']
                                }
                            ]
                        },
                        {
                            model: product,
                            as: 'product',
                            required: true,
                            where: productId ? { product_id: productId } : {},
                            attributes: ['product_id', 'name', 'commission_rate']
                        }
                    ]
                },
                {
                    model: product_inventory,
                    as: 'inventory',
                    attributes: ['price']
                }
            ],
            order: [['creation_at', 'DESC']]
        });

        if (!orderItems?.length) {
            return {
                success: true,
                data: {
                    summary: {
                        total_orders: 0,
                        total_revenue: 0,
                        commission: {
                            product: 0,
                            tier: 0,
                            total: 0
                        }
                    },
                    period: {
                        start: startDate ? moment(startDate).format('YYYY-MM-DD') : null,
                        end: moment(endDate).format('YYYY-MM-DD')
                    },
                    group_by: groupBy,
                    details: []
                }
            };
        }

        const processedData = processOrderItems(orderItems);
        const groupedData = groupReportData(processedData, groupBy);
        const summary = calculateSummary(processedData);

        return {
            success: true,
            data: {
                summary,
                period: {
                    start: startDate ? moment(startDate).format('YYYY-MM-DD') : null,
                    end: moment(endDate).format('YYYY-MM-DD')
                },
                group_by: groupBy,
                details: groupedData
            }
        };

    } catch (error) {
        logger.error('Error generating KOL conversion report:', error);
        return {
            success: false,
            error: 'Failed to generate conversion report',
            details: error.message
        };
    }
};
function processOrderItems(orderItems) {
    return orderItems.map(item => {
        const orderDate = item.creation_at;
        const itemTotal = (item.inventory?.price || 0) * item.quantity;

        const kol = item.link?.influencer;
        const kolUser = kol?.user;
        const kolName = kolUser?.username ||
            `${kolUser?.first_name || ''} ${kolUser?.last_name || ''}`.trim();

        const prod = item.link?.product;

        const productCommissionRate = prod?.commission_rate || 0;
        const tierCommissionRate = kol?.tier?.commission_rate || 0;

        const productCommission = (itemTotal * productCommissionRate) / 100;
        const tierCommission = (itemTotal * tierCommissionRate) / 100;
        const totalCommission = productCommission + tierCommission;

        return {
            order_id: item.order_id,
            date: orderDate,
            kol: {
                id: kol?.influencer_id,
                name: kolName,
                tier: {
                    name: kol?.tier?.tier_name,
                    commission_rate: tierCommissionRate
                }
            },
            product: {
                id: prod?.product_id,
                name: prod?.name,
                commission_rate: productCommissionRate
            },
            quantity: item.quantity,
            total: itemTotal,
            commission: {
                product_rate: productCommissionRate,
                tier_rate: tierCommissionRate,
                total_rate: productCommissionRate + tierCommissionRate,
                product_amount: productCommission,
                tier_amount: tierCommission,
                total_amount: totalCommission
            }
        };
    });
}

function groupReportData(data, groupBy) {
    switch (groupBy) {
        case 'day':
        case 'week':
        case 'month': {
            const grouped = {};

            data.forEach(item => {
                let key;
                if (groupBy === 'day') {
                    key = moment(item.date).format('YYYY-MM-DD');
                } else if (groupBy === 'week') {
                    key = moment(item.date).startOf('week').format('YYYY-MM-DD');
                } else {
                    key = moment(item.date).format('YYYY-MM');
                }

                if (!grouped[key]) {
                    grouped[key] = {
                        period: key,
                        orders: new Set(),
                        revenue: 0,
                        commission: {
                            product: 0,
                            tier: 0,
                            total: 0
                        } || [],
                        kols: new Set(),
                        products: new Set()
                    };
                }

                grouped[key].orders.add(item.order_id);
                grouped[key].revenue += item.total;
                grouped[key].commission.product += item.commission.product_amount;
                grouped[key].commission.tier += item.commission.tier_amount;
                grouped[key].commission.total += item.commission.total_amount;
                grouped[key].kols.add(item.kol.id);
                grouped[key].products.add(item.product.id);
            });

            return Object.values(grouped)
                .map(g => ({
                    period: g.period,
                    orders_count: g.orders.size,
                    revenue: g.revenue,
                    commission: {
                        product: g.commission.product,
                        tier: g.commission.tier,
                        total: g.commission.total
                    },
                    unique_kols: g.kols.size,
                    unique_products: g.products.size
                }))
                .sort((a, b) => a.period.localeCompare(b.period));
        }

        case 'product': {
            const grouped = {};

            data.forEach(item => {
                const key = item.product.id;
                if (!grouped[key]) {
                    grouped[key] = {
                        product: item.product,
                        orders: new Set(),
                        kols: new Set(),
                        total_quantity: 0,
                        revenue: 0,
                        commission: {
                            product: 0,
                            tier: 0,
                            total: 0
                        } || []
                    };
                }

                grouped[key].orders.add(item.order_id);
                grouped[key].kols.add(item.kol.id);
                grouped[key].total_quantity += item.quantity;
                grouped[key].revenue += item.total;
                grouped[key].commission.product += item.commission.product_amount;
                grouped[key].commission.tier += item.commission.tier_amount;
                grouped[key].commission.total += item.commission.total_amount;
            });

            return Object.values(grouped)
                .map(g => ({
                    product_id: g.product.id,
                    product_name: g.product.name,
                    product_commission_rate: g.product.commission_rate,
                    orders_count: g.orders.size,
                    unique_kols: g.kols.size,
                    total_quantity: g.total_quantity,
                    revenue: g.revenue,
                    commission: g.commission
                }))
                .sort((a, b) => b.revenue - a.revenue);
        }

        case 'kol': {
            const grouped = {};

            data.forEach(item => {
                const key = item.kol.id;
                if (!grouped[key]) {
                    grouped[key] = {
                        kol: item.kol,
                        orders: new Set(),
                        products: new Set(),
                        total_quantity: 0,
                        revenue: 0,
                        commission: {
                            product: 0,
                            tier: 0,
                            total: 0
                        } || []
                    };
                }

                grouped[key].orders.add(item.order_id);
                grouped[key].products.add(item.product.id);
                grouped[key].total_quantity += item.quantity;
                grouped[key].revenue += item.total;
                grouped[key].commission.product += item.commission.product_amount;
                grouped[key].commission.tier += item.commission.tier_amount;
                grouped[key].commission.total += item.commission.total_amount;
            });

            return Object.values(grouped)
                .map(g => ({
                    kol_id: g.kol.id,
                    kol_name: g.kol.name,
                    tier_name: g.kol.tier.name,
                    tier_commission_rate: g.kol.tier.commission_rate,
                    orders_count: g.orders.size,
                    unique_products: g.products.size,
                    total_quantity: g.total_quantity,
                    revenue: g.revenue,
                    commission: g.commission
                }))
                .sort((a, b) => b.commission.total - a.commission.total);
        }

        default:
            return data;
    }
}

function calculateSummary(data) {
    return {
        total_orders: new Set(data.map(item => item.order_id)).size,
        total_revenue: data.reduce((sum, item) => sum + item.total, 0),
        commission: {
            product: data.reduce((sum, item) => sum + item.commission.product_amount, 0),
            tier: data.reduce((sum, item) => sum + item.commission.tier_amount, 0),
            total: data.reduce((sum, item) => sum + item.commission.total_amount, 0)
        }
    };
}

exports.getReport = async (req, res) => {
    try {
        const { influencerId } = req.params;
        const { start_date, end_date, product_id, group_by } = req.query;
        const report = await generateKolConversionReport({
            kolId: parseInt(influencerId),
            startDate: start_date,
            endDate: end_date,
            productId: product_id ? parseInt(product_id) : '',
            groupBy: group_by || 'month'
        });

        return res.json(report);
    } catch (error) {
        logger.error('Error in KOL report controller:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate report',
            details: error.message
        });
    }
};

