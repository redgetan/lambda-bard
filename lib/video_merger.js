'use strict';
var exec = require('child_process').exec;
var fs = require('fs');
var AWS = require('aws-sdk');
var models = require('./../models/index');
var raven = require('raven');
var util = require('./helpers');
var uuid = require('node-uuid');
var path = require('path');
var env       = process.env.NODE_ENV || 'production';
var userS3Bucket    = require(__dirname + '/../config/general.json')["userS3Bucket"][env];
var userRepoCdnPath = require(__dirname + '/../config/general.json')["userRepoCdnPath"][env];
var funcStartTime;
var funcEndTime;

var VideoMerger = function(options) {
  this.character_token = options.character_token;
  this.scene_token     = options.scene_token;
  this.text            = options.text;

  this.NAMESPACE = "repositories";
  this.DOWNLOADED_SEGMENTS_DIR = "/tmp/" + this.NAMESPACE;

  AWS.config.region = 'us-west-2';

  this.initBinDirectory();
  this.initErrorReporting();
};

/********* MAIN FUNCTIONS ********/

VideoMerger.prototype.initBinDirectory = function() {
  if (process.platform === "darwin") {
    process.env['PATH'] = "./bin/darwin_64" + ':' + process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];
  } else {
    process.env['PATH'] = "./bin/linux_64" + ':' + process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];
  }
};

VideoMerger.prototype.initErrorReporting = function() {
  this.raven = new raven.Client('https://eeeab140f7794810a29e5b139871bc8d:65a80e26bacd4af6a56fdec3408fe21e@sentry.io/96679');
  this.raven.patchGlobal();

  this.rollbar = require("rollbar");
  this.rollbar.init("608fbaf6aa554c6aa6044b0d20efe646");
  this.rollbar.handleUncaughtExceptionsAndRejections("608fbaf6aa554c6aa6044b0d20efe646", {});
};

VideoMerger.prototype.getAlphaNumeric = function(text) {
  return text.replace(/[^\w]+/g,"");
};

VideoMerger.prototype.buildFilterPromise = function(character_token, scene_token){
  var filterPromise;

  if (character_token) {
    filterPromise = models.Character.findOne({
      attributes: ['id'],
      where: ["token = ?", character_token]  
    }).then(function(character){
      return models.Video.findAll({ 
        attributes: ['id','token'],
        where: ["character_id = ?", character.id]
      });
    });
  } else if (scene_token) {
    filterPromise = models.Video.findAll({ 
        attributes: ['id','token'],
        where: {
          token: {
            $in: scene_token.split(",")
          }
        }
    });
  } else {
    filterPromise = Promise.resolve([]);
  }

  return filterPromise;
};

VideoMerger.prototype.isBlank = function(text) {
    return (!text || /^\s*$/.test(text));
};

VideoMerger.prototype.generateErrorMessage = function(text) {
    return { message: text };
};

VideoMerger.prototype.segmentUrlsFromCharacterScene = function(text, character_token, scene_token) {
  funcStartTime = new Date();

  return this.buildFilterPromise(character_token, scene_token).then(function(videos) {
    var video_ids = videos.map(function(video){ return video.id; }).join(",");
    console.log("scene filter ids: " + video_ids);

    var isWordTagGiven = text.indexOf(":") != -1;
    if (isWordTagGiven) {
      var segmentUrls = models.Segment.urlsFromWordTags(text, scene_token);
      return Promise.all(segmentUrls);
    } else {
      return models.Segment.fromText(text, video_ids).then(function(segments) {
        funcEndTime = new Date();
        console.log("sql query took: " + (funcEndTime - funcStartTime));
        var segmentUrls = segments.map(function(segment){ return segment.sourceUrl(); });
        return Promise.all(segmentUrls);
      });
    }
  })
};

VideoMerger.prototype.concatSegments = function() {

  var self = this;
  var outputFileAbsolutePath = this.generateOutputFileAbsolutePath();;

  if (this.isBlank(this.text)) {
    return Promise.reject(this.generateErrorMessage("text cant be blank"));
  }

  return this.segmentUrlsFromCharacterScene(this.text, this.character_token, this.scene_token
  ).then(function(segmentUrls){
    return self.fetchSegments(segmentUrls);

  }).then(function(segmentPaths){
    return self.mergeSegments(segmentPaths, outputFileAbsolutePath);

  }).then(function(){
    return self.uploadMergeResult(outputFileAbsolutePath);

  }).then(function(repoSourceUrl){
    return Promise.resolve(repoSourceUrl);

  }).catch(function(error) {
    self.reportError(error);
    return Promise.reject(self.generateErrorMessage("Unexpected error"));
  });

};

VideoMerger.prototype.fetchCommand = function(segmentUrls) {
    return "mkdir -p " + this.DOWNLOADED_SEGMENTS_DIR + 
           " && cd " + this.DOWNLOADED_SEGMENTS_DIR + 
           " && printf '" + segmentUrls.join("\n") + 
           "' | xargs -n 1 -P 8 curl -s -O";
};

VideoMerger.prototype.mergeCommand = function(segmentPaths, outputFileAbsolutePath) {
  var localSegmentPaths = segmentPaths;

  var binary = "ffmpeg"
  var inputs = localSegmentPaths.map(function(segment_path){ return " -i " + segment_path;  }).join(" ");
  var concatFilterPre  = " -filter_complex '";
  var concatFilterMid  = localSegmentPaths.map(function(segmentPath, index){ return " [" + index + ":v] " + "[" + index + ":a] "; }).join("");
  var concatFilterPost = "concat=n=" + localSegmentPaths.length + ":v=1:a=1 [v] [a]'" ;
  var outputArgs = "-map '[v]' -map '[a]' -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart -strict -2 " + outputFileAbsolutePath;

  return [binary, inputs, concatFilterPre, concatFilterMid, concatFilterPost, outputArgs].join(" ");
};

VideoMerger.prototype.getLocalSegmentPaths = function(segmentUrls) {
  return segmentUrls.map(function(url){ 
    return this.DOWNLOADED_SEGMENTS_DIR + "/" + url.split("/").slice(-1)[0]; 
  }.bind(this));
};

VideoMerger.prototype.generateOutputFileAbsolutePath = function() {
  var outputFile = uuid.v4() + ".mp4";
  return "/tmp/" + this.NAMESPACE + "/" + outputFile;
};

VideoMerger.prototype.fetchSegments = function(segmentUrls, cb) {
  var fetchCmd = this.fetchCommand(segmentUrls);

  var self = this;
  funcStartTime = new Date();

  return new Promise(function(resolve, reject){
    exec(fetchCmd, {maxBuffer: 1024 * 10000}, function(error, stdout, stderr) {
      funcEndTime = new Date();
      console.log("fetchSegments took: " + (funcEndTime - funcStartTime));
      if (error) { 
        self.reportError(error, "Error fetching segments"); 
        reject(error);
      } else {
        var localSegmentPaths = self.getLocalSegmentPaths(segmentUrls);
        resolve(localSegmentPaths);
      }
    });
  });
};

VideoMerger.prototype.mergeSegments = function(segmentPaths, outputFileAbsolutePath, cb) {
  var mergeCmd = this.mergeCommand(segmentPaths, outputFileAbsolutePath);

  var self = this;
  funcStartTime = new Date();

  return new Promise(function(resolve, reject){
    exec(mergeCmd, {maxBuffer: 1024 * 10000}, function(error, stdout, stderr) {
      funcEndTime = new Date();
      console.log("concat took: " + (funcEndTime - funcStartTime));
      if (error) { 
        self.reportError(error, "Concat Error"); 
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

VideoMerger.prototype.uploadMergeResult = function(outputFileAbsolutePath) {
  funcStartTime = new Date();

  var filename = path.basename(outputFileAbsolutePath);
  var s3       = new AWS.S3();
  var username = "anonymous";
  var s3_key   = this.NAMESPACE + "/" + username + "/" + filename;
  var body     = fs.createReadStream(outputFileAbsolutePath);
  var params = {
    Bucket: userS3Bucket.name, 
    Key: s3_key, 
    ACL: "public-read", 
    ContentType: "video/mp4",
    Body: body
  };

  return new Promise(function(resolve, reject){
    s3.upload(params, function (err, data) {
      funcEndTime = new Date();
      console.log("s3 upload took: " + (funcEndTime - funcStartTime));
      var repoSourceUrl = userRepoCdnPath.url + s3_key;
      resolve(repoSourceUrl);
    });
  });
};


/********* CUSTOM ERRORS **********/

VideoMerger.prototype.reportError = function(error, cb) {
  if (typeof error.stack !== "undefined") {
    console.log(error.stack);
  }

  this.raven.captureException(error, function(){
    // cb();
  });
};

VideoMerger.prototype.reportErrorMessage = function(error) {
  var self = this;
  return new Promise(function(resolve, reject){
    self.raven.captureMessage(error, function(){
      // cb();
      resolve();
    });
  });
};

function FetchError(message) {
  this.name = "FetchError";
  this.message = (message || "");
}
FetchError.prototype = Error.prototype;

function ConcatError(message) {
  this.name = "ConcatError";
  this.message = (message || "");
}
  ConcatError.prototype = Error.prototype;

module.exports = VideoMerger;