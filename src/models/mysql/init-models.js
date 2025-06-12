var DataTypes = require("sequelize").DataTypes;
var _cart_item = require("./cart_item");
var _cart_session = require("./cart_session");
var _category = require("./category");
var _influencer = require("./influencer");
var _influencer_affiliate_link = require("./influencer_affiliate_link");
var _influencer_social_link = require("./influencer_social_link");
var _influencer_tier = require("./influencer_tier");
var _kol_payout = require("./kol_payout");
var _order = require("./order");
var _order_item = require("./order_item");
var _payment = require("./payment");
var _product = require("./product");
var _product_image = require("./product_image");
var _product_inventory = require("./product_inventory");
var _review = require("./review");
var _roles = require("./roles");
var _user_address = require("./user_address");
var _user_role = require("./user_role");
var _users = require("./users");

function initModels(sequelize) {
  var cart_item = _cart_item(sequelize, DataTypes);
  var cart_session = _cart_session(sequelize, DataTypes);
  var category = _category(sequelize, DataTypes);
  var influencer = _influencer(sequelize, DataTypes);
  var influencer_affiliate_link = _influencer_affiliate_link(sequelize, DataTypes);
  var influencer_social_link = _influencer_social_link(sequelize, DataTypes);
  var influencer_tier = _influencer_tier(sequelize, DataTypes);
  var kol_payout = _kol_payout(sequelize, DataTypes);
  var order = _order(sequelize, DataTypes);
  var order_item = _order_item(sequelize, DataTypes);
  var payment = _payment(sequelize, DataTypes);
  var product = _product(sequelize, DataTypes);
  var product_image = _product_image(sequelize, DataTypes);
  var product_inventory = _product_inventory(sequelize, DataTypes);
  var review = _review(sequelize, DataTypes);
  var roles = _roles(sequelize, DataTypes);
  var user_address = _user_address(sequelize, DataTypes);
  var user_role = _user_role(sequelize, DataTypes);
  var users = _users(sequelize, DataTypes);

  roles.belongsToMany(users, { as: 'user_id_users', through: user_role, foreignKey: "role_id", otherKey: "user_id" });
  users.belongsToMany(roles, { as: 'role_id_roles', through: user_role, foreignKey: "user_id", otherKey: "role_id" });
  cart_item.belongsTo(cart_session, { as: "session", foreignKey: "session_id" });
  cart_session.hasMany(cart_item, { as: "cart_items", foreignKey: "session_id" });
  category.belongsTo(category, { as: "parent_category", foreignKey: "parent_category_id" });
  category.hasMany(category, { as: "categories", foreignKey: "parent_category_id" });
  product.belongsTo(category, { as: "category", foreignKey: "category_id" });
  category.hasMany(product, { as: "products", foreignKey: "category_id" });
  influencer_affiliate_link.belongsTo(influencer, { as: "influencer", foreignKey: "influencer_id" });
  influencer.hasMany(influencer_affiliate_link, { as: "influencer_affiliate_links", foreignKey: "influencer_id" });
  influencer_social_link.belongsTo(influencer, { as: "influencer", foreignKey: "influencer_id" });
  influencer.hasMany(influencer_social_link, { as: "influencer_social_links", foreignKey: "influencer_id" });
  kol_payout.belongsTo(influencer, { as: "kol", foreignKey: "kol_id" });
  influencer.hasMany(kol_payout, { as: "kol_payouts", foreignKey: "kol_id" });
  order_item.belongsTo(influencer_affiliate_link, { as: "link", foreignKey: "link_id" });
  influencer_affiliate_link.hasMany(order_item, { as: "order_items", foreignKey: "link_id" });
  influencer.belongsTo(influencer_tier, { as: "tier", foreignKey: "tier_id" });
  influencer_tier.hasMany(influencer, { as: "influencers", foreignKey: "tier_id" });
  order_item.belongsTo(order, { as: "order", foreignKey: "order_id" });
  order.hasMany(order_item, { as: "order_items", foreignKey: "order_id" });
  payment.belongsTo(order, { as: "order", foreignKey: "order_id" });
  order.hasMany(payment, { as: "payments", foreignKey: "order_id" });
  influencer_affiliate_link.belongsTo(product, { as: "product", foreignKey: "product_id" });
  product.hasMany(influencer_affiliate_link, { as: "influencer_affiliate_links", foreignKey: "product_id" });
  product_image.belongsTo(product, { as: "product", foreignKey: "product_id" });
  product.hasMany(product_image, { as: "product_images", foreignKey: "product_id" });
  product_inventory.belongsTo(product, { as: "product", foreignKey: "product_id" });
  product.hasMany(product_inventory, { as: "product_inventories", foreignKey: "product_id" });
  review.belongsTo(product, { as: "product", foreignKey: "product_id" });
  product.hasMany(review, { as: "reviews", foreignKey: "product_id" });
  cart_item.belongsTo(product_inventory, { as: "inventory", foreignKey: "inventory_id" });
  product_inventory.hasMany(cart_item, { as: "cart_items", foreignKey: "inventory_id" });
  order_item.belongsTo(product_inventory, { as: "inventory", foreignKey: "inventory_id" });
  product_inventory.hasMany(order_item, { as: "order_items", foreignKey: "inventory_id" });
  user_role.belongsTo(roles, { as: "role", foreignKey: "role_id" });
  roles.hasMany(user_role, { as: "user_roles", foreignKey: "role_id" });
  order.belongsTo(user_address, { as: "shipping_address", foreignKey: "shipping_address_id" });
  user_address.hasMany(order, { as: "orders", foreignKey: "shipping_address_id" });
  cart_session.belongsTo(users, { as: "user", foreignKey: "user_id" });
  users.hasMany(cart_session, { as: "cart_sessions", foreignKey: "user_id" });
  influencer.belongsTo(users, { as: "user", foreignKey: "user_id" });
  users.hasOne(influencer, { as: "influencer", foreignKey: "user_id" });
  order.belongsTo(users, { as: "user", foreignKey: "user_id" });
  users.hasMany(order, { as: "orders", foreignKey: "user_id" });
  review.belongsTo(users, { as: "user", foreignKey: "user_id" });
  users.hasMany(review, { as: "reviews", foreignKey: "user_id" });
  user_address.belongsTo(users, { as: "user", foreignKey: "user_id" });
  users.hasMany(user_address, { as: "user_addresses", foreignKey: "user_id" });
  user_role.belongsTo(users, { as: "user", foreignKey: "user_id" });
  users.hasMany(user_role, { as: "user_roles", foreignKey: "user_id" });

  review.hasMany(order_item, { as: 'order_items', foreignKey: 'order_item_id' })

  return {
    cart_item,
    cart_session,
    category,
    influencer,
    influencer_affiliate_link,
    influencer_social_link,
    influencer_tier,
    kol_payout,
    order,
    order_item,
    payment,
    product,
    product_image,
    product_inventory,
    review,
    roles,
    user_address,
    user_role,
    users,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
