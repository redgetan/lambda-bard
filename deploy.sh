#!/bin/bash

mkdir -p build
rm build/* 
zip --exclude '.git*' --exclude 'bin/darwin*' --exclude 'deploy.sh' --exclude 'build/*' --exclude 'events/*'  -r build/current.zip .
aws lambda update-function-code --function-name ffmpeg_concat  --zip-file fileb:///`pwd`/build/current.zip
version=`aws lambda publish-version --function-name ffmpeg_concat | jq -r .Version`
aws lambda update-alias --function-name ffmpeg_concat --function-version $version --name PROD
