// =============================================================
// Provider Nuvio : Noctaflix (VF/4K Direct)
// Version : 1.1.0 - Recherche par Nom Automatique
// =============================================================

var NOCTA_BASE = 'https://noctaflix.lol';
var TMDB_API_KEY = 'a9e49b08496469614f9d0e74b1219084'; // Clé publique pour trouver le nom du film

function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[Noctaflix] Début de la recherche pour ID: ' + tmdbId);

    // ÉTAPE 1 : Trouver le nom du film avec son ID (car Noctaflix veut un nom, pas un numéro)
    var tmdbUrl = 'https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=fr-FR';

    return fetch(tmdbUrl)
        .then(function(res) { return res.json(); })
        .then(function(metadata) {
            var title = metadata.title || metadata.name;
            console.log('[Noctaflix] Nom trouvé sur TMDB: ' + title);

            // ÉTAPE 2 : Chercher ce nom sur Noctaflix
            var searchUrl = NOCTA_BASE + '/search?q=' + encodeURIComponent(title);
            return fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            // ÉTAPE 3 : Trouver le lien du film dans les résultats
            var slugRegex = new RegExp('href="(https?://noctaflix\\.lol/(?:movie|tv)/[^"]+)"', 'i');
            var match = html.match(slugRegex);
            if (!match) throw new Error('Film non trouvé sur le site');
            
            return fetch(match[1]);
        })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            // ÉTAPE 4 : Trouver l'ID de la vidéo (ex: 3610)
            var embedMatch = html.match(/embed\/(\d+)/);
            if (!embedMatch) throw new Error('ID Vidéo non trouvé');
            
            return fetch(NOCTA_BASE + '/embed/' + embedMatch[1], { headers: { 'Referer': NOCTA_BASE + '/' } });
        })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            // ÉTAPE 5 : Décodage du lien final (Base64)
            var sourceMatch = html.match(/id="encrypted-source" value="([^"]+)"/);
            if (!sourceMatch) throw new Error('Lien vidéo introuvable');

            var finalUrl = atob(sourceMatch[1]); // C'est ici qu'on décode le lien !

            return [{
                name: 'Noctaflix',
                title: 'Lien Direct 4K/HD',
                url: finalUrl,
                quality: 'HD/4K',
                format: finalUrl.includes('.m3u8') ? 'm3u8' : 'mp4',
                headers: { 'Referer': NOCTA_BASE + '/', 'User-Agent': 'Mozilla/5.0' }
            }];
        })
        .catch(function(err) {
            console.error('[Noctaflix] Erreur:', err.message);
            return [];
        });
}

// Pour que Nuvio reconnaisse le fichier
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
