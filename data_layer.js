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
  const pandoraChart = new FuzzySearch(pandora200, ['name'], {
    caseSensitive: true,
    sort: true
  });
  for (let i = 0; i < 200; i++) {
    var spotifySong = spotify200[i];
    const pandoraMatch = pandoraChart.search(spotifySong.name)[0];
    if (pandoraMatch) { //found a pandora match
      var count = 0;
      for (let j = 0; j < spotifySong.artists.length; j++) {
        for (let k = 0; k < pandoraMatch.artists.length; k++) {
          if (spotifySong.artists[j].includes(pandoraMatch.artists[k])) {
            count++;
          }
        }
      }
      if (count == 0) {
        onSpotifyNotPandora.push(spotifySong);
      }
    } else {
      //on spotify but not on pandora
      onSpotifyNotPandora.push(spotifySong);
    }
  }

  await storage.setItem('chartsIntersection', similarTracks);
  await storage.setItem('pandora200', pandora200);
  await storage.setItem('spotify200', spotify200);
  await storage.setItem('pandoraExcl', onPandoraNotSpotify);
  await storage.setItem('spotifyExcl', onSpotifyNotPandora);
}

module.exports.pushWeeklyEmail = async function () {
  var recipients = await storage.getItem('recipients');
  var chartsIntersection = await storage.getItem('chartsIntersection');
  var pandora200 = await storage.getItem('pandora200');
  var spotify200 = await storage.getItem('spotify200');

  const similarByRankDiff = chartsIntersection.slice(0).sort((a, b) => {
    return Math.abs(b.pandora.rank - b.spotify.rank) - Math.abs(a.pandora.rank - a.spotify.rank);
  });

  var htmlContent = formatEmailHTML(similarByRankDiff, pandora200, spotify200);
  var mailOptions = {
    from: 'pandoradigest@gmail.com',
    to: recipients.toString(),
    subject: 'Top Charts Weekly Digest',
    html: htmlContent,
    attachments: [{ // utf-8 string as an attachment
      filename: 'data.tsv',
      content: formatCSV(similarByRankDiff)
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

function formatEmailHTML(similaritiesByRank, pandora200, spotify200) {
  var mainChartBody = ``;
  var p200 = ``;
  var s200 = ``;
  for (let j = 0; j < Math.min(similaritiesByRank.length, 5); j++) {
    const match1 = similaritiesByRank[j];
    mainChartBody += `
        <tr>
            <th scope="row"></th>
            <td>${match1.spotify.name} by ${match1.spotify.artists.toString()}</td>
            <td><center>${match1.pandora.rank}</center></td>
            <td><center>${match1.spotify.rank}</center></td>
            <td><center>${Math.abs(match1.pandora.rank - match1.spotify.rank)}</center></td>
        </tr>`;
  }
  for (let j = 0; j < Math.min(pandora200.length, 5); j++) {
    const pTrack = pandora200[j];
    const sTrack = spotify200[j];
    p200 += `
        <tr>
            <th scope="row"></th>
            <td>${pTrack.name}</td>
            <td><center>${pTrack.rank}</center></td>
            <td><center>${pTrack.streams}</center></td>
        </tr>`;
    s200 += `
        <tr>
            <th scope="row"></th>
            <td>${sTrack.name}</td>
            <td><center>${sTrack.rank}</center></td>
            <td><center>${sTrack.streams}</center></td>
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
  <div id=constainer>
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
                    <th> Disparity </th>
                </tr>
            </thead>
            <!--Table head-->
            <!--Table body-->
            <tbody>
                ${mainChartBody}
                <tr>
                    <th scope="row"></th>
                    <td><b>... ${similaritiesByRank.length - Math.min(similaritiesByRank.length, 5)} <a href="https://musicchartscompare.herokuapp.com/">More</a></b></td>
                </tr>
            </tbody>
            <!--Table body-->
            </table>
            <!--Table-->
        </div>
        <div>
                <!--Table-->
                <h3>Pandora Top 200</h3>
                <table id="rankDiff" class="table table-striped table-hover table-sm table-borderless">
                <!--Table head-->
                <thead>
                    <tr>
                        <th></th>
                        <th> Track Name </th>
                        <th> Rank </th>
                        <th> US Streams </th>
                    </tr>
                </thead>
                <!--Table head-->
                <!--Table body-->
                <tbody>
                    ${p200}
                    <tr>
                        <th scope="row"></th>
                        <td><b>... ${pandora200.length - Math.min(pandora200.length, 5)} <a href="https://musicchartscompare.herokuapp.com/">More</a></b></td>
                    </tr>
                </tbody>
                <!--Table body-->
                </table>
                <!--Table-->
          </div>
          <div>
                <!--Table-->
                <h3>Spotify Top 200</h3>
                <table id="rankDiff" class="table table-striped table-hover table-sm table-borderless">
                <!--Table head-->
                <thead>
                    <tr>
                        <th></th>
                        <th> Track Name </th>
                        <th> Rank </th>
                        <th> US Streams </th>
                    </tr>
                </thead>
                <!--Table head-->
                <!--Table body-->
                <tbody>
                    ${s200}
                    <tr>
                        <th scope="row"></th>
                        <td><b>... ${spotify200.length - Math.min(spotify200.length, 5)} <a href="https://musicchartscompare.herokuapp.com/">More</a></b></td>
                    </tr>
                </tbody>
                <!--Table body-->
                </table>
                <!--Table-->
          </div>
          <div>
            <span>To unsubscribe go to "https://musicchartscompare.herokuapp.com/unsubscribe/youremailaddress"</span>
          </div>
  </div>`
  return template;
}

module.exports.getHTML = async function () {
  var chartsIntersection = await storage.getItem('chartsIntersection')
  var similaritiesByRank = chartsIntersection.sort((a, b) => {
    return Math.abs(b.pandora.rank - b.spotify.rank) - Math.abs(a.pandora.rank - a.spotify.rank);
  });
  var pandora200 = await storage.getItem('pandora200');
  var spotify200 = await storage.getItem('spotify200');
  var pandoraExcl = await storage.getItem('pandoraExcl');
  var spotifyExcl = await storage.getItem('spotifyExcl');

  var mainChartBody = ``;
  var pandoraChart = ``;
  var spotifyChart = ``;
  var exclPandoraChart = ``;
  var exclSpotifyChart = ``;

  //pandora exclusive
  for (let i = 0; i < similaritiesByRank.length; i++) {
    const match = similaritiesByRank[i];
    mainChartBody += `
        <tr>
            <td>${match.spotify.name} by ${match.spotify.artists.toString()}</td>
            <td><center>${match.pandora.rank}</center></td>
            <td><center>${match.spotify.rank}</center></td>
            <td><center>${Math.abs(match.pandora.rank - match.spotify.rank)}</center></td>
            <td><center>${match.pandora.streams.toLocaleString()}</center></td>
            <td><center>${match.spotify.streams.toLocaleString()}</center></td>
            <td><center>${Math.abs(match.pandora.streams - match.spotify.streams).toLocaleString()}</center></td>
        </tr>`;
  }

  //top 200 chart
  for (let j = 0; j < pandora200.length; j++) {
    const tr1 = pandora200[j];
    const tr2 = spotify200[j];
    pandoraChart += `
        <tr>
            <th><center>${tr1.rank}</center></th>
            <td>${tr1.name} by ${tr1.artists.toString()}</td>
            <td><center>${tr1.streams.toLocaleString()}</center></td>
        </tr>`;

    spotifyChart += `
        <tr>
            <th><center>${tr2.rank}</center></th>
            <td>${tr2.name} by ${tr2.artists.toString()}</td>
            <td><center>${tr2.streams.toLocaleString()}</center></td>
        </tr>`;
  }

  //pandora exclusive
  for (let i = 0; i < pandoraExcl.length; i++) {
    const tr = pandoraExcl[i];
    exclPandoraChart += `
      <tr>
          <th><center>${tr.rank}</center></th>
          <td>${tr.name} by ${tr.artists.toString()}</td>
          <td><center>${tr.streams.toLocaleString()}</center></td>
      </tr>`;

  }

  //spotify exclusive
  for (let i = 0; i < spotifyExcl.length; i++) {
    const tr = spotifyExcl[i];
    exclSpotifyChart += `
      <tr>
          <th><center>${tr.rank}</center></th>
          <td>${tr.name} by ${tr.artists.toString()}</td>
          <td><center>${tr.streams.toLocaleString()}</center></td>
      </tr>`;

  }

  const template = Fs.readFileSync(Path.resolve(__dirname, 'public', 'webpage.html')).toString();
  var html = parseTpl(template, {
    mainChartBody: mainChartBody,
    pandora200: pandoraChart,
    spotify200: spotifyChart,
    exclPandoraChart: exclPandoraChart,
    exclSpotifyChart: exclSpotifyChart
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

//helpers
function get(path, obj, fb = `$\{${path}}`) {
  return path.split('.').reduce((res, key) => res[key] || fb, obj);
}

function parseTpl(template, map, fallback) {
  return template.replace(/\$\{.+?}/g, (match) => {
    const path = match.substr(2, match.length - 3).trim();
    return get(path, map, fallback);
  });
}