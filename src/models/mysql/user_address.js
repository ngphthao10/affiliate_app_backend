const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const UserAddress = sequelize.define('user_address', {
    address_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' } },
    recipient_name: { type: DataTypes.STRING(255), allowNull: false },
    phone_num: { type: DataTypes.STRING(20), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: false },
    city: { type: DataTypes.STRING(100), allowNull: true },
    country: { type: DataTypes.STRING(100), allowNull: true },
    is_default: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: 0 },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'user_address',
    hasTrigger: true,
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "address_id" },] },
      { name: "user_id", using: "BTREE", fields: [{ name: "user_id" },] },
    ]
  });

  // // Thêm phương thức associate
  // UserAddress.associate = function (models) {
  //   UserAddress.belongsTo(models.users, {
  //     foreignKey: 'user_id',
  //     as: 'user'
  //   });
  // };

  return UserAddress;
};