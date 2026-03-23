// =============================================================
// Provider Nuvio : ToFlix (VF français)
// Version : 2.2.0 - Support films + séries
// =============================================================
 
var TOFLIX_API = 'https://api.toflix.space/toflix_api.php';
var TOFLIX_REFERER = 'https://toflix.space/';
var TOFLIX_TOKEN = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
var TELEGRAM_CHANNEL = 'https://t.me/s/toflixofficiel';
var TOFLIX_MOM = 'https://toflix.mom/';
 
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
 
// Récupère un film
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
 
// Recherche un épisode dans toutes les pages de séries
function findEpisode(apiUrl, referer, tmdbId, season, episode, page) {
  page = page || 1;
  return callApi(apiUrl, referer, { api: 'fastflux', endpoint: 'series', tmdb_id: String(tmdbId), page: page })
    .then(function(data) {
      if (!data || !data.success || !data.data) throw new Error('Séries non disponibles');
 
      // Chercher la série par tmdb_id
      var serie = null;
      for (var i = 0; i < data.data.length; i++) {
        if (String(data.data[i].tmdb_id) === String(tmdbId)) {
          serie = data.data[i];
          break;
        }
      }
 
      if (serie) {
        // Chercher l'épisode
        var seasonStr = 'S' + String(season).padStart(2, '0');
        var ep = null;
        for (var j = 0; j < serie.episodes.length; j++) {
          var e = serie.episodes[j];
          if (e.season === seasonStr && e.episode_number === episode) {
            ep = e;
            break;
          }
        }
        if (ep) {
          return [{
            name: 'ToFlix',
            title: (serie.title || 'ToFlix') + ' S' + season + 'E' + episode + ' - VF',
            url: ep.url,
            quality: ep.quality !== 'Unknown' ? ep.quality : 'HD',
            format: 'mp4',
            headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          }];
        }
        throw new Error('Épisode non trouvé');
      }
 
      // Pas trouvé sur cette page, essayer la suivante
      if (data.pagination && page < data.pagination.total_pages) {
        return findEpisode(apiUrl, referer, tmdbId, season, episode, page + 1);
      }
 
      throw new Error('Série non trouvée sur ToFlix');
    });
}
 
function getStreamsWithApi(apiUrl, referer, tmdbId, mediaType, season, episode) {
  if (mediaType === 'tv') {
    return findEpisode(apiUrl, referer, tmdbId, season || 1, episode || 1);
  }
  return fetchMovie(apiUrl, referer, tmdbId);
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[ToFlix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
 
  // Étape 1 : API principale
  return getStreamsWithApi(TOFLIX_API, TOFLIX_REFERER, tmdbId, mediaType, season, episode)
    .catch(function(err) {
      // Étape 2 : Fallback Telegram
      console.log('[ToFlix] Fallback Telegram... (' + err.message + ')');
      return detectFromTelegram().then(function(detected) {
        if (detected) {
          return getStreamsWithApi(detected.api, detected.referer, tmdbId, mediaType, season, episode);
        }
        // Étape 3 : Fallback toflix.mom
        console.log('[ToFlix] Fallback toflix.mom...');
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
 
