#!/bin/bash

zip --exclude '*.git*' --exclude 'deploy.sh' --exclude '*build*'  -r build/current.zip .
