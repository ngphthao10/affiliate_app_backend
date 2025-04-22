const {
    influencer_affiliate_link,
    order_item,
    product,
    product_inventory,
    order,
    influencer,
    influencer_tier,
    Sequelize
} = require('../../models/mysql');
const KolAffiliateStats = require('../../models/mongodb/kolStats');
const logger = require('../../utils/logger');
const { sequelize } = require('../../models/mysql');

const Op = Sequelize.Op;

exports.getKolDashboardStats = async (req, res) => {
    try {
        const { influencerId } = req.params;
        let { startDate, endDate } = req.query;

        if (!influencerId) {
            return res.status(400).json({
                success: false,
                message: "Influencer ID is required"
            });
        }

        // Nếu không có endDate, sử dụng ngày hiện tại (kết thúc ngày hôm nay)
        if (!endDate) {
            const today = new Date();
            // Đặt thời gian là cuối ngày hiện tại (23:59:59.999)
            today.setHours(23, 59, 59, 999);
            endDate = today.toISOString();
        } else {
            // Nếu có endDate, đảm bảo nó bao gồm đến cuối ngày
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();
        }

        // Nếu không có startDate, lấy dữ liệu từ 30 ngày trước đến hiện tại
        if (!startDate) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            // Đặt thời gian là đầu ngày (00:00:00.000)
            thirtyDaysAgo.setHours(0, 0, 0, 0);
            startDate = thirtyDaysAgo.toISOString();
        } else {
            // Nếu có startDate, đảm bảo nó bắt đầu từ đầu ngày
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();
        }

        const influencerData = await influencer.findOne({
            where: { influencer_id: influencerId },
            include: [{
                model: influencer_tier,
                as: 'tier',
                attributes: ['tier_id', 'tier_name', 'commission_rate']
            }]
        });

        if (!influencerData) {
            return res.status(404).json({
                success: false,
                message: "Influencer not found"
            });
        }

        const tierCommissionRate = influencerData.tier?.commission_rate || 0;

        // Thiết lập bộ lọc ngày cho MongoDB
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Lấy thống kê clicks từ MongoDB
        const clickStats = await KolAffiliateStats.aggregate([
            {
                $match: {
                    kol_id: parseInt(influencerId),
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalClicks: { $sum: "$clicks" }
                }
            }
        ]);

        // Lấy tất cả các liên kết tiếp thị của influencer
        const affiliateLinks = await influencer_affiliate_link.findAll({
            where: {
                influencer_id: influencerId
            },
            attributes: ['link_id', 'product_id'],
            include: [{
                model: product,
                as: 'product',
                attributes: ['name', 'commission_rate', 'small_image']
            }]
        });

        const linkIds = affiliateLinks.map(link => link.link_id);

        // Tạo map để tra cứu thông tin sản phẩm theo link_id
        const linkToProductMap = {};
        affiliateLinks.forEach(link => {
            linkToProductMap[link.link_id] = {
                product_id: link.product_id,
                name: link.product?.name || 'Unknown Product',
                commission_rate: link.product?.commission_rate || 0,
                small_image: link.product?.small_image || null
            };
        });

        // Lấy thống kê đơn hàng với bộ lọc thời gian đã điều chỉnh
        const orderStats = await order_item.findOne({
            attributes: [
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('order.order_id'))), 'total_orders'],
                [sequelize.literal('SUM(order_item.quantity * inventory.price)'), 'total_sales'],
                [sequelize.fn('SUM', sequelize.col('order_item.quantity')), 'total_quantity']
            ],
            include: [
                {
                    model: product_inventory,
                    as: 'inventory',
                    attributes: []
                },
                {
                    model: order,
                    as: 'order',
                    attributes: [],
                    where: {
                        status: {
                            [Op.notIn]: ['cancelled', 'returned']
                        },
                        // Sử dụng startDate và endDate đã xử lý
                        creation_at: {
                            [Op.between]: [new Date(startDate), new Date(endDate)]
                        }
                    }
                }
            ],
            where: {
                link_id: {
                    [Op.in]: linkIds
                }
            },
            raw: true
        });

        // Lấy thống kê theo sản phẩm với bộ lọc thời gian đã điều chỉnh
        const productStats = await order_item.findAll({
            attributes: [
                'link_id',
                [sequelize.fn('SUM', sequelize.col('order_item.quantity')), 'total_sold'],
                [sequelize.literal('SUM(order_item.quantity * inventory.price)'), 'total_revenue']
            ],
            include: [
                {
                    model: product_inventory,
                    as: 'inventory',
                    attributes: []
                },
                {
                    model: order,
                    as: 'order',
                    attributes: [],
                    where: {
                        status: {
                            [Op.notIn]: ['cancelled', 'returned']
                        },
                        // Sử dụng startDate và endDate đã xử lý
                        creation_at: {
                            [Op.between]: [new Date(startDate), new Date(endDate)]
                        }
                    }
                }
            ],
            where: {
                link_id: {
                    [Op.in]: linkIds
                }
            },
            group: ['order_item.link_id'],
            order: [[sequelize.fn('SUM', sequelize.col('order_item.quantity')), 'DESC']],
            raw: true
        });

        // Xử lý thống kê sản phẩm
        const productPerformance = {};

        productStats.forEach(stat => {
            const linkId = stat.link_id;
            const productInfo = linkToProductMap[linkId];

            if (!productInfo) return;

            const productId = productInfo.product_id;

            if (!productPerformance[productId]) {
                productPerformance[productId] = {
                    product_id: productId,
                    name: productInfo.name,
                    commission_rate: productInfo.commission_rate,
                    small_image: productInfo.small_image,
                    total_sold: 0,
                    total_revenue: 0,
                    commission: 0
                };
            }

            const totalSold = parseInt(stat.total_sold || 0);
            const totalRevenue = parseFloat(stat.total_revenue || 0);

            const productCommissionRate = productInfo.commission_rate || 0;
            const productCommission = totalRevenue * (productCommissionRate / 100);
            const tierCommission = totalRevenue * (tierCommissionRate / 100);
            const totalCommission = productCommission + tierCommission;

            productPerformance[productId].total_sold += totalSold;
            productPerformance[productId].total_revenue += totalRevenue;
            productPerformance[productId].commission += totalCommission;
        });

        // Lấy top 5 sản phẩm bán chạy nhất
        const topProducts = Object.values(productPerformance)
            .sort((a, b) => b.total_sold - a.total_sold)
            .slice(0, 5);

        // Tính toán tổng số liệu
        const totalSales = parseFloat(orderStats?.total_sales || 0);
        const totalOrders = parseInt(orderStats?.total_orders || 0);
        const totalQuantity = parseInt(orderStats?.total_quantity || 0);

        let totalCommission = 0;
        Object.values(productPerformance).forEach(product => {
            totalCommission += product.commission;
        });

        // Trả về kết quả
        res.status(200).json({
            success: true,
            data: {
                time_range: {
                    start_date: startDate,
                    end_date: endDate
                },
                clicks: clickStats[0]?.totalClicks || 0,
                total_orders: totalOrders,
                total_quantity: totalQuantity,
                total_sales: totalSales,
                estimated_commission: totalCommission,
                tier_name: influencerData.tier?.tier_name || 'Standard',
                tier_commission_rate: tierCommissionRate,
                top_products: topProducts
            }
        });

    } catch (error) {
        logger.error(`Error getting KOL stats: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL statistics',
            error: error.message
        });
    }
};