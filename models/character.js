'use strict';
module.exports = function(sequelize, DataTypes) {
  var Character = sequelize.define('Character', {
    name: DataTypes.STRING,
    description: DataTypes.STRING,
    avatar: DataTypes.STRING,
    token: DataTypes.STRING,
  }, {
    tableName: "characters",
    underscored: true,
    classMethods: {
      associate: function(models) {
        // associations can be defined here
        Character.hasMany(models.Video);
      }
    }
  });
  return Character;
};