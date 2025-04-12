const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  const Product = sequelize.define('Product', {
    product_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    sku: { type: DataTypes.STRING(100), allowNull: true, unique: "sku" },
    small_image: { type: DataTypes.STRING(255), allowNull: true },
    out_of_stock: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: 0 },
    category_id: {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'category', key: 'category_id' }
    },
    subCategory_id: {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'category', key: 'category_id' }
    },
    reviews_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    commission_rate: { type: DataTypes.INTEGER, allowNull: true },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  },
    {
      sequelize,
      tableName: 'product',
      timestamps: false,
      indexes: [
        { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "product_id" },] },
        { name: "sku", unique: true, using: "BTREE", fields: [{ name: "sku" },] },
        { name: "category_id", using: "BTREE", fields: [{ name: "category_id" },] },
        { name: "subCategory_id", using: "BTREE", fields: [{ name: "subCategory_id" }] },
      ]
    });

  

  return Product;
};