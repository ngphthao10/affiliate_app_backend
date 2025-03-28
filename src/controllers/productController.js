const db = require('../models/mysql');
const logger = require('../utils/logger');

// Get the correct model references
const Product = db.product;
const Category = db.category;
const ProductImage = db.product_image;
const ProductInventory = db.product_inventory;

/**
 * List all products
 */
const listProducts = async (req, res) => {
    try {
        // Get products with basic information
        const products = await Product.findAll({
            attributes: [
                'product_id', 'name', 'description', 'sku',
                'small_image', 'category_id', 'reviews_count',
                'creation_at', 'modified_at'
            ],
            order: [['creation_at', 'DESC']]
        });

        // Format the data for frontend
        const formattedProducts = products.map(product => {
            return {
                _id: product.product_id,
                name: product.name,
                description: product.description,
                category: product.category_id,
                image: [product.small_image],
                price: 0, // Will be updated if inventory exists
                sku: product.sku
            };
        });

        // Get pricing information for each product
        for (const product of formattedProducts) {
            // Try to get inventory
            const inventory = await ProductInventory.findOne({
                where: { product_id: product._id },
                order: [['price', 'ASC']] // Get lowest price
            });

            if (inventory) {
                product.price = inventory.price;
            }

            // Try to get better images
            const images = await ProductImage.findAll({
                where: { product_id: product._id }
            });

            if (images && images.length > 0) {
                product.image = images.map(img => img.image);
            }
        }

        res.json({ success: true, products: formattedProducts });
    } catch (error) {
        logger.error(`Error listing products: ${error.message}`, { stack: error.stack });
        res.json({ success: false, message: error.message });
    }
};

/**
 * Remove a product
 */
const removeProduct = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({
                success: false,
                message: "Product ID is required"
            });
        }

        // Find the product
        const product = await Product.findByPk(id);

        if (!product) {
            return res.json({
                success: false,
                message: "Product not found"
            });
        }

        // Delete the product (will cascade to related tables if set up correctly)
        await product.destroy();

        res.json({
            success: true,
            message: "Product removed successfully"
        });
    } catch (error) {
        logger.error(`Error removing product: ${error.message}`, { stack: error.stack });
        res.json({ success: false, message: error.message });
    }
};

/**
 * Add a new product
 */
const addProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            category,
            bestseller,
            sizes
        } = req.body;

        // Validate required fields
        if (!name) {
            return res.json({
                success: false,
                message: "Product name is required"
            });
        }

        // Create the product
        const product = await Product.create({
            name,
            description,
            category_id: category,
            small_image: req.files?.image1 ? req.files.image1[0].path : 'https://via.placeholder.com/150',
            out_of_stock: false,
            sku: `SKU-${Date.now()}`,
            reviews_count: 0,
            creation_at: new Date(),
            modified_at: new Date()
        });

        // Format the response
        res.json({
            success: true,
            message: "Product added successfully",
            product: {
                id: product.product_id,
                name: product.name
            }
        });
    } catch (error) {
        logger.error(`Error adding product: ${error.message}`, { stack: error.stack });
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get single product details
 */
const singleProduct = async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.json({
                success: false,
                message: "Product ID is required"
            });
        }

        const product = await Product.findByPk(productId);

        if (!product) {
            return res.json({
                success: false,
                message: "Product not found"
            });
        }

        // Format the response
        const formattedProduct = {
            _id: product.product_id,
            name: product.name,
            description: product.description,
            category: product.category_id,
            image: [product.small_image],
            sku: product.sku
        };

        res.json({ success: true, product: formattedProduct });
    } catch (error) {
        logger.error(`Error getting product details: ${error.message}`, { stack: error.stack });
        res.json({ success: false, message: error.message });
    }
};

module.exports = {
    listProducts,
    addProduct,
    removeProduct,
    singleProduct
};