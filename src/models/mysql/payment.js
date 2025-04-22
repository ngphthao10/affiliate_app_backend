const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('payment', {
    payment_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    order_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'order', key: 'order_id' } },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    payment_method: { type: DataTypes.ENUM('zalopay', 'momo', 'vnpay','stripe','cod'), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), allowNull: true },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'payment',
    hasTrigger: true,
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "payment_id" },] },
      { name: "order_id", using: "BTREE", fields: [{ name: "order_id" },] },
    ]
  });
};
