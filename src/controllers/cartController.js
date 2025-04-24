// controllers/cartController.js
const { cart_session, cart_item, product_inventory, product, Sequelize } = require('../models/mysql');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const Op = Sequelize.Op;

// Thêm sản phẩm vào giỏ hàng
exports.addToCart = async (req, res) => {
  try {
    const user_id = req.user_id; // Lấy từ middleware
    const { inventory_id, quantity = 1 } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!user_id || !inventory_id || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid parameters: user_id, inventory_id, and quantity are required.',
      });
    }

    // Kiểm tra inventory_id có tồn tại và còn hàng không
    const inventory = await product_inventory.findOne({
      where: { inventory_id },
      include: [
        {
          model: product,
          as: 'product',
          attributes: ['product_id', 'name', 'small_image', 'out_of_stock'],
        },
      ],
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found.',
      });
    }

    if (inventory.quantity < quantity || inventory.product.out_of_stock) {
      return res.status(400).json({
        success: false,
        message: 'Product is out of stock or insufficient quantity.',
      });
    }

    // Tìm hoặc tạo phiên giỏ hàng cho user
    let session = await cart_session.findOne({
      where: { user_id },
      order: [['creation_at', 'DESC']],
    });

    if (!session) {
      session = await cart_session.create({
        user_id,
        creation_at: new Date(),
        modified_at: new Date(),
      });
    } else {
      // Cập nhật modified_at của phiên hiện tại
      await session.update({ modified_at: new Date() });
    }

    // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
    let item = await cart_item.findOne({
      where: {
        session_id: session.session_id,
        inventory_id,
      },
    });

    if (item) {
      // Nếu sản phẩm đã có, cập nhật số lượng
      const newQuantity = item.quantity + quantity;
      await item.update({
        quantity: newQuantity,
        modified_at: new Date(),
      });
      item.quantity = newQuantity;
    } else {
      // Nếu chưa có, tạo mới cart item
      item = await cart_item.create({
        session_id: session.session_id,
        inventory_id,
        quantity,
        creation_at: new Date(),
        modified_at: new Date(),
      });
    }

    // Định dạng dữ liệu trả về
    res.status(200).json({
      success: true,
      message: 'Product added to cart successfully.',
      cartItem: {
        cart_item_id: item.cart_item_id,
        session_id: item.session_id,
        inventory_id: item.inventory_id,
        quantity: item.quantity,
      },
    });
  } catch (error) {
    logger.error(`Error adding to cart: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to add product to cart.',
      error: error.message,
    });
  }
};

// Lấy thông tin giỏ hàng của người dùng
exports.getCart = async (req, res) => {
  try {
    const user_id = req.user_id; // Lấy từ middleware

    // Kiểm tra dữ liệu đầu vào
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required.',
      });
    }

    // Tìm phiên giỏ hàng mới nhất của user
    const session = await cart_session.findOne({
      where: { user_id },
      order: [['creation_at', 'DESC']],
    });

    if (!session) {
      return res.status(200).json({
        success: true,
        cart: {
          session_id: null,
          items: [],
          total_price: 0,
        },
      });
    }

    // Lấy danh sách các mục trong giỏ hàng với include
    const items = await cart_item.findAll({
      where: { session_id: session.session_id },
      include: [
        {
          model: product_inventory,
          as: 'inventory',
          attributes: ['inventory_id', 'size', 'price', 'quantity'],
          include: [
            {
              model: product,
              as: 'product',
              attributes: ['product_id', 'name', 'small_image', 'out_of_stock'],
            },
          ],
        },
      ],
    });

    // Định dạng dữ liệu trả về
    let totalPrice = 0;
    const formattedItems = items.map((item) => {
      const price = parseFloat(item.inventory.price);
      const itemTotal = price * item.quantity;
      totalPrice += itemTotal;

      // Xử lý hình ảnh - ưu tiên small_image, nếu không có thì dùng placeholder
      const images = item.inventory.product.small_image
        ? [
            {
              id: null,
              url: item.inventory.product.small_image,
              alt: item.inventory.product.name,
            },
          ]
        : [
            {
              id: null,
              url: '/images/placeholder-product.jpg',
              alt: 'No image available',
            },
          ];

      return {
        cart_item_id: item.cart_item_id,
        inventory_id: item.inventory_id,
        product: {
          id: item.inventory.product.product_id,
          quantity:item.inventory.quantity,
          name: item.inventory.product.name,
          images,
          out_of_stock: item.inventory.product.out_of_stock,
          small_image:item.inventory.product.small_image
        },
        size: item.inventory.size,
        price: price,
        quantity: item.quantity,
        item_total: itemTotal,
      };
    });

    res.status(200).json({
      success: true,
      cart: {
        session_id: session.session_id,
        items: formattedItems,
        total_price: totalPrice,
      },
    });
  } catch (error) {
    logger.error(`Error fetching cart: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart.',
      error: error.message,
    });
  }
};

// Cập nhật số lượng sản phẩm trong giỏ hàng
exports.updateCartItem = async (req, res) => {
  try {
    const { cart_item_id, quantity } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!cart_item_id || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid parameters: cart_item_id and quantity are required.',
      });
    }

    // Tìm cart item và kiểm tra tồn kho
    const item = await cart_item.findOne({
      where: { cart_item_id },
      include: [
        {
          model: product_inventory,
          as: 'inventory',
          attributes: ['quantity'],
          include: [
            {
              model: product,
              as: 'product',
              attributes: ['out_of_stock'],
            },
          ],
        },
      ],
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found.',
      });
    }

    if (item.inventory.quantity < quantity || item.inventory.product.out_of_stock) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock or product is unavailable.',
      });
    }

    // Cập nhật số lượng
    await item.update({
      quantity,
      modified_at: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Cart item updated successfully.',
      cartItem: {
        cart_item_id: item.cart_item_id,
        quantity: item.quantity,
      },
    });
  } catch (error) {
    logger.error(`Error updating cart item: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item.',
      error: error.message,
    });
  }
};

// Xóa sản phẩm khỏi giỏ hàng
exports.removeCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.params;

    // Kiểm tra dữ liệu đầu vào
    if (!cart_item_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing parameter: cart_item_id is required.',
      });
    }

    // Kiểm tra cart item có tồn tại không
    const item = await cart_item.findOne({
      where: { cart_item_id },
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found.',
      });
    }

    // Xóa cart item
    await item.destroy();

    res.status(200).json({
      success: true,
      message: 'Cart item removed successfully.',
    });
  } catch (error) {
    logger.error(`Error removing cart item: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to remove cart item.',
      error: error.message,
    });
  }
};