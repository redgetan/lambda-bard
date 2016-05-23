#!/bin/bash

zip --exclude '*.git*' --exclude 'deploy.sh' --exclude '*build/*' -r build/current.zip .
aws lambda update-function-code --function-name ffmpeg_concat  --zip-file fileb:///`pwd`/build/current.zip
