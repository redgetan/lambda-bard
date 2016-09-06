
var http = require('http');
var url = require('url');
var VideoMerger = require(__dirname + '/../lib/video_merger.js')

var server = http.createServer(function(req, res) {
  var params = url.parse(req.url, true).query;

  var videoMerger = new VideoMerger(params);

  videoMerger.concatSegments().then(function(result){
    res.writeHead(200);
    res.end(result);
  }).catch(function(error) {
    res.writeHead(400);
    res.end(error.message);
  });

});

server.listen(9000);
