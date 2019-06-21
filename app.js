const data_layer = require('./data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile('public/index.html', { root : __dirname});
});

app.get('/download_spotify_top200/:where/:how/:when', (req, res) => {
    data_layer.spotifyTop200(req.params.where, req.params.how, req.params.when);
    var firstLetter = req.params.how.charAt(0).toUpperCase();
    var firstLetter = req.params.how.slice(1);
    res.send(req.params.how.charAt(0).toUpperCase() + req.params.how.slice(1) + 
    ' top 200 Tracks on Spotify in ' + req.params.where.toUpperCase());
});

app.get('/download_spotify_viral50/:where/:how/:when', (req, res) => {
    data_layer.spotifyViral50(req.params.where, req.params.how, req.params.when);
    res.send(req.params.how.charAt(0).toUpperCase() + req.params.how.slice(1) 
     + ' viral 50 Tracks on Spotify in ' + req.params.where.toUpperCase());
});

app.get('/badpage', (req, res) => {
    res.send('Something went wrong!');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));