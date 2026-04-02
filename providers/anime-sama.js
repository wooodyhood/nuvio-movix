// ============================================================
// Provider Nuvio : Anime-Sama (anime-sama.to)
// Version      : 6.0.0
// Moteur       : Promise chains UNIQUEMENT (Hermes / React Native)
// Langues      : VF priorité, fallback VOSTFR
// Sources      : epsAS (MP4 direct) > sendvid > vidmoly > sibnet
// ============================================================

var AS_BASE  = 'https://anime-sama.to';
var AS_REF   = 'https://anime-sama.to/';
var UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var TMDB_KEY = '2dca580c2a14b55200e784d157207b4d';

// Cache mémoire tmdbId → slug anime-sama
var _cache = {};

// Ordre de test des langues
var LANGS = ['vf', 'vostfr'];

// ─── Helpers réseau ──────────────────────────────────────────

function getText(url, referer) {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': referer || AS_REF,
      'Accept-Language': 'fr-FR,fr;q=0.9'
    }
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);
    return r.text();
  });
}

function getJson(url) {
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' }
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

// ─── Étape 1 : tmdbId → titres candidats ─────────────────────

function getTitlesFromTmdb(tmdbId, mediaType) {
  var type = (mediaType === 'movie') ? 'movie' : 'tv';
  var url  = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId
    + '?api_key=' + TMDB_KEY + '&language=fr-FR&append_to_response=alternative_titles';

  console.log('[AnimeSama] TMDB:', url);

  return getJson(url).then(function(d) {
    var seen = {}, titles = [];
    function add(t) {
      t = (t || '').trim();
      if (t && !seen[t]) { seen[t] = 1; titles.push(t); }
    }
    add(d.name || d.title);
    add(d.original_name || d.original_title);
    var arr = ((d.alternative_titles || {}).results || (d.alternative_titles || {}).titles || []);
    arr.forEach(function(a) { add(a.title || a.name); });
    console.log('[AnimeSama] Titres:', titles.slice(0, 4));
    return titles;
  }).catch(function(e) {
    console.warn('[AnimeSama] TMDB fail:', e.message);
    return [];
  });
}

// ─── Étape 2 : Recherche slug sur anime-sama ─────────────────
// POST /template-php/defaut/fetch.php  body: query=xxx
// Réponse : href="https://anime-sama.to/catalogue/SLUG/"

function searchAnimeSama(query) {
  return fetch(AS_BASE + '/template-php/defaut/fetch.php', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Referer': AS_REF,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: 'query=' + encodeURIComponent(query)
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function(html) {
    var results = [];
    var re = /href=["']https?:\/\/anime-sama\.to\/catalogue\/([a-z0-9_-]+)\/["']/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      if (results.indexOf(m[1]) === -1) results.push(m[1]);
    }
    console.log('[AnimeSama] Slugs pour "' + query + '":', results);
    return results;
  }).catch(function(e) {
    console.warn('[AnimeSama] Search fail:', e.message);
    return [];
  });
}

// ─── Étape 2b : Score similarité titre ↔ slug ────────────────

function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreMatch(title, slug) {
  var a = norm(title);
  var b = norm(slug.replace(/-/g, ' '));
  if (a === b) return 1;
  if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 0.9;
  var wa = a.split(' '), wb = b.split(' ');
  var common = wa.filter(function(w) { return w.length > 2 && wb.indexOf(w) !== -1; });
  return common.length / Math.max(wa.length, wb.length, 1);
}

// ─── Étape 2c : Résolution slug ──────────────────────────────

function resolveSlug(tmdbId, titles) {
  if (_cache[tmdbId]) {
    console.log('[AnimeSama] Cache hit:', _cache[tmdbId]);
    return Promise.resolve(_cache[tmdbId]);
  }

  var best = null, bestScore = 0;

  return titles.slice(0, 4).reduce(function(chain, title) {
    return chain.then(function() {
      if (bestScore >= 0.95) return;
      return searchAnimeSama(title).then(function(slugs) {
        slugs.forEach(function(slug) {
          var s = scoreMatch(title, slug);
          if (s > bestScore) { bestScore = s; best = slug; }
        });
      });
    });
  }, Promise.resolve()).then(function() {
    // Retry avec titre tronqué si score faible
    if ((!best || bestScore < 0.35) && titles[0]) {
      var short = titles[0].split(/[:\-|]/)[0].trim();
      if (short && short !== titles[0] && short.length > 2) {
        return searchAnimeSama(short).then(function(slugs) {
          if (slugs.length && !best) { best = slugs[0]; bestScore = 0.4; }
        });
      }
    }
  }).then(function() {
    if (best) {
      console.log('[AnimeSama] Slug:', best, '(score ' + bestScore.toFixed(2) + ')');
      _cache[tmdbId] = best;
    } else {
      console.warn('[AnimeSama] Slug introuvable');
    }
    return best;
  });
}

// ─── Étape 3 : Parse episodes.js ─────────────────────────────
// /catalogue/slug/saison{N}/{lang}/episodes.js
// var epsAS = [...mp4...];  ← priorité max, MP4 direct
// var eps1  = [...sibnet...];
// var eps2  = [...vidmoly...];
// var eps3  = [...sendvid...];

function parseEpisodesJs(js) {
  var result = {};
  var varRe  = /var\s+(eps\w*)\s*=\s*\[([\s\S]*?)\]\s*;/g;
  var m;
  while ((m = varRe.exec(js)) !== null) {
    var urls = [], urlRe = /['"]([^'"]+)['"]/g, u;
    while ((u = urlRe.exec(m[2])) !== null) {
      if (u[1].indexOf('http') === 0) urls.push(u[1].trim());
    }
    if (urls.length) result[m[1]] = urls;
  }
  return Object.keys(result).length ? result : null;
}

function fetchEpisodesJs(slug, season, lang) {
  var url = AS_BASE + '/catalogue/' + slug + '/saison' + season + '/' + lang + '/episodes.js';
  console.log('[AnimeSama] episodes.js:', url);
  return getText(url, AS_REF)
    .then(function(js) { return parseEpisodesJs(js); })
    .catch(function() { return null; });
}

// Essaye VF puis VOSTFR
function fetchEpisodes(slug, season) {
  return LANGS.reduce(function(chain, lang) {
    return chain.then(function(found) {
      if (found) return found;
      return fetchEpisodesJs(slug, season, lang).then(function(eps) {
        return eps ? { eps: eps, lang: lang } : null;
      });
    });
  }, Promise.resolve(null));
}

// ─── Étape 4 : Extracteurs embed ─────────────────────────────

// sendvid : src="https://videos2.sendvid.com/...mp4?validfrom=..."
function extractSendvid(embedUrl) {
  return getText(embedUrl, 'https://sendvid.com/').then(function(html) {
    var patterns = [
      /["'](https?:\/\/videos\d*\.sendvid\.com\/[^"'>\s]+\.mp4[^"'>\s]*)["']/i,
      /<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(html);
      if (match) return match[1];
    }
    return null;
  }).catch(function() { return null; });
}

// sibnet : redirect 302 → mp4
function extractSibnet(shellUrl) {
  return fetch(shellUrl, {
    headers: { 'User-Agent': UA, 'Referer': 'https://video.sibnet.ru/' }
  }).then(function(r) {
    // Cherche dans le HTML final après redirect
    return r.text().then(function(html) {
      var m = /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i.exec(html);
      return m ? m[1] : null;
    });
  }).catch(function() { return null; });
}

// vidmoly : JW Player → .m3u8 ou .mp4
function extractVidmoly(embedUrl) {
  return getText(embedUrl, 'https://vidmoly.to/').then(function(html) {
    var m3 = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i.exec(html);
    if (m3) return { url: m3[1], fmt: 'm3u8' };
    var m4 = /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i.exec(html);
    if (m4) return { url: m4[1], fmt: 'mp4' };
    return null;
  }).catch(function() { return null; });
}

// Dispatch → { url, fmt } | null
function extractUrl(embedUrl) {
  // epsAS : URL directe mp4/m3u8
  if (/\.(mp4|m3u8)(\?|$)/i.test(embedUrl)) {
    return Promise.resolve({
      url: embedUrl,
      fmt: embedUrl.indexOf('.m3u8') !== -1 ? 'm3u8' : 'mp4'
    });
  }
  if (embedUrl.indexOf('sendvid.com') !== -1) {
    return extractSendvid(embedUrl).then(function(u) {
      return u ? { url: u, fmt: 'mp4' } : null;
    });
  }
  if (embedUrl.indexOf('sibnet.ru') !== -1) {
    return extractSibnet(embedUrl).then(function(u) {
      return u ? { url: u, fmt: 'mp4' } : null;
    });
  }
  if (embedUrl.indexOf('vidmoly.to') !== -1) {
    return extractVidmoly(embedUrl);
  }
  return Promise.resolve(null);
}

// ─── Étape 5 : Construction streams ──────────────────────────

var PRIO   = { epsAS: 100, eps3: 70, eps2: 60, eps1: 50 };
var LABELS = { epsAS: 'Anime-Sama Direct', eps1: 'Sibnet', eps2: 'Vidmoly', eps3: 'Sendvid' };

function buildStreams(epsData, epIndex, season, episode) {
  var lang = epsData.lang;
  var flag = lang === 'vf' ? '[VF]' : '[VOSTFR]';
  var eps  = epsData.eps;

  var keys = Object.keys(eps).sort(function(a, b) {
    return (PRIO[b] || 30) - (PRIO[a] || 30);
  });

  var promises = keys.map(function(key) {
    var embedUrl = (eps[key] || [])[epIndex];
    if (!embedUrl) return Promise.resolve(null);

    return extractUrl(embedUrl).then(function(res) {
      if (!res || !res.url) return null;
      return {
        name:    'AnimeSama',
        title:   flag + ' ' + (LABELS[key] || key) + ' | S' + season + 'E' + episode,
        url:     res.url,
        quality: res.fmt === 'm3u8' ? 'HD' : 'Auto',
        headers: { 'User-Agent': UA, 'Referer': AS_REF },
        _prio:   PRIO[key] || 30
      };
    }).catch(function() { return null; });
  });

  return Promise.all(promises).then(function(results) {
    return results
      .filter(Boolean)
      .sort(function(a, b) { return b._prio - a._prio; })
      .map(function(r) { delete r._prio; return r; });
  });
}

// ─── Interface publique Nuvio ─────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  var s   = season  || 1;
  var e   = episode || 1;
  var idx = e - 1;

  console.log('[AnimeSama] getStreams tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + s + 'E' + e);

  return getTitlesFromTmdb(tmdbId, mediaType)
    .then(function(titles) {
      if (!titles.length) throw new Error('Aucun titre TMDB');
      return resolveSlug(tmdbId, titles);
    })
    .then(function(slug) {
      if (!slug) throw new Error('Slug introuvable');
      return fetchEpisodes(slug, s);
    })
    .then(function(epsData) {
      if (!epsData) throw new Error('Aucun épisode');
      return buildStreams(epsData, idx, s, e);
    })
    .catch(function(err) {
      console.error('[AnimeSama] Erreur:', err && err.message || err);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
