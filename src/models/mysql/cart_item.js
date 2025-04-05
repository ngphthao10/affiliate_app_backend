const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('cart_item', {
    cart_item_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    session_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'cart_session', key: 'session_id' } },
    inventory_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: {
        model: 'product_inventory',
        key: 'inventory_id'
      }
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'cart_item',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "cart_item_id" },] },
      { name: "session_id", using: "BTREE", fields: [{ name: "session_id" },] },
      { name: "inventory_id", using: "BTREE", fields: [{ name: "inventory_id" },] },
    ]
  });
};
