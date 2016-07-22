# Usage

## Locally 

1. Install [lambda-local](https://www.npmjs.com/package/lambda-local)
2. Install ffmpeg
3. FFMPEG_PATH=$(which ffmpeg) lambda-local -l ffmpeg_concat.js -h handler -e events/basic.js -t 20

## Production

Merge random segments that match the given words

    curl -i "https://yq2h3krykl.execute-api.us-west-2.amazonaws.com/prod/query?text=hello+world"

Merge random segments that match the given word tags (%3A means colon char ':')

    curl -i "https://yq2h3krykl.execute-api.us-west-2.amazonaws.com/prod/query?text=i%3A409982+like%3AuDmF4CaFh94+hayley%3A411736+williams%3A411737"


# Deployment

1. Make sure 'aws' command line tool is installed
2. Make sure 'aws_access_key_id' and 'aws_secret_access_key' is configured in ~/.aws/credentials
3. Run the command

    ./deploy.sh







