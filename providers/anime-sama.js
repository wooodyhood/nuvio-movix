// =============================================================
// Provider Nuvio : Anime-Sama (anime-sama.fr)
// Version : 6.0.0 - Final working version
// =============================================================

var TMDB_API = 'https://api.themoviedb.org/3';
var TMDB_KEY = '8265bd1679663a7ea12ac168da84d2e8';
var ANIME_SAMA_BASE = 'https://anime-sama.to';

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

// Récupérer le fichier episodes.js
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
      
      // Parser tous les arrays : eps1, eps2, eps3, epsAS, etc.
      var allUrls = [];
      
      // Cherche var eps1 = [...], var eps2 = [...], etc.
      var regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]/g;
      var match;
      
      while ((match = regex.exec(html)) !== null) {
        var arrayName = match[1];
        var arrayContent = match[2];
        
        // Récupère toutes les URLs de cet array
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
      
      // Si c'est déjà un lien direct .mp4
      if (embedUrl.indexOf('.mp4') > -1) {
        return embedUrl;
      }
      
      // Cherche les patterns vidéo dans le HTML
      var patterns = [
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /["']([^"']*\.m3u8[^"']*?)["']/i,
        /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
        /source\s+src=["']([^"']+\.mp4[^"']*)["']/i,
        /https?:\/\/[^\s"']+\.m3u8[^\s"']*/i,
        /https?:\/\/[^\s"']+\.mp4[^\s"']*/i
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
  if (lower.indexOf('anime-sama.fr') > -1 || lower.indexOf('s22.anime-sama')

