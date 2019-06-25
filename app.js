const data_layer = require('./data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile('public/index.html', { root : __dirname});
});

app.get('/pandora', async (req, res) => {
    data_layer.getNBSTopSpins().then((data) => {
        console.log(data);
        res.send(data);
    });
});

app.get('/spotify', (req, res) => {
    data_layer.getSpotifyTopSpins().then((data) => {
        console.log(data);
        res.send(data)
    });
});

app.get('/nightjob', (req, res) => {
    data_layer.nightJob();
    res.send();
});
app.listen(port, () => console.log(`Example app listening on port ${port}!`));