'use strict';
module.exports = function(sequelize, DataTypes) {
  var Repo = sequelize.define('Repo', {
    title: DataTypes.STRING,
    duration: DataTypes.DECIMAL,
    segment_ids: DataTypes.STRING,
    word_list: DataTypes.TEXT,
    token: DataTypes.STRING,
  }, {
    tableName: "repos",
    underscored: true,
    classMethods: {
      associate: function(models) {
        // associations can be defined here
      }
    }
  });
  return Repo;
};