'use strict';
module.exports = function(sequelize, DataTypes) {
  var Pack = sequelize.define('Pack', {
    name: DataTypes.STRING,
    description: DataTypes.STRING,
    avatar: DataTypes.STRING,
    token: DataTypes.STRING,
  }, {
    tableName: "packs",
    underscored: true,
    classMethods: {
      associate: function(models) {
        // associations can be defined here
        Pack.hasMany(models.Video);
      }
    }
  });
  return Pack;
};