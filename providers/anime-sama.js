// =============================================================
// Provider Nuvio : Anime-Sama (Sibnet only) - Étape 1
// =============================================================

var BASE = 'https://anime-sama.to';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var TMDB_API = 'https://api.themoviedb.org/3';
var TMDB_KEY = 'a9e49b08496469614f9d0e74b1219084';

// Récupérer le titre depuis TMDB
function getTitleFromTmdb(tmdbId, mediaType) {
    var type = (mediaType === 'tv') ? 'tv' : 'movie';
    var url = TMDB_API + '/' + type + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=fr-FR';
    
    return fetch(url)
        .then(function(res) {
            if (!res.ok) throw new Error('TMDB error: ' + res.status);
            return res.json();
        })
        .then(function(data) {
            var title = data.title || data.name;
            if (!title) throw new Error('Titre non trouvé');
            console.log('[Anime-Sama] Titre TMDB: ' + title);
            return title;
        });
}

// Récupérer le slug à partir du titre
function getSlug(title) {
    return title.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Récupérer l'URL du stream pour un épisode
function getStreamUrl(slug, season, episode, lang) {
    var langCode = (lang === 'vf') ? 'vf' : 'vostfr';
    var url = BASE + '/catalogue/' + slug + '/saison' + season + '/' + langCode + '/episodes.js';
    console.log('[Anime-Sama] Chargement: ' + url);
    
    return fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': BASE }
    })
    .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
    })
    .then(function(js) {
        // Extraire le tableau d'URLs
        var match = js.match(/var\s+\w+\s*=\s*\[([\s\S]*?)\];/);
        if (!match) throw new Error('Tableau non trouvé');
        
        var urls = match[1].match(/['"]([^'"]+)['"]/g);
        if (!urls || urls.length < episode) throw new Error('URL non trouvée pour épisode ' + episode);
        
        var videoUrl = urls[episode - 1].slice(1, -1);
        console.log('[Anime-Sama] URL trouvée: ' + videoUrl);
        
        // Pour Sibnet, on doit aller chercher l'URL réelle
        if (videoUrl.includes('sibnet.ru')) {
            return resolveSibnet(videoUrl);
        }
        
        return videoUrl;
    });
}

// Résoudre l'URL Sibnet
function resolveSibnet(sibnetUrl) {
    console.log('[Anime-Sama] Résolution Sibnet: ' + sibnetUrl);
    
    return fetch(sibnetUrl, {
        headers: { 'User-Agent': UA, 'Referer': BASE }
    })
    .then(function(res) { 
        if (!res.ok) throw new Error('Sibnet HTTP ' + res.status);
        return res.text(); 
    })
    .then(function(html) {
        // Chercher le token et l'ID dans le script
        var match = html.match(/src:\s*["']\/v\/([^\/]+)\/(\d+)\.mp4["']/);
        if (!match) throw new Error('Token non trouvé');
        
        var token = match[1];
        var id = match[2];
        var streamUrl = 'https://video.sibnet.ru/v/' + token + '/' + id + '.mp4';
        console.log('[Anime-Sama] Stream final: ' + streamUrl);
        
        return streamUrl;
    });
}

// Fonction principale
function getStreams(tmdbId, mediaType, season, episode, title) {
    console.log('[Anime-Sama] Démarrage: tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
    
    // Vérifier que c'est une série
    if (mediaType !== 'tv') {
        console.log('[Anime-Sama] Seules les séries sont supportées');
        return Promise.resolve([]);
    }
    
    var s = season || 1;
    var e = episode || 1;
    
    // Récupérer le titre (fourni ou via TMDB)
    var titlePromise = (title && title !== '') 
        ? Promise.resolve(title) 
        : getTitleFromTmdb(tmdbId, mediaType);
    
    return titlePromise
        .then(function(resolvedTitle) {
            var slug = getSlug(resolvedTitle);
            console.log('[Anime-Sama] Slug: ' + slug);
            
            // Essayer d'abord la VF
            return getStreamUrl(slug, s, e, 'vf')
                .catch(function(err) {
                    console.log('[Anime-Sama] VF échouée: ' + err.message);
                    // Fallback VOSTFR
                    return getStreamUrl(slug, s, e, 'vostfr');
                });
        })
        .then(function(streamUrl) {
            return [{
                name: 'Anime-Sama',
                title: 'S' + s + 'E' + e + ' - VF',
                url: streamUrl,
                quality: 'HD',
                format: 'mp4',
                headers: {
                    'User-Agent': UA,
                    'Referer': 'https://video.sibnet.ru/'
                }
            }];
        })
        .catch(function(err) {
            console.error('[Anime-Sama] Erreur finale: ' + err.message);
            return [];
        });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
