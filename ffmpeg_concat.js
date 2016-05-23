'use strict';
var exec = require('child_process').exec;
var fs = require('fs');
var AWS = require('aws-sdk');

AWS.config.region = 'us-west-2';

process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];

// echo $URL_LIST | xargs -n 1 -P 8
// "curl -o /tmp/lol.mp4 -s url"

function buildVideoConcatCommand(segment_urls, outputFile) {
  var binary = "./bin/ffmpeg"
  var inputs = segment_urls.map(function(segment_url){ return " -i " + segment_url;  }).join(" ");
  var concatFilterPre  = " -filter_complex \"";
  var concatFilterMid  = segment_urls.map(function(segment_url, index){ return " [" + index + ":v] " + "[" + index + ":a] "; }).join("");
  var concatFilterPost = "concat=n=" + segment_urls.length + ":v=1:a=1 [v] [a]\"" ;
  var outputArgs = "-map '[v]' -map '[a]' -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart " + outputFile;

  return [binary, inputs, concatFilterPre, concatFilterMid, concatFilterPost, outputArgs].join(" ");
}

function getAlphaNumeric(text) {
  return text.replace(/[^\w]+/g,"");
}


exports.handler = (event, context, callback) => {
  var resultLocalPath = "/tmp/coming_591_100.mp4";
  var url = "http://d22z4oll34c07f.cloudfront.net/segments/1yrHV5NBhc8/dnmt_62611_44.mp4";
  // var list = [
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/this_453_100.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/is_468_96.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/a_480_42.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/huge_488_95.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/movie_526_100.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/its_552_68.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/going_565_100.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/to_578_100.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/be_584_100.mp4",
  //   "http://d22z4oll34c07f.cloudfront.net/segments/n1IJt22JFY4/coming_591_100.mp4"
  // ];

  var list = [
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/this_453_100.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/is_468_96.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/a_480_42.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/huge_488_95.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/movie_526_100.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/its_552_68.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/going_565_100.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/to_578_100.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/be_584_100.mp4",
    "https://roplabs-mad.s3-us-west-2.amazonaws.com/segments/n1IJt22JFY4/coming_591_100.mp4"
  ];

  var localList = [
    "/tmp/this_453_100.mp4",
    "/tmp/is_468_96.mp4",
    "/tmp/a_480_42.mp4",
    "/tmp/huge_488_95.mp4",
    "/tmp/movie_526_100.mp4",
    "/tmp/its_552_68.mp4",
    "/tmp/going_565_100.mp4",
    "/tmp/to_578_100.mp4",
    "/tmp/be_584_100.mp4",
    "/tmp/coming_591_100.mp4"
  ];

  // var cmd = "curl -o " + resultLocalPath + " " + url;

  var outputFile = Date.now() + ".mp4";
  var outputFileAbsolutePath = "/tmp/" + outputFile;

  var cmd = (typeof(event.queryParams) !== "undefined" && event.queryParams.cmd.length > 0)  ? event.queryParams.cmd : "cd /tmp && echo -e '" + list.join("\n") + "' | xargs -n 1 -P 8 curl -s -O";
  var concatCmd = (typeof(event.queryParams) !== "undefined" && event.queryParams.cmd.length > 0) ? "" : buildVideoConcatCommand(localList, outputFileAbsolutePath);

  var start;
  var end;

  start = new Date();

  // console.log("cmd is " + event.query.cmd);
  const child = exec(cmd, {maxBuffer: 1024 * 10000}, (error, stdout, stderr) => {
      end = new Date();
      console.log("fetchSegments took: " + (end - start));
      // Resolve with result of process
      if (error) {
        callback(error);
      } 

      if (concatCmd === "") {
        return callback(null,stdout);
      }

      start = new Date();

      exec(concatCmd, {maxBuffer: 1024 * 10000}, (error, stdout, stderr) => {

        end = new Date();

        console.log("concat took: " + (end - start));
        if (error) {
          callback(error);
        } 

        start = new Date();


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
          end = new Date();
          console.log("s3 upload took: " + (end - start));
          return callback(null,data.Location);
        });
      });
  });

};