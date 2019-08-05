const express = require('express');
const app = express();
const dl = require('./data_layer');
const port = 3000;

app.get('/night', async (req, res) => {
    const data = await dl.start().then(dl.compareCharts);
    res.send(data);
});

app.get('/home', async (req, res) => {
    const page = await dl.getHTML()
    res.send(page);
});

app.get('/emailme', async (req, res) => {
    await dl.pushWeeklyEmail();
    res.send("email sent");
});

app.get('/subscribe/:email', async (req, res) => {
    await dl.addEmailRecipient(req.params.email);
    res.send("Welcome to the mailing list " + req.params.email + "!");
});

app.get('/unsubscribe/:email', async (req, res) => {
    await dl.unsubcribeRecipient(req.params.email);
    res.send("Successfully Unsubscribed " + req.params.email);
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`))