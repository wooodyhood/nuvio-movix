// =============================================================
// Provider Nuvio : Movix.rodeo (VF/VOSTFR français)
// Auteur  : généré par Claude (Anthropic)
// Version : 1.0.0
// =============================================================
// IMPORTANT : Ce fichier est écrit en syntaxe Promise (.then/.catch)
// pour être compatible avec le moteur Hermes de Nuvio SANS transpilation.
// Si vous souhaitez quand même le transpiler :
//   node build.js --transpile movix.js
// =============================================================

var BASE_URL = 'https://movix.rodeo';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL,
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'X-Requested-With': 'XMLHttpRequest'
};

// ── Utilitaires ────────────────────────────────────────────────

/**
 * Normalise une chaîne pour la comparaison de titres.
 * Supprime accents, ponctuation, casse.
 */
function normalizeTitle(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime les diacritiques
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcule un score de similarité simple entre deux titres normalisés.
 * Retourne un nombre entre 0 et 1.
 */
function titleSimilarity(a, b) {
  var na = normalizeTitle(a);
  var nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // Jaccard sur les mots
  var wa = na.split(' ');
  var wb = nb.split(' ');
  var intersection = wa.filter(function(w) { return wb.indexOf(w) !== -1; }).length;
  var union = wa.length + wb.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Effectue un GET et retourne la réponse texte.
 */
function httpGet(url, extraHeaders) {
  var headers = Object.assign({}, HEADERS, extraHeaders || {});
  return fetch(url, { method: 'GET', headers: headers })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' pour ' + url);
      return res.text();
    });
}

/**
 * Effectue un GET et retourne la réponse JSON.
 */
function httpGetJson(url, extraHeaders) {
  var headers = Object.assign({}, HEADERS, extraHeaders || {});
  headers['Accept'] = 'application/json';
  return fetch(url, { method: 'GET', headers: headers })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' pour ' + url);
      return res.json();
    });
}

// ── Recherche sur Movix ────────────────────────────────────────

/**
 * Cherche un titre sur movix.rodeo via son moteur de recherche interne.
 * Retourne un tableau d'objets { id, title, type, year, slug }.
 */
function searchMovix(query) {
  // Movix utilise probablement WordPress avec un endpoint de recherche AJAX
  // ou un endpoint REST personnalisé. On essaie plusieurs stratégies.

  var encodedQuery = encodeURIComponent(query);

  // Stratégie 1 : API REST WordPress standard
  return httpGetJson(BASE_URL + '/wp-json/wp/v2/search?search=' + encodedQuery + '&per_page=10&subtype=any')
    .then(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        return parseWpSearchResults(data);
      }
      return [];
    })
    .catch(function() {
      // Stratégie 2 : Endpoint AJAX WordPress personnalisé
      return httpGetJson(BASE_URL + '/wp-admin/admin-ajax.php?action=ajax_search&query=' + encodedQuery + '&type=any')
        .then(function(data) {
          if (data && data.results) return parseAjaxResults(data.results);
          return [];
        })
        .catch(function() {
          // Stratégie 3 : Page de recherche HTML classique
          return searchViaHtml(query);
        });
    });
}

/**
 * Parse les résultats de l'API REST WordPress.
 */
function parseWpSearchResults(data) {
  return data.map(function(item) {
    return {
      id: item.id,
      title: item.title || '',
      type: item.subtype === 'tv-shows' ? 'tv' : 'movie',
      slug: item.slug || '',
      url: item.url || ''
    };
  });
}

/**
 * Parse les résultats AJAX personnalisés.
 */
function parseAjaxResults(results) {
  return results.map(function(item) {
    return {
      id: item.id || item.ID || '',
      title: item.title || item.post_title || '',
      type: item.type === 'tv' || item.post_type === 'tvshow' ? 'tv' : 'movie',
      slug: item.slug || item.post_name || '',
      url: item.url || item.permalink || ''
    };
  });
}

/**
 * Recherche via la page HTML de résultats de Movix.
 * Extrait les résultats du HTML retourné.
 */
function searchViaHtml(query) {
  var encodedQuery = encodeURIComponent(query);
  return httpGet(BASE_URL + '/?s=' + encodedQuery)
    .then(function(html) {
      return parseSearchHtml(html);
    });
}

/**
 * Parse le HTML d'une page de recherche pour en extraire les résultats.
 * Adapté au format typique des sites de streaming WordPress.
 */
function parseSearchHtml(html) {
  var results = [];

  // Pattern pour extraire les liens de films/séries depuis les résultats
  // Format attendu: <a href="https://movix.rodeo/film/titre-du-film/"> ou /serie/
  var linkPattern = /href="(https?:\/\/movix\.rodeo\/(film|serie|movie|tv|watch)[^"]+)"/gi;
  var titlePattern = /<(?:h[1-6]|a)[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([^<]+)<\/(?:h[1-6]|a)>/gi;
  var articlePattern = /<article[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/gi;

  var match;
  var seen = {};

  // Extraction via articles WordPress
  while ((match = articlePattern.exec(html)) !== null) {
    var postId = match[1];
    var articleHtml = match[2];

    if (seen[postId]) continue;
    seen[postId] = true;

    var linkMatch = /href="([^"]+)"/.exec(articleHtml);
    var titleMatch = /<(?:h[1-6]|a)[^>]*>([^<]{2,100})<\/(?:h[1-6]|a)>/.exec(articleHtml);
    var yearMatch = /\b(19|20)\d{2}\b/.exec(articleHtml);
    var typeGuess = articleHtml.indexOf('serie') !== -1 || articleHtml.indexOf('saison') !== -1 ? 'tv' : 'movie';

    if (linkMatch && titleMatch) {
      results.push({
        id: postId,
        title: titleMatch[1].trim(),
        type: typeGuess,
        year: yearMatch ? yearMatch[0] : '',
        slug: '',
        url: linkMatch[1]
      });
    }
  }

  // Fallback : extraction directe des liens si aucun article trouvé
  if (results.length === 0) {
    while ((match = linkPattern.exec(html)) !== null) {
      var url = match[1];
      var pathType = match[2];
      if (seen[url]) continue;
      seen[url] = true;

      var slugMatch = url.match(/\/([^\/]+)\/?$/);
      results.push({
        id: '',
        title: slugMatch ? decodeURIComponent(slugMatch[1].replace(/-/g, ' ')) : '',
        type: (pathType === 'serie' || pathType === 'tv') ? 'tv' : 'movie',
        year: '',
        slug: slugMatch ? slugMatch[1] : '',
        url: url
      });
    }
  }

  return results;
}

// ── Extraction de la page de détail ───────────────────────────

/**
 * Récupère la page de détail d'un contenu et extrait l'ID interne Movix.
 * L'ID interne est utilisé dans l'URL de lecture : /watch/{type}/{internalId}/...
 */
function getInternalId(detailUrl) {
  return httpGet(detailUrl)
    .then(function(html) {
      // Recherche de l'ID interne dans le HTML
      // Plusieurs patterns possibles selon le thème WordPress

      // Pattern 1 : data-id ou data-post-id dans un bouton de lecture
      var idMatch = html.match(/data-(?:post-)?id="([a-zA-Z0-9_-]{10,})"/);
      if (idMatch) return idMatch[1];

      // Pattern 2 : dans l'URL du bouton "Regarder"
      var watchMatch = html.match(/\/watch\/(?:movie|film|tv|serie)\/([a-zA-Z0-9_-]+)/);
      if (watchMatch) return watchMatch[1];

      // Pattern 3 : variable JavaScript dans la page
      var jsMatch = html.match(/(?:movieId|serieId|contentId|postId)['":\s]+['"]?([a-zA-Z0-9_-]{8,})['"]?/);
      if (jsMatch) return jsMatch[1];

      // Pattern 4 : meta tag
      var metaMatch = html.match(/<meta[^>]+name="(?:movie-id|content-id)"[^>]+content="([^"]+)"/);
      if (metaMatch) return metaMatch[1];

      // Pattern 5 : lien direct href="/watch/..."
      var hrefMatch = html.match(/href="[^"]*\/watch\/[^\/]+\/([a-zA-Z0-9_-]{8,})/);
      if (hrefMatch) return hrefMatch[1];

      return null;
    });
}

// ── Construction de l'URL de lecture ──────────────────────────

/**
 * Construit l'URL de la page de lecture sur movix.rodeo.
 */
function buildWatchUrl(internalId, mediaType, season, episode) {
  if (mediaType === 'tv' || mediaType === 'series') {
    var s = season || 1;
    var e = episode || 1;
    return BASE_URL + '/watch/tv/' + internalId + '/s/' + s + '/e/' + e;
  }
  return BASE_URL + '/watch/movie/' + internalId;
}

/**
 * Récupère la page de lecture et en extrait les URLs de stream.
 */
function extractStreamsFromWatchPage(watchUrl) {
  return httpGet(watchUrl)
    .then(function(html) {
      var streams = [];

      // Pattern 1 : iframes embed (source la plus courante sur ces sites)
      var iframePattern = /<iframe[^>]+src="([^"]+)"/gi;
      var match;
      while ((match = iframePattern.exec(html)) !== null) {
        var src = match[1];
        // On ignore les iframes publicitaires connues
        if (src.indexOf('ads') !== -1 || src.indexOf('popup') !== -1) continue;
        streams.push({
          name: 'Movix VF',
          title: 'Movix - Lecteur intégré',
          url: src,
          quality: 'HD',
          headers: {
            'Referer': watchUrl,
            'User-Agent': HEADERS['User-Agent']
          }
        });
      }

      // Pattern 2 : sources vidéo directes (m3u8, mp4)
      var videoPattern = /["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi;
      while ((match = videoPattern.exec(html)) !== null) {
        var videoUrl = match[1];
        if (videoUrl.startsWith('http') || videoUrl.startsWith('//')) {
          if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
          streams.push({
            name: 'Movix Direct',
            title: 'Movix - Stream direct',
            url: videoUrl,
            quality: videoUrl.indexOf('1080') !== -1 ? '1080p' : videoUrl.indexOf('720') !== -1 ? '720p' : 'HD',
            headers: {
              'Referer': watchUrl,
              'User-Agent': HEADERS['User-Agent']
            }
          });
        }
      }

      // Pattern 3 : sources dans un objet JS
      var jwMatch = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi);
      if (jwMatch) {
        jwMatch.forEach(function(m) {
          var fileMatch = m.match(/file\s*:\s*["']([^"']+)/);
          if (fileMatch) {
            streams.push({
              name: 'Movix Player',
              title: 'Movix - JW Player',
              url: fileMatch[1],
              quality: 'HD',
              headers: {
                'Referer': watchUrl,
                'User-Agent': HEADERS['User-Agent']
              }
            });
          }
        });
      }

      // Pattern 4 : sources dans un tableau sources[]
      var sourcesMatch = html.match(/sources\s*:\s*\[([^\]]+)\]/);
      if (sourcesMatch) {
        var srcBlock = sourcesMatch[1];
        var fileMatches = srcBlock.match(/file\s*:\s*["']([^"']+)["']/g);
        if (fileMatches) {
          fileMatches.forEach(function(m) {
            var fileMatch = m.match(/["']([^"']+)["']$/);
            if (fileMatch) {
              streams.push({
                name: 'Movix Source',
                title: 'Movix - Source vidéo',
                url: fileMatch[1],
                quality: 'HD',
                headers: {
                  'Referer': watchUrl,
                  'User-Agent': HEADERS['User-Agent']
                }
              });
            }
          });
        }
      }

      return streams;
    });
}

// ── Résolution des iframes embed ──────────────────────────────

/**
 * Pour chaque iframe trouvé, on essaie de résoudre l'URL finale du stream.
 * Certains iframes pointent vers des players intermédiaires.
 */
function resolveEmbedUrl(embedUrl) {
  // Si c'est déjà un stream direct, on le retourne
  if (embedUrl.match(/\.(m3u8|mp4|mkv)(\?|$)/i)) {
    return Promise.resolve([{
      name: 'Movix VF',
      title: 'Movix - Stream direct',
      url: embedUrl,
      quality: 'HD',
      headers: { 'Referer': BASE_URL + '/' }
    }]);
  }

  // Sinon on charge l'iframe et on cherche les sources dedans
  return httpGet(embedUrl, { 'Referer': BASE_URL + '/' })
    .then(function(html) {
      var streams = [];

      // Sources directes dans la page du player
      var patterns = [
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
        /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/gi,
        /source\s+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)["']/gi,
      ];

      patterns.forEach(function(pattern) {
        var match;
        while ((match = pattern.exec(html)) !== null) {
          var url = match[1];
          if (url.startsWith('//')) url = 'https:' + url;
          if (url.startsWith('http')) {
            streams.push({
              name: 'Movix VF',
              title: 'Movix - Embed résolu',
              url: url,
              quality: url.indexOf('1080') !== -1 ? '1080p' : url.indexOf('720') !== -1 ? '720p' : 'HD',
              headers: {
                'Referer': embedUrl,
                'User-Agent': HEADERS['User-Agent']
              }
            });
          }
        }
      });

      // Si rien, on retourne l'iframe lui-même comme fallback
      if (streams.length === 0) {
        streams.push({
          name: 'Movix VF',
          title: 'Movix - Lecteur',
          url: embedUrl,
          quality: 'HD',
          headers: {
            'Referer': BASE_URL + '/',
            'User-Agent': HEADERS['User-Agent']
          }
        });
      }

      return streams;
    })
    .catch(function() {
      // Si l'embed ne charge pas, on le retourne quand même
      return [{
        name: 'Movix VF',
        title: 'Movix - Lecteur',
        url: embedUrl,
        quality: 'HD',
        headers: {
          'Referer': BASE_URL + '/',
          'User-Agent': HEADERS['User-Agent']
        }
      }];
    });
}

// ── Fonction principale ────────────────────────────────────────

/**
 * Point d'entrée principal appelé par Nuvio.
 *
 * @param {string} tmdbId    - L'ID TMDB du contenu (ex: "550")
 * @param {string} mediaType - "movie" ou "tv"
 * @param {number} season    - Numéro de saison (séries uniquement, sinon null)
 * @param {number} episode   - Numéro d'épisode (séries uniquement, sinon null)
 * @returns {Promise<Array>} - Tableau de streams
 */
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Recherche tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  // Étape 1 : Récupérer les infos du titre via l'API TMDB (disponible dans Nuvio)
  // Nuvio injecte automatiquement les métadonnées, mais on a accès à tmdbId
  // On utilise l'API TMDB publique pour récupérer le titre original et français

  var tmdbApiUrl;
  if (mediaType === 'movie') {
    tmdbApiUrl = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=fr-FR';
  } else {
    tmdbApiUrl = 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=fr-FR';
  }

  return httpGetJson(tmdbApiUrl)
    .then(function(tmdbData) {
      var frTitle = tmdbData.title || tmdbData.name || '';
      var enTitle = tmdbData.original_title || tmdbData.original_name || '';
      var year = (tmdbData.release_date || tmdbData.first_air_date || '').substring(0, 4);

      console.log('[Movix] Titre FR: ' + frTitle + ' | EN: ' + enTitle + ' | Année: ' + year);

      // Étape 2 : Rechercher sur Movix avec le titre français en priorité
      return searchMovix(frTitle)
        .then(function(results) {
          // Si pas de résultats en FR, essayer le titre original
          if (results.length === 0 && enTitle && enTitle !== frTitle) {
            return searchMovix(enTitle);
          }
          return results;
        })
        .then(function(results) {
          // Étape 3 : Choisir le meilleur résultat par similarité de titre
          var best = null;
          var bestScore = 0;

          results.forEach(function(r) {
            var score = Math.max(
              titleSimilarity(r.title, frTitle),
              titleSimilarity(r.title, enTitle)
            );
            // Bonus si l'année correspond
            if (year && r.year === year) score += 0.1;
            // Bonus si le type correspond
            var rType = r.type === 'tv' || r.type === 'series' ? 'tv' : 'movie';
            var mType = mediaType === 'tv' ? 'tv' : 'movie';
            if (rType === mType) score += 0.05;

            if (score > bestScore) {
              bestScore = score;
              best = r;
            }
          });

          if (!best || bestScore < 0.4) {
            console.log('[Movix] Aucun résultat suffisamment similaire (meilleur score: ' + bestScore + ')');
            return [];
          }

          console.log('[Movix] Meilleur résultat: "' + best.title + '" (score: ' + bestScore + ')');
          return best;
        });
    })
    .then(function(best) {
      if (!best || !best.url) return [];

      // Étape 4 : Récupérer l'ID interne depuis la page de détail
      return getInternalId(best.url)
        .then(function(internalId) {
          if (!internalId) {
            console.log('[Movix] ID interne non trouvé sur ' + best.url);
            // Tentative directe avec le slug ou l'ID WordPress
            internalId = best.id || best.slug || '';
          }

          if (!internalId) return [];

          console.log('[Movix] ID interne trouvé: ' + internalId);

          // Étape 5 : Construire l'URL de lecture et extraire les streams
          var watchUrl = buildWatchUrl(internalId, mediaType, season, episode);
          console.log('[Movix] URL de lecture: ' + watchUrl);

          return extractStreamsFromWatchPage(watchUrl);
        });
    })
    .then(function(streams) {
      if (!streams || streams.length === 0) return [];

      // Étape 6 : Pour chaque iframe trouvé, résoudre les URLs réelles
      var iframeStreams = streams.filter(function(s) {
        return !s.url.match(/\.(m3u8|mp4|mkv)(\?|$)/i);
      });
      var directStreams = streams.filter(function(s) {
        return s.url.match(/\.(m3u8|mp4|mkv)(\?|$)/i);
      });

      if (iframeStreams.length === 0) return directStreams;

      // Résoudre les iframes (limité aux 3 premiers pour éviter trop de requêtes)
      var iframesToResolve = iframeStreams.slice(0, 3);

      return Promise.all(
        iframesToResolve.map(function(stream) {
          return resolveEmbedUrl(stream.url)
            .catch(function() { return [stream]; });
        })
      ).then(function(resolved) {
        var allStreams = directStreams.slice();
        resolved.forEach(function(group) {
          group.forEach(function(s) { allStreams.push(s); });
        });
        // Dédoublonnage par URL
        var seen = {};
        return allStreams.filter(function(s) {
          if (seen[s.url]) return false;
          seen[s.url] = true;
          return true;
        });
      });
    })
    .catch(function(err) {
      console.error('[Movix] Erreur globale:', err.message || err);
      return [];
    });
}

module.exports = { getStreams: getStreams };
