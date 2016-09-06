'use strict';

var VideoMerger = require(__dirname + './lib/video_merger.js')

exports.handler = function(event, context, callback) {
  var videoMerger = new VideoMerger(event.queryParams);

  videoMerger.concatSegments().then(function(result){
    context.done(result);
  }).catch(function(error) {
    context.done(null, error.message);
  });

};