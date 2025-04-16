const { category, Sequelize } = require('../models/mysql');
const logger = require('../utils/logger');
const Op = Sequelize.Op;

exports.getAllCategories = async (req, res) => {
    try {
        const parentCategories = await category.findAll({
            where: { parent_category_id: null },
            attributes: ['category_id', 'display_text', 'description']
        });

        return res.status(200).json({
            success: true,
            data: parentCategories
        });
    } catch (error) {
        logger.error('Error fetching categories:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
};

exports.getSubCategories = async (req, res) => {
    try {
        const { parentId } = req.params;

        const parentExists = await category.findByPk(parentId);
        if (!parentExists) {
            return res.status(404).json({
                success: false,
                message: 'Parent category not found'
            });
        }

        const subCategories = await category.findAll({
            where: { parent_category_id: parentId },
            attributes: ['category_id', 'display_text', 'description']
        });

        return res.status(200).json({
            success: true,
            data: subCategories
        });
    } catch (error) {
        logger.error('Error fetching subcategories:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch subcategories',
            error: error.message
        });
    }
};

exports.getAllSubCategories = async (req, res) => {
    try {
        const subCategories = await category.findAll({
            where: {
                parent_category_id: { [Op.not]: null }
            },
            attributes: ['category_id', 'display_text', 'description', 'parent_category_id'],
            include: [{
                model: category,
                as: 'parent_category',
                attributes: ['category_id', 'display_text']
            }]
        });

        return res.status(200).json({
            success: true,
            data: subCategories
        });
    } catch (error) {
        logger.error('Error fetching all subcategories:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch all subcategories',
            error: error.message
        });
    }
};

exports.createCategory = async (req, res) => {
    try {
        const { display_text, description } = req.body;

        if (!display_text) {
            return res.status(400).json({
                success: false,
                message: 'Category name (display_text) is required'
            });
        }

        const existingCategory = await category.findOne({
            where: { display_text, parent_category_id: null }
        });

        if (existingCategory) {
            return res.status(409).json({
                success: false,
                message: 'A category with this name already exists'
            });
        }

        const newCategory = await category.create({
            display_text,
            description,
            parent_category_id: null
        });

        return res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: newCategory
        });
    } catch (error) {
        logger.error('Error creating category:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create category',
            error: error.message
        });
    }
};

exports.createSubCategory = async (req, res) => {
    try {
        const { display_text, description, parent_category_id } = req.body;

        if (!display_text || !parent_category_id) {
            return res.status(400).json({
                success: false,
                message: 'Subcategory name (display_text) and parent category ID are required'
            });
        }

        const parentCategory = await category.findByPk(parent_category_id);
        if (!parentCategory) {
            return res.status(404).json({
                success: false,
                message: 'Parent category not found'
            });
        }

        const existingSubCategory = await category.findOne({
            where: {
                display_text,
                parent_category_id
            }
        });

        if (existingSubCategory) {
            return res.status(409).json({
                success: false,
                message: 'A subcategory with this name already exists under the selected parent category'
            });
        }

        const newSubCategory = await category.create({
            display_text,
            description,
            parent_category_id
        });

        return res.status(201).json({
            success: true,
            message: 'Subcategory created successfully',
            data: newSubCategory
        });
    } catch (error) {
        logger.error('Error creating subcategory:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create subcategory',
            error: error.message
        });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const categoryToDelete = await category.findByPk(id);
        if (!categoryToDelete) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        const hasSubCategories = await category.findOne({
            where: { parent_category_id: id }
        });

        if (hasSubCategories) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with existing subcategories. Please delete all subcategories first.'
            });
        }

        const hasProducts = await categoryToDelete.getProducts();
        if (hasProducts && hasProducts.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with existing products. Please reassign or delete the products first.'
            });
        }

        await categoryToDelete.destroy();

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting category:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete category',
            error: error.message
        });
    }
};

exports.deleteSubCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const subCategoryToDelete = await category.findByPk(id);
        if (!subCategoryToDelete) {
            return res.status(404).json({
                success: false,
                message: 'Subcategory not found'
            });
        }

        if (!subCategoryToDelete.parent_category_id) {
            return res.status(400).json({
                success: false,
                message: 'Specified ID is for a parent category, not a subcategory'
            });
        }

        const hasProducts = await subCategoryToDelete.getProducts();
        if (hasProducts && hasProducts.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete subcategory with existing products. Please reassign or delete the products first.'
            });
        }

        await subCategoryToDelete.destroy();

        return res.status(200).json({
            success: true,
            message: 'Subcategory deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting subcategory:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete subcategory',
            error: error.message
        });
    }
};