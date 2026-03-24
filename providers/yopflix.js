var YOPFLIX_BASE = 'https://yopflix.my';
var TMDB_KEY = 'a9e49b08496469614f9d0e74b1219084';

function unpack(p, a, c, k, e, d) {
    while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    return p;
}

function getStreams(tmdbId, mediaType, season, episode, title) {
    // 1. Obtenir le titre via TMDB
    var urlMetadata = 'https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=fr-FR';
    
    return fetch(urlMetadata)
        .then(function(r) { return r.json(); })
        .then(function(metadata) {
            var name = metadata.title || metadata.name;
            // 2. Chercher sur l'API de YopFlix
            return fetch(YOPFLIX_BASE + '/api_search.php?q=' + encodeURIComponent(name));
        })
        .then(function(r) { return r.json(); })
        .then(function(searchData) {
            if (!searchData.results || searchData.results.length === 0) return [];
            var id = searchData.results[0].id;
            
            // 3. Aller sur la page de lecture
            var watchUrl = (mediaType === 'tv') ? 
                YOPFLIX_BASE + '/series.php?id=' + id + '&season=' + season + '&ep=' + episode :
                YOPFLIX_BASE + '/watch.php?id=' + id;
                
            return fetch(watchUrl);
        })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            // 4. Trouver l'iframe Vidzy
            var vidzyMatch = html.match(/src=["'](https?:\/\/vidzy\.[^"']+)["']/i);
            if (!vidzyMatch) return [];

            return fetch(vidzyMatch[1], { headers: { 'Referer': YOPFLIX_BASE + '/' } });
        })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            // 5. Décoder le lien vidéo
            var packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/i);
            if (!packerMatch) return [];

            // On extrait les arguments du packer pour les envoyer à notre fonction unpack
            var args = packerMatch[0].match(/\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split/);
            if (!args) return [];

            var unzipped = unpack(args[1], parseInt(args[2]), parseInt(args[3]), args[4].split('|'));
            var finalMatch = unzipped.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
            
            if (!finalMatch) return [];

            return [{
                name: 'YopFlix (Vidzy)',
                url: finalMatch[0],
                quality: 'HD',
                format: 'm3u8',
                headers: { 'Referer': 'https://vidzy.live/', 'User-Agent': 'Mozilla/5.0' }
            }];
        })
        .catch(function() { return []; });
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { getStreams }; }
