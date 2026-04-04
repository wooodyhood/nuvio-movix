// MovieBox — French only edition
// Validé avec les vraies réponses API (avril 2026)
// Compatible Hermes : uniquement .then(), pas de async/await

var CryptoJS = require('crypto-js');

var UA = 'com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)';
var CLIENT_INFO = '{"package_name":"com.community.mbox.in","version_name":"3.0.03.0529.03","version_code":50020042,"os":"android","os_version":"16","device_id":"da2b99c821e6ea023e4be55b54d5f7d8","install_store":"ps","gaid":"d7578036d13336cc","brand":"google","model":"sdk_gphone64_x86_64","system_language":"en","net":"NETWORK_WIFI","region":"IN","timezone":"Asia/Calcutta","sp_code":""}';

var API = 'https://api.inmoviebox.com';
var TMDB_KEY = 'd131017ccc6e5462a81c9304d21476de';

// Clé HMAC — double-décodage Base64 (confirmé fonctionnel)
var HMAC_KEY = CryptoJS.enc.Base64.parse(
    CryptoJS.enc.Base64.parse('NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==').toString(CryptoJS.enc.Utf8)
);

// ─── Crypto / Auth ────────────────────────────────────────────────────────────

function md5str(input) {
    return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function makeClientToken(ts) {
    var rev = String(ts).split('').reverse().join('');
    return ts + ',' + md5str(rev);
}

function makeSignature(method, accept, ct, url, body, ts) {
    var path = '';
    var query = '';
    try {
        var u = new URL(url);
        path = u.pathname;
        var keys = Array.from(u.searchParams.keys()).sort();
        if (keys.length) {
            query = keys.map(function(k) {
                return u.searchParams.getAll(k).map(function(v) { return k + '=' + v; }).join('&');
            }).join('&');
        }
    } catch (e) {}

    var canonicalUrl = query ? path + '?' + query : path;
    var bodyHash = '';
    var bodyLen = '';
    if (body) {
        var words = CryptoJS.enc.Utf8.parse(body);
        bodyHash = md5str(words);
        bodyLen = String(words.sigBytes);
    }

    var canonical = method.toUpperCase() + '\n'
        + (accept || '') + '\n'
        + (ct || '') + '\n'
        + bodyLen + '\n'
        + ts + '\n'
        + bodyHash + '\n'
        + canonicalUrl;

    return ts + '|2|' + CryptoJS.HmacMD5(canonical, HMAC_KEY).toString(CryptoJS.enc.Base64);
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function apiRequest(method, url, body) {
    body = body || null;
    var ts = Date.now();
    var accept = 'application/json';
    var ct = 'application/json';

    var headers = {
        'Accept': accept,
        'Content-Type': ct,
        'x-client-token': makeClientToken(ts),
        'x-tr-signature': makeSignature(method, accept, ct, url, body, ts),
        'User-Agent': UA,
        'x-client-info': CLIENT_INFO,
        'x-client-status': '0'
    };

    var opts = { method: method, headers: headers };
    if (body) opts.body = body;

    return fetch(url, opts).then(function(res) {
        return res.text().then(function(text) {
            if (!res.ok) return null;
            try { return JSON.parse(text); } catch (e) { return null; }
        });
    }).catch(function() { return null; });
}

// ─── Détection français ───────────────────────────────────────────────────────
// Valeurs réelles API : "French dub", "Original Audio", "Arabic sub", "Russian sub"...
// On détecte aussi lanCode === 'fr' comme filet de sécurité

function isFrench(lanName, lanCode) {
    if (lanCode && lanCode.toLowerCase() === 'fr') return true;
    if (!lanName) return false;
    var l = lanName.toLowerCase().trim();
    if (l === 'french' || l === 'vf' || l === 'vff' || l === 'fr') return true;
    if (l.includes('french') || l.includes('français') || l.includes('francais')
        || l.includes('vostfr') || l.includes('franco')) return true;
    // "fr" comme mot délimité — évite les faux positifs ("africain", etc.)
    if (/(?:^|\s)fr(?:\s|$)/.test(l)) return true;
    return false;
}

// ─── TMDB ─────────────────────────────────────────────────────────────────────

function getTmdbInfo(tmdbId, mediaType) {
    var url = 'https://api.themoviedb.org/3/' + mediaType + '/' + tmdbId
        + '?api_key=' + TMDB_KEY;
    return fetch(url).then(function(r) { return r.json(); }).then(function(d) {
        return {
            title: mediaType === 'movie' ? (d.title || d.original_title) : (d.name || d.original_name),
            year: (d.release_date || d.first_air_date || '').substring(0, 4),
            originalTitle: d.original_title || d.original_name || null
        };
    }).catch(function() { return null; });
}

// ─── Recherche & matching ─────────────────────────────────────────────────────

function normalizeTitle(s) {
    if (!s) return '';
    return s
        .replace(/\[.*?\]/g, ' ')   // retire [Version française], [netflix], etc.
        .replace(/\(.*?\)/g, ' ')
        .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, ' ')
        .toLowerCase()
        .replace(/:/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function searchMovieBox(query) {
    var url = API + '/wefeed-mobile-bff/subject-api/search/v2';
    var body = JSON.stringify({ page: 1, perPage: 15, keyword: query });
    return apiRequest('POST', url, body).then(function(res) {
        if (!res || !res.data || !res.data.results) return [];
        var all = [];
        res.data.results.forEach(function(group) {
            if (group.subjects) all = all.concat(group.subjects);
        });
        return all;
    }).catch(function() { return []; });
}

function bestMatch(subjects, title, year, mediaType) {
    var norm = normalizeTitle(title);
    var type = mediaType === 'movie' ? 1 : 2;
    var best = null;
    var bestScore = -1;

    for (var i = 0; i < subjects.length; i++) {
        var s = subjects[i];
        if (s.subjectType !== type) continue;

        var sNorm = normalizeTitle(s.title);
        var sYear = s.year ? String(s.year) : (s.releaseDate ? s.releaseDate.substring(0, 4) : null);
        var score = 0;

        if (sNorm === norm) score += 60;
        else if (sNorm.includes(norm) || norm.includes(sNorm)) score += 20;

        if (year && sYear) {
            if (year === sYear) score += 30;
            else if (Math.abs(parseInt(year, 10) - parseInt(sYear, 10)) === 1) score += 10;
        }

        if (score > bestScore) { bestScore = score; best = s; }
    }
    return bestScore >= 30 ? best : null;
}

function search(query, title, year, mediaType) {
    return searchMovieBox(query).then(function(subjects) {
        return bestMatch(subjects, title, year, mediaType);
    });
}

// ─── Streams ──────────────────────────────────────────────────────────────────

function qualityLabel(stream) {
    // Champ réel API : "resolutions": "360" / "480" / "1080" (string)
    var raw = stream.resolutions || stream.quality || stream.definition
              || stream.resolution || stream.videoHeight || null;
    if (!raw) return 'Auto';
    var candidates = Array.isArray(raw) ? raw.map(String)
        : (typeof raw === 'string' && raw.includes(',')) ? raw.split(',').map(function(x) { return x.trim(); })
        : [String(raw)];
    var max = candidates.reduce(function(m, v) {
        var n = parseInt(String(v).match(/(\d{3,4})/), 10) || 0;
        return Math.max(m, n);
    }, 0);
    return max ? max + 'p' : (candidates[0] || 'Auto');
}

function formatType(url) {
    var u = String(url || '').toLowerCase().split('?')[0];
    if (u.includes('.mpd')) return 'DASH';
    if (u.includes('.m3u8')) return 'HLS';
    if (u.includes('.mp4')) return 'MP4';
    if (u.includes('.mkv')) return 'MKV';
    return 'VIDEO';
}

function typeRank(url) {
    var u = String(url || '').toLowerCase();
    if (u.includes('.mpd')) return 3;
    if (u.includes('.m3u8')) return 2;
    if (u.includes('.mp4') || u.includes('.mkv')) return 1;
    return 0;
}

function streamTitle(title, season, episode, mediaType) {
    if (mediaType === 'tv' && season > 0 && episode > 0) {
        return title + ' S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
    }
    return title || 'Stream';
}

function fetchStreams(subjectId, lang, season, episode, mediaTitle, mediaType) {
    var url = API + '/wefeed-mobile-bff/subject-api/play-info'
        + '?subjectId=' + subjectId + '&se=' + season + '&ep=' + episode;

    return apiRequest('GET', url).then(function(res) {
        if (!res || !res.data) return [];

        // Champ réel : res.data.streams (tableau)
        var raw = res.data.streams || res.data.videoList || res.data.playList || [];
        if (!Array.isArray(raw) && raw && raw.url) raw = [raw];

        var out = [];
        raw.forEach(function(s) {
            var streamUrl = s.url || s.playUrl || s.streamUrl || null;
            if (!streamUrl) return;

            var q = qualityLabel(s);
            var fmt = formatType(streamUrl);
            var hdrs = { 'Referer': API, 'User-Agent': UA };
            if (s.signCookie) hdrs['Cookie'] = s.signCookie;
            else if (s.cookie) hdrs['Cookie'] = s.cookie;

            out.push({
                name: 'MovieBox (' + lang + ') ' + q + ' [' + fmt + ']',
                title: streamTitle(mediaTitle, season, episode, mediaType),
                url: streamUrl,
                quality: q,
                headers: hdrs
            });
        });
        return out;
    }).catch(function() { return []; });
}

function getStreamLinks(subjectId, season, episode, mediaTitle, mediaType) {
    var url = API + '/wefeed-mobile-bff/subject-api/get?subjectId=' + subjectId;

    return apiRequest('GET', url).then(function(res) {
        if (!res || !res.data || !res.data.subject) return [];

        // BUG CORRIGÉ (validé sur données réelles) :
        // Le subjectId principal peut être le dub français, pas l'original.
        // On utilise le flag original:true pour identifier l'audio d'origine,
        // et lanCode pour filtrer le français — pas la comparaison d'ID.
        var dubs = res.data.subject.dubs || [];
        if (!Array.isArray(dubs) || dubs.length === 0) return [];

        // Garder uniquement les dubs français (lanName ou lanCode)
        var frDubs = dubs.filter(function(d) {
            return isFrench(d.lanName || d.langName || '', d.lanCode || '');
        });

        if (frDubs.length === 0) return []; // Pas de VF disponible pour ce titre

        var promises = frDubs.map(function(d) {
            var lang = d.lanName || d.langName || 'French';
            return fetchStreams(d.subjectId, lang, season, episode, mediaTitle, mediaType);
        });

        return Promise.all(promises).then(function(results) {
            var all = [];
            results.forEach(function(streams) {
                streams.forEach(function(s) { all.push(s); });
            });

            // Trier : meilleure qualité d'abord, puis DASH > HLS > MP4
            all.sort(function(a, b) {
                var qa = parseInt(String(a.quality).match(/\d+/) || 0, 10);
                var qb = parseInt(String(b.quality).match(/\d+/) || 0, 10);
                if (qb !== qa) return qb - qa;
                return typeRank(b.url) - typeRank(a.url);
            });
            return all;
        });
    }).catch(function() { return []; });
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    seasonNum = seasonNum || 1;
    episodeNum = episodeNum || 1;
    var se = mediaType === 'tv' ? seasonNum : 0;
    var ep = mediaType === 'tv' ? episodeNum : 0;

    return getTmdbInfo(tmdbId, mediaType).then(function(info) {
        if (!info) return [];

        // Tentative 1 : titre principal
        return search(info.title, info.title, info.year, mediaType)
            .then(function(match) {
                if (match) return match;
                // Tentative 2 : titre original (films non-anglophones)
                if (info.originalTitle && info.originalTitle !== info.title) {
                    return search(info.originalTitle, info.originalTitle, info.year, mediaType);
                }
                return null;
            })
            .then(function(match) {
                if (match) return match;
                // Tentative 3 : titre tronqué avant ":" ("Wu-Tang: An American Saga" → "Wu-Tang")
                var short = info.title.split(':')[0].trim();
                if (short !== info.title) {
                    return search(short, info.title, info.year, mediaType);
                }
                return null;
            })
            .then(function(match) {
                if (!match) return [];
                return getStreamLinks(match.subjectId, se, ep, info.title, mediaType);
            });
    });
}

module.exports = { getStreams: getStreams };
