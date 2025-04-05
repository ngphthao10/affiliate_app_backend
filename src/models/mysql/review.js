const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('review', {
    review_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' } },
    product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'product', key: 'product_id' } },
    rate: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: true },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'review',
    hasTrigger: true,
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "review_id" },] },
      { name: "user_id", using: "BTREE", fields: [{ name: "user_id" },] },
      { name: "product_id", using: "BTREE", fields: [{ name: "product_id" },] },
    ]
  });
};
