// ============================================================
// Provider Nuvio : Anime-Sama (anime-sama.to)
// Version      : 2.0.0
// Moteur       : Promise chains UNIQUEMENT (pas d'async/await)
//                → compatibilité Hermes / React Native
// Langues      : VF en priorité, fallback VOSTFR
// Sources      : epsAS (MP4 direct) > sendvid > vidmoly > sibnet
// ============================================================

var AS_BASE   = 'https://anime-sama.to';
var AS_REF    = 'https://anime-sama.to/';
var TMDB_BASE = 'https://api.themoviedb.org/3';
var TMDB_KEY  = (typeof process !== 'undefined' && process.env && process.env.TMDB_API_KEY)
  ? process.env.TMDB_API_KEY : '';

// Cache mémoire slug  { tmdbId → slug }
var _cache = {};

// Ordre de test des langues
var LANGS = ['vf', 'vostfr'];

// ─── Helpers réseau ──────────────────────────────────────────

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getText(url, referer) {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': referer || AS_REF,
      'Accept-Language': 'fr-FR,fr;q=0.9'
    }
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
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

// ─── Étape 1 : TMDB → titres candidats ──────────────────────

function getTmdbTitles(tmdbId, mediaType) {
  var type = (mediaType === 'movie') ? 'movie' : 'tv';
  var url  = TMDB_BASE + '/' + type + '/' + tmdbId
    + '?api_key=' + TMDB_KEY
    + '&language=fr-FR&append_to_response=alternative_titles';

  console.log('[AnimeSama] TMDB:', url);

  return getJson(url).then(function(d) {
    var seen = {}, titles = [];
    function add(t) { if (t && !seen[t]) { seen[t] = 1; titles.push(t); } }
    add(d.name || d.title || '');
    add(d.original_name || d.original_title || '');
    var arr = ((d.alternative_titles || {}).results || (d.alternative_titles || {}).titles || []);
    arr.forEach(function(a) { add(a.title || a.name || ''); });
    console.log('[AnimeSama] Titres:', titles.slice(0, 4));
    return titles;
  }).catch(function(e) {
    console.warn('[AnimeSama] TMDB fail:', e.message);
    return [];
  });
}

// ─── Étape 2 : slug anime-sama ───────────────────────────────

function norm(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreMatch(title, slug) {
  var a = norm(title);
  var b = norm(slug.replace(/-/g, ' '));
  if (a === b) return 1;
  if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 0.85;
  var wa = a.split(' '), wb = b.split(' ');
  var common = wa.filter(function(w) { return w.length > 2 && wb.indexOf(w) !== -1; });
  return common.length / Math.max(wa.length, wb.length, 1);
}

function searchSlugs(query) {
  var url = AS_BASE + '/template-parts/search/?search=' + encodeURIComponent(query);
  return getText(url, AS_REF).then(function(html) {
    var slugs = [], re = /href=["']\/catalogue\/([a-z0-9_-]+)\/?["']/gi, m;
    while ((m = re.exec(html)) !== null) {
      if (slugs.indexOf(m[1]) === -1) slugs.push(m[1]);
    }
    return slugs;
  }).catch(function() { return []; });
}

function resolveSlug(tmdbId, titles) {
  if (_cache[tmdbId]) {
    console.log('[AnimeSama] Cache slug:', _cache[tmdbId]);
    return Promise.resolve(_cache[tmdbId]);
  }

  var best = null, bestScore = 0;

  return titles.slice(0, 4).reduce(function(chain, title) {
    return chain.then(function() {
      if (bestScore >= 0.95) return;
      return searchSlugs(title).then(function(slugs) {
        slugs.forEach(function(slug) {
          var s = scoreMatch(title, slug);
          if (s > bestScore) { bestScore = s; best = slug; }
        });
      });
    });
  }, Promise.resolve()).then(function() {
    // Retry avec titre tronqué si score faible
    if ((!best || bestScore < 0.3) && titles[0]) {
      var short = titles[0].split(/[:\-|]/)[0].trim();
      if (short && short !== titles[0]) {
        return searchSlugs(short).then(function(slugs) {
          if (slugs.length && !best) { best = slugs[0]; }
        });
      }
    }
  }).then(function() {
    if (best) {
      console.log('[AnimeSama] Slug:', best, '(score ' + bestScore.toFixed(2) + ')');
      _cache[tmdbId] = best;
    } else {
      console.warn('[AnimeSama] Slug introuvable pour tmdbId=' + tmdbId);
    }
    return best;
  });
}

// ─── Étape 3 : Parse episodes.js ─────────────────────────────

function parseEpisodesJs(js) {
  var result = {}, varRe = /var\s+(eps\w*)\s*=\s*\[([\s\S]*?)\]\s*;/g, m;
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

// Essaye VF puis VOSTFR ; retourne { eps, lang } ou null
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

// sendvid : page HTML → <source src="...mp4?validfrom=...">
function extractSendvid(embedUrl) {
  return getText(embedUrl, 'https://sendvid.com/').then(function(html) {
    var pats = [
      /["'](https?:\/\/(?:videos?\d*\.)?sendvid\.com\/[^"'>\s]+\.mp4[^"'>\s]*)["']/i,
      /<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i
    ];
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i].exec(html);
      if (m) return m[1];
    }
    return null;
  }).catch(function() { return null; });
}

// sibnet : redirect 302 → mp4  OU  HTML avec src=mp4
function extractSibnet(shellUrl) {
  return fetch(shellUrl, {
    redirect: 'manual',
    headers: { 'User-Agent': UA, 'Referer': 'https://video.sibnet.ru/' }
  }).then(function(r) {
    if (r.status === 301 || r.status === 302) {
      var loc = r.headers.get('location') || '';
      if (loc.indexOf('.mp4') !== -1) return loc;
    }
    return r.text().then(function(html) {
      var m = /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i.exec(html);
      return m ? m[1] : null;
    });
  }).catch(function() { return null; });
}

// vidmoly : JW Player → file:"...m3u8" ou "...mp4"
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
  // URL directe (epsAS) — mp4 ou m3u8, pas d'extraction nécessaire
  if (/\.(mp4|m3u8)(\?|$)/i.test(embedUrl)) {
    return Promise.resolve({
      url: embedUrl,
      fmt: embedUrl.indexOf('.m3u8') !== -1 ? 'm3u8' : 'mp4'
    });
  }
  if (embedUrl.indexOf('sendvid.com') !== -1) {
    return extractSendvid(embedUrl).then(function(u) { return u ? { url: u, fmt: 'mp4' } : null; });
  }
  if (embedUrl.indexOf('sibnet.ru') !== -1) {
    return extractSibnet(embedUrl).then(function(u) { return u ? { url: u, fmt: 'mp4' } : null; });
  }
  if (embedUrl.indexOf('vidmoly.to') !== -1) {
    return extractVidmoly(embedUrl);
  }
  return Promise.resolve(null);
}

// ─── Étape 5 : Construction streams Nuvio ────────────────────

var PRIO   = { epsAS: 100, eps3: 70, eps2: 60, eps1: 50 };
var LABELS = { epsAS: 'Anime-Sama Direct', eps1: 'Sibnet', eps2: 'Vidmoly', eps3: 'Sendvid' };

function buildStreams(epsData, epIndex, season, episode) {
  var lang  = epsData.lang;
  var flag  = lang === 'vf' ? 'FR' : 'VOSTFR';
  var eps   = epsData.eps;

  var keys = Object.keys(eps).sort(function(a, b) {
    return (PRIO[b] || 30) - (PRIO[a] || 30);
  });

  var promises = keys.map(function(key) {
    var embedUrl = (eps[key] || [])[epIndex];
    if (!embedUrl) return Promise.resolve(null);

    return extractUrl(embedUrl).then(function(res) {
      if (!res) return null;
      return {
        name:    'AnimeSama',
        title:   '[' + flag + '] ' + (LABELS[key] || key) + ' — S' + season + 'E' + episode,
        url:     res.url,
        quality: res.fmt === 'm3u8' ? 'HD' : 'Auto',
        headers: { 'User-Agent': UA, 'Referer': AS_REF },
        _p:      PRIO[key] || 30
      };
    }).catch(function() { return null; });
  });

  return Promise.all(promises).then(function(results) {
    return results
      .filter(Boolean)
      .sort(function(a, b) { return b._p - a._p; })
      .map(function(r) { delete r._p; return r; });
  });
}

// ─── Interface publique Nuvio ─────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  var s    = season  || 1;
  var e    = episode || 1;
  var idx  = e - 1;

  console.log('[AnimeSama] getStreams', tmdbId, mediaType, 'S' + s + 'E' + e);

  return getTmdbTitles(tmdbId, mediaType)
    .then(function(titles) {
      if (!titles.length) return null;
      return resolveSlug(tmdbId, titles);
    })
    .then(function(slug) {
      if (!slug) return null;
      return fetchEpisodes(slug, s);
    })
    .then(function(epsData) {
      if (!epsData) return [];
      return buildStreams(epsData, idx, s, e);
    })
    .catch(function(err) {
      console.error('[AnimeSama] Erreur:', err && err.message || err);
      return [];
    });
}

module.exports = { getStreams };
