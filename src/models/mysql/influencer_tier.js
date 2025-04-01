const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const InfluencerTier = sequelize.define('influencer_tier', {
    tier_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    tier_name: { type: DataTypes.STRING(50), allowNull: false },
    min_successful_purchases: { type: DataTypes.INTEGER, allowNull: false },
    commission_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false }
  }, {
    sequelize,
    tableName: 'influencer_tier',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "tier_id" },] },
    ]
  });
  return InfluencerTier;
};
