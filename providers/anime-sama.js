// =============================================================
// Provider Nuvio : Anime-Sama (anime-sama.fr)
// Version : 4.0.0 - Simple working provider with Promise chains
// =============================================================

var ANIME_SAMA_BASE = 'https://anime-sama.fr';
var JIKAN_API = 'https://api.jikan.moe/v4';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ============= SEARCH ANIME =============

function searchAnimeOnJikan(query) {
  console.log('[Anime-Sama] Searching Jikan: ' + query);
  
  var url = JIKAN_API + '/anime?query=' + encodeURIComponent(query) + '&limit=1';
  
  return fetch(url, { headers: HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.data || data.data.length === 0) {
        console.warn('[Anime-Sama] No anime found for: ' + query);
        return null;
      }
      var anime = data.data[0];
      console.log('[Anime-Sama] Found: ' + anime.title);
      return {
        title: anime.title,
        titleEnglish: anime.title_english || anime.title
      };
    })
    .catch(function(err) {
      console.error('[Anime-Sama] Jikan error: ' + err.message);
      return null;
    });
}

// ============= NORMALIZE =============

function normalizeTitleForAnimeSama(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============= FETCH EPISODES =============

function fetchEpisodesJs(catalogueName, season, language) {
  season = season || 1;
  language = language || 'vf';
  
  console.log('[Anime-Sama] Fetching episodes: ' + catalogueName + ' S' + season + ' (' + language + ')');
  
  var url = ANIME_SAMA_BASE + '/catalogue/' + catalogueName + '/saison' + season + '/' + language + '/episodes.js';
  
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

// ============= RESOLVE STREAM URL =============

function resolveStreamUrl(embedUrl) {
  if (!embedUrl || embedUrl.indexOf('http') !== 0) return Promise.resolve(null);
  
  console.log('[Anime-Sama] Resolving embed: ' + embedUrl);
  
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

// ============= MAIN FUNCTION =============

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Anime-Sama] Request: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);
  
  // Vérifier les paramètres
  if (mediaType !== 'tv' || !season || !episode || !tmdbId) {
    console.warn('[Anime-Sama] Invalid parameters');
    return Promise.resolve([]);
  }
  
  // Étape 1: Chercher l'anime via Jikan avec l'ID
  return searchAnimeOnJikan(tmdbId.toString())
    .then(function(anime) {
      if (!anime) {
        console.warn('[Anime-Sama] Anime not found');
        return [];
      }
      
      // Étape 2: Normaliser le titre pour anime-sama
      var catalogueName = normalizeTitleForAnimeSama(anime.titleEnglish || anime.title);
      console.log('[Anime-Sama] Catalog: ' + catalogueName);
      
      // Étape 3: Récupérer les épisodes en VF
      return fetchEpisodesJs(catalogueName, season, 'vf')
        .then(function(episodeUrls) {
          if (episodeUrls && episodeUrls.length > 0) {
            var episodeUrl = episodeUrls[episode - 1];
            if (episodeUrl) {
              return resolveStreamUrl(episodeUrl)
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
          return fetchEpisodesJs(catalogueName, season, 'vostfr')
            .then(function(vostfrUrls) {
              if (vostfrUrls && vostfrUrls.length > 0) {
                var episodeUrl = vostfrUrls[episode - 1];
                if (episodeUrl) {
                  return resolveStreamUrl(episodeUrl)
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

// ============= EXPORT =============

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
