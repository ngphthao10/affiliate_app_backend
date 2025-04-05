const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const UserRole = sequelize.define('user_role', {
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'roles',
        key: 'role_id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'user_id'
      }
    }
  }, {
    sequelize,
    tableName: 'user_role',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "role_id" },
          { name: "user_id" },
        ]
      },
      {
        name: "user_id",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
    ]
  });

  // UserRole.associate = function (models) {
  //   UserRole.belongsTo(models.roles, {
  //     foreignKey: 'role_id',
  //     as: 'role'
  //   });

  //   UserRole.belongsTo(models.users, {
  //     foreignKey: 'user_id'
  //   });
  // };

  return UserRole;
};