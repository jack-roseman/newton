const Fs = require('fs');
const Path = require('path');
const Axios = require('axios');
const csv = require('csvtojson');

var exports = {};

async function download(url) {
  const dataPeriod = (url.charAt(38) === 'w' ? "weekly" : "daily");
  const path = Path.resolve(__dirname, 'files', 'us_' + dataPeriod + '_latest.csv');
  const writer = Fs.createWriteStream(path);
  const response = await Axios({
    method: 'GET',
    url,
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('end', () => {
      resolve();
    });

    writer.on('error', err => {
      reject(err);
    });
  });
}

exports.nightJob = function() {
  download("https://spotifycharts.com/regional/us/daily/latest/download");
  download("https://spotifycharts.com/regional/us/weekly/latest/download");
}

module.exports = exports;