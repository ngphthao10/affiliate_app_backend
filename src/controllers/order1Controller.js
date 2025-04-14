const { order, users, payment, Sequelize, user_address, order_item, cart_session, cart_item, product_inventory } = require('../models/mysql');
const logger = require('../utils/logger');
const Stripe = require('stripe');
const axios = require('axios');
const crypto = require('crypto');
const Op = Sequelize.Op;

// Global variables
const currency = 'usd';
const deliveryCharge = 1;

// Gateway initialize
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Hàm tạo chữ ký (signature) cho MoMo
const createSignature = (rawData) => {
  return crypto
    .createHmac('sha256', process.env.MOMO_SECRET_KEY)
    .update(rawData)
    .digest('hex');
};

// Hàm kiểm tra hoặc tạo địa chỉ trong bảng user_address
const ensureUserAddress = async (userId, addressData) => {
  try {
    const { recipient_name, phone_num, address, city, country } = addressData;

    if (!recipient_name || !phone_num || !address) {
      throw new Error('Missing required address fields: recipient_name, phone_num, and address are required');
    }

    console.log('Checking user address for userId:', userId, 'with data:', addressData);

    let userAddress = await user_address.findOne({
      where: {
        user_id: userId,
        recipient_name: recipient_name,
        phone_num: phone_num,
        address: address,
        city: city || '',
        country: country || '',
      },
    });

    if (!userAddress) {
      console.log('Address not found, creating new address...');
      userAddress = await user_address.create({
        user_id: userId,
        recipient_name: recipient_name,
        phone_num: phone_num,
        address: address,
        city: city || null,
        country: country || null,
        is_default: false,
        creation_at: new Date(),
        modified_at: new Date(),
      });
      console.log('New address created with address_id:', userAddress.address_id);
    } else {
      console.log('Address found with address_id:', userAddress.address_id);
    }

    if (!userAddress.address_id) {
      throw new Error('Failed to create or retrieve address_id');
    }

    return userAddress.address_id;
  } catch (error) {
    logger.error(`Error in ensureUserAddress: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Hàm lấy giỏ hàng của người dùng từ cart_session và cart_item
const getCartItems = async (userId) => {
    try {
      // Tìm cart_session có modified_at mới nhất
      const session = await cart_session.findOne({
        where: { user_id: userId },
        order: [['modified_at', 'DESC']], // Sắp xếp theo modified_at giảm dần để lấy bản ghi mới nhất
      });
  
      if (!session) {
        console.log(`No cart session found for userId: ${userId}`);
        return [];
      }
  
      console.log(`Found latest cart session for userId: ${userId}, session_id: ${session.session_id}, modified_at: ${session.modified_at}`);
  
      const items = await cart_item.findAll({
        where: { session_id: session.session_id },
        include: [
          {
            model: product_inventory,
            as: 'inventory', // Sửa alias để khớp với mối quan hệ đã định nghĩa
            attributes: ['inventory_id', 'price'],
          },
        ],
      });
      console.log('Raw items data:', JSON.stringify(items, null, 2));
      const formattedItems = items.map(item => ({
        inventory_id: item.inventory_id,
        name: `Product ${item.inventory_id}`, // Thay bằng tên thực tế từ product_inventory nếu có
        price: item.inventory?.price || 0, // Giả sử price được lấy từ product_inventory
        quantity: item.quantity,
      }));
  
      console.log(`Cart items for userId: ${userId}:`, formattedItems);
      return formattedItems;
    } catch (error) {
      logger.error(`Error fetching cart items for userId ${userId}: ${error.message}`, { stack: error.stack });
      throw error;
    }
  };

// Hàm xóa giỏ hàng của người dùng
const clearCart = async (userId) => {
    try {
      // Tìm cart_session có modified_at mới nhất
      const latestSession = await cart_session.findOne({
        where: { user_id: userId },
        order: [['modified_at', 'DESC']], // Sắp xếp theo modified_at giảm dần để lấy bản ghi mới nhất
      });
  
      if (latestSession) {
        console.log(`Clearing cart for userId: ${userId}, session_id: ${latestSession.session_id}, modified_at: ${latestSession.modified_at}`);
  
        // Xóa các mục trong cart_item liên quan đến session này
        await cart_item.destroy({
          where: { session_id: latestSession.session_id },
        });
  
        // Xóa cart_session có modified_at mới nhất
        await cart_session.destroy({
          where: { session_id: latestSession.session_id },
        });
  
        console.log(`Cart cleared successfully for session_id: ${latestSession.session_id}`);
      } else {
        console.log(`No cart session found for userId: ${userId}`);
      }
    } catch (error) {
      logger.error(`Error clearing cart for userId ${userId}: ${error.message}`, { stack: error.stack });
      throw error;
    }
  };

// Hàm tạo các bản ghi trong bảng order_item
const createOrderItems = async (orderId, items) => {
  for (const item of items) {
    const inventoryExists = await product_inventory.findByPk(item.inventory_id);
    if (!inventoryExists) {
      throw new Error(`Invalid inventory_id: ${item.inventory_id}`);
    }

    await order_item.create({
      order_id: orderId,
      inventory_id: item.inventory_id,
      quantity: item.quantity || 1,
      link_id: item.link_id || null,
    });
  }
};

// Hàm tạo bản ghi trong bảng payment
const createPayment = async (orderId, amount, paymentMethod) => {
  await payment.create({
    order_id: orderId,
    amount: amount,
    payment_method: paymentMethod,
    status: 'pending',
  });
};

// Placing orders using COD Method
const placeOrder = async (req, res) => {
  try {
    const { userId, address } = req.body;

    if (!userId || !address) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId and address are required',
      });
    }

    // Lấy giỏ hàng của người dùng
    const items = await getCartItems(userId);
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Tính tổng tiền
    const amount = items.reduce((total, item) => total + (item.price * item.quantity), 0) + deliveryCharge;

    console.log('Placing COD order with data:', { userId, items, amount, address });

    // Kiểm tra hoặc tạo địa chỉ
    const shippingAddressId = await ensureUserAddress(userId, address);
    console.log('Shipping address ID:', shippingAddressId);

    // Tạo đơn hàng
    const newOrder = await order.create({
      user_id: userId,
      total: amount,
      status: 'pending',
      shipping_address_id: shippingAddressId,
    });

    console.log('Order created with order_id:', newOrder.order_id);

    // Tạo các mục trong order_item
    await createOrderItems(newOrder.order_id, items);

    // Tạo bản ghi trong bảng payment
    await createPayment(newOrder.order_id, amount, 'COD');

    // Xóa giỏ hàng của người dùng
    await clearCart(userId);

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      order_id: newOrder.order_id,
    });
  } catch (error) {
    logger.error(`Error placing COD order: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to place order',
      error: error.message,
    });
  }
};

// Placing orders using Stripe Method
const placeOrderStripe = async (req, res) => {
    try {
      const { userId, address } = req.body;
      const { origin } = req.headers;
  
      if (!userId || !address || !origin) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: userId, address, and origin are required',
        });
      }
  
      // Lấy giỏ hàng của người dùng
      const items = await getCartItems(userId);
      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty',
        });
      }
  
      // Tính tổng tiền (ở đây tính bằng USD vì giá trong product_inventory là USD)
      const amount = items.reduce((total, item) => total + (item.price * item.quantity), 0) + deliveryCharge;
      console.log(`Calculated amount for userId ${userId}: ${amount} USD`);
  
      // Kiểm tra tổng số tiền có đủ lớn không (Stripe yêu cầu ít nhất 0.5 USD)
      const minimumAmountUSD = 0.5; // Tối thiểu 0.5 USD
      if (amount < minimumAmountUSD) {
        return res.status(400).json({
          success: false,
          message: `Total amount must be at least ${minimumAmountUSD} USD. Current amount: ${amount} USD`,
        });
      }
  
      // Kiểm tra hoặc tạo địa chỉ
      const shippingAddressId = await ensureUserAddress(userId, address);
      // Tạo đơn hàng
      const newOrder = await order.create({
        user_id: userId,
        total: amount, // Lưu ý: total ở đây là USD
        status: 'pending',
        shipping_address_id: shippingAddressId,
      });
  
      // Tạo các mục trong order_item
      await createOrderItems(newOrder.order_id, items);
  
      // Tạo bản ghi trong bảng payment
      await createPayment(newOrder.order_id, amount, 'stripe');
  
      // Chuẩn bị line items cho Stripe
      const line_items = items.map((item) => ({
        price_data: {
          currency: currency, // Sử dụng 'usd'
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100), // Nhân với 100 vì USD yêu cầu cent
        },
        quantity: item.quantity,
      }));
  
      line_items.push({
        price_data: {
          currency: currency,
          product_data: {
            name: 'Delivery Charges',
          },
          unit_amount: Math.round(deliveryCharge * 100), // Nhân với 100 vì USD
        },
        quantity: 1,
      });
  
      // Tạo phiên Stripe
      const session = await stripe.checkout.sessions.create({
        success_url: `${origin}/verify?success=true&orderId=${newOrder.order_id}&user_id=${userId}`,
      cancel_url: `${origin}/verify?success=false&orderId=${newOrder.order_id}&user_id=${userId}`,
        line_items,
        mode: 'payment',
      });
  
      res.status(200).json({
        success: true,
        session_url: session.url,
      });
    } catch (error) {
      logger.error(`Error placing Stripe order: ${error.message}`, { stack: error.stack });
      res.status(500).json({
        success: false,
        message: 'Failed to place order with Stripe',
        error: error.message,
      });
    }
  };

// Verify Stripe
const verifyStripe = async (req, res) => {
  try {
    // Lấy orderId, success và user_id từ req.query
    const { orderId, success, user_id } = req.query;

    // Kiểm tra dữ liệu đầu vào
    if (!orderId || !user_id || success === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId, user_id, and success are required',
      });
    }
    // Tìm đơn hàng và kiểm tra xem nó có thuộc về user_id không
    const orderDetails = await order.findOne({
      where: {
        order_id: orderId,
        user_id: user_id, // Đảm bảo đơn hàng thuộc về user_id
      },
    });

    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or does not belong to this user',
      });
    }

    const paymentDetails = await payment.findOne({ where: { order_id: orderId } });
    if (!paymentDetails) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    if (success === 'true') {
      await orderDetails.update({
        status: 'processing',
        modified_at: new Date(),
      });
      await paymentDetails.update({
        status: 'completed',
        modified_at: new Date(),
      });

      // Xóa giỏ hàng của người dùng
      await clearCart(user_id);

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
      });
    } else {
      await paymentDetails.update({
        status: 'failed',
        modified_at: new Date(),
      });
      await orderDetails.destroy();

      res.status(200).json({
        success: false,
        message: 'Payment failed, order cancelled',
      });
    }
  } catch (error) {
    logger.error(`Error verifying Stripe payment: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message,
    });
  }
};
// Placing orders using MoMo Method
const placeOrderMomo = async (req, res) => {
  try {
    const { userId, address } = req.body;

    if (!userId || !address) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId and address are required',
      });
    }

    // Lấy giỏ hàng của người dùng
    const items = await getCartItems(userId);
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Tính tổng tiền bằng USD và làm tròn
    const amountInUSD = Math.round(items.reduce((total, item) => total + (item.price * item.quantity), 0) + deliveryCharge);

    // Chuyển sang VND để gửi cho MoMo
   // 1 USD = 25,000 VND
    const amountInVND = amountInUSD * process.env.EXCHANGE_RATE;

    // Kiểm tra hoặc tạo địa chỉ
    const shippingAddressId = await ensureUserAddress(userId, address);

    // Tạo đơn hàng (lưu total bằng USD)
    const newOrder = await order.create({
      user_id: userId,
      total: amountInUSD, // Lưu bằng USD
      status: 'pending',
      shipping_address_id: shippingAddressId,
    });
    const creationTime = new Date();
    console.log('Creation time before saving:', creationTime.toString());

    // Tạo các mục trong order_item
    await createOrderItems(newOrder.order_id, items);

    // Tạo bản ghi trong bảng payment (lưu amount bằng USD)
    await createPayment(newOrder.order_id, amountInUSD, 'momo');

    // Tạo requestId và orderId
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const orderId = `${newOrder.order_id}-${Date.now()}`; // Tạo orderId duy nhất
    const requestId = partnerCode + new Date().getTime();

    const orderInfo = `Payment for order ${orderId}`;
    const extraData = '';
    const requestType = 'captureWallet';
    const autoCapture = true;
    const lang = 'vi';

    // Tạo signature với amountInVND
    const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY}&amount=${amountInVND}&extraData=${extraData}&ipnUrl=${process.env.MOMO_NOTIFY_URL}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${process.env.MOMO_RETURN_URL}&requestId=${requestId}&requestType=${requestType}`;
    const signature = createSignature(rawSignature);

    const requestBody = {
      partnerCode: partnerCode,
      partnerName: "Test",
      storeId: "MomoTestStore",
      requestId: requestId,
      amount: amountInVND,
      orderId: orderId,
      orderInfo: orderInfo,
      redirectUrl: process.env.MOMO_RETURN_URL,
      ipnUrl: process.env.MOMO_NOTIFY_URL,
      lang: lang,
      requestType: requestType,
      autoCapture: autoCapture,
      extraData: extraData,
      orderGroupId: '',
      signature: signature,
    };

    console.log('MoMo requestBody:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/create', requestBody, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data.resultCode === 0) {
      res.status(200).json({
        success: true,
        paymentUrl: response.data.payUrl,
      });
    } else {
      logger.error(`Error creating MoMo order: ${response.data.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to create MoMo order',
        error: response.data.message,
      });
    }
  } catch (error) {
    logger.error(`Error placing MoMo order: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to place order with MoMo',
      error: error.message,
    });
  }
};
// Verify MoMo
const verifyMomo = async (req, res) => {
  try {
    const { userId, orderId } = req.body;

    if (!userId || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId and orderId are required',
      });
    }

    const orderDetails = await order.findByPk(orderId);
    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const paymentDetails = await payment.findOne({ where: { order_id: orderId } });
    if (!paymentDetails) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    const requestId = `${orderId}-${Date.now()}`;
    const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY}&orderId=${orderId}&partnerCode=${process.env.MOMO_PARTNER_CODE}&requestId=${requestId}`;
    const signature = createSignature(rawSignature);

    const checkStatusBody = {
      partnerCode: process.env.MOMO_PARTNER_CODE,
      requestId: requestId,
      orderId: orderId,
      lang: "vi",
      signature: signature,
    };

    const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/query', checkStatusBody, {
      headers: { 'Content-Type': 'application/json' },
    });

    const orderInfo = response.data;
    if (orderInfo.resultCode === 0 && orderInfo.status === 'SUCCESS') {
      await orderDetails.update({
        status: 'processing',
        modified_at: new Date(),
      });
      await paymentDetails.update({
        status: 'completed',
        modified_at: new Date(),
      });

      // Xóa giỏ hàng
      await clearCart(userId);

      res.status(200).json({
        success: true,
        message: 'Payment successful',
      });
    } else {
      await paymentDetails.update({
        status: 'failed',
        modified_at: new Date(),
      });

      res.status(200).json({
        success: false,
        message: 'Payment failed',
      });
    }
  } catch (error) {
    logger.error(`Error verifying MoMo payment: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message,
    });
  }
};

// All Orders data for Admin Panel
const allOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      payment_status,
      start_date,
      end_date,
      sort_by = 'creation_at',
      sort_order = 'DESC',
    } = req.query;

    const whereConditions = {};

    if (search) {
      whereConditions[Op.or] = [
        { order_id: { [Op.like]: `%${search}%` } },
        { '$user.username$': { [Op.like]: `%${search}%` } },
        { '$user.email$': { [Op.like]: `%${search}%` } },
      ];
    }

    if (status && status !== 'All Statuses') {
      whereConditions.status = status.toLowerCase();
    }

    if (payment_status && payment_status !== 'All Payment Statuses') {
      whereConditions.payment_status = payment_status.toLowerCase();
    }

    if (start_date && end_date) {
      whereConditions.creation_at = {
        [Op.between]: [new Date(start_date), new Date(end_date)],
      };
    }

    const offset = (page - 1) * limit;

    const totalOrdersCount = await order.count({
      where: whereConditions,
      include: [
        {
          model: users,
          as: 'user',
          attributes: ['username', 'email'],
        },
      ],
    });

    const validSortFields = ['order_id', 'creation_at', 'total', 'status'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'creation_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const orders = await order.findAll({
      where: whereConditions,
      include: [
        {
          model: users,
          as: 'user',
          attributes: ['username', 'email', 'phone_num'],
        },
        {
          model: payment,
          as: 'payments',
          attributes: ['payment_method', 'status', 'amount'],
          order: [['creation_at', 'DESC']],
          limit: 1,
        },
      ],
      order: [[sortField, sortDirection]],
      limit: parseInt(limit, 10),
      offset: offset,
    });

    const formattedOrders = orders.map((order) => ({
      id: order.order_id,
      customer: {
        name: order.user.username,
        email: order.user.email,
        phone: order.user.phone_num,
      },
      total: parseFloat(order.total),
      status: order.status,
      payment_status: order.payments[0]?.status || 'pending',
      payment_method: order.payments[0]?.payment_method,
      created_at: order.creation_at,
      updated_at: order.modified_at,
    }));

    res.status(200).json({
      success: true,
      orders: formattedOrders,
      pagination: {
        total: totalOrdersCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(totalOrdersCount / limit),
      },
    });
  } catch (error) {
    logger.error(`Error listing all orders: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
};

// User Order Data For Frontend
const userOrders = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: userId is required',
      });
    }

    const orders = await order.findAll({
      where: { user_id: userId },
      include: [
        {
          model: users,
          as: 'user',
          attributes: ['username', 'email', 'phone_num'],
        },
        {
          model: payment,
          as: 'payments',
          attributes: ['payment_method', 'status', 'amount'],
          order: [['creation_at', 'DESC']],
          limit: 1,
        },
      ],
      order: [['creation_at', 'DESC']],
    });

    const formattedOrders = orders.map((order) => ({
      id: order.order_id,
      customer: {
        name: order.user.username,
        email: order.user.email,
        phone: order.user.phone_num,
      },
      total: parseFloat(order.total),
      status: order.status,
      payment_status: order.payments[0]?.status || 'pending',
      payment_method: order.payments[0]?.payment_method,
      created_at: order.creation_at,
      updated_at: order.modified_at,
    }));

    res.status(200).json({
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    logger.error(`Error fetching user orders: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user orders',
      error: error.message,
    });
  }
};

// Update order status from Admin Panel
const updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId and status are required',
      });
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status',
      });
    }

    const orderDetails = await order.findByPk(orderId);
    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    await orderDetails.update({
      status: status,
      modified_at: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
    });
  } catch (error) {
    logger.error(`Error updating order status: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message,
    });
  }
};

module.exports = {
  placeOrder,
  placeOrderStripe,
  verifyStripe,
  placeOrderMomo,
  verifyMomo,
  allOrders,
  userOrders,
  updateStatus,
};