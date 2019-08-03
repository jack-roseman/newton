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
const storage = require('node-persist');
var nodemailer = require('nodemailer');
var FuzzySearch = require('fuzzy-search');
const NBS_ACCESS_TOKEN = '00ca8bb19fc5246774dfbcb6215a9cc6';

var similarTracks = [];
var onPandoraNotSpotify = [];
var onSpotifyNotPandora = [];

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'pandoradigest@gmail.com',
    pass: 'pandoradigest88'
  }
});

storage.init({
  dir: Path.resolve(__dirname, '.node-persist/storage')
});

// mailingList.init({
//   dir: Path.resolve(__dirname, '.node-persist/mailingList')
// });

// Please pay attention to the month (parts[1]); JavaScript counts months from 0:
// January - 0, February - 1, etc.
var current_date = new Date();
var week_ago_date = new Date();
week_ago_date.setDate(current_date.getDate() - 7); //date 7 days ago

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
function generateNBSArtistMap() {
  const path = Path.resolve(__dirname, 'static', 'meta_artists.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator: '\t'
  }));

  return new Promise((resolve, reject) => {
    var artists = {};
    reader.on('data', (data) => {
      artists[parseInt(data['artist_id'])] = data['artist_name'];
    });

    reader.on('end', () => {
      storage.setItem('artists', JSON.stringify(artists));
      resolve();
    });
  });
}


/**
 * EXPORTED METHODS
 */
async function downloadStaticFiles() {
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
async function getSpotifyTopStreams() {
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
async function getNBSTopSpins() {
  const path = Path.resolve(__dirname, 'static', 'industry_report.tsv');
  var reader = Fs.createReadStream(path).pipe(csv({
    separator: '\t',
    quote: ''
  }));
  return new Promise(async (resolve, reject) => {
    const data = await storage.getItem('artists')
    const artists = JSON.parse(data);
    var pandora_top200 = [];
    var checkDups = new Map();
    reader.on('data', (data) => {
      if (!checkDups.get(parseInt(data['track_id']))) {
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
          checkDups.set(parseInt(data['track_id']), 1);
        }
      }
    });

    reader.on('end', async () => {
      //sort in descending order by total streams
      const sorted = pandora_top200.sort((a, b) => {
        return b.streams - a.streams;
      }).slice(0, 200);

      for (let i = 0; i < sorted.length; i++) {
        sorted[i].rank = i + 1;
        sorted[i].artists = await Promise.all(sorted[i].artists.map((id) => artists[`${id}`]));
      }
      resolve(sorted);
    });

    reader.on('error', (err) => {
      console.error(err);
      reject();
    });
  });
}

module.exports.compareCharts = async function () {
  const pandora200 = await getNBSTopSpins();
  const spotify200 = await getSpotifyTopStreams();
  const spotifyChart = new FuzzySearch(spotify200, ['name'], {
    caseSensitive: true,
    sort: true
  });
  for (let i = 0; i < 200; i++) {
    var pandoraSong = pandora200[i];
    const spotifyMatch = spotifyChart.search(pandoraSong.name)[0];
    if (spotifyMatch) { //found a spotify match
      var count = 0;
      for (let j = 0; j < pandoraSong.artists.length; j++) {
        for (let k = 0; k < spotifyMatch.artists.length; k++) {
          if (pandoraSong.artists[j].includes(spotifyMatch.artists[k])) {
            count++;
          }
        }
      }
      if (count > 0) {
        similarTracks.push({
          pandora: pandoraSong,
          spotify: spotifyMatch
        });
      } else {
        onPandoraNotSpotify.push(pandoraSong);
      }
    } else {
      //on pandora but not on spotify
      onPandoraNotSpotify.push(pandoraSong);
    }
  }
  await storage.setItem('chartsIntersection', similarTracks);
  return similarTracks;
}

module.exports.pushWeeklyEmail = async function () {
  var recipients = await storage.getItem('recipients');
  var chartsIntersection = await storage.getItem('chartsIntersection');

  const similarByRankDiff = chartsIntersection.slice(0).sort((a, b) => {
    return Math.abs(b.pandora.rank - b.spotify.rank) - Math.abs(a.pandora.rank - a.spotify.rank);
  });

  const similarByStreamDiff = chartsIntersection.slice(0).sort((a, b) => {
    return Math.abs(b.pandora.streams - b.spotify.streams) - Math.abs(a.pandora.streams - a.spotify.streams);
  });
  var htmlContent = formatEmailHTML(similarByRankDiff, similarByStreamDiff);
  var mailOptions = {
    from: 'pandoradigest@gmail.com',
    to: recipients.toString(),
    subject: 'Top Charts Weekly Digest',
    html: htmlContent,
    attachments: [{ // utf-8 string as an attachment
      filename: 'similarSongs.tsv',
      content: formatCSV(similarTracks)
    }]
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}

module.exports.getHTML = async function () {
  var chartsIntersection = await storage.getItem('chartsIntersection');

  const similarByRankDiff = chartsIntersection.slice(0).sort((a, b) => {
    return Math.abs(b.pandora.rank - b.spotify.rank) - Math.abs(a.pandora.rank - a.spotify.rank);
  });

  const similarByStreamDiff = chartsIntersection.slice(0).sort((a, b) => {
    return Math.abs(b.pandora.streams - b.spotify.streams) - Math.abs(a.pandora.streams - a.spotify.streams);
  });
  return formatWebHTML(similarByRankDiff, similarByStreamDiff);
}

function formatCSV(similarities) {
  var similarityTable = `\tPandora Track\tPandora Artist\tPandora Rank\tTotal Pandora Streams\tSpotify Track\tSpotify Artist\tSpotify Rank\tTotal Spotify Streams\tRank Difference\tStreaming Difference\n`;
  for (let i = 0; i < similarities.length; i++) {
    const match = similarities[i];
    similarityTable += `\t${match.pandora.name}\t${match.pandora.artists.toString().replace(/,/g, '/')}\t${match.pandora.rank}\t${match.pandora.streams}\t`;
    similarityTable += `${match.spotify.name}\t${match.spotify.artists.toString().replace(/,/g, '/')}\t${match.spotify.rank}\t${match.spotify.streams}\t`;
    similarityTable += `${Math.abs(match.pandora.rank - match.spotify.rank)}\t${Math.abs(match.pandora.streams - match.spotify.streams)}\n`;
  }
  return similarityTable;
}

function formatEmailHTML(similaritiesByRank, similaritiesByStreams) {
  var rankBody = ``;
  var streamBody = ``;
  for (let j = 0; j < Math.min(similaritiesByRank.length, 10); j++) {
    const match1 = similaritiesByRank[j];
    const match2 = similaritiesByStreams[j];
    rankBody += `
        <tr>
            <th scope="row"></th>
            <td>${match1.spotify.name} by ${match1.spotify.artists.toString()}</td>
            <td><center>${match1.pandora.rank}</center></td>
            <td><center>${match1.spotify.rank}</center></td>
            <td><center>${Math.abs(match1.pandora.rank - match1.spotify.rank)}</center></td>
        </tr>`;

    streamBody += `
        <tr>
            <th scope="row"></th>
            <td>${match2.spotify.name} by ${match2.spotify.artists.toString()}</td>
            <td><center>${match2.pandora.streams.toLocaleString()}</center></td>
            <td><center>${match2.spotify.streams.toLocaleString()}</center></td>
            <td><center>${Math.abs(match2.pandora.streams - match2.spotify.streams).toLocaleString()}</center></td>
        </tr>`;
  }
  var template = `
  <style>
  th, td {
    padding: 5px;
  }
  table {
    width: 100%;
  }
  </style>
        <div>
            <!--Table-->
            <h3>Tracks on both Pandora and Spotify Top 200, by difference in chart ranking</h3>
            <table id="rankDiff" class="table table-striped table-hover table-sm table-borderless">
            <!--Table head-->
            <thead>
                <tr>
                    <th></th>
                    <th> Track Name </th>
                    <th> Pandora Rank </th>
                    <th> Spotify Rank </th>
                    <th> Difference </th>
                </tr>
            </thead>
            <!--Table head-->
            <!--Table body-->
            <tbody>
                ${rankBody}
                <tr>
                    <th scope="row"></th>
                    <td><b>... ${similaritiesByRank.length - Math.min(similaritiesByRank.length, 10)} More</b></td>
                </tr>
            </tbody>
            <!--Table body-->
            </table>
            <!--Table-->
        </div>
        <div>
            <!--Table-->
            <h3>Tracks on both Pandora and Spotify Top 200, by difference in streams</h3>
            <table id="streamDiff" class="table table-striped table-hover table-sm table-borderless">
            <!--Table head-->
            <thead>
                <tr>
                    <th></th>
                    <th> Track Name </th>
                    <th> Pandora Streams </th>
                    <th> Spotify Streams </th>
                    <th> Difference </th>
                </tr>
            </thead>
            <!--Table head-->
            <!--Table body-->
            <tbody>
                ${streamBody}
                <tr>
                    <th scope="row"></th>
                    <td><b>... ${similaritiesByStreams.length - Math.min(similaritiesByStreams.length, 10)} More</b></td>
                </tr>
            </tbody>
            <!--Table body-->
            </table>
            <!--Table--> 
        </div>`
  return template;
}

function formatWebHTML(similaritiesByRank, similaritiesByStreams) {
  var rankBody = ``;
  var streamBody = ``;
  for (let j = 0; j < similaritiesByRank.length; j++) {
    const match1 = similaritiesByRank[j];
    const match2 = similaritiesByStreams[j];
    rankBody += `
        <tr>
            <td>${match1.spotify.name} by ${match1.spotify.artists.toString()}</td>
            <td><center>${match1.pandora.rank}</center></td>
            <td><center>${match1.spotify.rank}</center></td>
            <td><center>${Math.abs(match1.pandora.rank - match1.spotify.rank)}</center></td>
        </tr>`;

    streamBody += `
        <tr>
            <td>${match2.spotify.name} by ${match2.spotify.artists.toString()}</td>
            <td><center>${match2.pandora.streams.toLocaleString()}</center></td>
            <td><center>${match2.spotify.streams.toLocaleString()}</center></td>
            <td><center>${Math.abs(match2.pandora.streams - match2.spotify.streams).toLocaleString()}</center></td>
        </tr>`;
  }
  const template = Fs.readFileSync(Path.resolve(__dirname, 'public', 'webpage.html')).toString();
  var html = parseTpl(template, {
    rankBody: rankBody,
    streamBody: streamBody
  });
  return html;
}

module.exports.addEmailRecipient = async function (newRecipient) {
  return storage.getItem('recipients')
    .then((recipients) => {
      recipients.push(newRecipient);
      return storage.setItem('recipients', recipients);
    });
}

module.exports.unsubcribeRecipient = async function (email) {
  return storage.getItem('recipients')
    .then((recipients) => {
      const filtered = recipients.filter((userEmail) => userEmail != email);
      return storage.setItem('recipients', filtered);
    });
}

module.exports.start = async () => {
  await downloadStaticFiles();
  await generateNBSArtistMap();
}

function get(path, obj, fb = `$\{${path}}`) {
  return path.split('.').reduce((res, key) => res[key] || fb, obj);
}

function parseTpl(template, map, fallback) {
  return template.replace(/\$\{.+?}/g, (match) => {
    const path = match.substr(2, match.length - 3).trim();
    return get(path, map, fallback);
  });
}