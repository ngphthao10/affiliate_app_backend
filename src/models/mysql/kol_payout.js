const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('kol_payout', {
    payout_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    kol_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: {
        model: 'influencer',
        key: 'influencer_id'
      }
    },
    total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    payment_status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), allowNull: true },
    payout_date: { type: DataTypes.DATEONLY, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'kol_payout',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'modified_at',
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "payout_id" },] },
      { name: "kol_id", using: "BTREE", fields: [{ name: "kol_id" },] },]
  });
};