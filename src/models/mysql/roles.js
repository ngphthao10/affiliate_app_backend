const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  const Roles = sequelize.define('roles', {
    role_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    role_name: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true }
  }, {
    sequelize,
    tableName: 'roles',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "role_id" },] },
    ]
  });

  // // Associate models when the model is initialized
  // Roles.associate = function (models) {
  //   // Roles has many UserRoles
  //   Roles.hasMany(models.user_role, {
  //     foreignKey: 'role_id',
  //     as: 'user_roles'
  //   });

  //   Roles.belongsToMany(models.users, {
  //     through: models.user_role,
  //     foreignKey: 'role_id',
  //     otherKey: 'user_id'
  //   });
  // };

  return Roles;
};