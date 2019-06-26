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
var csv = require('csv-parser');
const NBS_ACCESS_TOKEN = '00ca8bb19fc5246774dfbcb6215a9cc6';

const storage = require('node-persist');


var exports = {};
/**
 * Helpers
 */


 /**
 * Downloads a resource from a url and pipes the raw data into a file under the 
 * the "static" folder under the server's root directory. This function is only called during the night job
 */
async function downloadStatic(url, filename) {
  const path = Path.resolve(__dirname, 'static', filename);
  const writer = Fs.createWriteStream(path);
  const response = await Axios({
    method: 'GET',
    url,
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('end', () => {
      console.log("Resource Downloaded");
      resolve();
    });
    
    writer.on('error', err => {
      console.log("ERROR");
      reject(err);
    });
  });
}

/**
 * This function takes the "meta_artists.tsv" and maps it into an updated object that will be stored statically in the same folder.
 */
exports.generateNBSArtistMap = async function() {
  await storage.init({
    dir: '/',
 
    stringify: JSON.stringify,
 
    parse: JSON.parse,
 
    encoding: 'utf8',
 
    logging: false,  // can also be custom logging function
 
    ttl: false, // ttl* [NEW], can be true for 24h default or a number in MILLISECONDS or a valid Javascript Date object
 
    expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache
 
    // in some cases, you (or some other service) might add non-valid storage files to your
    // storage dir, i.e. Google Drive, make this true if you'd like to ignore these files and not throw an error
    forgiveParseErrors: false
 
});
  const path = Path.resolve(__dirname, 'static', 'meta_artists.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator:'\t'
  }));
  
  return new Promise((resolve, reject) => {
    reader.on('data', (data) => {
      storage.setItem(data['artist_id'], data['artist_name']);
    });

    reader.on('end', () => {
      resolve();
    });
  });
}


/**
 * EXPORTED METHODS
 */
exports.nightJob = async function() {
  downloadStatic('https://spotifycharts.com/regional/us/weekly/latest/download', 'us_weekly_latest.csv');
  downloadStatic(`https://api.nextbigsound.com/static/v2/?access_token=${NBS_ACCESS_TOKEN}&filepath=java/industry_report/plays/ranked_ratios.tsv`, 'industry_report.tsv');
  downloadStatic(`https://api.nextbigsound.com/static/v2/?access_token=${NBS_ACCESS_TOKEN}&filepath=java/industry_report/plays/meta_artists.tsv`, 'meta_artists.tsv');
}


/**
 * Get's the latest Spotify top spin charts
 * https://spotifycharts.com/regional
 */
exports.getSpotifyTopStreams = async function() {
  const path = Path.resolve(__dirname, 'static', 'us_weekly_latest.csv');
  const spotify_top200 = [];
  var reader = Fs.createReadStream(path).pipe(csv({
    skipLines: 1
  }));

  return new Promise((resolve, reject) => {
    reader.on('data', (data) => {
      spotify_top200.push([data['Track Name'], data['Artist'], parseInt(data['Streams'])]);
    });

    reader.on('end', () => {
      spotify_top200.sort((a,b) => {
        return b[2] - a[2];
      })
      resolve(spotify_top200);
    });
  });
}

/**
 * Get's the latest Pandora top spin charts
 * https://www.nextbigsound.com/charts/trendsetters
 */
exports.getNBSTopSpins = async function() {
  const tracks = [];
  const path = Path.resolve(__dirname, 'static', 'industry_report.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator:'\t',
    quote: ''
  }));

  return new Promise((resolve, reject) => {
    reader.on('data', (data) => {
      tracks.push([data['track_name'], data['artist_ids'], parseInt(data['short_value']) + parseInt(data['long_value']), data['day']]);
    });
    reader.on('end', () => {
    // Please pay attention to the month (parts[1]); JavaScript counts months from 0:
    // January - 0, February - 1, etc.
      var current_date = new Date();
      var week_ago_date = new Date();
      week_ago_date.setDate(current_date.getDate() - 7); //date 7 days ago

      //first we filter out tracks that are within our 7 day date range
      tracks.filter((a) => {
        var parts = a[3].split('-');
        var year = parseInt(parts[0]);
        var month = parseInt(parts[1]);
        var day = parseInt(parts[2]);
        var d = new Date(year, month - 1, day);
        if (d.getTime() > week_ago_date.getTime() && d.getTime() <= current_date.getTime()) {
          return true
        }
        return false;
      });
      tracks.sort((a, b) => {
        return b[2] - a[2];
      });
      tracks.forEach(element => {
        //TODO finish generateNBSArtistMap() then load it and do a binary search on it
        // const artists = JSON.parse(element[1])
        // element[1] = artists;
        JSON.parse(element[1]).map(async (id) => {
          const lookup = '' + id;
          var val = await storage.getItem(lookup);
          console.log(val);
        });
      });
      resolve(tracks);
    });
  });
}

module.exports = exports;