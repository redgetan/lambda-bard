if [ -f ./bin/linux_64/ffmpeg ];
then
   echo "Setup already complete. exiting.."
   exit
fi

echo "==== INSTALLING BINARIES"
echo
echo
echo

mkdir -p ./bin/darwin_64
mkdir -p ./bin/linux_64

wget https://s3-us-west-2.amazonaws.com/roplabs-mad/binaries/darwin_64/ffmpeg -O ./bin/darwin_64/ffmpeg && chmod +x ./bin/darwin_64/ffmpeg
wget https://s3-us-west-2.amazonaws.com/roplabs-mad/binaries/linux_64/ffmpeg -O ./bin/linux_64/ffmpeg && chmod +x ./bin/linux_64/ffmpeg

echo "==== BINARIES now installed in ./bin directory"

