'use strict';
var exec = require('child_process').exec;
var fs = require('fs');
var AWS = require('aws-sdk');
var models = require('./models/index');
var util = require('./utils/helpers');
var funcStartTime;
var funcEndTime;


AWS.config.region = 'us-west-2';

process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];

// echo $URL_LIST | xargs -n 1 -P 8
// "curl -o /tmp/lol.mp4 -s url"

function buildVideoConcatCommand(segment_urls, outputFile) {
  var binary = "./bin/ffmpeg"
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

function buildFilterPromise(bundle_token, video_token){
  var filterPromise;

  if (bundle_token) {
    filterPromise = models.Bundle.findOne({
      attributes: ['id'],
      where: ["token = ?", bundle_token]  
    }).then(function(bundle){
      return models.Video.findAll({ 
        attributes: ['id'],
        where: ["bundle_id = ?", bundle.id]
      });
    });
  } else if (video_token) {
    filterPromise = models.Video.findAll({ 
        attributes: ['id'],
        where: {
          token: {
            $in: video_token.split(",")
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

function concatSegments(segment_urls, event, context, callback) {
  var username = "demo_user";
  var key = Date.now();
  var namespace = username + "/" + key;
  var downloadedSegmentsDir = "/tmp/" + namespace;
  var localList = segment_urls.map(function(url){ return downloadedSegmentsDir + "/" + url.split("/").slice(-1)[0]; });

  var outputFile = key + ".mp4";
  var outputFileAbsolutePath = "/tmp/" + namespace + "/" + outputFile;
  
  // var list = [
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/this_453_100.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/is_468_96.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/a_480_42.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/huge_488_95.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/movie_526_100.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/its_552_68.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/going_565_100.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/to_578_100.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/be_584_100.mp4",
  //   "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/coming_591_100.mp4"
  // ];

  // var localList = [
  //   "/tmp/this_453_100.mp4",
  //   "/tmp/is_468_96.mp4",
  //   "/tmp/a_480_42.mp4",
  //   "/tmp/huge_488_95.mp4",
  //   "/tmp/movie_526_100.mp4",
  //   "/tmp/its_552_68.mp4",
  //   "/tmp/going_565_100.mp4",
  //   "/tmp/to_578_100.mp4",
  //   "/tmp/be_584_100.mp4",
  //   "/tmp/coming_591_100.mp4"
  // ];

  var cmd = (typeof(event.queryParams) !== "undefined" && typeof(event.queryParams.cmd) !== "undefined" && event.queryParams.cmd.length > 0)  ? event.queryParams.cmd : "mkdir -p " + downloadedSegmentsDir + " && cd " + downloadedSegmentsDir + " && printf '" + segment_urls.join("\n") + "' | xargs -n 1 -P 8 curl -s -O";
  var concatCmd = (typeof(event.queryParams) !== "undefined" && typeof(event.queryParams.cmd) !== "undefined" && event.queryParams.cmd.length > 0) ? "" : buildVideoConcatCommand(localList, outputFileAbsolutePath);

  funcStartTime = new Date();

  // console.log("cmd is " + event.query.cmd);
  var child = exec(cmd, {maxBuffer: 1024 * 10000}, function(error, stdout, stderr) {
      funcEndTime = new Date();
      console.log("fetchSegments took: " + (funcEndTime - funcStartTime));

      if (error) {
        callback(error);
      } 

      if (concatCmd === "") {
        return callback(null,stdout);
      }

      funcStartTime = new Date();

      exec(concatCmd, {maxBuffer: 1024 * 10000}, function(error, stdout, stderr) {

        funcEndTime = new Date();

        console.log("concat took: " + (funcEndTime - funcStartTime));
        if (error) {
          callback(error);
        } 

        funcStartTime = new Date();


        var s3 = new AWS.S3();
        var body     = fs.createReadStream(outputFileAbsolutePath);
        var params = {
          Bucket: 'roplabs-mad', 
          Key: outputFile, 
          ACL: "public-read", 
          ContentType: "video/mp4",
          Body: body
        };

        s3.upload(params, function (err, data) {
          funcEndTime = new Date();
          console.log(callback);
          console.log("s3 upload took: " + (funcEndTime - funcStartTime));
          return callback(null,data.Location);
        });
      });
  });
}



exports.handler = (event, context, callback) => {
  // callback = callback || context.done; // lambda local uses the 0.10 nodejs api where it uses context.done instead of callback to return result to user

  var bundle_token = event.queryParams.bundle_token;
  var video_token  = event.queryParams.video_token;
  var text         = event.queryParams.text;
  var filterPromise;

  if (isBlank(text)) {
    return callback("text can't be blank");
  }

  console.log("here before filter promise");
  funcStartTime = new Date();

  buildFilterPromise(bundle_token, video_token).then(function(videos) {
    var video_ids = videos.map(function(video){ return video.id; }).join(",");
    console.log("here: " + video_ids);
    return models.Segment.fromText(text, video_ids);
  }).then(function(segments){
    funcEndTime = new Date();
    console.log("sql query took: " + (funcEndTime - funcStartTime));
    var segmentUrls = segments.map(function(segment){ return segment.sourceUrl(); });
    return concatSegments(segmentUrls, event, context, callback);
  }).catch(function(error) {
    return callback(error);
  });

};