const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const Influencer = sequelize.define('influencer', {
    influencer_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' }, unique: "influencer_ibfk_1" },
    status: { type: DataTypes.ENUM('pending', 'active', 'suspended', 'banned'), allowNull: false, defaultValue: 'pending' },
    status_reason: { type: DataTypes.STRING(255), allowNull: true },
    tier_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'influencer_tier', key: 'tier_id' } },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'influencer',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "influencer_id" },] },
      { name: "user_id", unique: true, using: "BTREE", fields: [{ name: "user_id" },] },
      { name: "tier_id", using: "BTREE", fields: [{ name: "tier_id" },] },
    ]
  });

  return Influencer;
};
