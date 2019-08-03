const data_layer = require('./data_layer');
var nodemailer = require('nodemailer');
var FuzzySearch = require('fuzzy-search');
const fs = require('fs');

var similarTracks1 = [];
var similarTracks2 = [];
var onPandoraNotSpotify = [];
var onSpotifyNotPandora = [];

var recipients = ['jackroseman33@yahoo.com']
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'pandoradigest@gmail.com',
        pass: 'pandoradigest88'
    }
});


const compareData = async () => {
    const pandora200 = await data_layer.getNBSTopSpins();
    const spotify200 = await data_layer.getSpotifyTopStreams();
    const spotifyChart = new FuzzySearch(spotify200, ['name'], {
        caseSensitive: true,
        sort: true
    });
    const pandoraChart = new FuzzySearch(pandora200, ['name'], {
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
                similarTracks1.push({
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

        // //lookup each spotify song on pandora and only accept when artist 
        // //this doesnt catch all of them because of the case is featured
        // var spotifySong = spotify200[i];
        // const pandoraMatch = pandoraChart.search(spotifySong.name)[0];
        // if (pandoraMatch) { //found a spotify match
        //     var count = 0;
        //     for (let j = 0; j < spotifySong.artists.length; j++) {
        //         for (let k = 0; k < pandoraMatch.artists.length; k++) {
        //             if (spotifySong.artists[j].includes(pandoraMatch.artists[k])) {
        //                 count++;
        //             }
        //         }
        //     }
        //     if (count > 0) {
        //         similarTracks2.push({
        //             pandora: pandoraMatch,
        //             spotify: spotifySong
        //         });
        //     } else {
        //         onSpotifyNotPandora.push(spotifySong);
        //     }
        // } else {
        //     //on spotify but not on pandora
        //     onSpotifyNotPandora.push(spotifySong);
        // }
    }

    const similarByRankDiff = similarTracks1.sort((a, b) => {
        return Math.abs(b.pandora.rank - b.spotify.rank) - Math.abs(a.pandora.rank - a.spotify.rank);
    });

    const similarByStream = similarTracks1.sort((a, b) => {
        return Math.abs(b.pandora.streams - b.spotify.streams) - Math.abs(a.pandora.streams - a.spotify.streams);
    });

    console.log(similarByRankDiff);
    var mailOptions = {
        from: 'pandoradigest@gmail.com',
        to: recipients.toString(),
        subject: 'Top Charts Weekly Digest',
        html: formatEmailHTML(similarByStream, similarByRankDiff),
        attachments: [{ // utf-8 string as an attachment
            filename: 'similarSongs.tsv',
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

const formatCSV = (similarities) => {
    var similarityTable = `\tPandora Track\tPandora Artist\tPandora Rank\tTotal Pandora Streams\tSpotify Track\tSpotify Artist\tSpotify Rank\tTotal Spotify Streams\tRank Difference\tStreaming Difference\n`;
    for (let i = 0; i < similarities.length; i++) {
        const match = similarities[i];
        similarityTable += `\t${match.pandora.name}\t${match.pandora.artists.toString().replace(/,/g, '/')}\t${match.pandora.rank}\t${match.pandora.streams}\t`;
        similarityTable += `${match.spotify.name}\t${match.spotify.artists.toString().replace(/,/g, '/')}\t${match.spotify.rank}\t${match.spotify.streams}\t`;
        similarityTable += `${Math.abs(match.pandora.rank - match.spotify.rank)}\t${Math.abs(match.pandora.streams - match.spotify.streams)}\n`;
    }

    return similarityTable;
}

const formatEmailHTML = (similaritiesByRank, similaritiesByStreams) => {
    var rankBody = ``;
    for (let i = 0; i < Math.min(similaritiesByRank.length, 15); i++) {
        const match = similaritiesByRank[i];
        rankBody += `
        <tr>
            <th scope="row"></th>
            <td>${match.spotify.name} by ${match.spotify.artists.toString()}</td>
            <td><center>${match.pandora.rank}</center></td>
            <td><center>${match.spotify.rank}</center></td>
            <td><center>${Math.abs(match.pandora.rank - match.spotify.rank)}</center></td>
        </tr>`;
    }
    var streamBody = ``;
    for (let i = 0; i < Math.min(similaritiesByStreams.length, 15); i++) {
        const match = similaritiesByStreams[i];
        streamBody += `
        <tr>
            <th scope="row"></th>
            <td>${match.spotify.name} by ${match.spotify.artists.toString()}</td>
            <td><center>${match.pandora.streams.toLocaleString()}</center></td>
            <td><center>${match.spotify.streams.toLocaleString()}</center></td>
            <td><center>${Math.abs(match.pandora.streams - match.spotify.streams).toLocaleString()}</center></td>
        </tr>`;
    }
    var template = `
        <div>
            <!--Table-->
            <h3>Tracks on both Pandora and Spotify Top 200 sorted by difference in chart ranking</h3>
            <table id="rankDiff" class="table table-striped table-hover table-sm table-borderless">
            <!--Table head-->
            <thead>
                <tr>
                    <th></th>
                    <th>Track Name</th>
                    <th>Pandora Rank</th>
                    <th>Spotify Rank</th>
                    <th>Rank Difference</th>
                </tr>
            </thead>
            <!--Table head-->
            <!--Table body-->
            <tbody>
                ${rankBody}
                <tr>
                    <th scope="row"></th>
                    <td><b>... ${similaritiesByRank.length - Math.min(similaritiesByRank.length, 15)} More</b></td>
                </tr>
            </tbody>
            <!--Table body-->
            </table>
            <!--Table-->
        </div>  
        <div>
            <!--Table-->
            <h3>Tracks on both Pandora and Spotify Top 200 sorted by difference in streams</h3>
            <table id="streamDiff" class="table table-striped table-hover table-sm table-borderless">
            <!--Table head-->
            <thead>
                <tr>
                    <th></th>
                    <th>Track Name</th>
                    <th>Total Pandora Streams</th>
                    <th>Total Spotify Streams</th>
                    <th>Streaming Difference</th>
                </tr>
            </thead>
            <!--Table head-->
            <!--Table body-->
            <tbody>
                ${streamBody}
                <tr>
                    <th scope="row"></th>
                    <td><b>... ${similaritiesByStreams.length - Math.min(similaritiesByStreams.length, 15)} More</b></td>
                </tr>
            </tbody>
            <!--Table body-->
            </table>
            <!--Table--> 
        </div>`
    return template;
}
const start = async () => {
    await data_layer.downloadStaticFiles();
    data_layer.generateNBSArtistMap();
}


//start();
compareData();