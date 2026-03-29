// Provider HDS pour Nuvio TV
// Site: on2.hds.quest
// Version: 4.0.0 - Sans clé TMDB

var HDS_DOMAIN = 'https://on2.hds.quest';
var HDS_API = 'https://on2.hds.quest/wp-admin/admin-ajax.php';
var HDSPLAY = 'https://hdsplay.xyz';

// Étape 1 : Chercher sur HDS par titre
function searchOnHDS(title, mediaType) {
  var query = encodeURIComponent(title);
  var url = HDS_DOMAIN + '/?s=' + query;

  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) { return r.text(); })
  .then(function(html) {
    var links = [];
    var pattern = /href=["'](https:\/\/on2\.hds\.quest\/(films|series|episodes)\/[^"'?#]+)["']/gi;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (links.indexOf(match[1]) === -1) links.push(match[1]);
    }

    // Filtrer selon le type
    var filtered = links.filter(function(l) {
      if (mediaType === 'movie') return l.indexOf('/films/') !== -1;
      return l.indexOf('/series/') !== -1;
    });

    if (filtered.length === 0 && links.length > 0) filtered = links;
    if (filtered.length === 0) throw new Error('[HDS] Aucun résultat pour: ' + title);

    console.log('[HDS] Lien trouvé:', filtered[0]);
    return filtered[0];
  });
}

// Étape 2 : Construire l'URL de l'épisode pour les séries
function buildEpisodeUrl(seriesUrl, season, episode) {
  var slugMatch = seriesUrl.match(/\/series\/([^\/]+)\/?$/);
  if (!slugMatch) throw new Error('[HDS] Impossible d\'extraire le slug série');
  var slug = slugMatch[1];
  return HDS_DOMAIN + '/episodes/' + slug + '-saison-' + season + '-episode-' + episode + '/';
}

// Étape 3 : Extraire le postId depuis une page
function extractPostId(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) {
    if (!r.ok) throw new Error('[HDS] Page introuvable: ' + url);
    return r.text();
  })
  .then(function(html) {
    var m = html.match(/data-post=["']?(\d+)/i) || html.match(/data-id=["']?(\d+)/i);
    if (!m) throw new Error('[HDS] PostId non trouvé sur: ' + url);
    console.log('[HDS] PostId:', m[1]);
    return m[1];
  });
}

// Étape 4 : Appel admin-ajax pour obtenir l'embed URL
function getEmbedUrl(postId, type, referer) {
  var tryPlayer = function(nume) {
    var formData = new URLSearchParams();
    formData.append('action', 'doo_player_ajax');
    formData.append('post', postId);
    formData.append('nume', String(nume));
    formData.append('type', type);

    return fetch(HDS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36'
      },
      body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      return (data.embed_url && data.embed_url !== '') ? data.embed_url : null;
    });
  };

  return tryPlayer(1).then(function(url) {
    if (url) return url;
    return tryPlayer(2);
  }).then(function(url) {
    if (url) return url;
    return tryPlayer(3);
  }).then(function(url) {
    if (!url) throw new Error('[HDS] Aucune embed_url pour postId=' + postId);
    console.log('[HDS] embed_url:', url);
    return url;
  });
}

// Étape 5 : Suivre la redirection vers hdsplay.xyz
function resolveHdsplayUrl(embedUrl) {
  return fetch(embedUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) {
    var finalUrl = r.url;
    console.log('[HDS] URL après redirection:', finalUrl);
    if (finalUrl.indexOf('hdsplay.xyz') === -1) {
      throw new Error('[HDS] Redirection inattendue: ' + finalUrl);
    }
    return finalUrl;
  });
}

// Étape 6 : Extraire le m3u8 depuis la page hdsplay
function extractM3u8(hdsplayUrl) {
  return fetch(hdsplayUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) { return r.text(); })
  .then(function(html) {
    var start = html.indexOf("eval(function(p,a,c,k,e,d)");
    if (start === -1) throw new Error('[HDS] eval non trouvé dans la page hdsplay');

    var evalStr = html.substring(start);
    var end = evalStr.indexOf("split('|')))") + "split('|')))".length;
    evalStr = evalStr.substring(0, end);

    var decoded;
    try {
      decoded = (new Function('return ' + evalStr.replace(/^eval/, '')))();
    } catch(e) {
      throw new Error('[HDS] Erreur décodage eval: ' + e.message);
    }

    // hls4 en priorité (stream direct), puis hls2, puis hls3
    var hls4 = decoded.match(/"hls4"\s*:\s*"([^"]+)"/);
    var hls2 = decoded.match(/"hls2"\s*:\s*"([^"]+)"/);
    var hls3 = decoded.match(/"hls3"\s*:\s*"([^"]+)"/);

    var url = null;
    if (hls4 && hls4[1]) url = hls4[1];
    else if (hls2 && hls2[1]) url = hls2[1];
    else if (hls3 && hls3[1]) url = hls3[1];

    if (!url) throw new Error('[HDS] Aucune source m3u8 trouvée');
    if (url.charAt(0) === '/') url = HDSPLAY + url;

    console.log('[HDS] m3u8:', url);
    return url;
  });
}

// Fonction principale appelée par Nuvio TV
function getStreams(tmdbId, mediaType, season, episode, title) {
  console.log('[HDS] Début recherche tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode + ' title=' + title);

  if (!title) {
    console.error('[HDS] Titre manquant');
    return Promise.resolve([]);
  }

  var contentUrl = null;

  return searchOnHDS(title, mediaType)
    .then(function(url) {
      if (mediaType === 'tv' && season && episode) {
        contentUrl = buildEpisodeUrl(url, season, episode);
        console.log('[HDS] URL épisode:', contentUrl);
      } else {
        contentUrl = url;
      }
      return extractPostId(contentUrl);
    })
    .then(function(postId) {
      var type = mediaType === 'movie' ? 'movie' : 'tv';
      return getEmbedUrl(postId, type, contentUrl);
    })
    .then(function(embedUrl) {
      return resolveHdsplayUrl(embedUrl);
    })
    .then(function(hdsplayUrl) {
      return extractM3u8(hdsplayUrl);
    })
    .then(function(m3u8Url) {
      return [{
        name: 'HDS',
        title: 'HDS Streaming',
        url: m3u8Url,
        quality: 'HD',
        type: 'hls',
        headers: {
          'Referer': HDSPLAY + '/',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36'
        }
      }];
    })
    .catch(function(error) {
      console.error('[HDS] Erreur:', error.message);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
