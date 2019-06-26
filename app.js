const data_layer = require('./data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile('public/index.html', { root : __dirname});
});

app.get('/pandora', async (req, res) => {
    const data = await data_layer.getNBSTopSpins();
    res.send(data);
});

app.get('/tree', async (req, res) => {
    const data = await data_layer.generateNBSArtistMap();
    res.send(data);
});

app.get('/spotify', async (req, res) => {
    const data = await data_layer.getSpotifyTopStreams();
    res.send(data);
});

app.get('/nightjob', (req, res) => {
    data_layer.nightJob();
    res.send("Night Job Complete");
});
app.listen(port, () => console.log(`Example app listening on port ${port}!`));