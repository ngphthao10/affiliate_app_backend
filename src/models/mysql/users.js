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

  // Associate models when the model is initialized
  Users.associate = function (models) {
    Users.hasOne(models.influencer, {
      foreignKey: 'user_id',
      as: 'influencer'
    });

    // Users has many UserRoles
    Users.hasMany(models.user_role, {
      foreignKey: 'user_id',
      as: 'user_roles'
    });

    // Users has many Addresses
    Users.hasMany(models.user_address, {
      foreignKey: 'user_id',
      as: 'user_addresses'
    });

    // Users has many Orders
    Users.hasMany(models.order, {
      foreignKey: 'user_id',
      as: 'orders'
    });

    Users.belongsToMany(models.roles, {
      through: models.user_role,
      foreignKey: 'user_id',
      otherKey: 'role_id'
    });
  };

  return Users;
};