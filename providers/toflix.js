// =============================================================
// Provider Nuvio : ToFlix (VF français)
// API : api.toflix.space
// Version : 2.1.0 - Détection automatique via Telegram + toflix.mom
// =============================================================
 
var TOFLIX_API = 'https://api.toflix.space/toflix_api.php';
var TOFLIX_REFERER = 'https://toflix.space/';
var TOFLIX_TOKEN = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
var TELEGRAM_CHANNEL = 'https://t.me/s/toflixofficiel';
var TOFLIX_MOM = 'https://toflix.mom/';
 
// Détecte le domaine depuis le Telegram officiel
function detectFromTelegram() {
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/toflix\.[a-z]+/gi);
      if (!matches) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram') && !url.includes('mom');
      });
      if (domains.length === 0) return null;
      var lastDomain = domains[domains.length - 1];
      var domainMatch = lastDomain.match(/^(https?:\/\/[^\/\s]+)/);
      if (!domainMatch) return null;
      var frontend = domainMatch[1];
      var api = frontend.replace(/^(https?:\/\/)toflix\./, '$1api.toflix.') + '/toflix_api.php';
      console.log('[ToFlix] Telegram → ' + frontend);
      return { api: api, referer: frontend + '/' };
    })
    .catch(function() { return null; });
}
 
// Détecte le domaine depuis toflix.mom
function detectFromMom() {
  return fetch(TOFLIX_MOM, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Cherche un lien vers le nouveau domaine toflix
      var matches = html.match(/https?:\/\/toflix\.[a-z]+/gi);
      if (!matches) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('mom') && !url.includes('t.me') && !url.includes('telegram');
      });
      if (domains.length === 0) return null;
      var lastDomain = domains[domains.length - 1];
      var domainMatch = lastDomain.match(/^(https?:\/\/[^\/\s]+)/);
      if (!domainMatch) return null;
      var frontend = domainMatch[1];
      var api = frontend.replace(/^(https?:\/\/)toflix\./, '$1api.toflix.') + '/toflix_api.php';
      console.log('[ToFlix] toflix.mom → ' + frontend);
      return { api: api, referer: frontend + '/' };
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
 
function buildStreams(data, referer) {
  var streams = [{
    name: 'ToFlix',
    title: (data.title || 'ToFlix') + ' - VF',
    url: data.source_url,
    quality: 'HD',
    format: data.source && data.source.type === 'm3u8' ? 'm3u8' : 'mp4',
    headers: {
      'Referer': referer,
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
            'Referer': referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
      }
    });
  }
  return streams;
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[ToFlix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType);
 
  // Étape 1 : API principale connue
  return callApi(TOFLIX_API, TOFLIX_REFERER, tmdbId, mediaType, season, episode)
    .then(function(data) {
      return buildStreams(data, TOFLIX_REFERER);
    })
    .catch(function(err) {
      // Étape 2 : Détection via Telegram
      console.log('[ToFlix] Fallback Telegram...');
      return detectFromTelegram()
        .then(function(detected) {
          if (detected) {
            return callApi(detected.api, detected.referer, tmdbId, mediaType, season, episode)
              .then(function(data) { return buildStreams(data, detected.referer); });
          }
          // Étape 3 : Détection via toflix.mom
          console.log('[ToFlix] Fallback toflix.mom...');
          return detectFromMom()
            .then(function(detected2) {
              if (!detected2) throw new Error('Aucun domaine trouvé');
              return callApi(detected2.api, detected2.referer, tmdbId, mediaType, season, episode)
                .then(function(data) { return buildStreams(data, detected2.referer); });
            });
        });
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
 
