'use strict';
module.exports = function(sequelize, DataTypes) {
  var Bundle = sequelize.define('Bundle', {
    name: DataTypes.STRING,
    description: DataTypes.STRING,
    avatar: DataTypes.STRING,
    token: DataTypes.STRING,
  }, {
    tableName: "bundles",
    underscored: true,
    classMethods: {
      associate: function(models) {
        // associations can be defined here
        Bundle.hasMany(models.Video);
      }
    }
  });
  return Bundle;
};