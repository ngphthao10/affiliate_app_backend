const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('product_image', {
    image_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'product', key: 'product_id' } },
    image: { type: DataTypes.STRING(255), allowNull: false },
    alt: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'product_image',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "image_id" },] },
      { name: "product_id", using: "BTREE", fields: [{ name: "product_id" },] },
    ]
  });
};
