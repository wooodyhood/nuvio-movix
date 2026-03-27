// =============================================================
// Provider Nuvio : Anime-Sama (anime-sama.fr)
// Version : 7.0.0 - Simple direct URLs
// =============================================================

var TMDB_API = 'https://api.themoviedb.org/3';
var TMDB_KEY = '8265bd1679663a7ea12ac168da84d2e8';
var ANIME_SAMA_BASE = 'https://anime-sama.to';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

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

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function fetchEpisodesFile(catalogName, season, language) {
  season = season || 1;
  language = language || 'vf';
  
  console.log('[Anime-Sama] Fetching episodes file: ' + catalogName + ' S' + season + ' (' + language + ')');
  
  var url = ANIME_SAMA_BASE + '/catalogue/' + catalogName + '/saison' + season + '/' + language + '/episodes.js';
  
  return fetch(url, { headers: HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      if (!html) return [];
      
      var allUrls = [];
      
      // Parser tous les arrays
      var regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]/g;
      var match;
      
      while ((match = regex.exec(html)) !== null) {
        var arrayContent = match[2];
        var urlMatches = arrayContent.match(/["']([^"']+)["']/g);
        
        if (urlMatches) {
          for (var i = 0; i < urlMatches.length; i++) {
            var url = urlMatches[i].replace(/["']/g, '');
            allUrls.push(url);
          }
        }
      }
      
      console.log('[Anime-Sama] Found ' + allUrls.length + ' episode URLs');
      return allUrls;
    })
    .catch(function(err) {
      console.error('[Anime-Sama] Episode file fetch error: ' + err.message);
      return [];
    });
}

function getPlayerName(url) {
  if (!url) return 'Player';
  var lower = url.toLowerCase();
  
  if (lower.indexOf('sibnet') > -1) return 'Sibnet';
  if (lower.indexOf('vidmoly') > -1) return 'Vidmoly';
  if (lower.indexOf('sendvid') > -1) return 'Sendvid';
  if (lower.indexOf('s22.anime-sama') > -1 || lower.indexOf('.mp4') > -1) return 'Anime-Sama Direct';
  
  return 'Stream';
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Anime-Sama] Request: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);
  
  if (mediaType !== 'tv' || !season || !episode || !tmdbId) {
    console.warn('[Anime-Sama] Invalid parameters');
    return Promise.resolve([]);
  }
  
  return getTitleFromTMDB(tmdbId)
    .then(function(title) {
      if (!title) return [];
      
      var catalogName = normalizeTitle(title);
      console.log('[Anime-Sama] Catalog: ' + catalogName);
      
      return fetchEpisodesFile(catalogName, season, 'vf')
        .then(function(episodeUrls) {
          if (episodeUrls && episodeUrls.length > 0) {
            var episodeIndex = episode - 1;
            
            if (episodeIndex < episodeUrls.length) {
              var episodeUrl = episodeUrls[episodeIndex];
              console.log('[Anime-Sama] Episode URL: ' + episodeUrl);
              
              return [{
                name: 'Anime-Sama',
                title: getPlayerName(episodeUrl) + ' - Ep ' + episode,
                url: episodeUrl,
                quality: 'HD',
                headers: {
                  'Referer': ANIME_SAMA_BASE,
                  'User-Agent': HEADERS['User-Agent']
                }
              }];
            }
          }
          
          console.log('[Anime-Sama] VF not found, trying VOSTFR');
          return fetchEpisodesFile(catalogName, season, 'vostfr')
            .then(function(vostfrUrls) {
              if (vostfrUrls && vostfrUrls.length > 0) {
                var episodeIndex = episode - 1;
                
                if (episodeIndex < vostfrUrls.length) {
                  var episodeUrl = vostfrUrls[episodeIndex];
                  
                  return [{
                    name: 'Anime-Sama (VOSTFR)',
                    title: getPlayerName(episodeUrl) + ' - Ep ' + episode,
                    url: episodeUrl,
                    quality: 'HD',
                    headers: {
                      'Referer': ANIME_SAMA_BASE,
                      'User-Agent': HEADERS['User-Agent']
                    }
                  }];
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
