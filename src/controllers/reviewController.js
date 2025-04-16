const {
    review,
    users,
    product,
    Sequelize,
    sequelize
} = require('../models/mysql');
const logger = require('../utils/logger');
const Op = Sequelize.Op;

exports.getReviews = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, search = '', status = 'all', product: productFilter = '',
            rating = 'all', sort_by = 'creation_at', sort_order = 'DESC'
        } = req.query;

        const whereConditions = {};

        if (status !== 'all') {
            whereConditions.status = status;
        }

        if (rating !== 'all') {
            whereConditions.rate = rating;
        }

        const searchConditions = [];
        if (search) {
            searchConditions.push({
                '$user.username$': { [Op.like]: `%${search}%` }
            });
            searchConditions.push({
                '$user.email$': { [Op.like]: `%${search}%` }
            });
            searchConditions.push({
                '$user.first_name$': { [Op.like]: `%${search}%` }
            });
            searchConditions.push({
                '$user.last_name$': { [Op.like]: `%${search}%` }
            });
            searchConditions.push({
                content: { [Op.like]: `%${search}%` }
            });
        }

        if (searchConditions.length > 0) {
            whereConditions[Op.or] = searchConditions;
        }

        const productSearchConditions = {};
        if (productFilter) {
            productSearchConditions.name = { [Op.like]: `%${productFilter}%` };
        }

        const offset = (page - 1) * limit;

        const validSortFields = ['creation_at', 'rate', 'status'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'creation_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const totalCount = await review.count({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'first_name', 'last_name'],
                    required: true
                },
                {
                    model: product,
                    as: 'product',
                    attributes: ['name', 'sku'],
                    where: Object.keys(productSearchConditions).length > 0 ? productSearchConditions : undefined
                }
            ],
            distinct: true
        });

        const reviews = await review.findAll({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'first_name', 'last_name'],
                    required: true
                },
                {
                    model: product,
                    as: 'product',
                    attributes: ['product_id', 'name', 'sku', 'small_image'],
                    where: Object.keys(productSearchConditions).length > 0 ? productSearchConditions : undefined
                }
            ],
            order: [[sortField, sortDirection]],
            limit: parseInt(limit),
            offset: offset
        });

        res.status(200).json({
            success: true,
            reviews,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error fetching reviews: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews',
            error: error.message
        });
    }
};

exports.getReviewById = async (req, res) => {
    try {
        const { id } = req.params;

        const reviewData = await review.findByPk(id, {
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['user_id', 'username', 'email', 'first_name', 'last_name'],
                },
                {
                    model: product,
                    as: 'product',
                    attributes: ['product_id', 'name', 'sku', 'description', 'small_image'],
                }
            ]
        });

        if (!reviewData) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        res.status(200).json({
            success: true,
            data: reviewData
        });

    } catch (error) {
        logger.error(`Error fetching review details: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch review details',
            error: error.message
        });
    }
};

exports.updateReviewStatus = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;

        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be pending, approved, or rejected.'
            });
        }

        const reviewData = await review.findByPk(id, { transaction });
        if (!reviewData) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        if (status === 'rejected' && (!rejection_reason || rejection_reason.trim() === '')) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required when rejecting a review'
            });
        }

        const updateData = {
            status,
            modified_at: new Date()
        };

        if (rejection_reason) {
            updateData.rejection_reason = rejection_reason;
        }

        await reviewData.update(updateData, { transaction });

        if (status === 'approved' || reviewData.status === 'approved') {
            const productId = reviewData.product_id;

            const approvedCount = await review.count({
                where: {
                    product_id: productId,
                    status: 'approved'
                },
                transaction
            });

            await product.update(
                { reviews_count: approvedCount },
                {
                    where: { product_id: productId },
                    transaction
                }
            );
        }

        const updatedReview = await review.findByPk(id, {
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['user_id', 'username', 'email'],
                },
                {
                    model: product,
                    as: 'product',
                    attributes: ['product_id', 'name', 'sku'],
                }
            ],
            transaction
        });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: `Review has been ${status} successfully`,
            data: updatedReview
        });

    } catch (error) {
        await transaction.rollback();
        logger.error(`Error updating review status: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update review status',
            error: error.message
        });
    }
};

exports.getReviewStatistics = async (req, res) => {
    try {
        const statusCounts = await review.findAll({
            attributes: [
                'status',
                [Sequelize.fn('count', Sequelize.col('review_id')), 'count']
            ],
            group: ['status']
        });

        const ratingCounts = await review.findAll({
            attributes: [
                'rate',
                [Sequelize.fn('count', Sequelize.col('review_id')), 'count']
            ],
            group: ['rate'],
            order: [['rate', 'DESC']]
        });

        const topProducts = await review.findAll({
            attributes: [
                'product_id',
                [Sequelize.fn('count', Sequelize.col('review_id')), 'review_count'],
                [Sequelize.fn('avg', Sequelize.col('rate')), 'average_rating']
            ],
            include: [
                {
                    model: product,
                    as: 'product',
                    attributes: ['name', 'sku', 'small_image'],
                }
            ],
            group: ['product_id'],
            order: [[Sequelize.literal('review_count'), 'DESC']],
            limit: 5
        });

        res.status(200).json({
            success: true,
            data: {
                statusCounts: statusCounts.reduce((acc, item) => {
                    acc[item.status] = parseInt(item.dataValues.count);
                    return acc;
                }, {}),
                ratingCounts: ratingCounts.map(item => ({
                    rating: item.rate,
                    count: parseInt(item.dataValues.count)
                })),
                topProducts: topProducts.map(item => ({
                    product_id: item.product_id,
                    name: item.product.name,
                    sku: item.product.sku,
                    image: item.product.small_image,
                    review_count: parseInt(item.dataValues.review_count),
                    average_rating: parseFloat(item.dataValues.average_rating).toFixed(1)
                }))
            }
        });

    } catch (error) {
        logger.error(`Error fetching review statistics: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch review statistics',
            error: error.message
        });
    }
};

exports.deleteReview = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;

        const reviewData = await review.findByPk(id, { transaction });
        if (!reviewData) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        const productId = reviewData.product_id;
        const wasApproved = reviewData.status === 'approved';

        await reviewData.destroy({ transaction });

        if (wasApproved) {
            const approvedCount = await review.count({
                where: {
                    product_id: productId,
                    status: 'approved'
                },
                transaction
            });

            await product.update(
                { reviews_count: approvedCount },
                {
                    where: { product_id: productId },
                    transaction
                }
            );
        }

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Review deleted successfully'
        });

    } catch (error) {
        await transaction.rollback();
        logger.error(`Error deleting review: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to delete review',
            error: error.message
        });
    }
};