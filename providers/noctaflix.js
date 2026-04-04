// =============================================================
// Provider Nuvio : Noctaflix.lol (VF français)
// Version : 1.0.0
// Stratégie :
//   1. tmdbId → titre FR via TMDB → slugify → URL noctaflix
//   2. GET /movie/{slug} ou /episode/{slug}/{saison}-{episode}
//      → extraire wire:snapshot du watch-component
//      → récupérer l'embed ID
//   3. GET /embed/{id}
//      → décoder base64 de "encrypted-source"
//      → URL directe mp4 sur cdn.fastflux.xyz
// =============================================================

var NOCTAFLIX_BASE    = 'https://noctaflix.lol';
var NOCTAFLIX_REFERER = 'https://noctaflix.lol/';
var NOCTAFLIX_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var TMDB_KEY          = '2dca580c2a14b55200e784d157207b4d';
var TELEGRAM_CHANNEL  = 'https://t.me/s/noctaflix';

// ---------------------------------------------------------------
// Utilitaire : slugify un titre comme noctaflix le fait
// "Zootopie 2"                    → "zootopie-2"
// "Avatar : De feu et de cendres" → "avatar-de-feu-et-de-cendres"
// "Stranger Things"               → "stranger-things"
// ---------------------------------------------------------------
function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprime les accents
    .replace(/[^a-z0-9\s-]/g, '')                     // supprime les caractères spéciaux
    .trim()
    .replace(/\s+/g, '-');                             // espaces → tirets
}

// ---------------------------------------------------------------
// Détection du domaine actif via Telegram (fallback si .lol down)
// ---------------------------------------------------------------
function detectFromTelegram() {
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: { 'User-Agent': NOCTAFLIX_UA }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/noctaflix\.[a-z]+/gi);
      if (!matches) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram');
      });
      if (domains.length === 0) return null;
      var last = domains[domains.length - 1];
      var m = last.match(/^(https?:\/\/[^\/\s]+)/);
      if (!m) return null;
      return m[1];
    })
    .catch(function() { return null; });
}

// ---------------------------------------------------------------
// Étape 1 : tmdbId → titres FR + original via TMDB
// ---------------------------------------------------------------
function getTitleFromTmdb(tmdbId, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId
          + '?language=fr-FR&api_key=' + TMDB_KEY;

  return fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': NOCTAFLIX_UA }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('TMDB HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var titleFr   = data.title   || data.name;
      var titleOrig = data.original_title || data.original_name;
      if (!titleFr && !titleOrig) throw new Error('Aucun titre TMDB');
      console.log('[Noctaflix] Titres TMDB: FR=' + titleFr + ' | ORIG=' + titleOrig);
      return { fr: titleFr, orig: titleOrig };
    });
}

// ---------------------------------------------------------------
// Étape 2 : Construire l'URL de la page noctaflix
// Film  : https://noctaflix.lol/movie/{slug}
// Série : https://noctaflix.lol/episode/{slug}/{saison}-{episode}
// ---------------------------------------------------------------
function buildPageUrl(base, slug, mediaType, season, episode) {
  if (mediaType === 'tv') {
    return base + '/episode/' + slug + '/' + (season || 1) + '-' + (episode || 1);
  }
  return base + '/movie/' + slug;
}

// ---------------------------------------------------------------
// Étape 3 : Fetch la page et extraire l'embed ID
// via wire:snapshot du watch-component
// ---------------------------------------------------------------
function getEmbedIdFromPage(pageUrl) {
  return fetch(pageUrl, {
    method: 'GET',
    headers: {
      'User-Agent': NOCTAFLIX_UA,
      'Referer': NOCTAFLIX_REFERER
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Page HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var snapMatches = html.match(/wire:snapshot="([^"]+)"/g);
      if (!snapMatches || snapMatches.length === 0) {
        throw new Error('Aucun wire:snapshot trouvé');
      }

      for (var i = 0; i < snapMatches.length; i++) {
        try {
          var raw = snapMatches[i]
            .replace(/^wire:snapshot="/, '')
            .replace(/"$/, '')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
            .replace(/\\\//g, '/');

          var json = JSON.parse(raw);

          // On cherche uniquement le watch-component
          if (!json.memo || json.memo.name !== 'watch-component') continue;

          // Extraire le lien embed : videos[0][0][0].link
          var videos = json.data && json.data.videos;
          if (!videos || !videos[0] || !videos[0][0] || !videos[0][0][0]) {
            throw new Error('Structure videos inattendue');
          }

          var embedUrl = videos[0][0][0].link;
          if (!embedUrl) throw new Error('Lien embed vide');

          var embedId = embedUrl.split('/embed/')[1];
          console.log('[Noctaflix] Embed ID trouvé: ' + embedId);
          return embedId;

        } catch (e) {
          continue;
        }
      }
      throw new Error('watch-component introuvable dans les snapshots');
    });
}

// ---------------------------------------------------------------
// Étape 4 : Fetch l'embed et décoder le base64 encrypted-source
// → URL directe mp4 sur cdn.fastflux.xyz
// ---------------------------------------------------------------
function getDirectUrlFromEmbed(embedId, pageUrl) {
  var embedUrl = NOCTAFLIX_BASE + '/embed/' + embedId;
  console.log('[Noctaflix] Fetch embed: ' + embedUrl);

  return fetch(embedUrl, {
    method: 'GET',
    headers: {
      'User-Agent': NOCTAFLIX_UA,
      'Referer': pageUrl
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Embed HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var b64Match = html.match(/id="encrypted-source"\s+value="([^"]+)"/);
      if (!b64Match) throw new Error('encrypted-source introuvable dans embed');

      var directUrl = atob(b64Match[1]);
      if (!directUrl || (!directUrl.match(/\.mp4/i) && !directUrl.match(/\.m3u8/i))) {
        throw new Error('URL décodée invalide: ' + directUrl);
      }

      console.log('[Noctaflix] URL directe: ' + directUrl);
      return directUrl;
    });
}

// ---------------------------------------------------------------
// Pipeline complet pour un slug donné
// ---------------------------------------------------------------
function fetchWithSlug(base, slug, mediaType, season, episode) {
  var pageUrl = buildPageUrl(base, slug, mediaType, season, episode);
  console.log('[Noctaflix] Page: ' + pageUrl);

  return getEmbedIdFromPage(pageUrl)
    .then(function(embedId) {
      return getDirectUrlFromEmbed(embedId, pageUrl);
    })
    .then(function(directUrl) {
      return [{
        name: 'Noctaflix',
        title: 'Noctaflix VF',
        url: directUrl,
        quality: 'HD',
        format: directUrl.match(/\.m3u8/i) ? 'm3u8' : 'mp4',
        headers: {
          'User-Agent': NOCTAFLIX_UA,
          'Referer': NOCTAFLIX_REFERER
        }
      }];
    });
}

// ---------------------------------------------------------------
// Fonction principale appelée par Nuvio
// ---------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Noctaflix] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  var base = NOCTAFLIX_BASE;

  return getTitleFromTmdb(tmdbId, mediaType)
    .then(function(titles) {
      var slugFr   = slugify(titles.fr);
      var slugOrig = slugify(titles.orig);
      console.log('[Noctaflix] Slugs: FR=' + slugFr + ' | ORIG=' + slugOrig);

      // Essai 1 : titre français
      return fetchWithSlug(base, slugFr, mediaType, season, episode)
        .catch(function(err) {
          // Essai 2 : titre original
          console.log('[Noctaflix] Slug FR échoué (' + err.message + '), essai titre original...');
          return fetchWithSlug(base, slugOrig, mediaType, season, episode);
        });
    })
    .catch(function() {
      // Essai 3 : fallback domaine via Telegram
      console.log('[Noctaflix] Tentative fallback Telegram...');
      return detectFromTelegram()
        .then(function(newBase) {
          if (!newBase) throw new Error('Aucun domaine Telegram trouvé');
          console.log('[Noctaflix] Nouveau domaine: ' + newBase);
          base = newBase;
          return getTitleFromTmdb(tmdbId, mediaType);
        })
        .then(function(titles) {
          var slugFr   = slugify(titles.fr);
          var slugOrig = slugify(titles.orig);
          return fetchWithSlug(base, slugFr, mediaType, season, episode)
            .catch(function() {
              return fetchWithSlug(base, slugOrig, mediaType, season, episode);
            });
        });
    })
    .catch(function(err) {
      console.error('[Noctaflix] Erreur globale: ' + (err.message || String(err)));
      return [];
    });
}

// ---------------------------------------------------------------
// Export
// ---------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
