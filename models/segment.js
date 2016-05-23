'use strict';
var util = require('./../utils/helpers');

module.exports = function(sequelize, DataTypes) {

  var MAX_DURATION = 3;
  var MIN_DURATION = 0.2;
  var MIN_CONFIDENCE = 0.2;

  var Segment = sequelize.define('Segment', {
    video_id: DataTypes.INTEGER,
    word: DataTypes.STRING,
    relative_path: DataTypes.STRING,
    start: DataTypes.DECIMAL,
    stop: DataTypes.DECIMAL,
    duration: DataTypes.DECIMAL,
    confidence: DataTypes.DECIMAL,
  }, {
    tableName: "segments",
    underscored: true,
    classMethods: {
      associate: function(models) {
        Segment.belongsTo(models.Video);
      },
      fromText: function(text, filter_ids) { 
        var words = normalize(text).split(" ");

        var sqlStatement = words.map(function(word){
          return buildWordSelect(word, filter_ids)
        }).join(" UNION "); 

        return sequelize.query(sqlStatement, { model: Segment });
      }
    }, instanceMethods: {
      cdnPath: function() {
        return "http://d22z4oll34c07f.cloudfront.net/";
      },
      sourceUrl: function() {
        return this.cdnPath() + this.relative_path;
      },
      serialize: function() { 
        return { 
          word: this.word,
          source_url: this.sourceUrl()
        };
      }
    }
  });

  function normalize(text) {
    return util.replaceAll(text,"[^\\w]"," ").toLowerCase();
  }  

  function buildWordSelect(word, filter_ids) {
    var filterStatement = filter_ids.length > 0 ? " and video_id IN (" + filter_ids + ")" : ""
    return "(select * from segments where word = '" + word + "'" + 
            filterStatement +
            " and confidence > " + MIN_CONFIDENCE + 
            " and duration > "   + MIN_DURATION   +
            " and duration < "   + MAX_DURATION   +
            " order by rand() limit 1)";
  }

  return Segment;
};