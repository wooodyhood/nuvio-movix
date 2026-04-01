// =============================================================
// Provider Nuvio : xamoz.com
// Version : 1.1.0
// Films uniquement
// =============================================================

var XAMOZ_BASE = 'https://xamoz.com';
var XAMOZ_REFERER = XAMOZ_BASE + '/';
var SEARCH_PATH = '/cq4ug1qhqr/home/xamoz';

// -------------------------------------------------------------
// 1. Rechercher le film par titre pour obtenir l'ID interne
// -------------------------------------------------------------
function searchMovie(title) {
    var cleanTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    var url = XAMOZ_BASE + SEARCH_PATH;
    var formData = new URLSearchParams();
    formData.append('searchword', cleanTitle);

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Referer': XAMOZ_REFERER,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: formData.toString()
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Erreur HTTP recherche : ' + res.status);
        return res.text();
    })
    .then(function(html) {
        var ids = [];
        var regex = /\/cq4ug1qhqr\/b\/xamoz\/(\d+)/g;
        var match;
        while ((match = regex.exec(html)) !== null) {
            if (ids.indexOf(match[1]) === -1) ids.push(match[1]);
        }
        if (ids.length === 0) throw new Error('Aucun film trouvé pour : ' + title);
        console.log('[Xamoz] ID interne trouvé :', ids[0], '(sur', ids.length, 'résultats)');
        return ids[0];
    });
}

// -------------------------------------------------------------
// 2. Récupérer la page du film et extraire l'URL du lecteur
// -------------------------------------------------------------
function getEmbedUrl(internalId) {
    var filmUrl = XAMOZ_BASE + '/cq4ug1qhqr/b/xamoz/' + internalId;

    return fetch(filmUrl, {
        headers: {
            'Referer': XAMOZ_REFERER,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Erreur HTTP page film : ' + res.status);
        return res.text();
    })
    .then(function(html) {
        var patterns = [
            /<iframe[^>]+src="(https?:\/\/[^"]*sharecloudy\.com\/iframe\/[^"]+)"/i,
            /<iframe[^>]+src="(https?:\/\/[^"]*(?:embed|player|iframe)[^"]+)"/i,
            /<iframe[^>]+src="(https?:\/\/[^"]+)"/i,
            /"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i,
            /"file"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/i,
            /source\s+src="(https?:\/\/[^"]+\.m3u8[^"]*)"/i,
            /source\s+src="(https?:\/\/[^"]+\.mp4[^"]*)"/i
        ];

        for (var i = 0; i < patterns.length; i++) {
            var match = html.match(patterns[i]);
            if (match) {
                console.log('[Xamoz] Lecteur trouvé (pattern ' + i + ') :', match[1]);
                return match[1];
            }
        }

        throw new Error('Aucun lecteur trouvé dans la page du film');
    });
}

// -------------------------------------------------------------
// 3. Fonction principale
// -------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode, title) {
    console.log('[Xamoz] tmdbId=' + tmdbId + ' type=' + mediaType + ' title=' + title);

    // Ce provider ne gère que les films
    if (mediaType !== 'movie') {
        console.log('[Xamoz] Type non supporté :', mediaType);
        return Promise.resolve([]);
    }

    if (!title) {
        console.warn('[Xamoz] Titre manquant, impossible de rechercher');
        return Promise.resolve([]);
    }

    return searchMovie(title)
        .then(function(internalId) {
            return getEmbedUrl(internalId);
        })
        .then(function(embedUrl) {
            return [{
                name: 'Xamoz',
                title: title + ' - HD',
                url: embedUrl,
                quality: 'HD',
                format: 'embed',
                headers: {
                    'Referer': XAMOZ_REFERER,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }];
        })
        .catch(function(err) {
            console.error('[Xamoz] Erreur :', err.message || err);
            return [];
        });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
}
