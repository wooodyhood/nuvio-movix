// =============================================================
// Provider Nuvio : xamoz.com
// Version : 1.0.0
// =============================================================

var XAMOZ_BASE = 'https://xamoz.com';
var XAMOZ_REFERER = XAMOZ_BASE + '/';
var SEARCH_PATH = '/cq4ug1qhqr/home/xamoz';

// -------------------------------------------------------------
// 1. Rechercher le film par titre pour obtenir l'ID interne
// -------------------------------------------------------------
function searchMovie(title, mediaType) {
    // Nettoyer le titre : supprimer accents, mettre en minuscules,
    // remplacer caractères non alphanumériques par + (comme le fait le site)
    var cleanTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .trim()
        .replace(/\s+/g, '+');

    var url = XAMOZ_BASE + SEARCH_PATH;
    var formData = new URLSearchParams();
    formData.append('searchword', cleanTitle);

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': XAMOZ_REFERER
        },
        body: formData
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var regex = /\/cq4ug1qhqr\/b\/xamoz\/(\d+)/g;
        var ids = [];
        var match;
        while ((match = regex.exec(html)) !== null) {
            ids.push(match[1]);
        }
        if (ids.length === 0) {
            throw new Error('Aucun film trouvé pour : ' + title);
        }
        // On prend le premier ID (le plus pertinent)
        var internalId = ids[0];
        console.log('[Xamoz] ID interne trouvé :', internalId);
        return internalId;
    });
}

// -------------------------------------------------------------
// 2. Récupérer la page du film et extraire l'URL de l'iframe
// -------------------------------------------------------------
function getEmbedUrl(internalId) {
    var filmUrl = XAMOZ_BASE + '/cq4ug1qhqr/b/xamoz/' + internalId;
    return fetch(filmUrl, {
        headers: { 'Referer': XAMOZ_REFERER }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // Chercher l'iframe du lecteur (ex: sharecloudy.com/iframe/...)
        var iframeRegex = /<iframe[^>]*src="([^"]+sharecloudy\.com\/iframe\/[^"]+)"[^>]*>/i;
        var match = html.match(iframeRegex);
        if (!match) {
            // Fallback : n'importe quel iframe présent
            var altRegex = /<iframe[^>]*src="([^"]+)"[^>]*>/i;
            match = html.match(altRegex);
            if (!match) {
                throw new Error('Aucun lecteur trouvé dans la page');
            }
        }
        var embedUrl = match[1];
        console.log('[Xamoz] Embed URL :', embedUrl);
        return embedUrl;
    });
}

// -------------------------------------------------------------
// 3. Fonction principale
// -------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode, title) {
    console.log('[Xamoz] tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode + ' title=' + title);

    // Si le titre n'est pas fourni, on ne peut pas continuer
    if (!title) {
        console.warn('[Xamoz] Titre manquant, impossible de rechercher');
        return Promise.resolve([]);
    }

    // Pour les séries, on pourrait ajouter une gestion spécifique,
    // mais pour l'instant on ne gère que les films.
    // On ignore season/episode pour les films.
    return searchMovie(title, mediaType)
        .then(function(internalId) {
            return getEmbedUrl(internalId);
        })
        .then(function(embedUrl) {
            // Retourner la source au format attendu par NuvioTV
            return [{
                name: 'Xamoz',
                title: title + ' - HD',
                url: embedUrl,
                quality: 'HD',
                format: 'embed',   // l'URL est une iframe, pas un flux direct
                headers: {
                    'Referer': XAMOZ_REFERER,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }];
        })
        .catch(function(err) {
            console.error('[Xamoz] Erreur :', err.message || err);
            return [];
        });
}

// Exports pour Node.js et global pour navigateur
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
