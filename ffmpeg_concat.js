'use strict';
var exec = require('child_process').exec;
var fs = require('fs');
var AWS = require('aws-sdk');
var raven = require('raven');
var models = require('./models/index');
var util = require('./utils/helpers');
var uuid = require('node-uuid');
var funcStartTime;
var funcEndTime;

var sentry = new raven.Client('https://eeeab140f7794810a29e5b139871bc8d:65a80e26bacd4af6a56fdec3408fe21e@sentry.io/96679');
sentry.patchGlobal();


AWS.config.region = 'us-west-2';

process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];


// echo $URL_LIST | xargs -n 1 -P 8
// "curl -o /tmp/lol.mp4 -s url"

function buildVideoConcatCommand(segment_urls, outputFile) {
  var binary = process.env['FFMPEG_PATH'] || "./bin/ffmpeg"
  var inputs = segment_urls.map(function(segment_url){ return " -i " + segment_url;  }).join(" ");
  var concatFilterPre  = " -filter_complex '";
  var concatFilterMid  = segment_urls.map(function(segment_url, index){ return " [" + index + ":v] " + "[" + index + ":a] "; }).join("");
  var concatFilterPost = "concat=n=" + segment_urls.length + ":v=1:a=1 [v] [a]'" ;
  var outputArgs = "-map '[v]' -map '[a]' -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart -strict -2 " + outputFile;

  return [binary, inputs, concatFilterPre, concatFilterMid, concatFilterPost, outputArgs].join(" ");
}

function getAlphaNumeric(text) {
  return text.replace(/[^\w]+/g,"");
}

function buildFilterPromise(character_token, scene_token){
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
}

function isBlank(str) {
    return (!str || /^\s*$/.test(str));
}

function concatSegments(segment_urls, event, context) {
  var namespace = "repositories";
  var downloadedSegmentsDir = "/tmp/" + namespace;
  var localList = segment_urls.map(function(url){ return downloadedSegmentsDir + "/" + url.split("/").slice(-1)[0]; });

  var outputFile = uuid.v4() + ".mp4";
  var outputFileAbsolutePath = "/tmp/" + namespace + "/" + outputFile;
  
  var cmd = (typeof(event.queryParams) !== "undefined" && typeof(event.queryParams.cmd) !== "undefined" && event.queryParams.cmd.length > 0)  ? event.queryParams.cmd : "mkdir -p " + downloadedSegmentsDir + " && cd " + downloadedSegmentsDir + " && printf '" + segment_urls.join("\n") + "' | xargs -n 1 -P 8 curl -s -O";
  var concatCmd = (typeof(event.queryParams) !== "undefined" && typeof(event.queryParams.cmd) !== "undefined" && event.queryParams.cmd.length > 0) ? "" : buildVideoConcatCommand(localList, outputFileAbsolutePath);

  funcStartTime = new Date();

  // console.log("cmd is " + event.query.cmd);
  var child = exec(cmd, {maxBuffer: 1024 * 10000}, function(error, stdout, stderr) {
      funcEndTime = new Date();
      console.log("fetchSegments took: " + (funcEndTime - funcStartTime));

      if (error) {
        console.log(error.stack);
        sentry.captureException(error);

        context.done("Error fetching segments");
      } 

      if (concatCmd === "") {
        return context.done(null,stdout);
      }

      funcStartTime = new Date();

      exec(concatCmd, {maxBuffer: 1024 * 10000}, function(error, stdout, stderr) {

        funcEndTime = new Date();

        console.log("concat took: " + (funcEndTime - funcStartTime));
        if (error) {
          console.log(error.stack);
          sentry.captureException(error);

          context.done("Concat Error");
        } 

        funcStartTime = new Date();


        var s3 = new AWS.S3();
        var body     = fs.createReadStream(outputFileAbsolutePath);
        var params = {
          Bucket: 'roplabs-mad', 
          Key: namespace + "/" + outputFile, 
          ACL: "public-read", 
          ContentType: "video/mp4",
          Body: body
        };

        s3.upload(params, function (err, data) {
          funcEndTime = new Date();
          console.log("s3 upload took: " + (funcEndTime - funcStartTime));
          var repoSourceUrl = models.Segment.cdnPath() + namespace + "/" + outputFile;
          return context.done(null, repoSourceUrl);
        });
      });
  });
}



exports.handler = (event, context, callback) => {
  // callback = callback || context.done; // lambda local uses the 0.10 nodejs api where it uses context.done instead of callback to return result to user

  var character_token = event.queryParams.character_token;
  var scene_token  = event.queryParams.scene_token;
  var text         = event.queryParams.text;
  var filterPromise;

  if (isBlank(text)) {
    return context.done("text can't be blank");
  }

  console.log("here before filter promise");
  funcStartTime = new Date();

  buildFilterPromise(character_token, scene_token).then(function(videos) {
    var video_ids = videos.map(function(video){ return video.id; }).join(",");
    console.log("here: " + video_ids);

    var isWordTagGiven = text.indexOf(":") != -1;
    if (isWordTagGiven) {
      return Promise.resolve(models.Segment.urlsFromWordTags(text, scene_token));
    } else {
      return models.Segment.fromText(text, video_ids).then(function(segments) {
        funcEndTime = new Date();
        console.log("sql query took: " + (funcEndTime - funcStartTime));
        var segmentUrls = segments.map(function(segment){ return segment.sourceUrl(); });
        return Promise.all(segmentUrls);
      });
    }
  }).then(function(segmentUrls){
    console.log("merging these segments:");
    console.log(segmentUrls);
    // return context.done(null,"asdf");
    return concatSegments(segmentUrls, event, context);
  }).catch(function(error) {
    console.log(error.stack);
    sentry.captureException(error);
    
    return context.done("Error");
  });

};