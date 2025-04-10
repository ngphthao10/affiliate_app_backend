const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const Users = sequelize.define('users', {
    user_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    username: { type: DataTypes.STRING(255), allowNull: false },
    first_name: { type: DataTypes.STRING(255), allowNull: true },
    last_name: { type: DataTypes.STRING(255), allowNull: true },
    phone_num: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.ENUM('active', 'suspended', 'banned'), allowNull: true },
    status_reason: { type: DataTypes.STRING(255), allowNull: true },
    creation_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
    modified_at: { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
  }, {
    sequelize,
    tableName: 'users',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
    ]
  });

  return Users;
};