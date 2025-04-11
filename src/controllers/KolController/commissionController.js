const {
    product,
    category,
    product_image,
    influencer_affiliate_link,
    Sequelize,
    sequelize
} = require('../../models/mysql');
const logger = require('../../utils/logger');
const mongoose = require('mongoose');

const Op = Sequelize.Op;

/**
 * Get all products with commission rates
 */
exports.getProducts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            search = '',
            category_id = '',
            sort_by = 'modified_at',
            sort_order = 'DESC'
        } = req.query;

        // Build where conditions for product search
        const whereConditions = {
            commission_rate: { [Op.gt]: 0 } // Only get products with commission rate > 0
        };

        // Add search if provided
        if (search) {
            whereConditions[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        // Add category filter if provided
        if (category_id) {
            whereConditions[Op.or] = [
                { category_id: category_id },
                { subCategory_id: category_id }
            ];
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const totalCount = await product.count({
            where: whereConditions
        });

        // Main query to get products
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

        // Format response
        const formattedProducts = products.map(product => {
            const productData = product.get({ plain: true });

            // Get the first image or use small_image or default
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


/**
 * Generate affiliate link for influencer
 */
// exports.generateAffiliateLink = async (req, res) => {
//     try {
//         const { product_id } = req.body;

//         // Validate product_id exists in the request
//         if (!product_id) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Product ID is required'
//             });
//         }

//         // Get influencer ID from the kolAuth middleware
//         const influencerId = req.influencerId;

//         if (!influencerId) {
//             return res.status(403).json({
//                 success: false,
//                 message: 'Authentication failed or influencer not found'
//             });
//         }

//         // Log the parameters for debugging
//         logger.info(`Generating affiliate link for product_id: ${product_id}, influencer_id: ${influencerId}`);

//         // Validate product exists and has commission
//         const productData = await product.findOne({
//             where: {
//                 product_id: product_id
//             }
//         });

//         if (!productData) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Product not found'
//             });
//         }

//         if (!productData.commission_rate || productData.commission_rate <= 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'This product does not have a commission rate set'
//             });
//         }

//         // Check if link already exists
//         let affiliateLink = await influencer_affiliate_link.findOne({
//             where: {
//                 influencer_id: influencerId,
//                 product_id: product_id
//             }
//         });

//         if (affiliateLink) {
//             return res.status(200).json({
//                 success: true,
//                 message: 'Affiliate link already exists',
//                 data: {
//                     link_id: affiliateLink.link_id,
//                     affiliate_link: affiliateLink.affliate_link
//                 }
//             });
//         }

//         // Generate unique affiliate link
//         const uniqueCode = Buffer.from(`${influencerId}-${product_id}-${Date.now()}`).toString('base64');
//         const baseUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
//         const affiliateLinkUrl = `${baseUrl}/product/${product_id}?ref=${uniqueCode}`;

//         // Create new affiliate link
//         affiliateLink = await influencer_affiliate_link.create({
//             affliate_link: affiliateLinkUrl,
//             influencer_id: influencerId,
//             product_id: product_id
//         });

//         // Create initial entry in MongoDB for tracking
//         try {
//             const KolAffiliateStats = mongoose.model('KolAffiliateStats');
//             await KolAffiliateStats.create({
//                 kol_id: influencerId,
//                 product_id: parseInt(product_id),
//                 date: new Date(),
//                 clicks: 0,
//                 successful_purchases: 0
//             });
//         } catch (statsError) {
//             // Log but don't fail if stats creation fails
//             logger.error(`Error creating initial stats: ${statsError.message}`);
//         }

//         res.status(201).json({
//             success: true,
//             message: 'Affiliate link created successfully',
//             data: {
//                 link_id: affiliateLink.link_id,
//                 affiliate_link: affiliateLink.affliate_link
//             }
//         });

//     } catch (error) {
//         logger.error(`Error generating affiliate link: ${error.message}`, { stack: error.stack });
//         res.status(500).json({
//             success: false,
//             message: 'Failed to generate affiliate link',
//             error: error.message
//         });
//     }
// };

/**
 * Generate affiliate link for influencer
 */
exports.generateAffiliateLink = async (req, res) => {
    try {
        const { product_id } = req.body;

        // Validate product_id exists in the request
        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        // Get influencer ID from the kolAuth middleware
        const influencerId = req.influencerId;

        if (!influencerId) {
            return res.status(403).json({
                success: false,
                message: 'Authentication failed or influencer not found'
            });
        }

        // Log the parameters for debugging
        logger.info(`Generating affiliate link for product_id: ${product_id}, influencer_id: ${influencerId}`);

        // Validate product exists and has commission
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

        // Check if link already exists
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

        // Create a new affiliate link record first
        affiliateLink = await influencer_affiliate_link.create({
            // We'll update the actual link after we get the ID
            affliate_link: '',
            influencer_id: influencerId,
            product_id: product_id
        }, {
            fields: ['affliate_link', 'influencer_id', 'product_id'] // Explicitly specify fields
        });

        const crypto = require('crypto');
        const timestamp = Date.now();
        const dataToEncode = `${influencerId}-${product_id}-${affiliateLink.link_id}-${timestamp}`;

        // Create an HMAC (Hash-based Message Authentication Code) using a secret key
        const hmac = crypto.createHmac('sha256', process.env.AFFILIATE_SECRET);
        hmac.update(dataToEncode);
        const signature = hmac.digest('hex');

        // Create a token by combining the data and signature
        // Format: base64(influencerId-productId-linkId-timestamp):signature
        const token = Buffer.from(dataToEncode).toString('base64') + '.' + signature;

        const baseUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        const trackingUrl = `${baseUrl}/api/track/${encodeURIComponent(token)}`;


        // Update the link with the correct URL
        await affiliateLink.update({
            affliate_link: trackingUrl
        });

        // Create initial entry in MongoDB for tracking
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
            // Log but don't fail if stats creation fails
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