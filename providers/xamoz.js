// =============================================================
// Provider Nuvio : xamoz.com
// Version : 2.0.0
// Films uniquement
// =============================================================

var XAMOZ_BASE = 'https://xamoz.com';
var XAMOZ_HOME = XAMOZ_BASE + '/cq4ug1qhqr/home/xamoz';
var XAMOZ_SEARCH = XAMOZ_BASE + '/cq4ug1qhqr/home/xamoz';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// -------------------------------------------------------------
// Étape 0 : Récupérer les cookies de session en visitant le site
// Le site pose g=true via JS quand on clique sur "entrez sur xamoz".
// On simule cette visite avec deux requêtes GET successives.
// -------------------------------------------------------------
function getSessionCookies() {
    // Visite 1 : page d'entrée (https://xamoz.com)
    return fetch(XAMOZ_BASE + '/', {
        method: 'GET',
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow'
    })
    .then(function(res) {
        // Visite 2 : page principale — simule le clic "entrez sur xamoz"
        return fetch(XAMOZ_HOME, {
            method: 'GET',
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9',
                'Referer': XAMOZ_BASE + '/',
                'Upgrade-Insecure-Requests': '1'
            },
            redirect: 'follow'
        });
    })
    .then(function() {
        // g=true est posé par JS côté client — on le fournit directement
        // C'est un cookie de consentement simple, pas un token cryptographique
        return 'g=true';
    });
}

// -------------------------------------------------------------
// Étape 1 : Rechercher le film par titre
// -------------------------------------------------------------
function searchMovie(title, cookie) {
    var cleanTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    var formData = new URLSearchParams();
    formData.append('searchword', cleanTitle);

    return fetch(XAMOZ_SEARCH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': XAMOZ_HOME,
            'Origin': XAMOZ_BASE,
            'Cookie': cookie,
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'upgrade-insecure-requests': '1'
        },
        body: formData.toString()
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Erreur HTTP recherche : ' + res.status);
        return res.text();
    })
    .then(function(html) {
        if (!html || html.trim().length === 0) {
            throw new Error('Réponse vide — cookie g=true non accepté ou site inaccessible');
        }

        var ids = [];
        var regex = /\/cq4ug1qhqr\/b\/xamoz\/(\d+)/g;
        var match;
        while ((match = regex.exec(html)) !== null) {
            if (ids.indexOf(match[1]) === -1) ids.push(match[1]);
        }

        if (ids.length === 0) throw new Error('Aucun film trouvé pour : ' + title);
        console.log('[Xamoz] Film trouvé, ID :', ids[0], '(' + ids.length + ' résultats)');
        return ids[0];
    });
}

// -------------------------------------------------------------
// Étape 2 : Récupérer la page du film et extraire l'iframe
// -------------------------------------------------------------
function getEmbedUrl(internalId, cookie) {
    var filmUrl = XAMOZ_BASE + '/cq4ug1qhqr/b/xamoz/' + internalId;

    return fetch(filmUrl, {
        method: 'GET',
        headers: {
            'Referer': XAMOZ_HOME,
            'Cookie': cookie,
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'upgrade-insecure-requests': '1'
        }
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Erreur HTTP page film : ' + res.status);
        return res.text();
    })
    .then(function(html) {
        if (!html || html.trim().length === 0) {
            throw new Error('Page film vide');
        }

        // Patterns par ordre de priorité
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
// Fonction principale
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

    return getSessionCookies()
        .then(function(cookie) {
            console.log('[Xamoz] Cookie session obtenu :', cookie);
            return searchMovie(title, cookie)
                .then(function(internalId) {
                    return getEmbedUrl(internalId, cookie);
                });
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
