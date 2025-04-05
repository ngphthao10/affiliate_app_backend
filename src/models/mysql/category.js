const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('category', {
    category_id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    display_text: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    parent_category_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'category', key: 'category_id' } }
  }, {
    sequelize,
    tableName: 'category',
    timestamps: false,
    indexes: [
      { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "category_id" },] },
      { name: "parent_category_id", using: "BTREE", fields: [{ name: "parent_category_id" },] },
    ]
  });
};
