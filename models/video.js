'use strict';
module.exports = function(sequelize, DataTypes) {
  var Video = sequelize.define('Video', {
    source_url: DataTypes.STRING,
    token: DataTypes.STRING,
    metadata: DataTypes.TEXT,
    character_id: DataTypes.INTEGER,
  }, {
    tableName: "videos",
    underscored: true,
    classMethods: {
      associate: function(models) {
        // associations can be defined here
        Video.belongsTo(models.Character);
        Video.hasMany(models.Segment);
      }
    }
  });
  return Video;
};