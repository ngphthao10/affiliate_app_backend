const { order, users, payment, sequelize, Sequelize, user_address, order_item, cart_session, cart_item, product_inventory, product } = require('../models/mysql');
const logger = require('../utils/logger');
// const Stripe = require('stripe');
const axios = require('axios');
const crypto = require('crypto');
const Op = Sequelize.Op;

// Global variables
const currency = 'usd';
const deliveryCharge = 1;

// Gateway initialize
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Hàm tạo chữ ký (signature) cho MoMo
const createSignature = (rawData) => {
  return crypto
    .createHmac('sha256', process.env.MOMO_SECRET_KEY)
    .update(rawData)
    .digest('hex');
};

const getCartItems = async (userId, transaction) => {
  try {
    const session = await cart_session.findOne({
      where: { user_id: userId },
      order: [['modified_at', 'DESC']],
      transaction,
    });

    if (!session) {
      return [];
    }

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

    const formattedItems = items.map(item => {
      if (!item.inventory) {
        throw new Error(`Invalid inventory_id: ${item.inventory_id}`);
      }
      return {
        inventory_id: item.inventory_id,
        name: item.inventory.product?.name || `Product ${item.inventory_id}`,
        price: item.inventory.price || 0,
        quantity: item.quantity,
        product_id: item.inventory.product_id
      };
    });

    return formattedItems;
  } catch (error) {
    logger.error(`Error fetching cart items for userId ${userId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Hàm xóa giỏ hàng của người dùng
const clearCart = async (userId, transaction) => {
  try {

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

      await cart_item.destroy({
        where: { session_id: latestSession.session_id },
        transaction,
      });

      await cart_session.destroy({
        where: { session_id: latestSession.session_id },
        transaction,
      });

    }
  } catch (error) {
    logger.error(`Error clearing cart for userId ${userId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Hàm kiểm tra hoặc tạo địa chỉ trong bảng user_address
const ensureUserAddress = async (userId, addressData, transaction) => {
  try {
    const { recipient_name, phone_num, address, city, country } = addressData;

    if (!recipient_name || !phone_num || !address) {
      throw new Error('Missing required address fields: recipient_name, phone_num, and address are required');
    }


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
    } else {
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

const createOrderItems = async (orderId, items, orderStatus = 'pending', transaction, req, res) => {
  try {
    // Validate order exists
    const orderExists = await order.findByPk(orderId, { transaction });
    if (!orderExists) {
      throw new Error(`Order with order_id ${orderId} does not exist`);
    }

    // Get all affiliate links from cookies
    const affiliateLinks = getAffiliateInfo(req);
    const usedAffiliateProductIds = new Set(); // Track which product IDs were used

    console.log(`Processing ${items.length} order items with ${affiliateLinks ? affiliateLinks.length : 0} affiliate links`);

    // Create a map of product_id to the most recent affiliate link
    const mostRecentAffiliatesByProduct = {};
    if (affiliateLinks) {
      affiliateLinks.forEach(link => {
        const productId = Number(link.product_id);

        // If this product doesn't have an affiliate yet, or if this click is more recent
        if (!mostRecentAffiliatesByProduct[productId] ||
          link.clickTime > mostRecentAffiliatesByProduct[productId].clickTime) {
          mostRecentAffiliatesByProduct[productId] = link;
        }
      });
    }

    // Process each order item
    for (const item of items) {
      const inventoryExists = await product_inventory.findByPk(item.inventory_id, { transaction });
      if (!inventoryExists) {
        throw new Error(`Invalid inventory_id: ${item.inventory_id}`);
      }

      // Find the most recent affiliate link for this product
      const productId = Number(item.product_id);
      const matchingAffiliate = mostRecentAffiliatesByProduct[productId];

      console.log(`Item product_id: ${productId}, Matching affiliate:`, matchingAffiliate);

      // Create order_item with link_id if the product was purchased through an affiliate link
      const newOrderItem = await order_item.create(
        {
          order_id: orderId,
          inventory_id: item.inventory_id,
          quantity: item.quantity || 1,
          link_id: matchingAffiliate ? matchingAffiliate.link_id : null
        },
        { transaction }
      );

      // Just store the affiliate info, no KOL stats update
      if (matchingAffiliate) {
        console.log(`Stored affiliate link for influencer ${matchingAffiliate.influencer_id}, product ${productId}`);
        usedAffiliateProductIds.add(productId); // Mark this product ID as used
      }
    }

    // Update inventory
    await sequelize.query(
      'CALL update_inventory_on_order(:orderId, :orderStatus)',
      {
        replacements: { orderId, orderStatus },
        transaction,
      }
    );

    // Selectively remove only the used affiliate links from cookies
    if (usedAffiliateProductIds.size > 0 && res) {
      updateAffiliateInfoCookies(req, res, usedAffiliateProductIds);
    }
  } catch (error) {
    logger.error(`Error in createOrderItems: ${error.message}`, { stack: error.stack });
    throw error;
  }
};
// New function to selectively update the affiliate cookies
const updateAffiliateInfoCookies = (req, res, usedProductIds) => {
  try {
    if (!req.cookies || !req.cookies.affiliate_links) {
      return;
    }

    let affiliateLinks;
    try {
      affiliateLinks = JSON.parse(req.cookies.affiliate_links);
    } catch (error) {
      logger.error(`Error parsing affiliate_links cookie: ${error.message}`);
      return;
    }

    // Filter out the used product IDs
    const updatedLinks = affiliateLinks.filter(link =>
      !usedProductIds.has(Number(link.productId))
    );

    console.log(`Removing ${affiliateLinks.length - updatedLinks.length} used affiliate links from cookies`);

    // Calculate the expiration date (same as in trackingController.js)
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const cookieOptions = {
      maxAge: TWO_WEEKS,
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    };

    // Set the updated cookie
    if (updatedLinks.length > 0) {
      res.cookie('affiliate_links', JSON.stringify(updatedLinks), cookieOptions);
    } else {
      // If no links left, clear the cookie
      res.cookie('affiliate_links', '', {
        expires: new Date(0),
        path: '/'
      });
    }
  } catch (error) {
    logger.error(`Error updating affiliate cookies: ${error.message}`, { stack: error.stack });
  }
};

// Updated getAffiliateInfo to include clickTime in the returned data
const getAffiliateInfo = (req) => {
  try {
    if (!req.cookies || !req.cookies.affiliate_links) {
      console.log("No affiliate_links cookie found");
      return null;
    }

    console.log("Found affiliate_links cookie:", req.cookies.affiliate_links);

    let affiliateInfoArray;
    try {
      affiliateInfoArray = JSON.parse(req.cookies.affiliate_links);
    } catch (parseError) {
      console.log("Failed to parse affiliate_links JSON:", parseError.message);
      return null;
    }

    if (!Array.isArray(affiliateInfoArray) || affiliateInfoArray.length === 0) {
      console.log("Affiliate info is not a valid array or is empty");
      return null;
    }

    // Return the entire array with all needed properties including clickTime
    const validLinks = affiliateInfoArray.filter(link =>
      link && link.linkId && link.productId && link.influencerId && link.clickTime
    );

    if (validLinks.length === 0) {
      console.log("No valid affiliate links found");
      return null;
    }

    console.log(`Found ${validLinks.length} valid affiliate links`);

    return validLinks.map(link => ({
      link_id: link.linkId,
      product_id: link.productId,
      influencer_id: link.influencerId,
      clickTime: link.clickTime
    }));
  } catch (error) {
    console.log("Error in getAffiliateInfo:", error.message);
    return null;
  }
};



// Hàm tạo bản ghi trong bảng payment
const createPayment = async (orderId, amount, paymentMethod, transaction) => {
  try {
    // Kiểm tra transaction
    if (!transaction) {
      console.warn('Transaction is undefined, proceeding without transaction');
    }

    // Kiểm tra order_id tồn tại
    const orderExists = await order.findByPk(orderId, { transaction });
    if (!orderExists) {
      throw new Error(`Order with order_id ${orderId} does not exist`);
    }
    const status = paymentMethod === 'cod' ? 'pending' : 'completed';
    const newPayment = await payment.create(
      {
        order_id: orderId,
        amount,
        payment_method: paymentMethod,
        status,
        // Thêm transaction_id nếu cần
      },
      { transaction }
    );

    return newPayment;
  } catch (error) {
    console.error('Error in createPayment:', error.message);
    logger.error(`Error in createPayment: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Sửa hàm placeOrder để truyền res vào createOrderItems
const placeOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user_id;
    const { address, amount } = req.body;

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
    const items = await getCartItems(userId, transaction);
    if (items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Kiểm tra hoặc tạo địa chỉ
    const shippingAddressId = await ensureUserAddress(userId, address, transaction);

    // Tạo đơn hàng
    const newOrder = await order.create(
      {
        user_id: userId,
        total: amount,
        status: 'pending',
        shipping_address_id: shippingAddressId,
      },
      { transaction }
    );

    // Trong các route handler (placeOrder, verifyStripe, verifyMomo)
    await createOrderItems(newOrder.order_id, items, 'pending', transaction, req, res);

    // Tạo bản ghi trong bảng payment
    await createPayment(newOrder.order_id, amount, 'cod', transaction);

    // Xóa giỏ hàng của người dùng
    await clearCart(userId, transaction);

    // Commit transaction
    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      order_id: newOrder.order_id,
    });
  } catch (error) {
    await transaction.rollback();
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

// Cập nhật hàm placeOrderStripe để thêm thông tin affiliate vào metadata
// const placeOrderStripe = async (req, res) => {
//   try {
//     const userId = req.user_id;
//     const { address, amount } = req.body;

//     if (!userId || !address || amount === undefined) {
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required fields: userId, address, and amount are required',
//       });
//     }

//     if (!address.recipient_name || !address.phone_num || !address.address) {
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required address fields: recipient_name, phone_num, and address are required',
//       });
//     }

//     // Kiểm tra giỏ hàng có sản phẩm không
//     const items = await getCartItems(userId);
//     if (items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Cart is empty',
//       });
//     }

//     // Kiểm tra amount tối thiểu
//     const minimumAmountUSD = 0.5;
//     if (amount < minimumAmountUSD) {
//       return res.status(400).json({
//         success: false,
//         message: `Total amount must be at least ${minimumAmountUSD} USD. Current amount: ${amount} USD`,
//       });
//     }

//     // Lấy thông tin affiliate từ cookies
//     const affiliateInfo = getAffiliateInfo(req);

//     // Thêm thông tin vào metadata
//     const metadata = {
//       user_id: userId.toString()
//     };

//     if (affiliateInfo) {
//       metadata.affiliate_info = JSON.stringify(affiliateInfo);
//     }

//     // Tạo line_items với amount
//     const line_items = [
//       {
//         price_data: {
//           currency: currency,
//           product_data: {
//             name: 'Order Total (Products + Delivery)',
//           },
//           unit_amount: Math.round(amount * 100), // amount đã bao gồm phí giao hàng
//         },
//         quantity: 1,
//       },
//     ];

//     const session = await stripe.checkout.sessions.create({
//       success_url: `${process.env.STRIPE_RETURN_URL}?success=true&user_id=${userId}`,
//       cancel_url: `${process.env.STRIPE_RETURN_URL}?success=false&user_id=${userId}`,
//       line_items,
//       mode: 'payment',
//       metadata: metadata,
//     });

//     res.status(200).json({
//       success: true,
//       session_url: session.url,
//       session_id: session.id,
//     });
//   } catch (error) {
//     logger.error(`Error placing Stripe order: ${error.message}`, { stack: error.stack });
//     res.status(500).json({
//       success: false,
//       message: 'Failed to initiate Stripe payment',
//       error: error.message,
//     });
//   }
// };

// Sửa verifyStripe để xử lý thông tin affiliate từ metadata
// const verifyStripe = async (req, res) => {
//   const transaction = await sequelize.transaction();
//   try {
//     const user_id = req.user_id;
//     const { sessionId, success, address, amount } = req.body;

//     if (!sessionId || !user_id || success === undefined || !address || amount === undefined) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required fields: sessionId, user_id, success, address, and amount are required',
//       });
//     }

//     if (!address.recipient_name || !address.phone_num || !address.address) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required address fields: recipient_name, phone_num, and address are required',
//       });
//     }

//     const session = await stripe.checkout.sessions.retrieve(sessionId);
//     if (session.metadata.user_id !== user_id.toString()) {
//       await transaction.rollback();
//       return res.status(403).json({
//         success: false,
//         message: 'Invalid session: user_id does not match',
//       });
//     }

//     if (success === 'true' && session.payment_status === 'paid') {
//       const items = await getCartItems(user_id, transaction);
//       if (items.length === 0) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Cart is empty',
//         });
//       }

//       if (Math.abs(amount - session.amount_total / 100) > 0.01) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Provided amount ${amount} USD does not match Stripe session amount ${session.amount_total / 100} USD`,
//         });
//       }

//       const shippingAddressId = await ensureUserAddress(user_id, address, transaction);

//       const newOrder = await order.create(
//         {
//           user_id,
//           total: amount,
//           status: 'processing',
//           shipping_address_id: shippingAddressId,
//         },
//         { transaction }
//       );

//       // Thêm affiliate info từ metadata vào request
//       if (session.metadata.affiliate_info) {
//         try {
//           // Tạo cookies tạm thời để sử dụng cùng function createOrderItems
//           req.cookies = req.cookies || {};
//           req.cookies.affiliate_info = encodeURIComponent(session.metadata.affiliate_info);
//         } catch (e) {
//           logger.error(`Error processing affiliate info from Stripe: ${e.message}`);
//         }
//       }

//       await createOrderItems(newOrder.order_id, items, 'processing', transaction, req, res);
//       await createPayment(newOrder.order_id, amount, 'stripe', transaction);
//       await clearCart(user_id, transaction);

//       await transaction.commit();

//       res.status(200).json({
//         success: true,
//         message: 'Payment verified and order created successfully',
//         order_id: newOrder.order_id,
//       });
//     } else {
//       await transaction.commit();
//       res.status(200).json({
//         success: false,
//         message: 'Payment failed or session not paid, no order created',
//       });
//     }
//   } catch (error) {
//     await transaction.rollback();
//     logger.error(`Error verifying Stripe payment: ${error.message}`, {
//       stack: error.stack,
//       request: { user_id: req.user_id, body: req.body },
//     });

//     if (error.message.includes('Insufficient inventory quantity')) {
//       return res.status(400).json({
//         success: false,
//         message: 'Not enough stock available for one or more items',
//         error: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: 'Failed to verify payment and create order',
//       error: error.message,
//     });
//   }
// };

// Cập nhật placeOrderMomo để thêm thông tin affiliate vào extraData
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

    // Lấy thông tin affiliate từ cookies và thêm vào extraData
    const affiliateInfo = getAffiliateInfo(req);
    const extraDataObj = {
      userId,
      affiliate_info: affiliateInfo ? JSON.stringify(affiliateInfo) : ''
    };

    const extraData = Buffer.from(JSON.stringify(extraDataObj)).toString('base64');
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

// Cập nhật verifyMomo để xử lý thông tin affiliate từ extraData
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

    const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/query', checkStatusBody, {
      headers: { 'Content-Type': 'application/json' },
    });

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

    // Lấy thông tin từ extraData
    let extraData;
    try {
      extraData = JSON.parse(Buffer.from(orderInfo.extraData, 'base64').toString());
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
    const shippingAddressId = await ensureUserAddress(userId, address, transaction);

    // Tạo đơn hàng
    const newOrder = await order.create(
      {
        user_id: userId,
        total: amountInUSD,
        status: 'processing',
        shipping_address_id: shippingAddressId,
      },
      { transaction }
    );

    // Thêm affiliate info từ extraData vào request
    if (extraData.affiliate_info) {
      try {
        // Tạo cookies tạm thời để sử dụng cùng function createOrderItems
        req.cookies = req.cookies || {};
        req.cookies.affiliate_info = encodeURIComponent(extraData.affiliate_info);
      } catch (e) {
        logger.error(`Error processing affiliate info from MoMo: ${e.message}`);
      }
    }

    // Tạo order items với thông tin affiliate
    await createOrderItems(newOrder.order_id, items, 'processing', transaction, req, res);
    await createPayment(newOrder.order_id, amountInUSD, 'momo', transaction);
    await clearCart(userId, transaction);

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Payment successful',
      order_id: newOrder.order_id,
    });
  } catch (error) {
    await transaction.rollback();
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
    const userId = req.user_id

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
              attributes: ['product_id', 'name', 'small_image'], // Sử dụng small_image thay vì image
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
      product_id: item.inventory.product.product_id,
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

// Hàm demo để test việc lấy cookies
const testReadCookies = (req, res, next) => {
  console.log('===== TEST COOKIES DEMO =====');

  // 1. Kiểm tra request có gì
  console.log('Request object has cookies property:', 'cookies' in req);
  console.log('Request cookies type:', typeof req.cookies);
  console.log('Request cookies value:', req.cookies);

  // 2. Kiểm tra headers.cookie
  const cookieHeader = req.headers.cookie;
  console.log('Cookie header exists:', !!cookieHeader);
  console.log('Cookie header value:', cookieHeader);

  // 3. Parse cookie header thủ công
  if (cookieHeader) {
    const cookieMap = {};
    cookieHeader.split(';').forEach(pair => {
      const [key, value] = pair.trim().split('=');
      cookieMap[key] = value;
    });

    console.log('Manually parsed cookies:', cookieMap);
    console.log('affiliate_links exists in parsed cookies:', 'affiliate_links' in cookieMap);

    if (cookieMap.affiliate_links) {
      try {
        // 4. Thử decode và parse cookie
        const decodedValue = decodeURIComponent(cookieMap.affiliate_links);
        console.log('Decoded affiliate_links:', decodedValue);

        const parsedValue = JSON.parse(decodedValue);
        console.log('Parsed affiliate_links:', parsedValue);

        if (Array.isArray(parsedValue) && parsedValue.length > 0) {
          const firstItem = parsedValue[0];
          console.log('First affiliate item:', firstItem);

          if (firstItem.linkId && firstItem.productId && firstItem.influencerId) {
            console.log('SUCCESS: Valid affiliate info found!');
            console.log(`Link ID: ${firstItem.linkId}`);
            console.log(`Product ID: ${firstItem.productId}`);
            console.log(`Influencer ID: ${firstItem.influencerId}`);
          } else {
            console.log('ERROR: Missing required fields in affiliate info');
          }
        } else {
          console.log('ERROR: Affiliate info is not an array or is empty');
        }
      } catch (error) {
        console.error('Error processing affiliate_links cookie:', error.message);
      }
    }
  }

  console.log('===== END TEST COOKIES DEMO =====');
  next();
};

// Sử dụng middleware này với route cần test
// Ví dụ:
// app.post('/api/orders/place', testReadCookies, authUser, placeOrder);
const cancelOrder = async (req, res) => {
  const transaction = await sequelize.transaction(); // Start a transaction

  try {
    const { orderId } = req.body;
    const userId = req.user_id; // From middleware customerAuth

    // Validate inputs
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: orderId is required',
      });
    }
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: userId is required',
      });
    }

    // Find the order
    const orderData = await order.findOne({
      where: { order_id: orderId, user_id: userId },
      transaction,
    });

    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or you do not have permission to cancel this order',
      });
    }

    // Check if the order is in a cancellable state
    if (orderData.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending orders can be canceled',
      });
    }

    // Find the items in the order
    const orderItems = await order_item.findAll({
      where: { order_id: orderId },
      transaction,
    });

    if (!orderItems || orderItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No items found for this order',
      });
    }

    // Update inventory quantities (restore stock)
    for (const item of orderItems) {
      const inventory = await product_inventory.findOne({
        where: { inventory_id: item.inventory_id },
        transaction,
      });

      if (!inventory) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Inventory not found for inventory_id ${item.inventory_id}`,
        });
      }

      // Add the quantity back to the inventory
      await inventory.update(
        { quantity: inventory.quantity + item.quantity },
        { transaction }
      );
    }

    // Update the order status to "cancelled"
    await orderData.update({ status: 'cancelled' }, { transaction });

    // Commit the transaction
    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Order canceled successfully, and inventory updated',
    });
  } catch (error) {
    // Rollback the transaction on error
    await transaction.rollback();

    console.error('Error canceling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message,
    });
  }
};
// Định nghĩa route
module.exports = {
  placeOrder,
  // placeOrderStripe,
  // verifyStripe,
  placeOrderMomo,
  verifyMomo,
  allOrders,
  userOrders,
  updateStatus, getOrderItems
  , testReadCookies,
  cancelOrder
};