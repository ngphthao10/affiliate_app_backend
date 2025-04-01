const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('influencer_affiliate_link', {
    link_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    affliate_link: { type: DataTypes.STRING(255), allowNull: false },
    influencer_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'influencer', key: 'influencer_id' } },
    product_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'product', key: 'product_id' } }
  }, {
    sequelize,
    tableName: 'influencer_affiliate_link',
    timestamps: true,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "link_id" },] },
      { name: "influencer_id", using: "BTREE", fields: [{ name: "influencer_id" },] },
      { name: "product_id", using: "BTREE", fields: [{ name: "product_id" },] },
    ]
  });
};
