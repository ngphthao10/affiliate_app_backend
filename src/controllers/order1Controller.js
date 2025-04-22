const { order, users, payment, sequelize,Sequelize, user_address, order_item, cart_session, cart_item, product_inventory,product } = require('../models/mysql');
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
const ensureUserAddress = async (userId, addressData, transaction) => {
  try {
    const { recipient_name, phone_num, address, city, country } = addressData;

    if (!recipient_name || !phone_num || !address) {
      throw new Error('Missing required address fields: recipient_name, phone_num, and address are required');
    }

    console.log('Checking user address for userId:', userId, 'with data:', addressData);

    // Kiểm tra user_id tồn tại
    const userExists = await users.findByPk(userId, { transaction });
    if (!userExists) {
      throw new Error(`User with user_id ${userId} does not exist`);
    }

    let userAddress = await user_address.findOne({
      where: {
        user_id: userId,
        recipient_name,
        phone_num,
        address,
        city: city || null,
        country: country || null,
      },
      transaction,
    });

    if (!userAddress) {
      console.log('Address not found, creating new address...');
      userAddress = await user_address.create(
        {
          user_id: userId,
          recipient_name,
          phone_num,
          address,
          city: city || null,
          country: country || null,
          is_default: false,
          creation_at: new Date(),
          modified_at: new Date(),
        },
        { transaction }
      );
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
const getCartItems = async (userId, transaction) => {
  try {
    console.log('Fetching cart session for user:', userId);
    const session = await cart_session.findOne({
      where: { user_id: userId },
      order: [['modified_at', 'DESC']],
      transaction,
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
          as: 'inventory',
          attributes: ['inventory_id', 'price', 'product_id'],
          include: [
            {
              model: product,
              as: 'product',
              attributes: ['name'],
            },
          ],
        },
      ],
      transaction,
    });
    console.log('Raw items data:', JSON.stringify(items, null, 2));

    const formattedItems = items.map(item => {
      if (!item.inventory) {
        throw new Error(`Invalid inventory_id: ${item.inventory_id}`);
      }
      return {
        inventory_id: item.inventory_id,
        name: item.inventory.product?.name || `Product ${item.inventory_id}`,
        price: item.inventory.price || 0,
        quantity: item.quantity,
      };
    });

    console.log(`Cart items for userId: ${userId}:`, formattedItems);
    return formattedItems;
  } catch (error) {
    logger.error(`Error fetching cart items for userId ${userId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Hàm xóa giỏ hàng của người dùng
const clearCart = async (userId, transaction) => {
  try {
    console.log('Clearing cart for user:', userId);

    // Kiểm tra user_id tồn tại
    const userExists = await users.findByPk(userId, { transaction });
    if (!userExists) {
      throw new Error(`User with user_id ${userId} does not exist`);
    }

    const latestSession = await cart_session.findOne({
      where: { user_id: userId },
      order: [['modified_at', 'DESC']],
      transaction,
    });

    if (latestSession) {
      console.log(`Clearing cart for userId: ${userId}, session_id: ${latestSession.session_id}, modified_at: ${latestSession.modified_at}`);

      await cart_item.destroy({
        where: { session_id: latestSession.session_id },
        transaction,
      });

      await cart_session.destroy({
        where: { session_id: latestSession.session_id },
        transaction,
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
const createOrderItems = async (orderId, items, orderStatus = 'pending', transaction) => {
  try {
    console.log('Starting createOrderItems:', { orderId, items, orderStatus });

    // Kiểm tra order_id tồn tại
    const orderExists = await order.findByPk(orderId, { transaction });
    if (!orderExists) {
      throw new Error(`Order with order_id ${orderId} does not exist`);
    }

    for (const item of items) {
      console.log('Processing item:', item);

      const inventoryExists = await product_inventory.findByPk(item.inventory_id, { transaction });
      if (!inventoryExists) {
        console.error('Invalid inventory_id:', item.inventory_id);
        throw new Error(`Invalid inventory_id: ${item.inventory_id}`);
      }
      console.log('Inventory found:', inventoryExists.toJSON());

      const newOrderItem = await order_item.create(
        {
          order_id: orderId,
          inventory_id: item.inventory_id,
          quantity: item.quantity || 1,
          link_id: item.link_id || null,
        },
        { transaction }
      );
      console.log('Created order_item:', newOrderItem.toJSON());
    }

    console.log('Calling update_inventory_on_order:', { orderId, orderStatus });
    await sequelize.query(
      'CALL update_inventory_on_order(:orderId, :orderStatus)',
      {
        replacements: { orderId, orderStatus },
        transaction,
      }
    );
    console.log('Stored procedure executed successfully');
  } catch (error) {
    console.error('Error in createOrderItems:', error.message);
    logger.error(`Error in createOrderItems: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Hàm tạo bản ghi trong bảng payment
const createPayment = async (orderId, amount, paymentMethod, transaction) => {
  try {
    console.log('Creating payment for order:', orderId, 'with transaction:', transaction);

    // Kiểm tra transaction
    if (!transaction) {
      console.warn('Transaction is undefined, proceeding without transaction');
    }

    // Kiểm tra order_id tồn tại
    const orderExists = await order.findByPk(orderId, { transaction });
    console.log('Order exists:', orderExists ? orderExists.toJSON() : null);
    if (!orderExists) {
      throw new Error(`Order with order_id ${orderId} does not exist`);
    }

    const newPayment = await payment.create(
      {
        order_id: orderId,
        amount,
        payment_method: paymentMethod,
        status: 'completed',
         // Thêm transaction_id nếu cần
      },
      { transaction }
    );
    console.log('Payment created:', newPayment.toJSON());

    return newPayment;
  } catch (error) {
    console.error('Error in createPayment:', error.message);
    logger.error(`Error in createPayment: ${error.message}`, { stack: error.stack });
    throw error;
  }
};
// Placing orders using COD Method
const placeOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user_id;
    const { address, amount } = req.body;

    console.log('Placing COD order with data:', { userId, amount, address });

    // Kiểm tra đầu vào
    if (!userId || !address) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId and address are required',
      });
    }

    // Kiểm tra định dạng address
    if (!address.recipient_name || !address.phone_num || !address.address) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required address fields: recipient_name, phone_num, and address are required',
      });
    }

    // Kiểm tra amount hợp lệ
    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid amount: amount must be greater than 0',
      });
    }

    // Lấy giỏ hàng của người dùng
    console.log('Fetching cart items for user:', userId);
    const items = await getCartItems(userId, transaction);
    if (items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }
    console.log('Cart items:', items);

    // Không kiểm tra amount mismatch, sử dụng amount từ client trực tiếp
    console.log('Using amount from client:', amount);

    // Kiểm tra hoặc tạo địa chỉ
    console.log('Ensuring user address:', address);
    const shippingAddressId = await ensureUserAddress(userId, address, transaction);
    console.log('Shipping address ID:', shippingAddressId);

    // Tạo đơn hàng
    console.log('Creating order for user:', userId);
    const newOrder = await order.create(
      {
        user_id: userId,
        total: amount, // Sử dụng amount từ client
        status: 'pending',
        shipping_address_id: shippingAddressId,
      },
      { transaction }
    );
    console.log('Order created with order_id:', newOrder.order_id);

    // Tạo các mục trong order_item
    console.log('Creating order items for order:', newOrder.order_id);
    await createOrderItems(newOrder.order_id, items, 'pending', transaction);
    console.log('Order items created successfully');

    // Tạo bản ghi trong bảng payment
    console.log('Creating payment for order:', newOrder.order_id);
    await createPayment(newOrder.order_id, amount, 'cod', transaction); // Sử dụng amount từ client
    console.log('Payment created successfully');

    // Xóa giỏ hàng của người dùng
    console.log('Clearing cart for user:', userId);
    await clearCart(userId, transaction);
    console.log('Cart cleared successfully');

    // Commit transaction
    await transaction.commit();
    console.log('Transaction committed successfully');

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      order_id: newOrder.order_id,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in placeOrder:', error.message, error.stack);
    logger.error(`Error placing COD order: ${error.message}`, {
      stack: error.stack,
      request: { userId: req.user_id, body: req.body },
    });

    // Xử lý lỗi cụ thể
    if (error.message.includes('Invalid inventory_id')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid inventory ID in cart items',
        error: error.message,
      });
    }
    if (error.message.includes('Insufficient inventory quantity')) {
      return res.status(400).json({
        success: false,
        message: 'Not enough stock available for one or more items',
        error: error.message,
      });
    }
    if (error.message.includes('Invalid order status')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status',
        error: error.message,
      });
    }
    if (error.message.includes('Missing required address fields')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message.includes('User with user_id') || error.message.includes('Order with order_id')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

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
    const userId = req.user_id;
    const { address, amount } = req.body;

    if (!userId || !address || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, address, and amount are required',
      });
    }

    if (!address.recipient_name || !address.phone_num || !address.address) {
      return res.status(400).json({
        success: false,
        message: 'Missing required address fields: recipient_name, phone_num, and address are required',
      });
    }

    // Kiểm tra giỏ hàng có sản phẩm không
    console.log('Fetching cart items for user:', userId);
    const items = await getCartItems(userId);
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }
    console.log('Cart items:', items);

    // Kiểm tra amount tối thiểu
    const minimumAmountUSD = 0.5;
    if (amount < minimumAmountUSD) {
      return res.status(400).json({
        success: false,
        message: `Total amount must be at least ${minimumAmountUSD} USD. Current amount: ${amount} USD`,
      });
    }

    // Tạo line_items với amount
    const line_items = [
      {
        price_data: {
          currency: currency,
          product_data: {
            name: 'Order Total (Products + Delivery)',
          },
          unit_amount: Math.round(amount * 100), // amount đã bao gồm phí giao hàng
        },
        quantity: 1,
      },
    ];

    console.log('Creating Stripe checkout session with amount:', amount);
    const session = await stripe.checkout.sessions.create({
      success_url: `${process.env.STRIPE_RETURN_URL}?success=true&user_id=${userId}`,
      cancel_url: `${process.env.STRIPE_RETURN_URL}?success=false&user_id=${userId}`,
      line_items,
      mode: 'payment',
      metadata: { user_id: userId.toString() },
    });

    res.status(200).json({
      success: true,
      session_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error('Error in placeOrderStripe:', error.message);
    logger.error(`Error placing Stripe order: ${error.message}`, { stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to initiate Stripe payment',
      error: error.message,
    });
  }
};

// Verify Stripe
const verifyStripe = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const user_id = req.user_id;
    const { sessionId, success, address, amount } = req.body;

    console.log('Verifying Stripe payment:', { user_id, sessionId, success, amount });

    if (!sessionId || !user_id || success === undefined || !address || amount === undefined) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, user_id, success, address, and amount are required',
      });
    }

    if (!address.recipient_name || !address.phone_num || !address.address) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required address fields: recipient_name, phone_num, and address are required',
      });
    }

    console.log('Retrieving Stripe session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata.user_id !== user_id.toString()) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Invalid session: user_id does not match',
      });
    }

    if (success === 'true' && session.payment_status === 'paid') {
      console.log('Fetching cart items for user:', user_id);
      const items = await getCartItems(user_id, transaction);
      if (items.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cart is empty',
        });
      }
      console.log('Cart items:', items);

      if (Math.abs(amount - session.amount_total / 100) > 0.01) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Provided amount ${amount} USD does not match Stripe session amount ${session.amount_total / 100} USD`,
        });
      }

      console.log('Ensuring user address:', address);
      const shippingAddressId = await ensureUserAddress(user_id, address, transaction);
      console.log('Shipping address ID:', shippingAddressId);

      console.log('Creating order for user:', user_id);
      const newOrder = await order.create(
        {
          user_id,
          total: amount,
          status: 'processing',
          shipping_address_id: shippingAddressId,
        },
        { transaction }
      );
      console.log('Order created with order_id:', newOrder.order_id);

      console.log('Creating order items for order:', newOrder.order_id);
      await createOrderItems(newOrder.order_id, items, 'processing', transaction);
      console.log('Order items created successfully');

      console.log('Creating payment for order:', newOrder.order_id);
      await createPayment(newOrder.order_id, amount, 'stripe', transaction);
      console.log('Payment created successfully');

      console.log('Clearing cart for user:', user_id);
      await clearCart(user_id, transaction);
      console.log('Cart cleared successfully');

      await transaction.commit();
      console.log('Transaction committed successfully');

      res.status(200).json({
        success: true,
        message: 'Payment verified and order created successfully',
        order_id: newOrder.order_id,
      });
    } else {
      await transaction.commit();
      res.status(200).json({
        success: false,
        message: 'Payment failed or session not paid, no order created',
      });
    }
  } catch (error) {
    await transaction.rollback();
    console.error('Error in verifyStripe:', error.message, error.stack);
    logger.error(`Error verifying Stripe payment: ${error.message}`, {
      stack: error.stack,
      request: { user_id: req.user_id, body: req.body },
    });

    if (error.message.includes('Insufficient inventory quantity')) {
      return res.status(400).json({
        success: false,
        message: 'Not enough stock available for one or more items',
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to verify payment and create order',
      error: error.message,
    });
  }
};
// Placing orders using MoMo Method
const placeOrderMomo = async (req, res) => {
  try {
    const userId = req.user_id;
    const { address, amount } = req.body;

    if (!userId || !address || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, address, and amount are required',
      });
    }

    if (!address.recipient_name || !address.phone_num || !address.address) {
      return res.status(400).json({
        success: false,
        message: 'Missing required address fields: recipient_name, phone_num, and address are required',
      });
    }

    // Lấy giỏ hàng để kiểm tra
    const items = await getCartItems(userId);
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Tính tổng tiền bằng USD và làm tròn
    const amountInUSD = Math.round(amount);

    // Kiểm tra amount tối thiểu (tương tự Stripe)
    const minimumAmountUSD = 0.5;
    if (amountInUSD < minimumAmountUSD) {
      return res.status(400).json({
        success: false,
        message: `Total amount must be at least ${minimumAmountUSD} USD. Current amount: ${amountInUSD} USD`,
      });
    }

    // Chuyển sang VND cho MoMo
    const amountInVND = amountInUSD * process.env.EXCHANGE_RATE;

    // Tạo requestId và orderId tạm
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const orderId = `MOMO-${userId}-${Date.now()}`;
    const requestId = partnerCode + new Date().getTime();

    const orderInfo = `Payment for order ${orderId}`;
    const extraData = Buffer.from(JSON.stringify({ userId })).toString('base64');
    const requestType = 'payWithMethod';
    const autoCapture = true;
    const lang = 'vi';

    // Tạo signature
    const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY}&amount=${amountInVND}&extraData=${extraData}&ipnUrl=${process.env.MOMO_NOTIFY_URL}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${process.env.MOMO_RETURN_URL}&requestId=${requestId}&requestType=${requestType}`;
    const signature = createSignature(rawSignature);

    const requestBody = {
      partnerCode,
      partnerName: 'Test',
      storeId: 'MomoTestStore',
      requestId,
      amount: amountInVND,
      orderId,
      orderInfo,
      redirectUrl: process.env.MOMO_RETURN_URL,
      ipnUrl: process.env.MOMO_NOTIFY_URL,
      lang,
      requestType,
      autoCapture,
      extraData,
      orderGroupId: '',
      signature,
    };

    const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/create', requestBody, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data.resultCode === 0) {
      res.status(200).json({
        success: true,
        paymentUrl: response.data.payUrl,
        orderId,
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
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user_id;
    const { orderId, address, amount } = req.body;

    // Kiểm tra đầu vào
    if (!userId || !orderId || !address || amount === undefined) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, orderId, address, and amount are required',
      });
    }

    if (!address.recipient_name || !address.phone_num || !address.address) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required address fields: recipient_name, phone_num, and address are required',
      });
    }

    // Lấy giỏ hàng
    const items = await getCartItems(userId, transaction);
    if (items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }
    console.log('Cart items:', items);

    // Tính tổng tiền bằng USD
    const amountInUSD = Math.round(amount);

    // Xác minh thanh toán MoMo
    const requestId = `${orderId}-${Date.now()}`;
    const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY}&orderId=${orderId}&partnerCode=${process.env.MOMO_PARTNER_CODE}&requestId=${requestId}`;
    const signature = createSignature(rawSignature);

    const checkStatusBody = {
      partnerCode: process.env.MOMO_PARTNER_CODE,
      requestId,
      orderId,
      lang: 'vi',
      signature,
    };
    console.log('MoMo check status body:', checkStatusBody);

    const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/query', checkStatusBody, {
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('MoMo response:', response.data);

    const orderInfo = response.data;
    if (orderInfo.resultCode !== 0 || orderInfo.message !== 'Thành công.') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Payment failed: ' + orderInfo.message,
      });
    }

    // Kiểm tra amount
    const amountInVND = amountInUSD * process.env.EXCHANGE_RATE;
    if (Math.abs(amountInVND - orderInfo.amount) > 100) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Provided amount ${amountInUSD} USD does not match MoMo amount ${orderInfo.amount / process.env.EXCHANGE_RATE} USD`,
      });
    }

    // Kiểm tra userId từ extraData
    let extraData;
    try {
      extraData = JSON.parse(Buffer.from(orderInfo.extraData, 'base64').toString());
      console.log('extraData:', extraData);
    } catch (error) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid extraData format',
        error: error.message,
      });
    }

    if (extraData.userId !== userId) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Invalid user: userId does not match',
      });
    }

    // Tạo địa chỉ
    console.log('Ensuring user address:', address);
    const shippingAddressId = await ensureUserAddress(userId, address, transaction);
    console.log('Shipping address ID:', shippingAddressId);

    // Tạo đơn hàng
    console.log('Creating order for user:', userId);
    const newOrder = await order.create(
      {
        user_id: userId,
        total: amountInUSD,
        status: 'processing',
        shipping_address_id: shippingAddressId,
      },
      { transaction }
    );
    console.log('Order created with order_id:', newOrder.order_id);

    // Tạo order items
    console.log('Creating order items for order:', newOrder.order_id);
    await createOrderItems(newOrder.order_id, items, 'processing', transaction);
    console.log('Order items created successfully');

    // Tạo payment
    console.log('Creating payment for order:', newOrder.order_id);
    await createPayment(newOrder.order_id, amountInUSD, 'momo', transaction);
    console.log('Payment created successfully');

    // Xóa giỏ hàng
    console.log('Clearing cart for user:', userId);
    await clearCart(userId, transaction);
    console.log('Cart cleared successfully');

    await transaction.commit();
    console.log('Transaction committed successfully');

    res.status(200).json({
      success: true,
      message: 'Payment successful',
      order_id: newOrder.order_id,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error verifying MoMo payment:', error.message);
    logger.error(`Error verifying MoMo payment: ${error.message}`, { stack: error.stack });
    if (error.message.includes('Insufficient inventory quantity')) {
      return res.status(400).json({
        success: false,
        message: 'Not enough stock available for one or more items',
        error: error.message,
      });
    }
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
    const userId =req.user_id

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
const getOrderItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user_id; // Từ middleware customerAuth

    const orderItems = await order_item.findAll({
      where: { order_id: orderId },
      include: [
        {
          model: product_inventory,
          as: 'inventory',
          include: [
            {
              model: product,
              as: 'product',
              attributes: ['name', 'small_image'], // Sử dụng small_image thay vì image
            },
          ],
        },
      ],
    });

    if (!orderItems || orderItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No items found for this order',
      });
    }

    console.log('Order Items:', JSON.stringify(orderItems, null, 2));

    const formattedItems = orderItems.map((item) => ({
      name: item.inventory.product.name,
      image: item.inventory.product.small_image ? [item.inventory.product.small_image] : [], // Đảm bảo image là mảng
      price: item.inventory.price, // Lấy price từ product_inventory
      quantity: item.quantity,
      size: item.inventory.size, // Lấy size từ product_inventory
    }));

    res.status(200).json({
      success: true,
      items: formattedItems,
    });
  } catch (error) {
    console.error('Error fetching order items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order items',
      error: error.message,
    });
  }
};

// Định nghĩa route
module.exports = {
  placeOrder,
  placeOrderStripe,
  verifyStripe,
  placeOrderMomo,
  verifyMomo,
  allOrders,
  userOrders,
  updateStatus,getOrderItems
};