'use strict';
var util = require('./../lib/helpers');

module.exports = function(sequelize, DataTypes) {

  var MAX_DURATION = 3;
  var MIN_DURATION = 0.2;
  var MIN_CONFIDENCE = 0.2;

  var Segment = sequelize.define('Segment', {
    video_id: DataTypes.INTEGER,
    word: DataTypes.STRING,
    relative_path: DataTypes.STRING,
    token: DataTypes.STRING,
    start: DataTypes.DECIMAL,
    stop: DataTypes.DECIMAL,
    duration: DataTypes.DECIMAL,
    confidence: DataTypes.DECIMAL,
  }, {
    timestamps: false,
    tableName: "segments",
    underscored: true,
    classMethods: {
      cdnPath: function() {
        return "https://d22z4oll34c07f.cloudfront.net/";
      },
      associate: function(models) {
        Segment.belongsTo(models.Video);
      },
      fromText: function(text, filter_ids) { 
        var words = normalize(text).split(/\s+/);

        var sqlStatement = words.map(function(word){
          return buildWordSelect(word, filter_ids)
        }).join(" UNION "); 

        return sequelize.query(sqlStatement, { model: Segment });
      },
      urlsFromWordTags: function(text, scene_token) { 
        var wordTags = text.trim().split(/\s+/);

        var urls = wordTags.map(function(wordTagString){
          var wordTagComponents = wordTagString.split(":");
          var wordTagToken      = wordTagComponents[1];
          return Segment.cdnPath() + "segments/" + scene_token + "/" + wordTagToken + ".mp4";
        });

        return urls;
      }
    }, instanceMethods: {
      sourceUrl: function() {
        return this.getRelativePath().then(function(relativePath){
          return Segment.cdnPath() + relativePath;
        });
      },
      getRelativePath: function() {
        var segmentToken = this.token;

        return this.getVideo().then(function(video){
          return "segments/" + video.token + "/" + segmentToken + ".mp4";
        });
      },
      serialize: function() { 
        return this.sourceUrl().then(function(sourceUrl){
          return { 
            word: this.word,
            source_url: sourceUrl
          };
        });
      }
    }
  });

  function normalize(text) {
    return util.replaceAll(text,"[^\\w|:]"," ").toLowerCase();
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