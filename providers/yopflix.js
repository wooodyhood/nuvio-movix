// =============================================================
// Provider Nuvio : YopFlix (VF français)
// Version : 1.3.0 - Dépacking sans eval
// =============================================================
 
var YOPFLIX_DEFAULT = 'https://yopflix.my';
var YOPFLIX_TELEGRAM = 'https://t.me/s/YopFlix';
var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
 
// Dépacker le format P,A,C,K,E,R sans eval
function unpackPacker(packed) {
  // Extraire les paramètres p,a,c,k,e,d
  var match = packed.match(/}\('(.+)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
  if (!match) return null;
 
  var p = match[1];
  var a = parseInt(match[2]);
  var c = parseInt(match[3]);
  var k = match[4].split('|');
 
  // Fonction de décodage de base
  function decode(base, num) {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var result = '';
    var b = base;
    do {
      result = chars[num % b] + result;
      num = Math.floor(num / b);
    } while (num > 0);
    return result;
  }
 
  // Remplacer chaque token
  while (c--) {
    if (k[c]) {
      var token = decode(a, c);
      p = p.replace(new RegExp('\\b' + token + '\\b', 'g'), k[c]);
    }
  }
  return p;
}
 
// Récupérer le titre depuis TMDB public
function getTitleFromTmdb(tmdbId, mediaType) {
  var url = mediaType === 'tv'
    ? 'https://www.themoviedb.org/tv/' + tmdbId + '?language=fr-FR'
    : 'https://www.themoviedb.org/movie/' + tmdbId + '?language=fr-FR';
 
  return fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogTitle) {
        var t = ogTitle[1].replace(/\s*[—–-]\s*(The Movie Database|TMDB).*$/i, '').trim();
        if (t) return t;
      }
      var pageTitle = html.match(/<title>([^<]+)<\/title>/);
      if (pageTitle) {
        var t = pageTitle[1].replace(/\s*[—–-]\s*(The Movie Database|TMDB).*$/i, '').trim();
        if (t) return t;
      }
      throw new Error('Titre non trouvé sur TMDB');
    });
}
 
// Détecter le domaine actuel depuis Telegram
function detectDomainFromTelegram() {
  return fetch(YOPFLIX_TELEGRAM, {
    method: 'GET',
    headers: { 'User-Agent': UA }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/yopflix\.[a-z.]+/gi);
      if (!matches || matches.length === 0) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram');
      });
      if (domains.length === 0) return null;
      return domains[domains.length - 1].replace(/\/$/, '');
    })
    .catch(function() { return null; });
}
 
// Rechercher sur YopFlix par titre
function searchYopflix(base, title) {
  return fetch(base + '/api_search.php?q=' + encodeURIComponent(title), {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data.results || data.results.length === 0) throw new Error('Aucun résultat pour "' + title + '"');
      var titleLower = title.toLowerCase().trim();
      var exact = data.results.find(function(r) {
        return r.title.toLowerCase().trim() === titleLower;
      });
      var best = exact || data.results[0];
      console.log('[YopFlix] Trouvé: id=' + best.id + ' type=' + best.type + ' titre="' + best.title + '"');
      return best;
    });
}
 
// Récupérer l'URL Vidzy depuis une page film
function getVidzyUrlFromMovie(base, yopId) {
  return fetch(base + '/watch.php?id=' + yopId, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var iframe = html.match(/src=["'](https:\/\/vidzy\.live\/embed-[^"']+)["']/);
      if (!iframe) throw new Error('iframe Vidzy non trouvée');
      return iframe[1];
    });
}
 
// Récupérer le ep_id depuis le numéro d'épisode
function getEpisodeId(base, yopId, season, episode) {
  return fetch(base + '/series.php?id=' + yopId + '&season=' + season, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var pattern = /ep=(\d+)#playerZone[\s\S]{0,300}?ep-num-badge-number">(\d+)<\/span>/g;
      var match;
      var episodes = {};
      while ((match = pattern.exec(html)) !== null) {
        episodes[parseInt(match[2])] = match[1];
      }
      var epId = episodes[episode];
      if (!epId) throw new Error('S' + season + 'E' + episode + ' non trouvé');
      console.log('[YopFlix] S' + season + 'E' + episode + ' → ep_id=' + epId);
      return epId;
    });
}
 
// Récupérer l'URL Vidzy depuis une page épisode
function getVidzyUrlFromEpisode(base, yopId, season, epId) {
  return fetch(base + '/series.php?id=' + yopId + '&season=' + season + '&ep=' + epId, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Referer': base + '/' }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var iframe = html.match(/src=["'](https:\/\/vidzy\.live\/embed-[^"']+)["']/);
      if (!iframe) throw new Error('iframe Vidzy non trouvée');
      return iframe[1];
    });
}
 
// Extraire le stream depuis Vidzy sans eval
function getStreamFromVidzy(vidzyUrl) {
  return fetch(vidzyUrl, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Referer': YOPFLIX_DEFAULT + '/' }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      // Essayer d'abord de trouver le m3u8 directement sans dépacking
      var directM3u8 = html.match(/https:\/\/[^"']+\.m3u8[^"']*/);
      var directMp4 = html.match(/https:\/\/[^"']+\.mp4[^"']*/);
      if (directM3u8) return { url: directM3u8[0], format: 'm3u8' };
      if (directMp4) return { url: directMp4[0], format: 'mp4' };
 
      // Dépacker sans eval
      var packed = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/g);
      if (!packed) throw new Error('JS packed non trouvé');
 
      var unpacked = unpackPacker(packed[0]);
      if (!unpacked) throw new Error('Dépackage échoué');
 
      console.log('[YopFlix] Dépacked (200):', unpacked.substring(0, 200));
 
      var m3u8 = unpacked.match(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
      var mp4 = unpacked.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/);
      if (m3u8) return { url: m3u8[0], format: 'm3u8' };
      if (mp4) return { url: mp4[0], format: 'mp4' };
 
      throw new Error('Stream non trouvé après dépacking');
    });
}
 
function tryGetStreams(base, tmdbId, mediaType, season, episode, title) {
  return searchYopflix(base, title)
    .then(function(result) {
      if (mediaType === 'tv') {
        return getEpisodeId(base, result.id, season || 1, episode || 1)
          .then(function(epId) {
            return getVidzyUrlFromEpisode(base, result.id, season || 1, epId);
          });
      }
      return getVidzyUrlFromMovie(base, result.id);
    })
    .then(function(vidzyUrl) {
      console.log('[YopFlix] Vidzy: ' + vidzyUrl);
      return getStreamFromVidzy(vidzyUrl);
    })
    .then(function(stream) {
      console.log('[YopFlix] Stream: ' + stream.url);
      return [{
        name: 'YopFlix',
        title: 'YopFlix VF',
        url: stream.url,
        quality: 'HD',
        format: stream.format,
        headers: {
          'User-Agent': UA,
          'Referer': 'https://vidzy.live/'
        }
      }];
    });
}
 
function getStreams(tmdbId, mediaType, season, episode, title) {
  console.log('[YopFlix] tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode + ' title=' + title);
 
  var titlePromise = (title && title !== '')
    ? Promise.resolve(title)
    : getTitleFromTmdb(tmdbId, mediaType).catch(function() { return null; });
 
  return titlePromise
    .then(function(resolvedTitle) {
      if (!resolvedTitle) throw new Error('Titre introuvable');
      console.log('[YopFlix] Titre: ' + resolvedTitle);
 
      return tryGetStreams(YOPFLIX_DEFAULT, tmdbId, mediaType, season, episode, resolvedTitle)
        .catch(function(err) {
          console.log('[YopFlix] Echec (' + err.message + '), tentative Telegram...');
          return detectDomainFromTelegram().then(function(newBase) {
            if (!newBase) throw new Error('Domaine introuvable');
            if (newBase === YOPFLIX_DEFAULT) throw new Error('Même domaine');
            console.log('[YopFlix] Nouveau domaine: ' + newBase);
            return tryGetStreams(newBase, tmdbId, mediaType, season, episode, resolvedTitle);
          });
        });
    })
    .catch(function(err) {
      console.error('[YopFlix] Erreur globale: ' + (err.message || err));
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
