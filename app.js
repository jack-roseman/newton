const spotify_data_layer = require('./spotify_data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', async function(req, res) {
    res.sendFile('public/index.html', { root : __dirname})
});

app.get('/spotify/:artist', async function(req, res) {
    var artist_ = await spotify_data_layer.getSpotifyArtistId("" + req.params.artist);
    res.send(req.params.artist + ":" + artist_);
});

app.get('/spotify', (req, res) => {
    res.send('Available Spotify Data:');
});

app.get('/badpage', () => {
    res.send('Something went wrong!');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
