// =============================================================
// Provider Nuvio : Anime-Sama
// Version : 3.0.0 - Compatible Nuvio TV + Mobile
// Sources : VF + VOSTFR — Players : Sibnet, Vidmoly, Sendvid,
//           Voe, Streamtape, Doodstream, Uqload, MyVi, LuluVid
// =============================================================

// --- Résolution dynamique du domaine ---
// Le portail anime-sama.pw liste toujours le domaine actif.
// En cas d'échec, on bascule sur le fallback connu.
var ANIMESAMA_PW = 'https://anime-sama.pw/';

// Domaines testés en parallèle si le portail est inaccessible.
// Mis à jour régulièrement — mettre le domaine le plus récent en premier.
var ANIMESAMA_CANDIDATES = [
    'https://anime-sama.fr',
    'https://anime-sama.tv',
    'https://anime-sama.to'
];

var _cachedBase = null; // cache session

// --- TMDB / Cinemeta ---
var TMDB_KEY      = '8265bd1679663a7ea12ac168da84d2e8';
var TMDB_BASE     = 'https://api.themoviedb.org/3';
var ARMSYNC_BASE  = 'https://arm.haglund.dev/api/v2';
var CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

// --- Langues à tester sur Anime-Sama, dans l'ordre de priorité ---
// On tente TOUTES ces langues : celles inexistantes donneront juste
// un 404 silencieux (fetchEpisodesJs retourne null). Pas de détection
// dynamique qui peut échouer — on laisse les 404 faire le tri.
var LANGS_TO_TRY = ['vf', 'vf1', 'vf2', 'vf3', 'vostfr', 'vostfr1', 'vostfr2', 'vqc'];

// Langues françaises (pour le tri final)
var FRENCH_LANGS = ['vf', 'vf1', 'vf2', 'vf3', 'vqc'];

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// =============================================================
// Utilitaires fetch
// =============================================================

function safeFetch(url, options, timeout) {
    timeout = timeout || 10000;
    return new Promise(function(resolve) {
        var timer = null;
        var aborted = false;
        var controller = null;
        try { controller = new AbortController(); } catch(e) {}

        if (controller) {
            timer = setTimeout(function() {
                aborted = true;
                try { controller.abort(); } catch(e) {}
                resolve(null);
            }, timeout);
        }

        var opts = Object.assign({ headers: { 'User-Agent': UA } }, options || {});
        if (controller) opts.signal = controller.signal;

        fetch(url, opts).then(function(res) {
            if (timer) clearTimeout(timer);
            if (aborted) return;
            if (!res.ok) { resolve(null); return; }
            res.text().then(function(text) {
                resolve({ text: text, url: res.url, ok: true });
            }).catch(function() { resolve(null); });
        }).catch(function() {
            if (timer) clearTimeout(timer);
            resolve(null);
        });
    });
}

function fetchJson(url, opts) {
    return safeFetch(url, opts, 8000).then(function(r) {
        if (!r) return null;
        try { return JSON.parse(r.text); } catch(e) { return null; }
    });
}

// =============================================================
// Résolution dynamique du domaine Anime-Sama
// =============================================================

function resolveBase() {
    if (_cachedBase) return Promise.resolve(_cachedBase);

    // Étape 1 : essayer anime-sama.pw pour récupérer le domaine actif
    return safeFetch(ANIMESAMA_PW, { headers: { 'User-Agent': UA } }, 5000)
        .then(function(res) {
            if (res && res.text) {
                var found = [];
                var rx = /https?:\/\/anime-sama\.[a-z]{2,6}/gi;
                var m;
                // Ne pas exclure .fr — c'est un domaine valide !
                var excluded = ['anime-sama.pw', 'anime-sama.org', 'anime-sama.eu',
                                'anime-sama.com', 'anime-sama.store'];
                while ((m = rx.exec(res.text)) !== null) {
                    var url = m[0].toLowerCase().replace(/\/+$/, '');
                    if (!excluded.some(function(b) { return url.includes(b); }) &&
                        found.indexOf(url) === -1) {
                        found.push(url);
                    }
                }
                if (found.length > 0) {
                    // Prendre le dernier lien trouvé (le plus récent dans la page)
                    var resolved = found[found.length - 1];
                    console.log('[Anime-Sama] Domaine via portail: ' + resolved);
                    _cachedBase = resolved;
                    return resolved;
                }
            }

            // Étape 2 : portail inaccessible → tester les candidats en parallèle
            console.log('[Anime-Sama] Portail inaccessible, test des candidats...');
            return Promise.all(ANIMESAMA_CANDIDATES.map(function(candidate) {
                var testUrl = candidate + '/catalogue/death-note/saison1/vf/episodes.js';
                return safeFetch(testUrl, { headers: { 'User-Agent': UA, 'Referer': candidate } }, 5000)
                    .then(function(r) { return r ? candidate : null; })
                    .catch(function() { return null; });
            })).then(function(results) {
                // Prendre le premier candidat qui répond
                for (var i = 0; i < results.length; i++) {
                    if (results[i]) {
                        console.log('[Anime-Sama] Domaine actif: ' + results[i]);
                        _cachedBase = results[i];
                        return results[i];
                    }
                }
                // Aucun ne répond → fallback sur le premier candidat
                console.log('[Anime-Sama] Aucun candidat ne répond, fallback: ' + ANIMESAMA_CANDIDATES[0]);
                _cachedBase = ANIMESAMA_CANDIDATES[0];
                return ANIMESAMA_CANDIDATES[0];
            });
        })
        .catch(function() {
            _cachedBase = ANIMESAMA_CANDIDATES[0];
            return ANIMESAMA_CANDIDATES[0];
        });
}

// =============================================================
// TMDB -> Titres (FR + EN + original)
// =============================================================

function getTmdbTitles(tmdbId, mediaType) {
    var type = mediaType === 'movie' ? 'movie' : 'tv';
    var titles = [];

    return fetchJson(TMDB_BASE + '/' + type + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=en-US')
        .then(function(d) {
            if (d) {
                var main = (type === 'movie' ? d.title : d.name) || '';
                var orig = (type === 'movie' ? d.original_title : d.original_name) || '';
                if (main.trim()) titles.push(main.trim());
                if (orig.trim() && orig !== main && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(orig))
                    titles.push(orig.trim());
            }
            return fetchJson(TMDB_BASE + '/' + type + '/' + tmdbId + '/translations?api_key=' + TMDB_KEY);
        })
        .then(function(d) {
            if (d && d.translations) {
                var fr = d.translations.find(function(t) { return t.iso_639_1 === 'fr'; });
                if (fr && fr.data) {
                    var t = ((fr.data.name || fr.data.title) || '').trim();
                    if (t && titles.indexOf(t) === -1) titles.push(t);
                }
            }
            console.log('[Anime-Sama] Titres TMDB: ' + titles.join(' | '));
            return titles;
        })
        .catch(function() { return titles; });
}

// =============================================================
// TMDB -> IMDB (via ArmSync)
// =============================================================

function tmdbToImdb(tmdbId, mediaType) {
    return fetchJson(ARMSYNC_BASE + '/themoviedb?id=' + tmdbId)
        .then(function(d) {
            var item = Array.isArray(d) ? d[0] : d;
            if (item && item.imdb) return item.imdb;
            return safeFetch(
                'https://www.themoviedb.org/' + (mediaType === 'movie' ? 'movie' : 'tv') + '/' + tmdbId,
                {}, 8000
            ).then(function(r) {
                if (!r) return null;
                var m = r.text.match(/imdb\.com\/title\/(tt\d+)/);
                return m ? m[1] : null;
            });
        })
        .catch(function() { return null; });
}

// =============================================================
// Episode absolu (Cinemeta)
// =============================================================

function getAbsoluteEpisode(imdbId, season, episode) {
    if (!imdbId) return Promise.resolve(null);
    return fetchJson(CINEMETA_BASE + '/meta/series/' + imdbId + '.json')
        .then(function(d) {
            if (!d || !d.meta || !d.meta.videos) return null;
            var seen = {};
            var list = d.meta.videos
                .filter(function(v) { return v.season > 0 && v.episode > 0; })
                .sort(function(a, b) { return a.season - b.season || a.episode - b.episode; })
                .filter(function(v) {
                    var k = v.season + '-' + v.episode;
                    return seen[k] ? false : (seen[k] = true);
                });
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].season == season && list[i].episode == episode) { idx = i; break; }
            }
            if (idx === -1) return null;
            console.log('[Anime-Sama] Episode absolu S' + season + 'E' + episode + ' -> ' + (idx + 1));
            return idx + 1;
        })
        .catch(function() { return null; });
}

// =============================================================
// Slugify
// =============================================================

function slugify(title) {
    return title.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// =============================================================
// Recherche de slugs via l'API Anime-Sama
// =============================================================

function searchSlugs(query, base) {
    return safeFetch(base + '/template-php/defaut/fetch.php', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': base
        },
        body: 'query=' + encodeURIComponent(query)
    }, 8000).then(function(r) {
        if (!r) return [];
        var slugs = [];
        var rx = /href=["'][^"']*\/catalogue\/([^/"']+)\/?["']/g;
        var m;
        while ((m = rx.exec(r.text)) !== null) {
            if (slugs.indexOf(m[1]) === -1) slugs.push(m[1]);
        }
        return slugs;
    }).catch(function() { return []; });
}

// =============================================================
// Détection du player depuis l'URL
// =============================================================

function playerName(url) {
    var u = url.toLowerCase();
    if (u.includes('sibnet'))   return 'Sibnet';
    if (u.includes('vidmoly'))  return 'Vidmoly';
    if (u.includes('sendvid'))  return 'Sendvid';
    if (u.includes('voe.'))     return 'Voe';
    if (u.includes('stape') || u.includes('streamtape')) return 'Streamtape';
    if (u.includes('dood') || u.includes('ds2play'))     return 'Doodstream';
    if (u.includes('uqload') || u.includes('oneupload')) return 'Uqload';
    if (u.includes('myvi') || u.includes('mytv'))        return 'MyVi';
    if (u.includes('luluvid') || u.includes('lulu.'))    return 'LuluVid';
    return 'Player';
}

// =============================================================
// Fetch d'un episodes.js (retourne null si 404)
// =============================================================

function fetchEpisodesJs(base, slug, season, lang) {
    // On essaie d'abord l'URL avec la saison, puis sans
    var urls = [
        base + '/catalogue/' + slug + '/saison' + season + '/' + lang + '/episodes.js',
        base + '/catalogue/' + slug + '/' + lang + '/episodes.js'
    ];

    function tryNext(i) {
        if (i >= urls.length) return Promise.resolve(null);
        return safeFetch(urls[i], {
            headers: { 'User-Agent': UA, 'Referer': base }
        }, 8000).then(function(r) {
            if (!r) return tryNext(i + 1);
            return { text: r.text, sourceUrl: urls[i] };
        });
    }
    return tryNext(0);
}

// =============================================================
// Extraction des URLs de stream depuis un episodes.js
// =============================================================

function extractFromEpisodesJs(jsText, sourceUrl, season, episode, absoluteEp, lang, base) {
    var streams = [];
    var rx = /var\s+[a-z0-9]+\s*=\s*\[([\s\S]*?)\];/gm;
    var m;

    while ((m = rx.exec(jsText)) !== null) {
        // Extraire toutes les URLs http du tableau
        var urlRx = /["'](https?:\/\/[^"']+)["']/g;
        var um;
        var epUrls = [];
        while ((um = urlRx.exec(m[1])) !== null) {
            epUrls.push(um[1]);
        }
        if (epUrls.length === 0) continue;

        // Determiner l'index de l'episode
        var idx;
        if (sourceUrl.includes('/saison' + season + '/')) {
            // URL specifique a la saison : index direct
            idx = episode - 1;
        } else if (absoluteEp && absoluteEp !== episode) {
            // URL generique (pas de saison dans le chemin) : index absolu
            idx = absoluteEp - 1;
        } else {
            idx = episode - 1;
        }

        if (idx < 0 || idx >= epUrls.length) continue;

        var epUrl = epUrls[idx];
        streams.push({
            name: 'Anime-Sama (' + lang.toUpperCase() + ')',
            title: playerName(epUrl) + ' . Ep ' + episode,
            url: epUrl,
            quality: 'HD',
            headers: { 'Referer': base }
        });
    }
    return streams;
}

// =============================================================
// Résolveurs de players (sans require, vanilla JS)
// =============================================================

function decodeB64(s) {
    try { return typeof atob === 'function' ? atob(s) : s; } catch(e) { return s; }
}

function unpack(code) {
    if (!code.includes('p,a,c,k,e,d')) return code;
    try {
        var rx = /eval\s*\(\s*function\s*\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(([\s\S]*?)\)\s*\)/g;
        var m, out = code;
        while ((m = rx.exec(code)) !== null) {
            try {
                var args = m[1].match(/^'([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
                if (!args) continue;
                var p = args[1].replace(/\\'/g, "'"), radix = +args[2], count = +args[3];
                var keys = args[4].split('|');
                var base36 = function(n) {
                    return (n < radix ? '' : base36(Math.floor(n / radix))) +
                        ((n = n % radix) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
                };
                var dict = {};
                while (count--) dict[base36(count)] = keys[count] || base36(count);
                out = out.replace(m[0], p.replace(/\b\w+\b/g, function(w) { return dict[w] || w; }));
            } catch(e) {}
        }
        return out;
    } catch(e) { return code; }
}

function resolveSibnet(url) {
    return safeFetch(url, { headers: { 'Referer': 'https://video.sibnet.ru/' } }).then(function(r) {
        if (!r) return { url: url };
        var m = r.text.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i)
            || r.text.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i)
            || r.text.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)['"]/i);
        if (!m) return { url: url };
        var u = m[1];
        if (u.startsWith('//')) u = 'https:' + u;
        if (u.startsWith('/')) u = 'https://video.sibnet.ru' + u;
        return { url: u, headers: { 'Referer': 'https://video.sibnet.ru/' } };
    }).catch(function() { return { url: url }; });
}

function resolveVidmoly(url) {
    var ref = { 'Referer': 'https://vidmoly.me/', 'Origin': 'https://vidmoly.me' };
    var norm = url.replace(/vidmoly\.(net|to|ru|is)/, 'vidmoly.me');
    return safeFetch(norm, { headers: ref }).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        var redir = html.match(/window\.location\.(?:replace|href)\s*[=(]\s*['"]([^'"]+)['"]/);
        var p = Promise.resolve(html);
        if (redir && redir[1] !== norm)
            p = safeFetch(redir[1], { headers: ref }).then(function(r2) { return r2 ? r2.text : html; });
        return p.then(function(h) {
            if (h.includes('p,a,c,k,e,d')) h = unpack(h);
            var m = h.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/i)
                || h.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)['"]/i);
            return m ? { url: m[1], headers: { 'Referer': 'https://vidmoly.me/' } } : { url: url };
        });
    }).catch(function() { return { url: url }; });
}

function resolveUqload(url) {
    var path = url.replace(/^https?:\/\/[^/]+/, '');
    var mirrors = ['uqload.is','uqload.co','uqload.com','uqload.io','uqloads.xyz','uqload.to'];
    function tryMirror(i) {
        if (i >= mirrors.length) return Promise.resolve({ url: url });
        return safeFetch('https://' + mirrors[i] + path, { headers: { 'Referer': 'https://uqload.is/' } })
            .then(function(r) {
                if (!r) return tryMirror(i + 1);
                var m = r.text.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))['"]\]/)
                    || r.text.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))['"]/);
                return m ? { url: m[1], headers: { 'Referer': 'https://uqload.is/' } } : tryMirror(i + 1);
            }).catch(function() { return tryMirror(i + 1); });
    }
    return tryMirror(0);
}

function resolveVoe(url) {
    return safeFetch(url).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        var redir = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        var p = Promise.resolve(html);
        if (redir) p = safeFetch(redir[1]).then(function(r2) { return r2 ? r2.text : html; });
        return p.then(function(h) {
            var m = h.match(/'hls'\s*:\s*'([^']+)'/) || h.match(/"hls"\s*:\s*"([^"]+)"/)
                || h.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
            if (!m) return { url: url };
            var u = m[1] || m[0];
            if (u.includes('base64')) u = decodeB64(u.split(',')[1] || u);
            return { url: u, headers: { 'Referer': url } };
        });
    }).catch(function() { return { url: url }; });
}

function resolveStreamtape(url) {
    return safeFetch(url).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
        var m = html.match(/robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*([^;]+)/);
        if (!m) return { url: url };
        var u = 'https:' + m[1];
        m[2].split('+').forEach(function(p) {
            var s = p.match(/['"]([^'"]+)['"]/);
            if (s) {
                var chunk = s[1];
                var sub = p.match(/substring\((\d+)\)/);
                if (sub) chunk = chunk.substring(+sub[1]);
                u += chunk;
            }
        });
        return { url: u, headers: { 'Referer': 'https://streamtape.com/' } };
    }).catch(function() { return { url: url }; });
}

function resolveDoodstream(url) {
    var domain = (url.match(/https?:\/\/([^/]+)/) || [])[1] || 'dood.to';
    return safeFetch(url).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
        var m = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
        if (!m) return { url: url };
        return fetch('https://' + domain + '/pass_md5/' + m[1], { headers: { 'Referer': url } })
            .then(function(res) {
                if (!res.ok) return { url: url };
                return res.text().then(function(base) {
                    var tok = Math.random().toString(36).substring(2, 12);
                    return { url: base + tok + '?token=' + m[1] + '&expiry=' + Date.now(),
                             headers: { 'Referer': 'https://' + domain + '/' } };
                });
            });
    }).catch(function() { return { url: url }; });
}

function resolveSendvid(url) {
    var embed = url.includes('/embed/') ? url : url.replace(/sendvid\.com\/([a-z0-9]+)/i, 'sendvid.com/embed/$1');
    return safeFetch(embed, { headers: { 'Referer': 'https://sendvid.com/' } }).then(function(r) {
        if (!r) return { url: url };
        var m = r.text.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/)
            || r.text.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/)
            || r.text.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/)
            || r.text.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/)
            || r.text.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/);
        return m ? { url: m[1], headers: { 'Referer': 'https://sendvid.com/' } } : { url: url };
    }).catch(function() { return { url: url }; });
}

function resolveMyvi(url) {
    return safeFetch(url, { headers: { 'Referer': 'https://www.myvi.ru/' } }).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
        var m = html.match(/["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)['"]/i)
            || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)['"]/i);
        return m ? { url: m[1], headers: { 'Referer': 'https://www.myvi.ru/' } } : { url: url };
    }).catch(function() { return { url: url }; });
}

function resolveLuluvid(url) {
    return safeFetch(url).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
        var m = html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]\]/)
            || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/);
        if (!m) return { url: url };
        var u = m[1];
        if (u.includes('base64')) u = decodeB64(u.split(',')[1] || u);
        return { url: u, headers: { 'Referer': url } };
    }).catch(function() { return { url: url }; });
}

function resolveGeneric(url) {
    return safeFetch(url).then(function(r) {
        if (!r) return { url: url };
        var html = r.text;
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
        var m = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i)
            || html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/i)
            || html.match(/file\s*:\s*["']([^"']+)['"]/);
        if (!m) return { url: url };
        var u = m[1] || m[0];
        if (u.startsWith('//')) u = 'https:' + u;
        if (u.startsWith('http') && !u.includes('googletagmanager')) return { url: u };
        return { url: url };
    }).catch(function() { return { url: url }; });
}

// =============================================================
// Résolveur principal (dispatch par domaine)
// =============================================================

function resolveStream(stream) {
    var url = stream.url;
    var u = url.toLowerCase();

    // Deja un stream direct
    if (u.match(/\.(mp4|m3u8|mkv|webm)(\?[^"']*)?$/) && !u.includes('.html')) {
        return Promise.resolve(Object.assign({}, stream, { isDirect: true }));
    }

    var p;
    if      (u.includes('sibnet.ru'))                         p = resolveSibnet(url);
    else if (u.includes('vidmoly.'))                          p = resolveVidmoly(url);
    else if (u.includes('uqload.') || u.includes('oneupload.')) p = resolveUqload(url);
    else if (u.includes('voe.'))                              p = resolveVoe(url);
    else if (u.includes('streamtape') || u.includes('stape')) p = resolveStreamtape(url);
    else if (u.includes('dood') || u.includes('ds2play'))     p = resolveDoodstream(url);
    else if (u.includes('sendvid.'))                          p = resolveSendvid(url);
    else if (u.includes('myvi.') || u.includes('mytv.'))      p = resolveMyvi(url);
    else if (u.includes('luluvid.') || u.includes('lulu.'))   p = resolveLuluvid(url);
    else                                                       p = resolveGeneric(url);

    return p.then(function(r) {
        if (!r || r.url === url) return Object.assign({}, stream, { isDirect: false });
        return Object.assign({}, stream, {
            url: r.url,
            headers: Object.assign({}, stream.headers || {}, r.headers || {}),
            isDirect: true,
            originalUrl: url
        });
    });
}

// =============================================================
// Logique principale
// =============================================================

function findStreams(tmdbId, mediaType, season, episode) {
    var s = season || 1;
    var e = episode || 1;

    // 1. Resoudre le domaine actif
    return resolveBase().then(function(base) {

    // 2. Titres TMDB
    return getTmdbTitles(tmdbId, mediaType).then(function(titles) {
        if (!titles || titles.length === 0) {
            console.log('[Anime-Sama] Aucun titre TMDB');
            return [];
        }

        // 3. Episode absolu (pour animes avec numerotation continue)
        return tmdbToImdb(tmdbId, mediaType)
            .then(function(imdbId) { return getAbsoluteEpisode(imdbId, s, e); })
            .then(function(absEp) {
                var absoluteEp = absEp || e;

                var primarySlugs = titles.map(slugify);
                console.log('[Anime-Sama] Slugs: ' + primarySlugs.join(', '));

                // 4. Pour chaque slug, tenter toutes les langues de LANGS_TO_TRY.
                // Les 404 sont silencieux (fetchEpisodesJs retourne null).
                function fetchForSlugs(slugs) {
                    var tasks = [];
                    slugs.forEach(function(slug) {
                        LANGS_TO_TRY.forEach(function(lang) {
                            tasks.push(
                                fetchEpisodesJs(base, slug, s, lang)
                                    .then(function(result) {
                                        if (!result) return [];
                                        return extractFromEpisodesJs(
                                            result.text, result.sourceUrl,
                                            s, e, absoluteEp, lang, base
                                        );
                                    })
                                    .catch(function() { return []; })
                            );
                        });
                    });
                    return Promise.all(tasks).then(function(results) {
                        var all = [];
                        results.forEach(function(r) { all = all.concat(r); });
                        return all;
                    });
                }

                return fetchForSlugs(primarySlugs).then(function(streams) {
                    if (streams.length > 0) return streams;

                    // 5. Fallback : recherche via l'API d'Anime-Sama
                    console.log('[Anime-Sama] Fallback API pour: ' + titles[0]);
                    return Promise.all(titles.map(function(t) {
                        return searchSlugs(t, base);
                    })).then(function(results) {
                        var seen = {};
                        primarySlugs.forEach(function(slug) { seen[slug] = true; });
                        var extra = [];
                        results.forEach(function(list) {
                            list.forEach(function(slug) {
                                if (!seen[slug]) { seen[slug] = true; extra.push(slug); }
                            });
                        });
                        console.log('[Anime-Sama] Slugs API: ' + extra.join(', '));
                        if (extra.length === 0) return [];
                        return fetchForSlugs(extra);
                    });
                });
            });
    });

    }); // fin resolveBase
}

// =============================================================
// Point d'entree public
// =============================================================

function getStreams(tmdbId, mediaType, season, episode, title) {
    console.log('[Anime-Sama] Requete: ' + mediaType + ' tmdbId=' + tmdbId + ' S' + season + 'E' + episode);

    if (mediaType !== 'tv') return Promise.resolve([]);

    return findStreams(tmdbId, mediaType, season, episode)
        .then(function(rawStreams) {
            if (!rawStreams || rawStreams.length === 0) return [];

            console.log('[Anime-Sama] Resolution de ' + rawStreams.length + ' streams bruts...');
            return Promise.all(rawStreams.map(function(s) {
                return resolveStream(s).catch(function() { return null; });
            }));
        })
        .then(function(resolved) {
            var valid = (resolved || []).filter(function(s) { return s && s.isDirect; });
            console.log('[Anime-Sama] Streams directs: ' + valid.length);

            // VF en premier
            valid.sort(function(a, b) {
                var isFr = function(s) {
                    return FRENCH_LANGS.some(function(l) {
                        return (s.name + '').toUpperCase().includes(l.toUpperCase());
                    });
                };
                var aFr = isFr(a), bFr = isFr(b);
                if (aFr && !bFr) return -1;
                if (!aFr && bFr) return 1;
                return 0;
            });

            return valid;
        })
        .catch(function(err) {
            console.error('[Anime-Sama] Erreur: ' + (err && err.message || err));
            return [];
        });
}

// =============================================================
// Export
// =============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    var _g = (typeof globalThis !== 'undefined') ? globalThis
           : (typeof window !== 'undefined') ? window
           : (typeof self !== 'undefined') ? self : this;
    _g.getStreams = getStreams;
}
