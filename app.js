const data_layer = require('./data_layer');
var FuzzySearch = require('fuzzy-search');
const textInPerensRegEx = new RegExp("\\([^)]*\\)");

var similarTracks1 = [];
var similarTracks2 = [];
var onPandoraNotSpotify = [];
var onSpotifyNotPandora = [];
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
        const match1 = spotifyChart.search(pandoraSong.name)[0];
        if (match1) { //found a spotify match
            var count = 0;
            for (let j = 0; j < pandoraSong.artists.length; j++) {
                for (let k = 0; k < match1.artists.length; k++) {
                    if (pandoraSong.artists[j].includes(match1.artists[k])) {
                        count++;
                    }
                }
            }
            if (count > 0) {
                similarTracks1.push([pandoraSong, match1]);
            } else {
                onPandoraNotSpotify.push(pandoraSong);
            }
        } else {
            //on pandora but not on spotify
            onPandoraNotSpotify.push(pandoraSong);
        }

        //lookup each spotify song on pandora and only accept when artist 
        //this doesnt catch all of them because of the case is featured
        var spotifySong = spotify200[i];
        const match2 = pandoraChart.search(spotifySong.name)[0];
        if (match2) { //found a spotify match
            var count = 0;
            for (let j = 0; j < spotifySong.artists.length; j++) {
                for (let k = 0; k < match2.artists.length; k++) {
                    if (spotifySong.artists[j].includes(match2.artists[k])) {
                        count++;
                    }
                }
            }
            if (count > 0) {
                similarTracks2.push([match2, spotifySong]);
            } else {
                onSpotifyNotPandora.push(spotifySong);
            }
        } else {
            //on spotify but not on pandora
            onSpotifyNotPandora.push(spotifySong);
        }
    }
    const similar1ByRankDiff = similarTracks1.sort((a, b) => {
        return Math.abs(b[0].rank - b[1].rank) - Math.abs(a[0].rank - a[1].rank);
    })
    const similar2ByRankDiff = similarTracks2.sort((a, b) => { // this 
        return Math.abs(b[0].rank - b[1].rank) - Math.abs(a[0].rank - a[1].rank);
    })

    //TODO - FIGURE OUT WHY PANDORA SONGS MATCHE MORE AGAINST SPOTIFY AND NOT VICE VERSA
    console.log(similar1ByRankDiff.length, similar2ByRankDiff.length);
}

const start = async () => {
    await data_layer.downloadStaticFiles();
    data_layer.generateNBSArtistMap();
}


//start();
compareData();