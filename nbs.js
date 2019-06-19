const accessToken = "fa779746f38f233dd4e9ccb16cb5c11d";
const fetch = require('node-fetch');

/**
 * Returns the Number of Pandora Streams for a given NBS ID
 *
 * @param {String} nbsId The NBS ID we want to fetch data for.
 * @return {Object} The API JSON response.
 * @private
 */

exports.getArtistId = function(name) {
  fetch("https://api.nextbigsound.com/search/v1/artists/?limit=1&fields=id,name&query=" + name + "&access_token=" + accessToken);
  var json = JSON.parse(response.getContentText());  
  return json.artists[0].id;
}