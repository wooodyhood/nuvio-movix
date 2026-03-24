// =============================================================
// Provider Nuvio : YopFlix (VF)
// Version : 1.0.0 - Unpacker Vidzy + Auto-Telegram + TMDB
// =============================================================

var YOPFLIX_BASE = 'https://yopflix.my';
var TELEGRAM_URL = 'https://t.me/s/YopFlix';
var TMDB_KEY = 'a9e49b08496469614f9d0e74b1219084'; // Clé publique pour récupérer le titre

// 1. Outil pour décoder le lecteur Vidzy
function unpackPacker(packed) {
    var pMatch = packed.match(/}?\('([^']*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/) ||
                 packed.match(/}?\("([^"]*)",(\d+),(\d+),"([^"]*)"\.split\('\|'\)/);
    if (!pMatch) return null;
    var p = pMatch[1], a = parseInt(pMatch[2]), c = parseInt(pMatch[3]), k = pMatch[4].split('|');
    function e(c) {
        return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }
    while (c--) {
        if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
    }
    return p;
}

// 2. Trouver le domaine YopFlix à jour via Telegram
function getActiveDomain() {
    return fetch(TELEGRAM_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var urls = html.match(/https?:\/\/yopflix\.[a-z]+/gi);
            if (urls && urls.length > 0) return urls[urls.length - 1]; // Prend le dernier domaine annoncé
            return YOPFLIX_BASE;
        })
        .catch(function() { return YOPFLIX_BASE; });
}

// 3. Fonction principale
function getStreams(tmdbId, mediaType, season, episode, title) {
    var activeDomain = YOPFLIX_BASE;
    var queryTitle = title || "";

    // ÉTAPE A : Récupérer le titre si Nuvio ne le donne pas
    var p = queryTitle ? Promise.resolve(queryTitle) : 
        fetch('https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=fr-FR')
        .then(function(res) { return res.json(); })
        .then(function(d) { return d.title || d.name; });

    return p.then(function(finalTitle) {
        if (!finalTitle) throw new Error('Titre introuvable');
        return getActiveDomain().then(function(domain) {
            activeDomain = domain;
            // ÉTAPE B : Chercher sur l'API YopFlix
            var searchUrl = activeDomain + '/api_search.php?q=' + encodeURIComponent(finalTitle);
            return fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data || !data.results || data.results.length === 0) throw new Error('Aucun résultat sur YopFlix');
        var yopId = data.results[0].id;

        // ÉTAPE C : Récupérer l'Iframe Vidzy
        if (mediaType === 'tv') {
            // Logique pour les séries : récupérer l'ID de l'épisode exact
            var seriesUrl = activeDomain + '/series.php?id=' + yopId + '&season=' + season;
            return fetch(seriesUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
                .then(function(res) { return res.text(); })
                .then(function(html) {
                    var epPattern = /ep=(\d+)[^>]*>[\s\S]{0,150}?ep-num-badge-number[^>]*>(\d+)</ig;
                    var match, epId = null;
                    while ((match = epPattern.exec(html)) !== null) {
                        if (parseInt(match[2]) === parseInt(episode)) { epId = match[1]; break; }
                    }
                    if (!epId) throw new Error('Épisode introuvable sur la page');
                    return fetch(activeDomain + '/series.php?id=' + yopId + '&season=' + season + '&ep=' + epId, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                });
        } else {
            // Logique pour les films
            return fetch(activeDomain + '/watch.php?id=' + yopId, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // Extraction de l'URL Vidzy
        var iframeMatch = html.match(/src=["'](https?:\/\/vidzy[^"']+)["']/i);
        if (!iframeMatch) throw new Error('Lecteur Vidzy introuvable');
        
        return fetch(iframeMatch[1], { headers: { 'Referer': activeDomain + '/', 'User-Agent': 'Mozilla/5.0' } });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // ÉTAPE D : Déobfuscation du lecteur Vidzy
        var packed = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/i);
        if (!packed) throw new Error('Script Vidzy introuvable ou modifié');
        
        var unpacked = unpackPacker(packed[0]);
        if (!unpacked) throw new Error('Échec du dépacking Vidzy');

        // Extraction de l'URL finale
        var m3u8Match = unpacked.match(/https:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
        if (!m3u8Match) throw new Error('M3U8 introuvable dans le code dépacké');

        var finalUrl = m3u8Match[0];

        return [{
            name: 'YopFlix',
            title: 'Lien Direct Vidzy (VF)',
            url: finalUrl,
            quality: 'HD',
            format: 'm3u8',
            headers: { 'Referer': activeDomain + '/', 'User-Agent': 'Mozilla/5.0' }
        }];
    })
    .catch(function(err) {
        console.error('[YopFlix] ' + err.message);
        return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
