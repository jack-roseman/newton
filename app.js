const data_layer = require('./data_layer');


const compareData = async () => {
    const pandora200 = await data_layer.getNBSTopSpins();
    const spotify200 = await data_layer.getSpotifyTopStreams();
    for (let i = 0; i < 200; i++) {
        console.log(pandora200[i]);
    }
}

compareData();