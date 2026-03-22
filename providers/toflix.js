// =============================================================
// Provider Nuvio : ToFlix (VF français)
// API : api.toflix.space
// Version : 1.0.0
// =============================================================
 
var TOFLIX_API = 'https://api.toflix.space/toflix_api.php';
var TOFLIX_TOKEN = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[ToFlix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType);
 
  var endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  var body = { api: 'fastflux', endpoint: endpoint, tmdb_id: String(tmdbId) };
 
  if (mediaType === 'tv') {
    body.season = season || 1;
    body.episode = episode || 1;
  }
 
  return fetch(TOFLIX_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'tfxtoken': TOFLIX_TOKEN,
      'Origin': 'https://toflix.space',
      'Referer': 'https://toflix.space/'
    },
    body: JSON.stringify(body)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      console.log('[ToFlix] Response:', JSON.stringify(data));
 
      if (!data || !data.success || !data.source_url) {
        console.log('[ToFlix] Aucune source trouvée');
        return [];
      }
 
      var streams = [{
        name: 'ToFlix',
        title: (data.title || 'ToFlix') + ' - VF',
        url: data.source_url,
        quality: 'HD',
        format: data.source && data.source.type === 'm3u8' ? 'm3u8' : 'mp4',
        headers: {
          'Referer': 'https://toflix.space/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      }];
 
      // Si l'API retourne aussi des sources alternatives
      if (data.sources && Array.isArray(data.sources)) {
        data.sources.forEach(function(source) {
          if (source.url && source.url !== data.source_url) {
            streams.push({
              name: 'ToFlix',
              title: (data.title || 'ToFlix') + ' - ' + (source.quality || 'VF'),
              url: source.url,
              quality: source.quality || 'HD',
              format: source.type || 'mp4',
              headers: {
                'Referer': 'https://toflix.space/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
              }
            });
          }
        });
      }
 
      return streams;
    })
    .catch(function(err) {
      console.error('[ToFlix] Erreur:', err.message || err);
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
