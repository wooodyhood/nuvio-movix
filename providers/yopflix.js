// =============================================================
// Provider Nuvio : YopFlix (VF/VOSTFR français)
// Version : 4.0.0 - Dépaquetage JavaScript comme movix.js
// =============================================================

var YOPFLIX_BASE = 'https://yopflix.my';
var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Fonction de dépaquetage (identique à celle de movix.js)
function unpackPacker(packed) {
  var match = packed.match(/\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split/);
  if (!match) return null;

  var p = match[1];
  var a = parseInt(match[2]);
  var c = parseInt(match[3]);
  var k = match[4].split('|');

  function decode(base, num) {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var result = '';
    do {
      result = chars[num % base] + result;
      num = Math.floor(num / base);
    } while (num > 0);
    return result;
  }

  while (c--) {
    if (k[c]) {
      var token = decode(a, c);
      p = p.replace(new RegExp('\\b' + token + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

// Récupérer le titre depuis TMDB API
function getTitleFromTmdb(tmdbId, mediaType) {
  var url = mediaType === 'tv'
    ? 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=a9e49b08496469614f9d0e74b1219084&language=fr-FR'
    : 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=a9e49b08496469614f9d0e74b1219084&language=fr-FR';
  
  return fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var title = data.title || data.name;
      if (!title) throw new Error('Titre non trouvé');
      return title;
    });
}

// Rechercher sur YopFlix par titre
function searchYopflix(title) {
  var url = YOPFLIX_BASE + '/api_search.php?q=' + encodeURIComponent(title);
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_BASE + '/' }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data.results || data.results.length === 0) {
        throw new Error('Aucun résultat pour "' + title + '"');
      }
      return data.results[0];
    });
}

// Récupérer l'iframe Vidzy depuis la page film
function getVidzyUrlFromMovie(yopId) {
  var url = YOPFLIX_BASE + '/watch.php?id=' + yopId;
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_BASE + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var iframeMatch = html.match(/src=["'](https:\/\/vidzy\.live\/embed-[^"']+)["']/);
      if (!iframeMatch) throw new Error('Iframe Vidzy non trouvée');
      return iframeMatch[1];
    });
}

// Récupérer l'ep_id pour les séries
function getEpisodeId(yopId, season, episode) {
  var url = YOPFLIX_BASE + '/series.php?id=' + yopId + '&season=' + season;
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_BASE + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var pattern = /ep=(\d+)#playerZone[\s\S]{0,300}?ep-num-badge-number">(\d+)<\/span>/g;
      var match;
      var episodes = {};
      while ((match = pattern.exec(html)) !== null) {
        episodes[parseInt(match[2])] = match[1];
      }
      
      var epId = episodes[episode];
      if (!epId) throw new Error('S' + season + 'E' + episode + ' non trouvé');
      return epId;
    });
}

// Récupérer l'iframe Vidzy depuis la page épisode
function getVidzyUrlFromEpisode(yopId, season, epId) {
  var url = YOPFLIX_BASE + '/series.php?id=' + yopId + '&season=' + season + '&ep=' + epId;
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_BASE + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var iframeMatch = html.match(/src=["'](https:\/\/vidzy\.live\/embed-[^"']+)["']/);
      if (!iframeMatch) throw new Error('Iframe Vidzy non trouvée');
      return iframeMatch[1];
    });
}

// Extraire le stream depuis Vidzy (avec dépaquetage)
function getStreamFromVidzy(vidzyUrl) {
  return fetch(vidzyUrl, {
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_BASE + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Chercher le JavaScript packé (comme dans movix.js)
      var packed = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\(.\|.\)\)\)/g);
      
      if (packed) {
        for (var i = 0; i < packed.length; i++) {
          var unpacked = unpackPacker(packed[i]);
          if (unpacked) {
            // Chercher l'URL m3u8 dans le code dépaqueté
            var m3u8Match = unpacked.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
            if (m3u8Match) return m3u8Match[0];
          }
        }
      }
      
      // Fallback : chercher directement dans le HTML
      var directMatch = html.match(/https?:\/\/[a-z0-9]+\.vidzy\.live\/hls2\/[^"'\s]+\.m3u8[^"'\s]*/);
      if (directMatch) return directMatch[0];
      
      throw new Error('Aucune URL .m3u8 trouvée');
    });
}

// Fonction principale
function getStreams(tmdbId, mediaType, season, episode, title) {
  console.log('[YopFlix] Démarrage tmdbId=' + tmdbId + ' type=' + mediaType);
  
  var isSeries = (mediaType === 'tv');
  var s = season || 1;
  var e = episode || 1;
  
  var titlePromise = (title && title !== '')
    ? Promise.resolve(title)
    : getTitleFromTmdb(tmdbId, mediaType);
  
  return titlePromise
    .then(function(resolvedTitle) {
      console.log('[YopFlix] Titre: ' + resolvedTitle);
      return searchYopflix(resolvedTitle);
    })
    .then(function(result) {
      console.log('[YopFlix] Trouvé: id=' + result.id + ' type=' + result.type);
      var yopId = result.id;
      
      if (isSeries && result.type === 'series') {
        return getEpisodeId(yopId, s, e)
          .then(function(epId) {
            return getVidzyUrlFromEpisode(yopId, s, epId);
          });
      } else {
        return getVidzyUrlFromMovie(yopId);
      }
    })
    .then(function(vidzyUrl) {
      console.log('[YopFlix] Vidzy: ' + vidzyUrl);
      return getStreamFromVidzy(vidzyUrl);
    })
    .then(function(streamUrl) {
      console.log('[YopFlix] Stream: ' + streamUrl);
      return [{
        name: 'YopFlix',
        title: isSeries ? 'S' + s + 'E' + e + ' - VF' : 'VF',
        url: streamUrl,
        quality: 'HD',
        format: 'm3u8',
        headers: {
          'User-Agent': UA,
          'Referer': 'https://vidzy.live/',
          'Origin': 'https://vidzy.live'
        }
      }];
    })
    .catch(function(err) {
      console.error('[YopFlix] Erreur: ' + err.message);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
