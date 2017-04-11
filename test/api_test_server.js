
var http = require('http');
var url = require('url');
var VideoMerger = require(__dirname + '/../lib/video_merger.js')

var server = http.createServer(function(req, res) {
  var params = url.parse(req.url, true).query;

  if (typeof req.headers["authorization"] !== "undefined") {
    var authorizationToken = req.headers["authorization"].replace("Token ","");
    params.authentication_token = authorizationToken;
  }

  var videoMerger = new VideoMerger(params);

  videoMerger.concatSegments().then(function(result){
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'text/plain');

    res.writeHead(200);
    res.end(result);
  }).catch(function(error) {
    res.writeHead(400);
    res.end(error.message);
  });

});

server.listen(9000);
