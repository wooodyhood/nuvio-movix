// =============================================================
// Provider Nuvio : YopFlix (VF/VOSTFR français)
// Version : 1.0.0 - Emulation Navigateur + Vidzy Decoder
// =============================================================

var BASE = 'https://yopflix.my';
var TMDB = 'https://api.themoviedb.org/3';
var KEY = 'a9e49b08496469614f9d0e74b1219084';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function resolveVidzy(embedUrl) {
    return fetch(embedUrl, {
        headers: { 'User-Agent': UA, 'Referer': BASE + '/' }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // Extraction du Packer de Vidzy
        var p = html.match(/\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split/);
        if (!p) return null;

        var unpacked = (function(p, a, c, k) {
            while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            return p;
        })(p[1], parseInt(p[2]), parseInt(p[3]), p[4].split('|'));

        var m3u8Match = unpacked.match(/file:["']([^"']+\.m3u8[^"']*)["']/i);
        return m3u8Match ? m3u8Match[1] : null;
    })
    .catch(function() { return null; });
}

function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[YopFlix] Démarrage tmdbId=' + tmdbId);
    var type = (mediaType === 'tv') ? 'tv' : 'movie';
    
    // Étape 1 : On récupère le titre sur TMDB
    return fetch(TMDB + '/' + type + '/' + tmdbId + '?api_key=' + KEY + '&language=fr-FR')
    .then(function(res) { return res.json(); })
    .then(function(movie) {
        var query = movie.title || movie.name;
        
        // Étape 2 : "Handshake" - On visite l'accueil pour simuler une session
        return fetch(BASE + '/', { headers: { 'User-Agent': UA } })
        .then(function() {
            // Étape 3 : Recherche
            return fetch(BASE + '/api_search.php?q=' + encodeURIComponent(query), {
                headers: { 'Referer': BASE + '/', 'User-Agent': UA }
            });
        });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data.results || data.results.length === 0) throw new Error('Aucun résultat');
        
        var id = data.results[0].id;
        var watchUrl = (type === 'tv') ? 
            BASE + '/series.php?id=' + id + '&season=' + season + '&ep=' + episode :
            BASE + '/watch.php?id=' + id;
            
        return fetch(watchUrl, { headers: { 'Referer': BASE + '/', 'User-Agent': UA } });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // Étape 4 : Extraction de l'iframe Vidzy
        var iframeMatch = html.match(/src=["'](https?:\/\/vidzy\.[^"']+)["']/i);
        if (!iframeMatch) throw new Error('Iframe non trouvée');
        
        return resolveVidzy(iframeMatch[1]);
    })
    .then(function(directUrl) {
        if (!directUrl) return [];

        return [{
            name: 'YopFlix',
            title: 'Vidzy (VF)',
            url: directUrl,
            quality: 'HD',
            format: 'm3u8',
            headers: {
                'Referer': 'https://vidzy.live/',
                'User-Agent': UA,
                'Origin': 'https://vidzy.live'
            }
        }];
    })
    .catch(function(err) {
        console.error('[YopFlix] Erreur:', err.message);
        return [];
    });
}

// Export final
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
