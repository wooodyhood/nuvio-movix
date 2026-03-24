// =============================================================
// Provider Nuvio : Anime-Sama (Sibnet only)
// =============================================================

var BASE = 'https://anime-sama.to';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getStreams(tmdbId, mediaType, season, episode, title) {
    console.log('[Anime-Sama] Démarrage', { tmdbId, mediaType, season, episode, title });
    
    if (mediaType !== 'tv') return Promise.resolve([]);
    if (!title || title === '') return Promise.resolve([]);
    
    var s = season || 1;
    var e = episode || 1;
    
    var slug = title.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    
    console.log('[Anime-Sama] Slug: ' + slug);
    
    // On utilise directement eps1 (Sibnet)
    var url = BASE + '/catalogue/' + slug + '/saison' + s + '/vf/episodes.js';
    console.log('[Anime-Sama] URL: ' + url);
    
    return fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': BASE }
    })
    .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
    })
    .then(function(js) {
        // Chercher le tableau eps1
        var match = js.match(/var\s+eps1\s*=\s*\[([\s\S]*?)\];/);
        if (!match) throw new Error('Tableau eps1 non trouvé');
        
        var urls = match[1].match(/['"]([^'"]+)['"]/g);
        if (!urls || urls.length < e) throw new Error('URL non trouvée pour épisode ' + e);
        
        var sibnetUrl = urls[e - 1].slice(1, -1);
        console.log('[Anime-Sama] Sibnet URL: ' + sibnetUrl);
        
        // Résoudre Sibnet
        return resolveSibnet(sibnetUrl, s, e);
    })
    .catch(function(err) {
        console.log('[Anime-Sama] Erreur: ' + err.message);
        return [];
    });
}

function resolveSibnet(sibnetUrl, season, episode) {
    return fetch(sibnetUrl, {
        headers: { 'User-Agent': UA, 'Referer': BASE }
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Sibnet HTTP ' + res.status);
        return res.text();
    })
    .then(function(html) {
        // Extraire le token et l'ID
        var match = html.match(/src:\s*["']\/v\/([^\/]+)\/(\d+)\.mp4["']/);
        if (!match) throw new Error('Token non trouvé');
        
        var token = match[1];
        var id = match[2];
        var streamUrl = 'https://video.sibnet.ru/v/' + token + '/' + id + '.mp4';
        console.log('[Anime-Sama] Stream final: ' + streamUrl);
        
        return [{
            name: 'Anime-Sama',
            title: 'S' + season + 'E' + episode + ' - VF',
            url: streamUrl,
            quality: 'HD',
            format: 'mp4',
            headers: {
                'User-Agent': UA,
                'Referer': 'https://video.sibnet.ru/'
            }
        }];
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
