// =============================================================
// Provider Nuvio : Movix.rodeo (VF/VOSTFR français)
// Version : 3.0.0 - Double API (purstream + FStream)
// =============================================================
 
var MOVIX_API = 'https://api.movix.blog';
var MOVIX_REFERER = 'https://movix.rodeo/';
var TELEGRAM_CHANNEL = 'https://t.me/s/movix_site';
 
// Détection du domaine via Telegram si l'API principale échoue
function detectApiFromTelegram() {
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/movix\.[a-z]+/gi);
      if (!matches) return null;
      var frontendDomains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('noel.') && !url.includes('telegram');
      });
      if (frontendDomains.length === 0) return null;
      var lastFrontend = frontendDomains[frontendDomains.length - 1];
      var tld = lastFrontend.replace(/https?:\/\/movix\./, '');
      return {
        api: 'https://api.movix.' + tld,
        referer: lastFrontend + '/'
      };
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
  }).catch(function() { return url; });
}
 
// Résout un embed (vidzy, fsvid, etc.) vers une URL m3u8 directe
function resolveEmbed(embedUrl, referer) {
  return fetch(embedUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer || MOVIX_REFERER
    }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Cherche les URLs m3u8 dans la page de l'embed
      var patterns = [
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)["']/i
      ];
      for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match) {
          var url = match[1];
          if (url.startsWith('//')) url = 'https:' + url;
          if (url.startsWith('http')) return url;
        }
      }
      return null;
    })
    .catch(function() { return null; });
}
 
// API 1 : purstream (films et séries avec source directe)
function fetchPurstream(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url;
  if (mediaType === 'tv') {
    url = apiBase + '/api/purstream/tv/' + tmdbId + '/stream?season=' + (season || 1) + '&episode=' + (episode || 1);
  } else {
    url = apiBase + '/api/purstream/movie/' + tmdbId + '/stream';
  }
  console.log('[Movix] Purstream URL: ' + url);
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
      if (!data || !data.sources || data.sources.length === 0) throw new Error('Aucune source purstream');
      return data.sources;
    });
}
 
// API 2 : FStream (embeds VF/VOSTFR)
function fetchFstream(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url;
  if (mediaType === 'tv') {
    url = apiBase + '/api/' + tmdbId + '?season=' + (season || 1) + '&episode=' + (episode || 1);
  } else {
    url = apiBase + '/api/' + tmdbId;
  }
  console.log('[Movix] FStream URL: ' + url);
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
      if (!data || !data.episodes) throw new Error('Aucun épisode FStream');
 
      var ep = episode || 1;
      var episodeData = data.episodes[ep];
      if (!episodeData) throw new Error('Épisode ' + ep + ' non trouvé');
 
      var languages = episodeData.languages;
      var sources = [];
 
      // Priorité VF, puis VOSTFR
      var langs = ['VF', 'VOSTFR'];
      langs.forEach(function(lang) {
        if (languages[lang]) {
          languages[lang].forEach(function(source) {
            // On privilégie vidzy car on sait le résoudre
            sources.push({
              url: source.url,
              name: 'Movix FStream ' + lang,
              player: source.player,
              lang: lang
            });
          });
        }
      });
 
      if (sources.length === 0) throw new Error('Aucune source FStream VF/VOSTFR');
      return sources;
    });
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
 
  var apiBase = MOVIX_API;
  var referer = MOVIX_REFERER;
 
  // Essayer purstream d'abord, puis FStream en fallback
  return fetchPurstream(apiBase, referer, tmdbId, mediaType, season, episode)
    .then(function(sources) {
      // Purstream trouvé — résoudre les redirections
      return Promise.all(sources.map(function(source) {
        return resolveRedirect(source.url, referer).then(function(resolvedUrl) {
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
    .catch(function() {
      // Purstream échoué — essayer FStream
      console.log('[Movix] Purstream vide, tentative FStream...');
      return fetchFstream(apiBase, referer, tmdbId, mediaType, season, episode)
        .then(function(sources) {
          // Résoudre les embeds vers des URLs directes
          return Promise.all(sources.slice(0, 4).map(function(source) {
            return resolveEmbed(source.url, referer).then(function(directUrl) {
              if (!directUrl) {
                // Si on n'arrive pas à résoudre, on retourne l'embed lui-même
                return {
                  name: 'Movix',
                  title: source.name + ' - ' + source.player,
                  url: source.url,
                  quality: 'HD',
                  format: 'embed',
                  headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                };
              }
              return {
                name: 'Movix',
                title: source.name + ' - ' + source.player,
                url: directUrl,
                quality: 'HD',
                format: 'm3u8',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              };
            });
          }));
        })
        .catch(function() {
          // FStream aussi échoué — essayer via Telegram
          console.log('[Movix] FStream échoué, tentative Telegram...');
          return detectApiFromTelegram().then(function(detected) {
            if (!detected) return [];
            return fetchPurstream(detected.api, detected.referer, tmdbId, mediaType, season, episode)
              .catch(function() {
                return fetchFstream(detected.api, detected.referer, tmdbId, mediaType, season, episode);
              })
              .then(function(sources) {
                return sources.map(function(source) {
                  return {
                    name: 'Movix',
                    title: source.name || 'Movix VF',
                    url: source.url,
                    quality: 'HD',
                    format: source.format || 'm3u8',
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                  };
                });
              })
              .catch(function() { return []; });
          });
        });
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
 
