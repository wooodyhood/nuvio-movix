// Provider HDS pour Nuvio TV
// Site: on2.hds.quest
// Version: 5.0.0 - Avec TMDB comme Purstream

var HDS_DOMAIN = 'https://on2.hds.quest';
var HDS_API = 'https://on2.hds.quest/wp-admin/admin-ajax.php';
var HDSPLAY = 'https://hdsplay.xyz';
var TMDB_KEY = '2dca580c2a14b55200e784d157207b4d';
var HDS_UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36';

// Etape 1 : tmdbId -> titre via TMDB
function getTitleFromTmdb(tmdbId, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?language=fr-FR&api_key=' + TMDB_KEY;

  return fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': HDS_UA }
  })
  .then(function(res) {
    if (!res.ok) throw new Error('[HDS] TMDB HTTP ' + res.status);
    return res.json();
  })
  .then(function(data) {
    var titleFr = data.title || data.name;
    var titleOrig = data.original_title || data.original_name;
    if (!titleFr && !titleOrig) throw new Error('[HDS] Aucun titre TMDB');
    console.log('[HDS] Titre FR=' + titleFr + ' ORIG=' + titleOrig);
    return { fr: titleFr, orig: titleOrig };
  });
}

// Etape 2 : Chercher sur HDS par titre
function searchOnHDS(title, mediaType) {
  var query = encodeURIComponent(title);
  var url = HDS_DOMAIN + '/?s=' + query;

  return fetch(url, {
    headers: {
      'User-Agent': HDS_UA,
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
    var filtered = links.filter(function(l) {
      if (mediaType === 'movie') return l.indexOf('/films/') !== -1;
      return l.indexOf('/series/') !== -1;
    });
    if (filtered.length === 0 && links.length > 0) filtered = links;
    if (filtered.length === 0) throw new Error('[HDS] Aucun resultat pour: ' + title);
    console.log('[HDS] Trouve:', filtered[0]);
    return filtered[0];
  });
}

// Etape 2 combinee : essaie titre FR puis titre original
function findOnHDS(tmdbId, mediaType) {
  return getTitleFromTmdb(tmdbId, mediaType)
    .then(function(titles) {
      return searchOnHDS(titles.fr, mediaType)
        .catch(function() {
          console.log('[HDS] Titre FR echoue, essai titre original...');
          return searchOnHDS(titles.orig, mediaType);
        });
    });
}

// Etape 3 : Construire l'URL de l'episode pour les series
function buildEpisodeUrl(seriesUrl, season, episode) {
  var slugMatch = seriesUrl.match(/\/series\/([^\/]+)\/?$/);
  if (!slugMatch) throw new Error('[HDS] Impossible d extraire le slug serie');
  var slug = slugMatch[1];
  return HDS_DOMAIN + '/episodes/' + slug + '-saison-' + season + '-episode-' + episode + '/';
}

// Etape 4 : Extraire le postId depuis une page
function extractPostId(url) {
  console.log('[HDS] Fetch page:', url);
  return fetch(url, {
    headers: {
      'User-Agent': HDS_UA,
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) {
    console.log('[HDS] Status page:', r.status);
    if (!r.ok) throw new Error('[HDS] Page introuvable: ' + url);
    return r.text();
  })
  .then(function(html) {
    var m = html.match(/data-post=["']?(\d+)/i) || html.match(/data-id=["']?(\d+)/i);
    if (!m) throw new Error('[HDS] PostId non trouve sur: ' + url);
    console.log('[HDS] PostId:', m[1]);
    return m[1];
  });
}

// Etape 5 : Appel admin-ajax pour obtenir l'embed URL
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
        'User-Agent': HDS_UA
      },
      body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      console.log('[HDS] Player', nume, ':', data.embed_url || 'vide');
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

// Etape 6 : Suivre la redirection vers hdsplay.xyz
function resolveHdsplayUrl(embedUrl) {
  console.log('[HDS] Resolution embed:', embedUrl);
  return fetch(embedUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': HDS_UA,
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) {
    var finalUrl = r.url;
    console.log('[HDS] URL apres redirection:', finalUrl);
    if (finalUrl.indexOf('hdsplay.xyz') === -1) {
      throw new Error('[HDS] Redirection inattendue: ' + finalUrl);
    }
    return finalUrl;
  });
}

// Etape 7 : Extraire le m3u8 depuis la page hdsplay
function extractM3u8(hdsplayUrl) {
  console.log('[HDS] Fetch hdsplay:', hdsplayUrl);
  return fetch(hdsplayUrl, {
    headers: {
      'User-Agent': HDS_UA,
      'Referer': HDS_DOMAIN
    }
  })
  .then(function(r) {
    console.log('[HDS] Status hdsplay:', r.status);
    return r.text();
  })
  .then(function(html) {
    var start = html.indexOf("eval(function(p,a,c,k,e,d)");
    if (start === -1) throw new Error('[HDS] eval non trouve dans la page hdsplay');

    var evalStr = html.substring(start);
    var end = evalStr.indexOf("split('|')))") + "split('|')))".length;
    evalStr = evalStr.substring(0, end);

    var decoded;
    try {
      decoded = (new Function('return ' + evalStr.replace(/^eval/, '')))();
    } catch(e) {
      throw new Error('[HDS] Erreur decodage eval: ' + e.message);
    }

    var hls4 = decoded.match(/"hls4"\s*:\s*"([^"]+)"/);
    var hls2 = decoded.match(/"hls2"\s*:\s*"([^"]+)"/);
    var hls3 = decoded.match(/"hls3"\s*:\s*"([^"]+)"/);

    console.log('[HDS] hls4:', hls4 ? hls4[1] : 'non trouve');
    console.log('[HDS] hls2:', hls2 ? hls2[1] : 'non trouve');
    console.log('[HDS] hls3:', hls3 ? hls3[1] : 'non trouve');

    var url = null;
    if (hls4 && hls4[1]) url = hls4[1];
    else if (hls2 && hls2[1]) url = hls2[1];
    else if (hls3 && hls3[1]) url = hls3[1];

    if (!url) throw new Error('[HDS] Aucune source m3u8 trouvee');
    if (url.charAt(0) === '/') url = HDSPLAY + url;

    console.log('[HDS] m3u8:', url);
    return url;
  });
}

// Fonction principale appelee par Nuvio TV
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[HDS] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  var contentUrl = null;

  return findOnHDS(tmdbId, mediaType)
    .then(function(url) {
      if (mediaType === 'tv' && season && episode) {
        contentUrl = buildEpisodeUrl(url, season, episode);
        console.log('[HDS] URL episode:', contentUrl);
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
      console.log('[HDS] SUCCESS:', m3u8Url);
      return [{
        name: 'HDS',
        title: 'HDS Streaming',
        url: m3u8Url,
        quality: 'HD',
        type: 'hls',
        headers: {
          'Referer': HDSPLAY + '/',
          'User-Agent': HDS_UA
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

// ===== TEST LOCAL UNIQUEMENT - A SUPPRIMER AVANT DEPLOIEMENT =====
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].indexOf('hds') !== -1) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  getStreams('27205', 'movie', null, null)
    .then(function(streams) {
      console.log('\n===== RESULTAT =====');
      console.log('Streams trouves:', streams.length);
      if (streams.length > 0) console.log(JSON.stringify(streams, null, 2));
    });
          } 
