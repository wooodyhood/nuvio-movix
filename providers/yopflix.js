// =============================================================
// Provider Nuvio : YopFlix (VF français)
// Version : 1.1.0 - Détection domaine via Telegram
// =============================================================
 
var YOPFLIX_DEFAULT = 'https://yopflix.my';
var YOPFLIX_TELEGRAM = 'https://t.me/s/YopFlix';
var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
 
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
      // Prendre le dernier domaine mentionné (le plus récent)
      return domains[domains.length - 1].replace(/\/$/, '');
    })
    .catch(function() { return null; });
}
 
// Dépacker le JS obfusqué de Vidzy
function unpack(packed) {
  try {
    return eval(packed.replace(/^eval/, '')) || '';
  } catch(e) { return ''; }
}
 
// Rechercher le film/série sur YopFlix par titre
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
 
// Récupérer le mapping ep_num → ep_id pour une saison
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
 
// Extraire le stream m3u8/mp4 depuis la page Vidzy
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
      var packed = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/g);
      if (!packed) throw new Error('JS packed non trouvé');
      var unpacked = unpack(packed[0]);
      if (!unpacked) throw new Error('Dépackage échoué');
      var m3u8 = unpacked.match(/https:\/\/[^"']+\.m3u8[^"']*/);
      var mp4 = unpacked.match(/https:\/\/[^"']+\.mp4[^"']*/);
      if (m3u8) return { url: m3u8[0], format: 'm3u8' };
      if (mp4) return { url: mp4[0], format: 'mp4' };
      throw new Error('Stream non trouvé');
    });
}
 
function tryGetStreams(base, mediaType, season, episode, title) {
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
      console.log('[YopFlix] Vidzy URL: ' + vidzyUrl);
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
 
  if (!title || title === '') {
    console.error('[YopFlix] Titre manquant');
    return Promise.resolve([]);
  }
 
  // Étape 1 : essayer avec le domaine par défaut
  return tryGetStreams(YOPFLIX_DEFAULT, mediaType, season, episode, title)
    .catch(function(err) {
      // Étape 2 : domaine en échec, récupérer le nouveau depuis Telegram
      console.log('[YopFlix] Echec (' + err.message + '), tentative Telegram...');
      return detectDomainFromTelegram().then(function(newBase) {
        if (!newBase) throw new Error('Domaine introuvable sur Telegram');
        if (newBase === YOPFLIX_DEFAULT) throw new Error('Même domaine, toujours en échec');
        console.log('[YopFlix] Nouveau domaine: ' + newBase);
        return tryGetStreams(newBase, mediaType, season, episode, title);
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
 
