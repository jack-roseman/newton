const data_layer = require('./data_layer');
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile('public/index.html', { root : __dirname});
});

app.get('/nightjob', async (req, res) => {
    await data_layer.downloadStaticFiles()
    .then(data_layer.generateNBSArtistMap());
    res.send("Night Job Complete");
});
app.listen(port, () => console.log(`Example app listening on port ${port}!`));