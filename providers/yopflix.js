// =============================================================
// Provider Nuvio : YopFlix (VF français)
// Version : 2.2.0 - Films + Séries
// =============================================================

var YOPFLIX_BASE = 'https://yopflix.my';
var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Récupérer le titre depuis TMDB
function getTitleFromTmdb(tmdbId, mediaType) {
  var url = mediaType === 'tv'
    ? 'https://www.themoviedb.org/tv/' + tmdbId + '?language=fr-FR'
    : 'https://www.themoviedb.org/movie/' + tmdbId + '?language=fr-FR';
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogTitle) {
        var t = ogTitle[1].replace(/\s*[—–-]\s*(The Movie Database|TMDB).*$/i, '').trim();
        if (t) return encodeURIComponent(t);
      }
      var pageTitle = html.match(/<title>([^<]+)<\/title>/);
      if (pageTitle) {
        var t = pageTitle[1].replace(/\s*[—–-]\s*(The Movie Database|TMDB).*$/i, '').trim();
        if (t) return encodeURIComponent(t);
      }
      throw new Error('Titre non trouvé');
    });
}

// Récupérer l'ID YopFlix à partir du titre
function getYopflixIdFromTitle(base, encodedTitle) {
  var searchUrl = base + '/search/' + encodedTitle;
  
  return fetch(searchUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': UA }
  })
    .then(function(res) {
      var location = res.headers.get('location');
      if (!location) throw new Error('Pas de redirection');
      
      var match = location.match(/id=(\d+)/);
      if (!match) throw new Error('ID non trouvé');
      
      return match[1];
    });
}

// === Gestion des SÉRIES ===

// Récupérer le ep_id depuis la page de saison
function getEpisodeId(base, yopId, season, episode) {
  var url = base + '/series.php?id=' + yopId + '&season=' + season;
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Pattern pour extraire ep=XXX et le numéro d'épisode
      var pattern = /ep=(\d+)[^"]*"[^"]*ep-num-badge-number[^>]*>(\d+)<\//g;
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

// Récupérer l'iframe Vidzy depuis une page d'épisode
function getVidzyUrlFromEpisode(base, yopId, season, epId) {
  var url = base + '/series.php?id=' + yopId + '&season=' + season + '&ep=' + epId;
  
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var iframeMatch = html.match(/<iframe[^>]+src=["'](https:\/\/vidzy\.live\/embed-[^"']+)["']/);
      if (!iframeMatch) throw new Error('Iframe Vidzy non trouvée');
      return iframeMatch[1];
    });
}

// === Gestion des FILMS ===

// Récupérer l'iframe Vidzy depuis une page film
function getVidzyUrlFromMovie(base, yopId) {
  return fetch(base + '/watch.php?id=' + yopId, {
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var iframeMatch = html.match(/<iframe[^>]+src=["'](https:\/\/vidzy\.live\/embed-[^"']+)["']/);
      if (!iframeMatch) throw new Error('Iframe Vidzy non trouvée');
      return iframeMatch[1];
    });
}

// === Extraction du stream depuis Vidzy ===

function getStreamUrlFromVidzy(embedUrl) {
  return fetch(embedUrl, {
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_BASE + '/' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Chercher une URL .m3u8 directe
      var m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
      if (m3u8Match) return m3u8Match[0];
      
      // Chercher le pattern vidzy.live/hls2
      var hlsMatch = html.match(/https?:\/\/[a-z0-9]+\.vidzy\.live\/hls2\/[^"'\s]+\.m3u8[^"'\s]*/);
      if (hlsMatch) return hlsMatch[0];
      
      throw new Error('Aucune URL .m3u8 trouvée');
    });
}

// === Fonction principale ===

function getStreams(tmdbId, mediaType, season, episode, title) {
  console.log('[YopFlix] tmdbId=' + tmdbId + ' type=' + mediaType);
  
  var isSeries = (mediaType === 'tv');
  var s = season || 1;
  var e = episode || 1;
  
  var titlePromise = (title && title !== '')
    ? Promise.resolve(encodeURIComponent(title))
    : getTitleFromTmdb(tmdbId, mediaType);
  
  return titlePromise
    .then(function(encodedTitle) {
      console.log('[YopFlix] Titre: ' + encodedTitle);
      return getYopflixIdFromTitle(YOPFLIX_BASE, encodedTitle);
    })
    .then(function(yopId) {
      console.log('[YopFlix] ID: ' + yopId);
      
      if (isSeries) {
        // Gestion série
        return getEpisodeId(YOPFLIX_BASE, yopId, s, e)
          .then(function(epId) {
            return getVidzyUrlFromEpisode(YOPFLIX_BASE, yopId, s, epId);
          });
      } else {
        // Gestion film
        return getVidzyUrlFromMovie(YOPFLIX_BASE, yopId);
      }
    })
    .then(function(vidzyUrl) {
      console.log('[YopFlix] Vidzy: ' + vidzyUrl);
      return getStreamUrlFromVidzy(vidzyUrl);
    })
    .then(function(streamUrl) {
      console.log('[YopFlix] Stream: ' + streamUrl);
      
      var titleDisplay = isSeries 
        ? 'S' + s + 'E' + e + ' - VF'
        : 'VF';
      
      return [{
        name: 'YopFlix',
        title: titleDisplay,
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
