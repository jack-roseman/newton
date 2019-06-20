
const NodeCache = require('node-cache');
const cache = new NodeCache();
const fetch = require('node-fetch');


var exports = {};

const SPOTIFY_CLIENT_ID = 'f530b38104e943b4baa08387593feeaf';
const SPOTIFY_CLIENT_SECRET = '6983abfc942944da8953282c430c2c85';

var SpotifyWebApi = require('spotify-web-api-node');

// credentials are optional
var spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/spotify'
});
/**
 * Get's the first Spotify artistID for a given artist name
 *
 * @param {String} name the artist's name
 * @return {String} a Spotify Artist ID
 * @customfunction
 */

exports.getSpotifyFeaturedPlaylists = async function(name) {
  var authorization = await spotifyApi.clientCredentialsGrant();
  await spotifyApi.setAccessToken(authorization.body['access_token']);
  
  var json = await spotifyApi.getFeaturedPlaylists({ limit : 3, offset: 1, country: 'US'});
  var playlists = await json.playlists;
  console.log(json.body.playlists);
  return json.playlists;
}

module.exports = exports;