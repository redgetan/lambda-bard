'use strict';

var VideoMerger = require(__dirname + '/lib/video_merger.js')

exports.handler = function(event, context, callback) {
  if (event.queryParams.cmd === "show_version") {
    context.done(null, "0.0.2");
  }

  var videoMerger = new VideoMerger(event.queryParams);

  videoMerger.concatSegments().then(function(result){
    context.done(null, result);
  }).catch(function(error) {
    context.done(error.message);
  });

};