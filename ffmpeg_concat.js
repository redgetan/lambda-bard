'use strict';

var VideoMerger = require(__dirname + '/lib/video_merger.js')

exports.handler = function(event, context, callback) {
  if (event.queryParams.cmd === "show_version") {
    context.done(null, "0.0.3");
  } else {
    var options = event.queryParams;

    if ((typeof event.headers !== "undefined") && (typeof event.headers["Authorization"] !== "undefined")) {
      var authorizationToken = event.headers["Authorization"].replace("Token ","");
      options.authentication_token = authorizationToken;
    }

    var videoMerger = new VideoMerger(options);

    videoMerger.concatSegments().then(function(result){
      context.done(null, result);
    }).catch(function(error) {
      context.done(error.message);
    });
  }


};