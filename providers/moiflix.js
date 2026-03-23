// =============================================================
// Provider Nuvio : Moiflix.org (VF français)
// Version : 1.0.0
// =============================================================
 
var MOIFLIX_BASE = 'https://moiflix.org';
 
function httpGet(url, headers) {
  return fetch(url, {
    method: 'GET',
    headers: Object.assign({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': MOIFLIX_BASE + '/'
    }, headers || {})
  }).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  });
}
 
function httpPost(url, body, headers) {
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': MOIFLIX_BASE + '/'
    }, headers || {}),
    body: body
  }).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  });
}
 
// Recherche un film/série sur moiflix et retourne le slug
function searchMoiflix(title) {
  var encoded = encodeURIComponent(title);
  return httpGet(MOIFLIX_BASE + '/search?q=' + encoded)
    .then(function(html) {
      var type = 'movie';
      var matches = html.match(/href="\/movie\/([^"]+)"/g);
      if (!matches || matches.length === 0) {
        matches = html.match(/href="\/show\/([^"]+)"/g);
        type = 'show';
      }
      if (!matches || matches.length === 0) return null;
      var slugMatch = matches[0].match(/href="\/(movie|show)\/([^"]+)"/);
      if (!slugMatch) return null;
      return { slug: slugMatch[2], type: slugMatch[1] };
    });
}
 
// Charge la page du film et extrait le token + embed ID
function getTokenAndEmbed(slug, type) {
  var url = MOIFLIX_BASE + '/' + (type || 'movie') + '/' + slug;
  return httpGet(url)
    .then(function(html) {
      var tokenMatch = html.match(/name="_TOKEN" value="([^"]+)"/);
      var embedMatch = html.match(/data-embed="([^"]+)"/);
      if (!tokenMatch || !embedMatch) throw new Error('Token ou embed non trouvé');
      return { token: tokenMatch[1], embedId: embedMatch[1] };
    });
}
 
// Appelle l'API ajax/embed pour obtenir l'URL du lecteur
function getEmbedUrl(embedId, token) {
  return httpPost(
    MOIFLIX_BASE + '/ajax/embed',
    'id=' + embedId + '&_TOKEN=' + encodeURIComponent(token)
  ).then(function(html) {
    var iframeMatch = html.match(/src="([^"]+)"/);
    if (!iframeMatch) throw new Error('URL embed non trouvée');
    var url = iframeMatch[1];
    if (url.startsWith('//')) url = 'https:' + url;
    return url;
  });
}
 
// Charge la page xtremestream et extrait le m3u8
function resolveXtremestream(embedUrl) {
  return httpGet(embedUrl, { 'Referer': MOIFLIX_BASE + '/' })
    .then(function(html) {
      // Cherche l'URL m3u8 ou le data-id pour construire l'URL
      var m3u8Match = html.match(/["']([^"']+\.m3u8[^"']*)["']/);
      if (m3u8Match) return m3u8Match[1];
 
      // Cherche l'ID dans l'URL embed (ex: data=72cad9e...)
      var dataMatch = embedUrl.match(/data=([a-f0-9]+)/);
      if (dataMatch) {
        // Construire l'URL du fichier html sur xslecteurcdn
        return httpGet('https://1.xslecteurcdn11.click/cdn/down/' + dataMatch[1] + '/1080/108060.html', {
          'Referer': embedUrl
        }).then(function(html2) {
          var m3u8 = html2.match(/["']([^"']+\.m3u8[^"']*)["']/);
          if (m3u8) return m3u8[1];
          return null;
        });
      }
      return null;
    })
    .catch(function() { return null; });
}
 
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Moiflix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType);
 
  // Étape 1 : Récupérer le titre via TMDB
  var tmdbUrl = mediaType === 'tv'
    ? 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=fr-FR'
    : 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=fr-FR';
 
  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(tmdb) {
      var title = tmdb.title || tmdb.name || '';
      console.log('[Moiflix] Titre: ' + title);
 
      // Étape 2 : Chercher sur moiflix
      return searchMoiflix(title)
        .then(function(result) {
          if (!result) throw new Error('Film non trouvé sur moiflix');
          console.log('[Moiflix] Slug: ' + result.slug);
 
          // Étape 3 : Récupérer token + embed ID
          return getTokenAndEmbed(result.slug, result.type)
            .then(function(data) {
              console.log('[Moiflix] Token + Embed ID récupérés');
 
              // Étape 4 : Obtenir l'URL du lecteur
              return getEmbedUrl(data.embedId, data.token)
                .then(function(embedUrl) {
                  console.log('[Moiflix] Embed URL: ' + embedUrl);
 
                  // Étape 5 : Résoudre le m3u8
                  return resolveXtremestream(embedUrl)
                    .then(function(streamUrl) {
                      if (!streamUrl) return [];
                      console.log('[Moiflix] Stream URL: ' + streamUrl);
                      return [{
                        name: 'Moiflix',
                        title: title + ' - VF',
                        url: streamUrl,
                        quality: '1080p',
                        format: 'm3u8',
                        headers: {
                          'Referer': embedUrl,
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                      }];
                    });
                });
            });
        });
    })
    .catch(function(err) {
      console.error('[Moiflix] Erreur:', err.message || err);
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
