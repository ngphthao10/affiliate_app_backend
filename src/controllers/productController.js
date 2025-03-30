const { product, product_inventory, product_image, category, Sequelize } = require('../models/mysql');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const Op = Sequelize.Op;

/**
 * List all products with filtering, sorting and pagination
 */
exports.listProducts = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, search = '', category_id, sort_by = 'creation_at', sort_order = 'DESC', min_price, max_price, in_stock
        } = req.query;

        // Build filter conditions
        const whereConditions = {};

        // Search in name and description
        if (search) {
            whereConditions[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by category
        if (category_id) {
            whereConditions.category_id = category_id;
        }

        // Filter by stock status
        if (in_stock !== undefined) {
            whereConditions.out_of_stock = in_stock === 'true' ? false : true;
        }

        // Prepare inventory filters for price range
        let inventoryFilters = {};
        if (min_price !== undefined || max_price !== undefined) {
            if (min_price !== undefined) {
                inventoryFilters.price = { ...inventoryFilters.price, [Op.gte]: min_price };
            }
            if (max_price !== undefined) {
                inventoryFilters.price = { ...inventoryFilters.price, [Op.lte]: max_price };
            }
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get total product count for pagination
        const totalProductsCount = await product.count({ where: whereConditions });

        // Validate sort parameters
        const validSortFields = ['name', 'creation_at', 'modified_at', 'reviews_count'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'creation_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get products with filters, sorting, and pagination
        const products = await product.findAll({
            where: whereConditions,
            attributes: [
                'product_id', 'name', 'description', 'sku',
                'small_image', 'category_id', 'reviews_count',
                'out_of_stock', 'commission_rate',
                'creation_at', 'modified_at'
            ],
            include: [
                {
                    model: category,
                    as: 'category',
                    attributes: ['category_id', 'display_text']
                },
                {
                    model: product_image,
                    as: 'product_images',
                    attributes: ['image_id', 'image', 'alt'],
                    required: false
                },
                {
                    model: product_inventory,
                    as: 'product_inventories',
                    attributes: ['inventory_id', 'size', 'price', 'quantity'],
                    where: Object.keys(inventoryFilters).length > 0 ? inventoryFilters : undefined,
                    required: Object.keys(inventoryFilters).length > 0
                }
            ],
            order: [[sortField, sortDirection]],
            limit: parseInt(limit, 10),
            offset: offset
        });

        // Format the response
        const formattedProducts = products.map(product => {
            // Xử lý images - ưu tiên product_images, fallback sang small_image
            let images = [];

            if (product.product_images && product.product_images.length > 0) {
                // Sử dụng ảnh từ product_images
                images = product.product_images.map(img => ({
                    id: img.image_id,
                    url: img.image,
                    alt: img.alt || product.name
                }));
            } else if (product.small_image) {
                // Fallback sang small_image nếu có
                images = [{
                    id: null,
                    url: product.small_image,
                    alt: product.name
                }];
            } else {
                // Nếu không có ảnh nào, sử dụng placeholder
                images = [{
                    id: null,
                    url: '/images/placeholder-product.jpg', // Đường dẫn đến ảnh placeholder
                    alt: 'No image available'
                }];
            }

            // Get price range from inventory
            let minPrice = null;
            let maxPrice = null;
            const availableSizes = [];

            if (product.product_inventories && product.product_inventories.length > 0) {
                // Get unique sizes
                product.product_inventories.forEach(item => {
                    if (item.size && !availableSizes.includes(item.size)) {
                        availableSizes.push(item.size);
                    }

                    if (minPrice === null || item.price < minPrice) {
                        minPrice = item.price;
                    }

                    if (maxPrice === null || item.price > maxPrice) {
                        maxPrice = item.price;
                    }
                });
            }

            return {
                id: product.product_id,
                name: product.name,
                description: product.description,
                sku: product.sku,
                category: {
                    id: product.category?.category_id,
                    name: product.category?.display_text
                },
                images: images,
                price: {
                    min: minPrice,
                    max: maxPrice,
                    range: minPrice !== maxPrice
                },
                sizes: availableSizes,
                in_stock: !product.out_of_stock,
                reviews_count: product.reviews_count,
                created_at: product.creation_at,
                updated_at: product.modified_at
            };
        });

        // Return products with pagination info
        res.status(200).json({
            success: true,
            products: formattedProducts,
            pagination: {
                total: totalProductsCount,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                pages: Math.ceil(totalProductsCount / limit)
            }
        });
    } catch (error) {
        logger.error(`Error listing products: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products',
            error: error.message
        });
    }
};

/**
 * Add a new product with inventory and images
 */

exports.addProduct = async (req, res) => {
    try {
        const { name, description, sku, category_id, commission_rate, inventory } = req.body;

        // Parse inventory if needed
        let parsedInventory = [];
        try {
            parsedInventory = typeof inventory === 'string' ? JSON.parse(inventory) : inventory;
        } catch (error) {
            logger.error(`Error parsing inventory data: ${error.message}`);
            // Fallback to legacy format
            const sizes = req.body.sizes ? (typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes) : [];
            if (sizes.length > 0 && req.body.price) {
                parsedInventory = sizes.map(size => ({
                    size,
                    price: parseFloat(req.body.price),
                    quantity: parseInt(req.body.quantity || 0, 10)
                }));
            }
        }

        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Product name is required"
            });
        }

        if (!parsedInventory || parsedInventory.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one size is required"
            });
        }

        // Check for main product image
        if (!req.files || !req.files.image1) {
            return res.status(400).json({
                success: false,
                message: "Main product image is required"
            });
        }

        // Use the category_id directly instead of looking it up
        const categoryId = parseInt(category_id, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({
                success: false,
                message: "Valid category ID is required"
            });
        }

        // Function to convert full path to relative URL
        const getRelativeUrl = (filePath) => {
            const filename = path.basename(filePath);
            console.log(filePath)
            return `/uploads/products/${filename}`;
        };
        // Start transaction
        const result = await product.sequelize.transaction(async (t) => {
            console.log(getRelativeUrl(req.files.image1[0].path))
            // Create the product
            const newProduct = await product.create({
                name,
                description,
                sku: sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                small_image: req.savedPaths.image1, // Use the saved relative path
                category_id: categoryId,
                out_of_stock: parsedInventory.every(item => parseInt(item.quantity) <= 0),
                commission_rate: commission_rate || 0,
                creation_at: new Date(),
                modified_at: new Date()
            }, { transaction: t });

            // Add product images if available
            const productImages = [];
            if (req.files) {
                for (let i = 1; i <= 4; i++) {
                    const imageField = `image${i}`;
                    if (req.files[imageField] && req.files[imageField][0]) {
                        const productImage = await product_image.create({
                            product_id: newProduct.product_id,
                            image: req.savedPaths[imageField], // Use the saved relative path
                            alt: `${name} - Image ${i}`,
                            creation_at: new Date(),
                            modified_at: new Date()
                        }, { transaction: t });
                        productImages.push(productImage);
                    }
                }
            }
            // Add inventory items for each size
            const inventoryItems = [];
            for (const item of parsedInventory) {
                const inventoryItem = await product_inventory.create({
                    product_id: newProduct.product_id,
                    size: item.size,
                    price: parseFloat(item.price),
                    quantity: parseInt(item.quantity || 0, 10),
                    creation_at: new Date(),
                    modified_at: new Date()
                }, { transaction: t });

                inventoryItems.push(inventoryItem);
            }

            return {
                product: newProduct,
                images: productImages,
                inventory: inventoryItems
            };
        });

        // Format response
        res.status(201).json({
            success: true,
            message: "Product added successfully",
            product: {
                id: result.product.product_id,
                name: result.product.name,
                images_count: result.images.length,
                inventory_count: result.inventory.length
            }
        });
    } catch (error) {
        logger.error(`Error adding product: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to add product',
            error: error.message
        });
    }
};
/**
 * Get product details for editing
 */
exports.getProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        const productData = await product.findByPk(id, {
            include: [
                {
                    model: category,
                    as: 'category',
                    attributes: ['category_id', 'display_text', 'parent_category_id']
                },
                {
                    model: product_image,
                    as: 'product_images',
                    attributes: ['image_id', 'image', 'alt', 'description']
                },
                {
                    model: product_inventory,
                    as: 'product_inventories',
                    attributes: ['inventory_id', 'size', 'price', 'quantity']
                }
            ]
        });

        if (!productData) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Get parent category info if it exists
        let parentCategory = null;
        if (productData.category?.parent_category_id) {
            parentCategory = await category.findByPk(productData.category.parent_category_id, {
                attributes: ['category_id', 'display_text']
            });
        }

        // Format response
        const formattedProduct = {
            id: productData.product_id,
            name: productData.name,
            description: productData.description,
            sku: productData.sku,
            category_id: productData.category_id,
            category: {
                id: productData.category?.category_id,
                name: productData.category?.display_text,
                parent: parentCategory ? {
                    id: parentCategory.category_id,
                    name: parentCategory.display_text
                } : null
            },
            images: productData.product_images.map(img => ({
                id: img.image_id,
                url: img.image,
                alt: img.alt || productData.name,
                description: img.description
            })),
            inventory: productData.product_inventories.map(item => ({
                id: item.inventory_id,
                size: item.size,
                price: parseFloat(item.price),
                quantity: parseInt(item.quantity, 10),
                available: item.quantity > 0
            })),
            out_of_stock: productData.out_of_stock,
            commission_rate: productData.commission_rate || 0,
            reviews_count: productData.reviews_count,
            created_at: productData.creation_at,
            updated_at: productData.modified_at
        };

        res.status(200).json({
            success: true,
            product: formattedProduct
        });
    } catch (error) {
        logger.error(`Error getting product: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product',
            error: error.message
        });
    }
};
/**
 * Update an existing product
 */
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        // Check if product exists
        const existingProduct = await product.findByPk(id);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Extract and validate basic fields
        const {
            name,
            description,
            sku,
            category_id,
            commission_rate,
            inventory,
            removed_images = [] // Add support for removed images
        } = req.body;

        // Validate required fields
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Product name is required"
            });
        }

        // Parse inventory data
        let parsedInventory = [];
        try {
            parsedInventory = typeof inventory === 'string' ? JSON.parse(inventory) : inventory;
        } catch (error) {
            logger.error(`Error parsing inventory data: ${error.message}`);
            return res.status(400).json({
                success: false,
                message: "Invalid inventory data format"
            });
        }

        // Parse removed images
        const imagesToRemove = typeof removed_images === 'string'
            ? JSON.parse(removed_images)
            : removed_images;

        // Function to get relative path for images
        const getRelativePath = (filePath) => {
            const filename = path.basename(filePath);
            return `/uploads/products/${filename}`;
        };

        // Start transaction
        await product.sequelize.transaction(async (t) => {
            // Update base product data
            const updateData = {
                name: name.trim(),
                description: description || '',
                sku: sku || '',
                category_id: category_id,
                commission_rate: commission_rate || 0,
                modified_at: new Date()
            };

            // Update small image if new one uploaded
            if (req.files?.image1) {
                updateData.small_image = req.savedPaths?.image1 || getRelativePath(req.files.image1[0].path);
            }

            // Update the product
            await product.update(updateData, {
                where: { product_id: id },
                transaction: t
            });

            // Handle image deletions
            if (imagesToRemove.length > 0) {
                // Find images to delete (for file deletion)
                const imagesToDelete = await product_image.findAll({
                    where: {
                        image_id: imagesToRemove,
                        product_id: id
                    }
                });

                // Delete physical files if possible
                for (const image of imagesToDelete) {
                    try {
                        const imagePath = path.join(process.cwd(), 'public', image.image);
                        if (fs.existsSync(imagePath)) {
                            fs.unlinkSync(imagePath);
                        }
                    } catch (fileError) {
                        logger.error(`Error deleting image file: ${fileError.message}`);
                        // Continue even if file deletion fails
                    }
                }

                // Delete the database records
                await product_image.destroy({
                    where: {
                        image_id: imagesToRemove,
                        product_id: id
                    },
                    transaction: t
                });
            }

            // Handle new images
            if (req.files) {
                for (let i = 1; i <= 4; i++) {
                    const imageField = `image${i}`;
                    if (req.files[imageField] && req.files[imageField][0]) {
                        const imagePath = req.savedPaths?.[imageField] || getRelativePath(req.files[imageField][0].path);

                        await product_image.create({
                            product_id: id,
                            image: imagePath,
                            alt: `${name.trim()} - Image ${i}`,
                            creation_at: new Date(),
                            modified_at: new Date()
                        }, { transaction: t });
                    }
                }
            }

            // Update inventory
            if (parsedInventory.length > 0) {
                // Delete existing inventory
                await product_inventory.destroy({
                    where: { product_id: id },
                    transaction: t
                });

                // Create new inventory items
                for (const item of parsedInventory) {
                    await product_inventory.create({
                        product_id: id,
                        size: item.size,
                        price: parseFloat(item.price),
                        quantity: parseInt(item.quantity, 10),
                        creation_at: new Date(),
                        modified_at: new Date()
                    }, { transaction: t });
                }
            }

            // Update out_of_stock status
            const totalInventory = await product_inventory.sum('quantity', {
                where: { product_id: id },
                transaction: t
            });

            await product.update({
                out_of_stock: totalInventory <= 0
            }, {
                where: { product_id: id },
                transaction: t
            });
        });

        res.status(200).json({
            success: true,
            message: "Product updated successfully"
        });

    } catch (error) {
        logger.error(`Error updating product: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update product',
            error: error.message
        });
    }
};

/**
 * Delete a product image
 */
exports.deleteProductImage = async (req, res) => {
    try {
        const { imageId } = req.params;

        if (!imageId) {
            return res.status(400).json({
                success: false,
                message: "Image ID is required"
            });
        }

        const imageToDelete = await product_image.findByPk(imageId);

        if (!imageToDelete) {
            return res.status(404).json({
                success: false,
                message: "Image not found"
            });
        }

        // Delete the image file from storage if possible
        try {
            if (imageToDelete.image && fs.existsSync(imageToDelete.image)) {
                fs.unlinkSync(imageToDelete.image);
            }
        } catch (fileError) {
            logger.error(`Error deleting image file: ${fileError.message}`);
            // Continue even if file deletion fails
        }

        // Delete the database record
        await imageToDelete.destroy();

        res.status(200).json({
            success: true,
            message: "Product image deleted successfully"
        });
    } catch (error) {
        logger.error(`Error deleting product image: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to delete product image',
            error: error.message
        });
    }
};

/**
 * Delete a product and all related data
 */
exports.deleteProduct = async (req, res) => {
    try {
        // Support both query methods: params.id and body.productId
        const productId = req.params.id || req.body.productId;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        // Check if product exists with its images
        const existingProduct = await product.findByPk(productId, {
            include: [
                {
                    model: product_image,
                    as: 'product_images'
                }
            ]
        });

        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Delete everything in a transaction
        await product.sequelize.transaction(async (t) => {
            // Delete inventory items
            await product_inventory.destroy({
                where: { product_id: productId },
                transaction: t
            });

            // Try to delete physical image files
            try {
                // Delete product images
                if (existingProduct.product_images?.length > 0) {
                    for (const image of existingProduct.product_images) {
                        if (image.image && fs.existsSync(image.image)) {
                            fs.unlinkSync(image.image);
                        }
                    }
                }

                // Delete small image if exists
                if (existingProduct.small_image && fs.existsSync(existingProduct.small_image)) {
                    fs.unlinkSync(existingProduct.small_image);
                }
            } catch (fileError) {
                logger.error(`Error deleting image files: ${fileError.message}`);
                // Continue even if file deletion fails
            }

            // Delete image records from database
            await product_image.destroy({
                where: { product_id: productId },
                transaction: t
            });

            // Finally delete the product
            await existingProduct.destroy({ transaction: t });
        });

        res.status(200).json({
            success: true,
            message: "Product deleted successfully"
        });
    } catch (error) {
        logger.error(`Error deleting product: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to delete product',
            error: error.message
        });
    }
};