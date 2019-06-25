/**
 * 
 * This module is called "data_layer" because it is responsible for server side 
 * functions that interact with a database and get raw data from other endpoints,
 * like spotifycharts.com/regional for example. 
 * 
 * Many of these functions will be run during the night job, but others may be called upon HTTP request
 * 
 */

const Fs = require('fs');
const Path = require('path');
const Axios = require('axios');
const fetch = require('node-fetch');
var csv = require('csv-parser');

const NBS_ACCESS_TOKEN = '00ca8bb19fc5246774dfbcb6215a9cc6';
var exports = {};

exports.nightJob = function() {
  downloadSpotifyChart('top200', 'us', 'weekly', 'latest');
  downloadSpotifyChart('top200', 'us', 'daily', 'latest');
}
/**
 * Get's the latest Spotify top spin charts
 * https://spotifycharts.com/regional
 * 
 * @return {Array} [track_name, artist_name]
 * @customfunction
 */
exports.getSpotifyTopSpins = async function(country='us', freq='weekly', date='latest') {
  const path = Path.resolve(__dirname, 'files', `${country}_${freq}_${date}.csv`);
  const tracks = [];
  const reader = Fs.createReadStream(path);
  var i = 0;
  var parser = reader.pipe(csv({headers:false}));

  return new Promise((resolve, reject) => {
    parser.on('data', (data) => {
      if(i >= 2 ) {
        tracks.push([parseInt(data[0]), data[1], data[2]]);
      }
      i++;
    })
    parser.on('end', () => resolve(tracks));
  });
}

/**
 * Get's the latest Pandora top spin charts
 * https://www.nextbigsound.com/charts/trendsetters
 * 
 * @return {Array} [track_name, artist_name]
 * @customfunction
 */
exports.getNBSTopSpins = async function() {
  var tracks = [];
  const url = `https://api.nextbigsound.com/charts/v2/2/releases/latest/appearances?access_token=${NBS_ACCESS_TOKEN}
  &fields=*,items.*,items.artist.name,items.track.name,items.track.artists.items.id,items.track.artists.items.name`
  
  return new Promise((resolve, reject) => {
    fetch(url, {}).then((res) => res.json()).then((json) => {
      for(var i=0; i<json.size; i++) {
        var item = json.items[i];
        tracks.push([i+1, item.track.name, item.track.artists.items[0].name]);
      }
      resolve(tracks);
    });
  });
}


/**
 * Helpers
 */


 /**
 * Downloads csv file from a url and pipes the raw data into a file under the 
 * the "files" folder under the server's root directory. This function is only called during the night job
 * @param {String} url The url from which a file download is initiated
 * @customfunction
 */
async function downloadSpotifyChart(chart_type, country, daily_or_weekly, date_range) {
  const chart = chart_type === 'top200' ? 'regional' : 'viral';
  const url = 'https://spotifycharts.com/' + chart + '/' + country + '/' + daily_or_weekly + '/' + date_range + '/download';
  const path = Path.resolve(__dirname, 'files', 'us_' + daily_or_weekly + '_latest.csv');
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

module.exports = exports;