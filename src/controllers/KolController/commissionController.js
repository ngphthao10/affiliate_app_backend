const {
    product, category, product_image, influencer_affiliate_link,
    Sequelize, sequelize
} = require('../../models/mysql');
const logger = require('../../utils/logger');
const mongoose = require('mongoose');
const Op = Sequelize.Op;


exports.getProducts = async (req, res) => {
    try {
        const {
            page = 1, limit = 12, search = '', category_id = '', sort_by = 'modified_at', sort_order = 'DESC'
        } = req.query;

        const whereConditions = {
            commission_rate: { [Op.gt]: 0 }
        };

        if (search) {
            whereConditions[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        if (category_id) {
            whereConditions[Op.or] = [
                { category_id: category_id },
                { subCategory_id: category_id }
            ];
        }

        const offset = (page - 1) * limit;

        const totalCount = await product.count({
            where: whereConditions
        });

        const products = await product.findAll({
            where: whereConditions,
            attributes: [
                'product_id',
                'name',
                'description',
                'small_image',
                'commission_rate',
                'reviews_count',
                [
                    sequelize.literal(`(
                        SELECT MIN(pi.price) 
                        FROM product_inventory pi 
                        WHERE pi.product_id = Product.product_id
                    )`),
                    'min_price'
                ],
                [
                    sequelize.literal(`(
                        SELECT COUNT(DISTINCT oi.order_item_id)
                        FROM order_item oi
                        JOIN product_inventory pi ON oi.inventory_id = pi.inventory_id
                        WHERE pi.product_id = Product.product_id
                    )`),
                    'sold_count'
                ]
            ],
            include: [
                {
                    model: product_image,
                    as: 'product_images',
                    attributes: ['image_id', 'image'],
                    required: false,
                    limit: 1
                },
                {
                    model: category,
                    as: 'category',
                    attributes: ['category_id', 'display_text'],
                    required: false
                }
            ],
            order: [[sort_by, sort_order]],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const formattedProducts = products.map(product => {
            const productData = product.get({ plain: true });

            let imageUrl = '/images/placeholder-product.jpg';
            if (productData.product_images && productData.product_images.length > 0) {
                imageUrl = productData.product_images[0].image;
            } else if (productData.small_image) {
                imageUrl = productData.small_image;
            }

            return {
                product_id: productData.product_id,
                name: productData.name,
                description: productData.description?.substring(0, 100) + (productData.description?.length > 100 ? '...' : ''),
                image: imageUrl,
                price: parseFloat(productData.min_price || 0),
                commission_rate: productData.commission_rate || 0,
                category: productData.category?.display_text || 'Uncategorized',
                sold_count: productData.sold_count || 0,
                reviews_count: productData.reviews_count || 0
            };
        });

        res.status(200).json({
            success: true,
            products: formattedProducts,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error getting products: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products',
            error: error.message
        });
    }
};


exports.generateAffiliateLink = async (req, res) => {
    try {
        const { product_id } = req.body;

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        const influencerId = req.influencerId;

        if (!influencerId) {
            return res.status(403).json({
                success: false,
                message: 'Authentication failed or influencer not found'
            });
        }

        const productData = await product.findOne({
            where: {
                product_id: product_id
            }
        });

        if (!productData) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (!productData.commission_rate || productData.commission_rate <= 0) {
            return res.status(400).json({
                success: false,
                message: 'This product does not have a commission rate set'
            });
        }

        let affiliateLink = await influencer_affiliate_link.findOne({
            where: {
                influencer_id: influencerId,
                product_id: product_id
            }
        });

        if (affiliateLink) {
            return res.status(200).json({
                success: true,
                message: 'Affiliate link already exists',
                data: {
                    link_id: affiliateLink.link_id,
                    affiliate_link: affiliateLink.affliate_link
                }
            });
        }

        affiliateLink = await influencer_affiliate_link.create({
            affliate_link: '',
            influencer_id: influencerId,
            product_id: product_id
        }, {
            fields: ['affliate_link', 'influencer_id', 'product_id']
        });

        const crypto = require('crypto');
        const timestamp = Date.now();
        const dataToEncode = `${influencerId}-${product_id}-${affiliateLink.link_id}-${timestamp}`;

        const hmac = crypto.createHmac('sha256', process.env.AFFILIATE_SECRET);
        hmac.update(dataToEncode);
        const signature = hmac.digest('hex');

        const token = Buffer.from(dataToEncode).toString('base64') + '.' + signature;

        const baseUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        const trackingUrl = `${baseUrl}/api/track/${encodeURIComponent(token)}`;


        await affiliateLink.update({
            affliate_link: trackingUrl
        });

        try {
            const KolAffiliateStats = mongoose.model('KolAffiliateStats');
            await KolAffiliateStats.create({
                kol_id: influencerId,
                product_id: parseInt(product_id),
                date: new Date(),
                clicks: 0,
                successful_purchases: 0
            });
        } catch (statsError) {
            logger.error(`Error creating initial stats: ${statsError.message}`);
        }

        res.status(201).json({
            success: true,
            message: 'Affiliate link created successfully',
            data: {
                link_id: affiliateLink.link_id,
                affiliate_link: affiliateLink.affliate_link
            }
        });

    } catch (error) {
        logger.error(`Error generating affiliate link: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to generate affiliate link',
            error: error.message
        });
    }
};