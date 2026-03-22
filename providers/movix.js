// =============================================================
// Provider Nuvio : Movix.rodeo (VF/VOSTFR français)
// Version : 2.3.0 - Détection automatique du domaine API
// =============================================================
 
var MOVIX_FRONTEND = 'https://movix.rodeo';
var FALLBACK_API = 'https://api.movix.blog';
 
// Détecte automatiquement le domaine de l'API en suivant
// la redirection éventuelle de movix.rodeo
function detectApiDomain() {
  return fetch(MOVIX_FRONTEND, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  }).then(function(res) {
    // L'URL finale après redirection donne le vrai domaine frontend
    var finalUrl = res.url || MOVIX_FRONTEND;
    var domainMatch = finalUrl.match(/^(https?:\/\/[^\/]+)/);
    var frontendDomain = domainMatch ? domainMatch[1] : MOVIX_FRONTEND;
 
    // L'API est toujours sur api.{domaine_frontend}
    // ex: movix.rodeo -> api.movix.blog (ou api.movix.rodeo selon le domaine)
    var apiDomain = frontendDomain.replace(/^(https?:\/\/)/, '$1api.');
 
    console.log('[Movix] Frontend détecté: ' + frontendDomain);
    console.log('[Movix] API détectée: ' + apiDomain);
 
    return { frontend: frontendDomain, api: apiDomain };
  }).catch(function() {
    console.log('[Movix] Détection échouée, utilisation du fallback');
    return { frontend: MOVIX_FRONTEND, api: FALLBACK_API };
  });
}
 
function resolveRedirect(url, referer) {
  return fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': referer || MOVIX_FRONTEND + '/'
    }
  }).then(function(res) {
    return res.url || url;
  }).catch(function() {
    return url;
  });
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
 
  return detectApiDomain().then(function(domains) {
    var apiUrl;
    if (mediaType === 'tv') {
      apiUrl = domains.api + '/api/purstream/tv/' + tmdbId + '/stream?season=' + (season || 1) + '&episode=' + (episode || 1);
    } else {
      apiUrl = domains.api + '/api/purstream/movie/' + tmdbId + '/stream';
    }
 
    console.log('[Movix] API URL: ' + apiUrl);
 
    return fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Referer': domains.frontend + '/',
        'Origin': domains.frontend,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        if (!data || !data.sources || data.sources.length === 0) {
          console.log('[Movix] Aucune source trouvée');
          return [];
        }
 
        return Promise.all(data.sources.map(function(source) {
          return resolveRedirect(source.url, domains.frontend + '/').then(function(resolvedUrl) {
            console.log('[Movix] URL résolue: ' + resolvedUrl);
            return {
              name: 'Movix',
              title: source.name || 'Movix VF',
              url: resolvedUrl,
              quality: source.name && source.name.indexOf('1080') !== -1 ? '1080p' : '720p',
              format: source.format || 'm3u8',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
              }
            };
          });
        }));
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
 
