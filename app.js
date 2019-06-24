const data_layer = require('./data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile('public/index.html', { root : __dirname});
});

app.get('/pandora', async (req, res) => {
    const top_spins = await data_layer.getPandoraTopSpins();
    res.send(top_spins);
});

app.get('/spotify', async (req, res) => {
    const top_spins = await data_layer.getSpotifyTopSpins();
    console.log(top_spins);
    res.send(top_spins);
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));