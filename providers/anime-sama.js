// =============================================================
// Provider Nuvio : Anime-Sama (anime-sama.fr)
// Version : 5.0.0 - With TMDB to Title conversion
// =============================================================

var TMDB_API = 'https://api.themoviedb.org/3';
var TMDB_KEY = '8265bd1679663a7ea12ac168da84d2e8';
var ANIME_SAMA_BASE = 'https://anime-sama.fr';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Récupérer le titre depuis TMDB
function getTitleFromTMDB(tmdbId) {
  console.log('[Anime-Sama] Fetching title from TMDB for ID: ' + tmdbId);
  
  var url = TMDB_API + '/tv/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=en-US';
  
  return fetch(url, { headers: HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.name) {
        console.warn('[Anime-Sama] No title found on TMDB');
        return null;
      }
      console.log('[Anime-Sama] Found title: ' + data.name);
      return data.name;
    })
    .catch(function(err) {
      console.error('[Anime-Sama] TMDB error: ' + err.message);
      return null;
    });
}

// Normaliser le titre pour anime-sama
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Récupérer les épisodes de anime-sama
function fetchEpisodes(catalogName, season, language) {
  season = season || 1;
  language = language || 'vf';
  
  console.log('[Anime-Sama] Fetching episodes: ' + catalogName + ' S' + season + ' (' + language + ')');
  
  var url = ANIME_SAMA_BASE + '/catalogue/' + catalogName + '/saison' + season + '/' + language + '/episodes.js';
  
  return fetch(url, { headers: HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      if (!html) return [];
      
      // Parser: var XXXXXXX = ["url1", "url2", ...]
      var match = html.match(/var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]/);
      if (!match) return [];
      
      var episodesStr = match[2];
      var urlMatches = episodesStr.match(/["']([^"']+)["']/g);
      
      if (!urlMatches) return [];
      
      return urlMatches.map(function(u) { return u.replace(/["']/g, ''); });
    })
    .catch(function(err) {
      console.error('[Anime-Sama] Episode fetch error: ' + err.message);
      return [];
    });
}

// Résoudre l'embed vers le lien direct
function resolveStream(embedUrl) {
  if (!embedUrl || embedUrl.indexOf('http') !== 0) return Promise.resolve(null);
  
  console.log('[Anime-Sama] Resolving: ' + embedUrl);
  
  return fetch(embedUrl, {
    method: 'GET',
    headers: HEADERS,
    redirect: 'follow'
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      if (!html) return null;
      
      var patterns = [
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /["']([^"']*\.m3u8[^"']*?)["']/i,
        /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
        /source\s+src=["']([^"']+\.mp4[^"']*)["']/i
      ];
      
      for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match && match[1]) {
          var streamUrl = match[1];
          
          if (streamUrl.indexOf('//') === 0) streamUrl = 'https:' + streamUrl;
          if (streamUrl.indexOf('/') === 0) streamUrl = ANIME_SAMA_BASE + streamUrl;
          
          if (streamUrl.indexOf('http') === 0) {
            console.log('[Anime-Sama] Found stream: ' + streamUrl);
            return streamUrl;
          }
        }
      }
      
      return null;
    })
    .catch(function(err) {
      console.error('[Anime-Sama] Resolution error: ' + err.message);
      return null;
    });
}

function getPlayerName(url) {
  if (!url) return 'Player';
  var lower = url.toLowerCase();
  
  if (lower.indexOf('sibnet') > -1) return 'Sibnet';
  if (lower.indexOf('vidmoly') > -1) return 'Vidmoly';
  if (lower.indexOf('voe') > -1) return 'Voe';
  if (lower.indexOf('sendvid') > -1) return 'Sendvid';
  if (lower.indexOf('streamtape') > -1 || lower.indexOf('stape') > -1) return 'Streamtape';
  if (lower.indexOf('dood') > -1) return 'Doodstream';
  if (lower.indexOf('uqload') > -1) return 'Uqload';
  
  return 'Direct';
}

// Fonction principale
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Anime-Sama] Request: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);
  
  if (mediaType !== 'tv' || !season || !episode || !tmdbId) {
    console.warn('[Anime-Sama] Invalid parameters');
    return Promise.resolve([]);
  }
  
  // Étape 1: Récupérer le titre depuis TMDB
  return getTitleFromTMDB(tmdbId)
    .then(function(title) {
      if (!title) return [];
      
      // Étape 2: Normaliser pour anime-sama
      var catalogName = normalizeTitle(title);
      console.log('[Anime-Sama] Catalog: ' + catalogName);
      
      // Étape 3: Récupérer les épisodes en VF
      return fetchEpisodes(catalogName, season, 'vf')
        .then(function(episodeUrls) {
          if (episodeUrls && episodeUrls.length > 0) {
            var episodeUrl = episodeUrls[episode - 1];
            if (episodeUrl) {
              return resolveStream(episodeUrl)
                .then(function(streamUrl) {
                  if (streamUrl) {
                    return [{
                      name: 'Anime-Sama',
                      title: getPlayerName(streamUrl) + ' - Ep ' + episode,
                      url: streamUrl,
                      quality: 'HD',
                      headers: {
                        'Referer': ANIME_SAMA_BASE,
                        'User-Agent': HEADERS['User-Agent']
                      }
                    }];
                  }
                  return [];
                });
            }
          }
          
          // Fallback: Essayer VOSTFR
          console.log('[Anime-Sama] VF not found, trying VOSTFR');
          return fetchEpisodes(catalogName, season, 'vostfr')
            .then(function(vostfrUrls) {
              if (vostfrUrls && vostfrUrls.length > 0) {
                var episodeUrl = vostfrUrls[episode - 1];
                if (episodeUrl) {
                  return resolveStream(episodeUrl)
                    .then(function(streamUrl) {
                      if (streamUrl) {
                        return [{
                          name: 'Anime-Sama (VOSTFR)',
                          title: getPlayerName(streamUrl) + ' - Ep ' + episode,
                          url: streamUrl,
                          quality: 'HD',
                          headers: {
                            'Referer': ANIME_SAMA_BASE,
                            'User-Agent': HEADERS['User-Agent']
                          }
                        }];
                      }
                      return [];
                    });
                }
              }
              
              console.warn('[Anime-Sama] No episodes found');
              return [];
            });
        });
    })
    .catch(function(err) {
      console.error('[Anime-Sama] Error: ' + err.message);
      return [];
    });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
