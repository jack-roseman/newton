const data_layer = require('./data_layer');

const textInPerensRegEx = new RegExp("\\([^)]*\\)");

const compareData = async () => {
    var chart = [];
    const pandora200 = await data_layer.getNBSTopSpins();
    const spotify200 = await data_layer.getSpotifyTopStreams();
    for (let i = 0; i < 200; i++) {
        chart.push([pandora200[i][0] + " by " + pandora200[i][1], spotify200[i][0] + " by " + spotify200[i][1]]);
    }
    console.table(chart);
}

const start = async () => {
    await data_layer.downloadStaticFiles();
    data_layer.generateNBSArtistMap();
}
//start();
compareData();