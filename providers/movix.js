// =============================================================
// Provider Nuvio : Movix.rodeo (VF/VOSTFR français)
// API : api.movix.blog
// Version : 2.0.0
// =============================================================
 
var MOVIX_API = 'https://api.movix.blog/api/purstream';
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
 
  var url;
  if (mediaType === 'tv') {
    url = MOVIX_API + '/tv/' + tmdbId + '/stream?season=' + (season || 1) + '&episode=' + (episode || 1);
  } else {
    url = MOVIX_API + '/movie/' + tmdbId + '/stream';
  }
 
  console.log('[Movix] API URL: ' + url);
 
  return fetch(url, {
    method: 'GET',
    headers: {
      'Referer': 'https://movix.rodeo/',
      'Origin': 'https://movix.rodeo',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      console.log('[Movix] Response:', JSON.stringify(data));
 
      if (!data || !data.sources || data.sources.length === 0) {
        console.log('[Movix] Aucune source trouvée');
        return [];
      }
 
      return data.sources.map(function(source) {
        return {
          name: 'Movix',
          title: source.name || 'Movix VF',
          url: source.url,
          quality: source.name && source.name.indexOf('1080') !== -1 ? '1080p' : '720p',
          format: source.format || 'm3u8',
          headers: {
            'Referer': 'https://movix.rodeo/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        };
      });
    })
    .catch(function(err) {
      console.error('[Movix] Erreur:', err.message || err);
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
