const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('order_item', {
    order_item_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    order_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'order', key: 'order_id' } },
    inventory_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'product_inventory',
        key: 'inventory_id'
      }
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    link_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'influencer_affiliate_link',
        key: 'link_id'
      }
    },
    payout_id: {
      type: DataTypes.INTEGER, allowNull: true,
      references: {
        model: 'kol_payout',
        key: 'payout_id'
      }
    },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'order_item',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "order_item_id" },] },
      { name: "order_id", using: "BTREE", fields: [{ name: "order_id" },] },
      { name: "inventory_id", using: "BTREE", fields: [{ name: "inventory_id" },] },
      { name: "link_id", using: "BTREE", fields: [{ name: "link_id" },] },
    ]
  });
};
