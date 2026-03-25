// =============================================================
// Provider Nuvio : Anime-Sama
// Version : 2.0.0 - Compatible Nuvio TV + Mobile
// Sources : VF + VOSTFR — Players : Sibnet, Vidmoly, Sendvid,
//           Voe, Streamtape, Doodstream, Uqload, MyVi, LuluVid
// =============================================================
//
// CHANGEMENTS vs version Gowaru (mobile-only) :
//  - Suppression de require("cheerio-without-node-native")
//    => parsing HTML fait via regex (compatible environnement web/TV)
//  - Suppression de Buffer.from() => atob() uniquement
//  - Toutes les dépendances Node.js retirées
//  - Compatible : Nuvio TV (Android TV / webOS / Tizen) + Mobile
// =============================================================

var ANIMESAMA_BASE = 'https://anime-sama.to';
var TMDB_API_KEY = '8265bd1679663a7ea12ac168da84d2e8';
var TMDB_BASE = 'https://api.themoviedb.org/3';
var ARMSYNC_BASE = 'https://arm.haglund.dev/api/v2';
var CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

var BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'max-age=0'
};

// =============================================================
// Utilitaires fetch
// =============================================================

function fetchWithTimeout(url, options, timeout) {
    timeout = timeout || 10000;
    return new Promise(function(resolve) {
        var controller = null;
        var timer = null;
        try {
            controller = new AbortController();
            timer = setTimeout(function() { controller.abort(); }, timeout);
        } catch (e) {
            // AbortController non dispo (vieux env)
        }

        var fetchOptions = Object.assign({}, options || {});
        if (controller) fetchOptions.signal = controller.signal;

        fetch(url, fetchOptions)
            .then(function(res) {
                if (timer) clearTimeout(timer);
                if (!res.ok) { resolve(null); return; }
                res.text().then(function(text) {
                    resolve({ text: text, url: res.url, ok: true, headers: res.headers });
                }).catch(function() { resolve(null); });
            })
            .catch(function() {
                if (timer) clearTimeout(timer);
                resolve(null);
            });
    });
}

function fetchJson(url, options, timeout) {
    return fetchWithTimeout(url, options, timeout || 8000).then(function(res) {
        if (!res) return null;
        try { return JSON.parse(res.text); } catch (e) { return null; }
    });
}

function fetchHtml(url, options) {
    var opts = Object.assign({ headers: BROWSER_HEADERS }, options || {});
    return fetchWithTimeout(url, opts).then(function(res) {
        if (!res) throw new Error('HTTP error for ' + url);
        return res.text;
    });
}

// =============================================================
// Décodage base64 (sans Buffer — compatible TV/web)
// =============================================================

function decodeBase64(str) {
    try {
        return typeof atob === 'function' ? atob(str) : str;
    } catch (e) {
        return str;
    }
}

// =============================================================
// Déobfuscation p,a,c,k,e,d
// =============================================================

function unpackPacked(code) {
    try {
        if (!code.includes('p,a,c,k,e,d')) return code;
        var packedRegex = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\).*?\}\s*\((.*?)\)\s*\)/gs;
        var result = code;
        var match;
        while ((match = packedRegex.exec(code)) !== null) {
            try {
                var args = match[1].match(/^'(.*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/s);
                if (!args) continue;
                var packed = args[1].replace(/\\'/g, "'");
                var radix = parseInt(args[2]);
                var count = parseInt(args[3]);
                var keys = args[4].split('|');
                var toBase = function(n) {
                    return (n < radix ? '' : toBase(parseInt(n / radix))) +
                        ((n = n % radix) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
                };
                var lookup = {};
                while (count--) lookup[toBase(count)] = keys[count] || toBase(count);
                var unpacked = packed.replace(/\b\w+\b/g, function(w) { return lookup[w] || w; });
                result = result.replace(match[0], unpacked);
            } catch (e) {}
        }
        return result;
    } catch (e) {
        return code;
    }
}

// =============================================================
// Résolution TMDB → titres (FR + EN + original)
// =============================================================

function getTmdbTitles(tmdbId, mediaType) {
    var type = mediaType === 'movie' ? 'movie' : 'tv';
    var titles = [];

    return fetchJson(TMDB_BASE + '/' + type + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=en-US')
        .then(function(data) {
            if (data) {
                var mainTitle = type === 'movie' ? data.title : data.name;
                var origTitle = type === 'movie' ? data.original_title : data.original_name;
                if (mainTitle) titles.push(mainTitle.trim());
                if (origTitle && origTitle !== mainTitle && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(origTitle)) {
                    titles.push(origTitle.trim());
                }
            }
            return fetchJson(TMDB_BASE + '/' + type + '/' + tmdbId + '/translations?api_key=' + TMDB_API_KEY);
        })
        .then(function(data) {
            if (data && data.translations) {
                var frTrans = data.translations.find(function(t) { return t.iso_639_1 === 'fr'; });
                if (frTrans && frTrans.data) {
                    var frTitle = (frTrans.data.name || frTrans.data.title || '').trim();
                    if (frTitle && titles.indexOf(frTitle) === -1) titles.push(frTitle);
                }
            }
            console.log('[Anime-Sama] Titres TMDB: ' + titles.join(' | '));
            return titles;
        })
        .catch(function(e) {
            console.log('[Anime-Sama] Erreur TMDB: ' + e.message);
            return titles;
        });
}

// =============================================================
// Résolution TMDB → IMDB (via ArmSync)
// =============================================================

function tmdbToImdb(tmdbId, mediaType) {
    return fetchJson(ARMSYNC_BASE + '/themoviedb?id=' + tmdbId)
        .then(function(data) {
            var item = Array.isArray(data) ? data[0] : data;
            if (item && item.imdb) return item.imdb;
            // Fallback : scrape page TMDB
            var type = mediaType === 'movie' ? 'movie' : 'tv';
            return fetchWithTimeout('https://www.themoviedb.org/' + type + '/' + tmdbId, {}, 8000)
                .then(function(res) {
                    if (!res) return null;
                    var match = res.text.match(/imdb\.com\/title\/(tt\d+)/);
                    return match ? match[1] : null;
                });
        })
        .catch(function() { return null; });
}

// =============================================================
// Résolution épisode absolu (IMDB + Cinemeta)
// =============================================================

function getAbsoluteEpisode(imdbId, season, episode) {
    if (!imdbId || season === 0) return Promise.resolve(null);

    return fetchJson(CINEMETA_BASE + '/meta/series/' + imdbId + '.json')
        .then(function(data) {
            if (!data || !data.meta || !data.meta.videos) return null;
            var videos = data.meta.videos
                .filter(function(v) { return v.season > 0 && v.episode > 0; })
                .sort(function(a, b) { return a.season - b.season || a.episode - b.episode; });

            // Dédoublonnage
            var seen = {};
            var unique = [];
            videos.forEach(function(v) {
                var key = v.season + '-' + v.episode;
                if (!seen[key]) { seen[key] = true; unique.push(v); }
            });

            var idx = unique.findIndex(function(v) { return v.season == season && v.episode == episode; });
            if (idx !== -1) {
                var absolute = idx + 1;
                console.log('[Anime-Sama] Épisode absolu: S' + season + 'E' + episode + ' → ' + absolute);
                return absolute;
            }
            return null;
        })
        .catch(function() { return null; });
}

// =============================================================
// Recherche slug sur Anime-Sama (sans cheerio)
// =============================================================

function slugify(title) {
    return title.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function searchAnimeSamaSlugs(query) {
    var url = ANIMESAMA_BASE + '/template-php/defaut/fetch.php';
    return fetchWithTimeout(url, {
        method: 'POST',
        headers: Object.assign({}, BROWSER_HEADERS, {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': ANIMESAMA_BASE
        }),
        body: 'query=' + encodeURIComponent(query)
    }).then(function(res) {
        if (!res) return [];
        // Parser les liens /catalogue/SLUG/ via regex (sans cheerio)
        var slugs = [];
        var linkRegex = /href=["'][^"']*\/catalogue\/([^/"']+)\/?["']/g;
        var match;
        while ((match = linkRegex.exec(res.text)) !== null) {
            if (slugs.indexOf(match[1]) === -1) slugs.push(match[1]);
        }
        return slugs;
    }).catch(function() { return []; });
}

// =============================================================
// Détection du nom du player depuis l'URL
// =============================================================

function detectPlayerName(url) {
    var u = url.toLowerCase();
    if (u.includes('sibnet')) return 'Sibnet';
    if (u.includes('vidmoly')) return 'Vidmoly';
    if (u.includes('sendvid')) return 'Sendvid';
    if (u.includes('voe.')) return 'Voe';
    if (u.includes('stape') || u.includes('streamtape')) return 'Streamtape';
    if (u.includes('dood') || u.includes('ds2play')) return 'Doodstream';
    if (u.includes('uqload') || u.includes('oneupload')) return 'Uqload';
    if (u.includes('myvi') || u.includes('mytv')) return 'MyVi';
    if (u.includes('luluvid') || u.includes('lulu.')) return 'LuluVid';
    return 'Player';
}

// =============================================================
// Résolveurs de players (vanilla JS, sans require)
// =============================================================

function resolveSibnet(url) {
    return fetchWithTimeout(url, { headers: { 'Referer': 'https://video.sibnet.ru/' } })
        .then(function(res) {
            if (!res) return { url: url };
            var match = res.text.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i)
                || res.text.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i)
                || res.text.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)['"]/i);
            if (match) {
                var u = match[1];
                if (u.startsWith('//')) u = 'https:' + u;
                if (u.startsWith('/')) u = 'https://video.sibnet.ru' + u;
                return { url: u, headers: { 'Referer': 'https://video.sibnet.ru/' } };
            }
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

function resolveVidmoly(url) {
    var normalizedUrl = url.replace(/vidmoly\.(net|to|ru|is)/, 'vidmoly.me');
    var refHeaders = { 'Referer': 'https://vidmoly.me/', 'Origin': 'https://vidmoly.me' };
    return fetchWithTimeout(normalizedUrl, { headers: refHeaders })
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            // Suivi de redirect interne
            var redirMatch = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/)
                || html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            var nextFetch = Promise.resolve(html);
            if (redirMatch && redirMatch[1] !== normalizedUrl) {
                nextFetch = fetchWithTimeout(redirMatch[1], { headers: refHeaders })
                    .then(function(r) { return r ? r.text : html; });
            }
            return nextFetch.then(function(h) {
                if (h.includes('eval(function(p,a,c,k,e,d)')) h = unpackPacked(h);
                var match = h.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/i)
                    || h.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)['"]/i);
                if (match) return { url: match[1], headers: { 'Referer': 'https://vidmoly.me/' } };
                return { url: url };
            });
        })
        .catch(function() { return { url: url }; });
}

function resolveUqload(url) {
    var path = url.replace(/^https?:\/\/[^/]+/, '');
    var mirrors = ['uqload.is', 'uqload.co', 'uqload.com', 'uqload.io', 'uqloads.xyz', 'uqload.to'];
    var referer = 'https://uqload.is/';

    function tryMirror(i) {
        if (i >= mirrors.length) return Promise.resolve({ url: url });
        return fetchWithTimeout('https://' + mirrors[i] + path, { headers: { 'Referer': referer } })
            .then(function(res) {
                if (!res) return tryMirror(i + 1);
                var match = res.text.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))['"]\]/)
                    || res.text.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))['"]/);
                if (match) return { url: match[1], headers: { 'Referer': referer } };
                return tryMirror(i + 1);
            })
            .catch(function() { return tryMirror(i + 1); });
    }
    return tryMirror(0);
}

function resolveVoe(url) {
    return fetchWithTimeout(url)
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            var redirMatch = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            var nextFetch = Promise.resolve(html);
            if (redirMatch) {
                nextFetch = fetchWithTimeout(redirMatch[1])
                    .then(function(r) { return r ? r.text : html; });
            }
            return nextFetch.then(function(h) {
                var match = h.match(/'hls'\s*:\s*'([^']+)'/)
                    || h.match(/"hls"\s*:\s*"([^"]+)"/)
                    || h.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
                if (match) {
                    var u = match[1] || match[0];
                    if (u.includes('base64')) u = decodeBase64(u.split(',')[1] || u);
                    return { url: u, headers: { 'Referer': url } };
                }
                return { url: url };
            });
        })
        .catch(function() { return { url: url }; });
}

function resolveStreamtape(url) {
    return fetchWithTimeout(url)
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            if (html.includes('p,a,c,k,e,d')) html = unpackPacked(html);
            var match = html.match(/robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*([^;]+)/);
            if (match) {
                var base = 'https:' + match[1];
                var parts = match[2].split('+');
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    var strMatch = p.match(/['"]([^'"]+)['"]/);
                    if (strMatch) {
                        var chunk = strMatch[1];
                        var subMatch = p.match(/substring\((\d+)\)/);
                        if (subMatch) chunk = chunk.substring(parseInt(subMatch[1]));
                        base += chunk;
                    }
                }
                return { url: base, headers: { 'Referer': 'https://streamtape.com/' } };
            }
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

function resolveDoodstream(url) {
    var domain = (url.match(/https?:\/\/([^/]+)/) || [])[1] || 'dood.to';
    return fetchWithTimeout(url)
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpackPacked(html);
            var match = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
            if (match) {
                var passUrl = 'https://' + domain + '/pass_md5/' + match[1];
                return fetch(passUrl, { headers: { 'Referer': url } })
                    .then(function(r) {
                        if (!r.ok) return { url: url };
                        return r.text().then(function(base) {
                            var token = Math.random().toString(36).substring(2, 12);
                            return {
                                url: base + token + '?token=' + match[1] + '&expiry=' + Date.now(),
                                headers: { 'Referer': 'https://' + domain + '/' }
                            };
                        });
                    });
            }
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

function resolveSendvid(url) {
    var embedUrl = url.includes('/embed/') ? url : url.replace(/sendvid\.com\/([a-z0-9]+)/i, 'sendvid.com/embed/$1');
    return fetchWithTimeout(embedUrl, { headers: { 'Referer': 'https://sendvid.com/' } })
        .then(function(res) {
            if (!res) return { url: url };
            var match = res.text.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/)
                || res.text.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/)
                || res.text.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/)
                || res.text.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/)
                || res.text.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/);
            if (match) return { url: match[1], headers: { 'Referer': 'https://sendvid.com/' } };
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

function resolveMyvi(url) {
    return fetchWithTimeout(url, { headers: { 'Referer': 'https://www.myvi.ru/' } })
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            if (html.includes('p,a,c,k,e,d')) html = unpackPacked(html);
            var match = html.match(/["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)['"]/i)
                || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)['"]/i)
                || html.match(/source\s+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)/);
            if (match) return { url: match[1], headers: { 'Referer': 'https://www.myvi.ru/' } };
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

function resolveLuluvid(url) {
    return fetchWithTimeout(url)
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            if (html.includes('p,a,c,k,e,d')) html = unpackPacked(html);
            var match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]\]/)
                || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/);
            if (match) {
                var u = match[1];
                if (u.includes('base64')) u = decodeBase64(u.split(',')[1] || u);
                return { url: u, headers: { 'Referer': url } };
            }
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

function resolveGeneric(url) {
    return fetchWithTimeout(url)
        .then(function(res) {
            if (!res) return { url: url };
            var html = res.text;
            if (html.includes('p,a,c,k,e,d')) html = unpackPacked(html);
            var match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i)
                || html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/i)
                || html.match(/file\s*:\s*["']([^"']+)['"]/);
            if (match) {
                var u = match[1] || match[0];
                if (u.startsWith('//')) u = 'https:' + u;
                if (u.startsWith('http') && !u.includes('googletagmanager')) {
                    return { url: u };
                }
            }
            return { url: url };
        })
        .catch(function() { return { url: url }; });
}

// =============================================================
// Résolveur principal (dispatch selon domaine)
// =============================================================

function resolveStream(streamObj, depth) {
    depth = depth || 0;
    if (depth > 3) return Promise.resolve(Object.assign({}, streamObj, { isDirect: false }));

    var url = streamObj.url;
    var u = url.toLowerCase();

    if (!url || u.includes('google-analytics') || u.includes('doubleclick')) {
        return Promise.resolve(null);
    }

    // Déjà un stream direct
    if (u.match(/\.(mp4|m3u8|mkv|webm)(\?.*)?$/) && !u.includes('.html')) {
        return Promise.resolve(Object.assign({}, streamObj, { isDirect: true }));
    }

    var resolver;
    if (u.includes('sibnet.ru')) resolver = resolveSibnet(url);
    else if (u.includes('vidmoly.')) resolver = resolveVidmoly(url);
    else if (u.includes('uqload.') || u.includes('oneupload.')) resolver = resolveUqload(url);
    else if (u.includes('voe.')) resolver = resolveVoe(url);
    else if (u.includes('streamtape.com') || u.includes('stape')) resolver = resolveStreamtape(url);
    else if (u.includes('dood') || u.includes('ds2play')) resolver = resolveDoodstream(url);
    else if (u.includes('sendvid.')) resolver = resolveSendvid(url);
    else if (u.includes('myvi.') || u.includes('mytv.')) resolver = resolveMyvi(url);
    else if (u.includes('luluvid.') || u.includes('lulu.')) resolver = resolveLuluvid(url);
    else resolver = resolveGeneric(url);

    return resolver.then(function(resolved) {
        if (resolved && resolved.url && resolved.url !== url) {
            return Object.assign({}, streamObj, {
                url: resolved.url,
                headers: Object.assign({}, streamObj.headers || {}, resolved.headers || {}),
                isDirect: true,
                originalUrl: url
            });
        }
        // Pas résolu : retourner avec isDirect: false
        return Object.assign({}, streamObj, { isDirect: false });
    });
}

// =============================================================
// Récupération des épisodes depuis episodes.js d'Anime-Sama
// =============================================================

function fetchEpisodesJs(slug, season, lang) {
    var urls = [
        ANIMESAMA_BASE + '/catalogue/' + slug + '/saison' + season + '/' + lang + '/episodes.js',
        ANIMESAMA_BASE + '/catalogue/' + slug + '/' + lang + '/episodes.js'
    ];

    function tryUrl(i) {
        if (i >= urls.length) return Promise.resolve(null);
        return fetchHtml(urls[i], { headers: Object.assign({}, BROWSER_HEADERS, { 'Referer': ANIMESAMA_BASE }) })
            .then(function(text) { return { text: text, url: urls[i] }; })
            .catch(function() { return tryUrl(i + 1); });
    }
    return tryUrl(0);
}

// =============================================================
// Extraction des streams depuis un episodes.js
// =============================================================

function extractStreamsFromEpisodesJs(jsText, sourceUrl, season, episode, absoluteEpisode, lang) {
    var streams = [];
    var varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
    var varMatch;

    while ((varMatch = varRegex.exec(jsText)) !== null) {
        var arrayContent = varMatch[2];
        var urlMatches = arrayContent.match(/['"](https?[^'"]+)['"]/g);
        if (!urlMatches) continue;

        var epUrls = urlMatches.map(function(u) { return u.slice(1, -1); });

        // Choisir l'index à utiliser
        var targetIndex = null;
        if (sourceUrl.includes('saison' + season)) {
            // URL spécifique à la saison → index direct
            targetIndex = (episode || 1) - 1;
        } else if (absoluteEpisode && absoluteEpisode !== episode) {
            // URL générique → utiliser l'épisode absolu
            targetIndex = absoluteEpisode - 1;
        } else {
            targetIndex = (episode || 1) - 1;
        }

        if (targetIndex < 0 || targetIndex >= epUrls.length) continue;

        var epUrl = epUrls[targetIndex];
        if (!epUrl || !epUrl.startsWith('http')) continue;

        streams.push({
            name: 'Anime-Sama (' + lang.toUpperCase() + ')',
            title: detectPlayerName(epUrl) + ' - Ep ' + episode,
            url: epUrl,
            quality: 'HD',
            headers: { 'Referer': ANIMESAMA_BASE }
        });
    }
    return streams;
}

// =============================================================
// Logique principale de recherche de streams
// =============================================================

function findStreams(tmdbId, mediaType, season, episode) {
    var s = season || 1;
    var e = episode || 1;
    var langs = ['vostfr', 'vf'];
    var allRawStreams = [];

    return getTmdbTitles(tmdbId, mediaType).then(function(titles) {
        if (!titles || titles.length === 0) {
            console.log('[Anime-Sama] Aucun titre TMDB trouvé');
            return [];
        }

        // Résoudre l'épisode absolu (pour les animes multi-saisons condensés)
        return tmdbToImdb(tmdbId, mediaType).then(function(imdbId) {
            return getAbsoluteEpisode(imdbId, s, e);
        }).then(function(absoluteEp) {
            var absoluteEpisode = absoluteEp || e;

            // Slugs principaux depuis les titres
            var primarySlugs = titles.map(slugify);
            console.log('[Anime-Sama] Slugs primaires: ' + primarySlugs.join(', '));

            // Pour chaque slug, récupérer les épisodes de chaque langue
            function fetchForSlugs(slugs) {
                var fetches = [];
                slugs.forEach(function(slug) {
                    langs.forEach(function(lang) {
                        fetches.push(
                            fetchEpisodesJs(slug, s, lang).then(function(result) {
                                if (!result) return [];
                                return extractStreamsFromEpisodesJs(
                                    result.text, result.url, s, e, absoluteEpisode, lang
                                );
                            }).catch(function() { return []; })
                        );
                    });
                });
                return Promise.all(fetches).then(function(results) {
                    var streams = [];
                    results.forEach(function(r) { streams = streams.concat(r); });
                    return streams;
                });
            }

            return fetchForSlugs(primarySlugs).then(function(streams) {
                if (streams.length > 0) return streams;

                // Fallback : recherche via l'API Anime-Sama
                console.log('[Anime-Sama] Fallback : recherche API pour ' + titles[0]);
                return Promise.all(titles.map(function(t) {
                    return searchAnimeSamaSlugs(t);
                })).then(function(results) {
                    var foundSlugs = [];
                    var seenPrimary = {};
                    primarySlugs.forEach(function(s) { seenPrimary[s] = true; });

                    results.forEach(function(slugList) {
                        slugList.forEach(function(slug) {
                            if (!seenPrimary[slug] && foundSlugs.indexOf(slug) === -1) {
                                foundSlugs.push(slug);
                            }
                        });
                    });

                    console.log('[Anime-Sama] Slugs trouvés via API: ' + foundSlugs.join(', '));
                    if (foundSlugs.length === 0) return [];
                    return fetchForSlugs(foundSlugs);
                });
            }).then(function(rawStreams) {
                allRawStreams = rawStreams;
                return allRawStreams;
            });
        });
    }).then(function(rawStreams) {
        if (rawStreams.length === 0) return [];

        // Résoudre tous les streams en parallèle
        console.log('[Anime-Sama] Résolution de ' + rawStreams.length + ' streams...');
        return Promise.all(rawStreams.map(function(stream) {
            return resolveStream(stream).catch(function() { return null; });
        }));
    }).then(function(resolved) {
        // Garder uniquement les streams directs valides
        var valid = (resolved || []).filter(function(s) { return s && s.isDirect; });
        console.log('[Anime-Sama] Streams valides: ' + valid.length);

        // Trier : VF en premier
        valid.sort(function(a, b) {
            var isVf = function(s) { return s && (s.name + ' ' + (s.title || '')).toUpperCase().includes('VF'); };
            var aVf = isVf(a), bVf = isVf(b);
            if (aVf && !bVf) return -1;
            if (!aVf && bVf) return 1;
            return 0;
        });

        return valid;
    });
}

// =============================================================
// Point d'entrée public
// =============================================================

function getStreams(tmdbId, mediaType, season, episode, title) {
    console.log('[Anime-Sama] Requête: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);

    if (mediaType !== 'tv') {
        console.log('[Anime-Sama] Type non supporté: ' + mediaType);
        return Promise.resolve([]);
    }

    return findStreams(tmdbId, mediaType, season, episode)
        .catch(function(err) {
            console.error('[Anime-Sama] Erreur globale: ' + (err.message || err));
            return [];
        });
}

// =============================================================
// Export (compatible Mobile + TV)
// =============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    var _global = (typeof globalThis !== 'undefined') ? globalThis
                : (typeof window !== 'undefined') ? window
                : (typeof self !== 'undefined') ? self
                : this;
    _global.getStreams = getStreams;
}
