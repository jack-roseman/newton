const data_layer = require('./data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile('public/index.html', { root : __dirname});
});

app.get('/nightJob', (req, res) => {
    data_layer.nightJob();
    res.send("night job complete");
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));