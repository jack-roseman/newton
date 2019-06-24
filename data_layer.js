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
const csv = require('csv-parser')
const PANDORA_ACCESS_TOKEN = '00ca8bb19fc5246774dfbcb6215a9cc6';

var exports = {};

/**
 * Get's the latest Spotify top spin charts
 * https://spotifycharts.com/regional
 * 
 * @return {Array} [track_name, artist_name]
 * @customfunction
 */
exports.getSpotifyTopSpins = async function() {
  const path = Path.resolve(__dirname, 'files', 'us_weekly_latest.csv');
  const tracks = [];
  Fs.createReadStream(path)
  .pipe(csv())
  .on('data', (data) => tracks.push([parseInt(data['Position']), data['Track Name'], data['Artist']]));
  return tracks;
}

/**
 * Get's the latest Pandora top spin charts
 * https://www.nextbigsound.com/charts/trendsetters
 * 
 * @return {Array} [track_name, artist_name]
 * @customfunction
 */
exports.getPandoraTopSpins = async function() {
  const url = "https://api.nextbigsound.com/charts/v2/2/releases/latest/appearances?access_token=" + PANDORA_ACCESS_TOKEN + "&exclude=items.chart,items.release,items.curationAppearance,items.nextNewerAppearance&excludeSelf=true&fields=*,items.*,items.artist.id,items.playlinks,items.artist.name,items.artist.scores,items.track.id,items.track.name,items.track.artists.items.id,items.track.artists.items.name,items.track.artists.items.scores,items.nextOlderAppearance.rank,items.nextOlderAppearance.publishedAt&limit=100&offset=0"
  const response = await fetch(url, {});
  const json = await response.json();
  var tracks = [];
  for(var i=0; i<json.size; i++) {
    var item = json.items[i];
    tracks.push([i+1, item.track.name, item.track.artists.items[0].name]);
  }
  return tracks;
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