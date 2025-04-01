const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const InfluencerSocialLink = sequelize.define('influencer_social_link', {
    link_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    influencer_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'influencer', key: 'influencer_id' } },
    platform: { type: DataTypes.STRING(50), allowNull: false },
    profile_link: { type: DataTypes.STRING(255), allowNull: false }
  }, {
    sequelize,
    tableName: 'influencer_social_link',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "link_id" },] },
      { name: "influencer_id", using: "BTREE", fields: [{ name: "influencer_id" },] },
    ]
  });

  return InfluencerSocialLink;
};
