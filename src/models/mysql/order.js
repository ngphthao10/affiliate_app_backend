const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('order', {
    order_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' } },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0.00 },
    shipping_address_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user_address',
        key: 'address_id'
      }
    },
    note: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'), allowNull: true },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'order',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "order_id" },] },
      { name: "user_id", using: "BTREE", fields: [{ name: "user_id" },] },
      { name: "shipping_address_id", using: "BTREE", fields: [{ name: "shipping_address_id" },] },
    ]
  });
};
