// =============================================================
// Provider Nuvio : ToFlix (VF français)
// API : api.toflix.space
// Version : 2.0.0 - Détection automatique du domaine via Telegram
// =============================================================
 
var TOFLIX_API = 'https://api.toflix.space/toflix_api.php';
var TOFLIX_REFERER = 'https://toflix.space/';
var TOFLIX_TOKEN = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
var TELEGRAM_CHANNEL = 'https://t.me/s/toflixofficiel';
 
// Détecte automatiquement le domaine via le Telegram officiel
function detectDomainFromTelegram() {
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Cherche les URLs toflix.xxx dans les messages
      var matches = html.match(/https?:\/\/toflix\.[a-z]+/gi);
      if (!matches || matches.length === 0) return null;
 
      // Filtre les URLs valides (pas telegram, pas t.me)
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram');
      });
 
      if (domains.length === 0) return null;
 
      // Prend le dernier domaine mentionné (le plus récent)
      var lastDomain = domains[domains.length - 1];
      var domainMatch = lastDomain.match(/^(https?:\/\/[^\/\s]+)/);
      if (!domainMatch) return null;
 
      var frontend = domainMatch[1];
      var apiDomain = frontend.replace(/^(https?:\/\/)toflix\./, '$1api.toflix.');
 
      console.log('[ToFlix] Domaine détecté via Telegram: ' + frontend);
      console.log('[ToFlix] API: ' + apiDomain);
 
      return {
        api: apiDomain + '/toflix_api.php',
        referer: frontend + '/'
      };
    })
    .catch(function() { return null; });
}
 
function callApi(apiUrl, referer, tmdbId, mediaType, season, episode) {
  var endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  var body = { api: 'fastflux', endpoint: endpoint, tmdb_id: String(tmdbId) };
 
  if (mediaType === 'tv') {
    body.season = season || 1;
    body.episode = episode || 1;
  }
 
  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'tfxtoken': TOFLIX_TOKEN,
      'Origin': referer.replace(/\/$/, ''),
      'Referer': referer
    },
    body: JSON.stringify(body)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success || !data.source_url) throw new Error('Aucune source');
      return data;
    });
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[ToFlix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType);
 
  // Étape 1 : Essayer avec l'API connue
  return callApi(TOFLIX_API, TOFLIX_REFERER, tmdbId, mediaType, season, episode)
    .catch(function(err) {
      // Étape 2 : Si ça échoue, détecter le nouveau domaine via Telegram
      console.log('[ToFlix] API principale échouée (' + err.message + '), tentative Telegram...');
      return detectDomainFromTelegram().then(function(detected) {
        if (!detected) throw new Error('Détection Telegram échouée');
        return callApi(detected.api, detected.referer, tmdbId, mediaType, season, episode);
      });
    })
    .then(function(data) {
      var streams = [{
        name: 'ToFlix',
        title: (data.title || 'ToFlix') + ' - VF',
        url: data.source_url,
        quality: 'HD',
        format: data.source && data.source.type === 'm3u8' ? 'm3u8' : 'mp4',
        headers: {
          'Referer': TOFLIX_REFERER,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }];
 
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
                'Referer': TOFLIX_REFERER,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
          }
        });
      }
 
      return streams;
    })
    .catch(function(err) {
      console.error('[ToFlix] Erreur globale:', err.message || err);
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
