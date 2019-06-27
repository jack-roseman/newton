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
const SPOTIFY_CLIENT_ID = 'f530b38104e943b4baa08387593feeaf';
const SPOTIFY_CLIENT_SECRET = '6983abfc942944da8953282c430c2c85';

var SpotifyWebApi = require('spotify-web-api-node');
 
// credentials are optional
var spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET
});

async function getSpotifyToken_() {
  //we want to use the cache here so we're not constantly fetching the auth token
  var cached = spotifyApi.getAccessToken();
  if (cached != null) {
    console.log('The access token is ' + cached);
    return cached;
  }
  
  await spotifyApi.clientCredentialsGrant().then(
    function(data) {
      console.log('The access token expires in ' + data.body['expires_in']);
      console.log('The access token is ' + data.body['access_token']);
   
      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body['access_token']);
    },
    function(err) {
      console.log('Something went wrong when retrieving an access token', err);
    }
  );
  return spotifyApi.getAccessToken();
}

const artists = require('node-persist');
const spotify = require('node-persist');

artists.init({
  dir: Path.resolve(__dirname, '.node-persist/artists')
});

spotify.init({
  dir: Path.resolve(__dirname, '.node-persist/spotify')
});


var exports = {};
/**
 * Helpers
 */

exports.getSpotifyFeatured = async function() {
  await getSpotifyToken_();
  const featured = await spotifyApi.getFeaturedPlaylists();
  const playlists = [];
  featured.body.playlists.items.forEach(async (p_list) => {
    var x_tracks = await spotifyApi.getPlaylistTracks(p_list.id);
    var x_tracks_ids = x_tracks.body.items.map((el) => el.track.id);
    var playlist = {
      service: 'Spotify',
      name: p_list.name,
      tracks: x_tracks_ids
    }
    playlists.push(playlist);
  });
  return playlists;
}


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
      console.log("ERROR");
      reject(err);
    });
  });
}

/**
 * This function takes the "meta_artists.tsv" and maps it into an updated object that will be stored in the database.
 */
exports.generateNBSArtistMap = function() {
  const path = Path.resolve(__dirname, 'static', 'meta_artists.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator:'\t'
  }));

  return new Promise((resolve, reject) => {
    reader.on('data', (data) => {
      artists.setItem(data['artist_id'], data['artist_name'], );
    });

    reader.on('end', () => {
      resolve();
    });
  });
}


/**
 * EXPORTED METHODS
 */
exports.downloadStaticFiles = async function() {
  downloadStatic('https://spotifycharts.com/regional/us/weekly/latest/download', 'us_weekly_latest.csv')
  .then(console.log("Static file downloaded"));
  downloadStatic(`https://api.nextbigsound.com/static/v2/?access_token=${NBS_ACCESS_TOKEN}&filepath=java/industry_report/plays/ranked_ratios.tsv`, 'industry_report.tsv')
  .then(console.log("Static file downloaded"));
  downloadStatic(`https://api.nextbigsound.com/static/v2/?access_token=${NBS_ACCESS_TOKEN}&filepath=java/industry_report/plays/meta_artists.tsv`, 'meta_artists.tsv')
  .then(console.log("Static file downloaded"));
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
      console.log(data);
      spotify_top200.push([data['Track Name'], data['Artist'], parseInt(data['Streams'])]);
    });

    reader.on('end', () => {
      spotify_top200.sort((a,b) => {
        resolve(spotify_top200);
        return b[2] - a[2];
      })
    });

    reader.on('error', (err) => {
      console.error(err);
      reject();
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

    reader.on('error', (err) => {
      console.error(err);
      reject();
    });

    reader.on('end', () => {
    // Please pay attention to the month (parts[1]); JavaScript counts months from 0:
    // January - 0, February - 1, etc.
      var current_date = new Date();
      var week_ago_date = new Date();
      week_ago_date.setDate(current_date.getDate() - 7); //date 7 days ago

      //first we filter out tracks that are out of date
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

      //sort in descending order
      tracks.sort((a, b) => {
        return b[2] - a[2];
      });

      tracks.forEach(async (element) => {
        var artist_ids = JSON.parse(element[1]);
        artist_ids.map(async (id) => {
          artists.getItem(`${id}`);
        });
      });
      
      resolve(tracks); 
    });
  });
}

module.exports = exports;