// =============================================================
// Provider Nuvio : xamoz.com
// Version : 4.0.0
// Films uniquement
// Utilise XMLHttpRequest — fetch ignore les cookies sur Android
// =============================================================

var XAMOZ_BASE = 'https://xamoz.com';
var XAMOZ_SEARCH = XAMOZ_BASE + '/cq4ug1qhqr/home/xamoz';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// -------------------------------------------------------------
// Utilitaire : XMLHttpRequest encapsulé en Promise
// -------------------------------------------------------------
function xhrRequest(method, url, headers, body) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.withCredentials = false;

        if (headers) {
            Object.keys(headers).forEach(function(key) {
                try { xhr.setRequestHeader(key, headers[key]); } catch(e) {}
            });
        }

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.responseText);
            } else {
                reject(new Error('Erreur HTTP ' + xhr.status + ' sur ' + url));
            }
        };

        xhr.onerror = function() {
            reject(new Error('Erreur réseau sur ' + url));
        };

        xhr.ontimeout = function() {
            reject(new Error('Timeout sur ' + url));
        };

        xhr.timeout = 15000;
        xhr.send(body || null);
    });
}

// -------------------------------------------------------------
// 1. Rechercher le film par titre via POST
// -------------------------------------------------------------
function searchMovie(title) {
    var cleanTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    console.log('[Xamoz] Recherche :', cleanTitle);

    return xhrRequest(
        'POST',
        XAMOZ_SEARCH,
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': XAMOZ_SEARCH,
            'Origin': XAMOZ_BASE,
            'User-Agent': UA
        },
        'searchword=' + encodeURIComponent(cleanTitle)
    )
    .then(function(html) {
        if (!html || html.trim().length === 0) {
            throw new Error('Réponse vide du serveur');
        }

        // Vérifier qu'on a bien une page de résultats et pas la homepage
        if (html.indexOf('Recherche :') === -1) {
            throw new Error('Page de résultats non obtenue (longueur: ' + html.length + ')');
        }

        var ids = [];
        var regex = /\/cq4ug1qhqr\/b\/xamoz\/(\d+)/g;
        var match;
        while ((match = regex.exec(html)) !== null) {
            if (ids.indexOf(match[1]) === -1) ids.push(match[1]);
        }

        if (ids.length === 0) throw new Error('Aucun film trouvé pour : ' + title);
        console.log('[Xamoz] Film trouvé, ID :', ids[0], '(' + ids.length + ' résultat(s))');
        return ids[0];
    });
}

// -------------------------------------------------------------
// 2. Récupérer la page du film et extraire l'URL du lecteur
// -------------------------------------------------------------
function getEmbedUrl(internalId) {
    var filmUrl = XAMOZ_BASE + '/cq4ug1qhqr/b/xamoz/' + internalId;

    return xhrRequest(
        'GET',
        filmUrl,
        {
            'Referer': XAMOZ_SEARCH,
            'User-Agent': UA
        }
    )
    .then(function(html) {
        if (!html || html.trim().length === 0) {
            throw new Error('Page film vide');
        }

        var patterns = [
            /<iframe[^>]+src="(https?:\/\/[^"]*sharecloudy\.com\/iframe\/[^"]+)"/i,
            /<iframe[^>]+src="(https?:\/\/[^"]*(?:embed|player|iframe)[^"]+)"/i,
            /<iframe[^>]+src="(https?:\/\/[^"]+)"/i,
            /"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i,
            /"file"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/i
        ];

        for (var i = 0; i < patterns.length; i++) {
            var match = html.match(patterns[i]);
            if (match) {
                console.log('[Xamoz] Lecteur trouvé :', match[1]);
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
    console.log('[Xamoz] Démarrage — tmdbId=' + tmdbId + ' type=' + mediaType + ' title=' + title);

    if (mediaType !== 'movie') {
        console.log('[Xamoz] Type non supporté :', mediaType);
        return Promise.resolve([]);
    }

    if (!title) {
        console.warn('[Xamoz] Titre manquant');
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
                    'Referer': XAMOZ_BASE + '/',
                    'User-Agent': UA
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
