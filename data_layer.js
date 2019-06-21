const Fs = require('fs');
const Path = require('path');
const Axios = require('axios');
var exports = {};

exports.spotifyViral50 = async function(where, how, when) {
  const url = 'https://spotifycharts.com/viral/' + where + '/' + how + '/' + when + '/download';
  const path = Path.resolve(__dirname, 'files', where + '_' + how + '_' + when + '.csv');
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

  }).then(() => {
    console.log('Spotify Viral 50 successfully downloaded');
  });
}

exports.spotifyTop200 = async function(where, how, when) {

  const url = 'https://spotifycharts.com/regional/' + where + '/' + how + '/' + when + '/download';
  const path = Path.resolve(__dirname, 'files', where + '_' + how + '_' + when + '.csv');
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

  }).then(() => {
    console.log('Spotify Top 200 successfully downloaded');
  });
}

module.exports = exports;