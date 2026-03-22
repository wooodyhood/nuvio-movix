// =============================================================
// Provider Nuvio : Movix.rodeo (VF/VOSTFR français)
// Version : 2.6.0 - Fallback automatique via Telegram
// =============================================================
 
var MOVIX_API = 'https://api.movix.blog/api/purstream';
var MOVIX_REFERER = 'https://movix.rodeo/';
var TELEGRAM_CHANNEL = 'https://t.me/s/movix_site';
 
// Lit le Telegram et extrait le domaine API actuel
function detectApiFromTelegram() {
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Cherche toutes les URLs movix.xxx (frontend)
      var matches = html.match(/https?:\/\/movix\.[a-z]+/gi);
      if (!matches) return null;
 
      // Filtre pour garder uniquement les domaines frontend valides
      var frontendDomains = matches.filter(function(url) {
        return !url.includes('t.me') &&
               !url.includes('noel.') &&
               !url.includes('telegram');
      });
 
      if (frontendDomains.length === 0) return null;
 
      // Prend le dernier domaine mentionné (le plus récent)
      var lastFrontend = frontendDomains[frontendDomains.length - 1];
      console.log('[Movix] Domaine frontend détecté via Telegram: ' + lastFrontend);
 
      // Construit l'URL API : movix.rodeo -> api.movix.blog
      // movix.xyz -> api.movix.xyz
      var tld = lastFrontend.replace(/https?:\/\/movix\./, '');
      var apiDomain = 'https://api.movix.' + tld + '/api/purstream';
      var referer = lastFrontend + '/';
 
      console.log('[Movix] API construite: ' + apiDomain);
      return { api: apiDomain, referer: referer };
    })
    .catch(function() { return null; });
}
 
function resolveRedirect(url, referer) {
  return fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer || MOVIX_REFERER
    }
  }).then(function(res) {
    return res.url || url;
  }).catch(function() {
    return url;
  });
}
 
function fetchStreams(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url;
  if (mediaType === 'tv') {
    url = apiBase + '/tv/' + tmdbId + '/stream?season=' + (season || 1) + '&episode=' + (episode || 1);
  } else {
    url = apiBase + '/movie/' + tmdbId + '/stream';
  }
 
  console.log('[Movix] Appel API: ' + url);
 
  return fetch(url, {
    method: 'GET',
    headers: {
      'Referer': referer,
      'Origin': referer.replace(/\/$/, ''),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.sources || data.sources.length === 0) {
        throw new Error('Aucune source');
      }
      return data;
    });
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
 
  // Étape 1 : essayer directement avec les domaines connus
  return fetchStreams(MOVIX_API, MOVIX_REFERER, tmdbId, mediaType, season, episode)
    .catch(function(err) {
      // Étape 2 : si ça échoue, détecter le nouveau domaine via Telegram
      console.log('[Movix] API principale échouée (' + err.message + '), tentative via Telegram...');
      return detectApiFromTelegram()
        .then(function(detected) {
          if (!detected) throw new Error('Détection Telegram échouée');
          return fetchStreams(detected.api, detected.referer, tmdbId, mediaType, season, episode);
        });
    })
    .then(function(data) {
      return Promise.all(data.sources.map(function(source) {
        return resolveRedirect(source.url, MOVIX_REFERER).then(function(resolvedUrl) {
          console.log('[Movix] URL résolue: ' + resolvedUrl);
          return {
            name: 'Movix',
            title: source.name || 'Movix VF',
            url: resolvedUrl,
            quality: source.name && source.name.indexOf('1080') !== -1 ? '1080p' : '720p',
            format: source.format || 'm3u8',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          };
        });
      }));
    })
    .catch(function(err) {
      console.error('[Movix] Erreur globale:', err.message || err);
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
