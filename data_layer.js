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
const artists = require('node-persist');

artists.init({
  dir: Path.resolve(__dirname, '.node-persist/artists')
});

// Please pay attention to the month (parts[1]); JavaScript counts months from 0:
// January - 0, February - 1, etc.
var current_date = new Date();
var week_ago_date = new Date();
week_ago_date.setDate(current_date.getDate() - 7); //date 7 days ago

var exports = {};
/**
 * Helpers
 */

/**
 * Downloads a resource from a url and pipes the raw data into a file under the 
 * the "static" folder under the server's root directory. 
 * This function is only called during the night job.
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
      console.log(err);
      reject(err);
    });
  });
}

/**
 * This function takes the "meta_artists.tsv" and maps it into an updated object that will be stored in the database.
 */
exports.generateNBSArtistMap = function () {
  const path = Path.resolve(__dirname, 'static', 'meta_artists.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator: '\t'
  }));

  return new Promise((resolve, reject) => {
    reader.on('data', (data) => {
      artists.setItem(data['artist_id'], data['artist_name']);
    });

    reader.on('end', () => {
      resolve();
    });
  });
}


/**
 * EXPORTED METHODS
 */
exports.downloadStaticFiles = async function () {
  downloadStatic('https://spotifycharts.com/regional/us/weekly/latest/download', 'spotify_us_weekly_latest.csv')
    .then(console.log("Static file downloaded"));
  downloadStatic(`https://api.nextbigsound.com/static/v2/?access_token=${NBS_ACCESS_TOKEN}&filepath=java/industry_report/plays/ranked_ratios.tsv`, 'industry_report.tsv')
    .then(console.log("Static file downloaded"));
  downloadStatic(`https://api.nextbigsound.com/static/v2/?access_token=${NBS_ACCESS_TOKEN}&filepath=java/industry_report/plays/meta_artists.tsv`, 'meta_artists.tsv')
    .then(console.log("Static file downloaded"));
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, 7000);
  });
}

/**
 * Get's the latest Spotify top spin charts
 * https://spotifycharts.com/regional
 */
exports.getSpotifyTopStreams = async function () {
  const path = Path.resolve(__dirname, 'static', 'spotify_us_weekly_latest.csv');
  var reader = Fs.createReadStream(path).pipe(csv({
    skipLines: 1
  }));

  return new Promise((resolve, reject) => {
    var spotify_top200 = [];
    reader.on('data', (data) => {
      const newTrack = {
        name: data['Track Name'],
        artists: [data['Artist']],
        streams: parseInt(data['Streams']),
        rank: -1
      }
      spotify_top200.push(newTrack);
    });

    reader.on('end', () => {
      const sorted = spotify_top200.sort((a, b) => {
        return b.streams - a.streams;
      })
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].rank = i + 1;
      }
      resolve(sorted);
    });

    reader.on('error', (err) => {
      console.error(err);
      reject();
    });
  });
}


/**
 * Get's the latest Pandora top spin charts
 * https://www.nextbigsound.com/charts
 */
exports.getNBSTopSpins = async function () {
  const path = Path.resolve(__dirname, 'static', 'industry_report.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator: '\t',
    quote: ''
  }));
  return new Promise((resolve, reject) => {
    var pandora_top200 = [];

    reader.on('data', (data) => {
      const totalStreams = parseInt(data['short_value']) + parseInt(data['long_value']);
      const d = new Date(data['day']);
      var artist_ids = JSON.parse(data['artist_ids']);

      if (d.getTime() > week_ago_date.getTime() && d.getTime() <= current_date.getTime()) {
        const newTrack = {
          name: data['track_name'],
          artists: artist_ids,
          streams: totalStreams,
          rank: -1
        }
        pandora_top200.push(newTrack);
      }
    });

    reader.on('end', async () => {
      //sort in descending order by total streams
      const sorted = pandora_top200.sort((a, b) => {
        return b.streams - a.streams;
      }).slice(0, 200);

      for (let i = 0; i < sorted.length; i++) {
        sorted[i].rank = i + 1;
        sorted[i].artists = await Promise.all(sorted[i].artists.map((id) => artists.getItem(`${id}`)));
      }
      resolve(sorted);
    });

    reader.on('error', (err) => {
      console.error(err);
      reject();
    });
  });
}

module.exports = exports;