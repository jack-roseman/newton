const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const cache = new NodeCache();

var exports = {};

const SPOTIFY_CLIENT_ID = '09ddbd45bf68487298cbc24046f7e461';
const SPOTIFY_CLIENT_SECRET = '362300d2a49b4dc590e3ac08a45524fd'

//cache spotify credentials on server so that you only need to log in once
async function getSpotifyToken_() {
  const cacheKey = "SPOTIFY_CLIENT_ID="+SPOTIFY_CLIENT_ID;
  const cached = cache.get(cacheKey);
  if (cached != null) {
    console.log("cached spotify key: ", cached);
    return cached;
  }

  //else let's go get our Token from the Spotify API
  const url = "https://accounts.spotify.com/api/token";
  const authorization = "Basic " + Buffer.from(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET).toString('base64');
  const options = {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: { "grant_type":"client_credentials" },
    headers: { "Authorization": authorization },
    muteHttpExceptions: true
  };
  let response = await fetch(url, options);
  console.log("got spotify key from api call: " , response);
  let json = response.json();
  cache.set(cacheKey, json.access_token, 3000); // cache for 50 minutes.
  return authorization;
}

/**
 * Get's the first Spotify artistID for a given artist name
 *
 * @param {String} name the artist's name
 * @return {String} a Spotify Artist ID
 * @customfunction
 */

exports.getSpotifyArtistId = async function(name) {
  var access_token = await getSpotifyToken_();
  console.log(access_token);
}

module.exports = exports;