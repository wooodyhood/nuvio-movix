// =============================================================
// Provider Nuvio : ToFlix (VF français)
// =============================================================

var TOFLIX_API = 'https://api.toflix.space/toflix_api.php';
var TOFLIX_REFERER = 'https://toflix.space/';
var TOFLIX_TOKEN = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
var TELEGRAM_CHANNEL = 'https://t.me/s/toflixofficiel';
var TOFLIX_MOM = 'https://toflix.mom/';

function log(msg, data) {
    console.log('[ToFlix] ' + msg + (data ? ': ' + JSON.stringify(data) : ''));
}

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
      return { api: api, referer: frontend + '/' };
    })
    .catch(function() { return null; });
}

function detectFromMom() {
  return fetch(TOFLIX_MOM, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
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
      return { api: api, referer: frontend + '/' };
    })
    .catch(function() { return null; });
}

function callApi(apiUrl, referer, body) {
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
    });
}

// =============================================================
// FILMS
// =============================================================

function fetchMovie(apiUrl, referer, tmdbId) {
  return callApi(apiUrl, referer, { api: 'fastflux', endpoint: 'movie', tmdb_id: String(tmdbId) })
    .then(function(data) {
      if (!data || !data.success || !data.source_url) throw new Error('Film non disponible');
      return [{
        name: 'ToFlix',
        title: (data.title || 'ToFlix') + ' - VF',
        url: data.source_url,
        quality: 'HD',
        format: data.source && data.source.type === 'm3u8' ? 'm3u8' : 'mp4',
        headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }];
    });
}

// =============================================================
// SÉRIES
// =============================================================

function fetchSeries(apiUrl, referer, tmdbId, season, episode) {
  var seasonNum = season || 1;
  var episodeNum = episode || 1;
  
  log('Fetch série', { tmdbId, season: seasonNum, episode: episodeNum });
  
  return callApi(apiUrl, referer, { 
    api: 'fastflux', 
    endpoint: 'series', 
    tmdb_id: String(tmdbId) 
  })
    .then(function(data) {
      if (!data || !data.success) {
        throw new Error('Réponse API invalide');
      }
      
      // Structure JSON : { success: true, seasons: { "1": [...], "2": [...] } }
      if (!data.seasons) {
        throw new Error('Pas de saisons disponibles');
      }
      
      var seasonKey = String(seasonNum);
      if (!data.seasons[seasonKey]) {
        throw new Error('Saison ' + seasonNum + ' non disponible');
      }
      
      var episodes = data.seasons[seasonKey];
      
      // Chercher l'épisode
      for (var i = 0; i < episodes.length; i++) {
        var ep = episodes[i];
        if (ep.episode_number === episodeNum) {
          var url = ep.url || (ep.source && ep.source.url);
          
          if (!url) {
            throw new Error('URL non trouvée pour S' + seasonNum + 'E' + episodeNum);
          }
          
          log('Stream trouvé', { url: url, title: ep.title });
          
          return [{
            name: 'ToFlix',
            title: 'S' + seasonNum + 'E' + episodeNum + ' - ' + (ep.title || 'VF'),
            url: url,
            quality: 'HD',
            format: url.includes('.m3u8') ? 'm3u8' : 'mp4',
            headers: { 
              'Referer': referer, 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            }
          }];
        }
      }
      
      throw new Error('Épisode S' + seasonNum + 'E' + episodeNum + ' non trouvé');
    });
}

// =============================================================
// POINT D'ENTRÉE PRINCIPAL
// =============================================================

function getStreamsWithApi(apiUrl, referer, tmdbId, mediaType, season, episode) {
  if (mediaType === 'tv') {
    return fetchSeries(apiUrl, referer, tmdbId, season, episode);
  }
  return fetchMovie(apiUrl, referer, tmdbId);
}

function getStreams(tmdbId, mediaType, season, episode, title) {
  log('getStreams', { tmdbId, mediaType, season, episode, title });
  
  return getStreamsWithApi(TOFLIX_API, TOFLIX_REFERER, tmdbId, mediaType, season, episode)
    .catch(function(err) {
      log('Fallback Telegram', err.message);
      return detectFromTelegram().then(function(detected) {
        if (detected) {
          return getStreamsWithApi(detected.api, detected.referer, tmdbId, mediaType, season, episode);
        }
        return detectFromMom().then(function(detected2) {
          if (!detected2) throw new Error('Aucun domaine trouvé');
          return getStreamsWithApi(detected2.api, detected2.referer, tmdbId, mediaType, season, episode);
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
