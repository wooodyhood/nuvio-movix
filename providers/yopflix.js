var BASE = 'https://yopflix.my';
var TMDB = 'https://api.themoviedb.org/3';
var KEY = 'a9e49b08496469614f9d0e74b1219084';

function getStreams(tmdbId, mediaType, season, episode, title) {
    var type = (mediaType === 'tv') ? 'tv' : 'movie';
    
    return fetch(TMDB + '/' + type + '/' + tmdbId + '?api_key=' + KEY + '&language=fr-FR')
    .then(function(res) { return res.json(); })
    .then(function(movie) {
        var query = movie.title || movie.name;
        return fetch(BASE + '/api_search.php?q=' + encodeURIComponent(query));
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data.results || data.results.length === 0) return [];
        var id = data.results[0].id;
        var watchUrl = (type === 'tv') ? 
            BASE + '/series.php?id=' + id + '&season=' + season + '&ep=' + episode :
            BASE + '/watch.php?id=' + id;
            
        return fetch(watchUrl, { headers: { 'Referer': BASE + '/' } });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var iframeMatch = html.match(/src=["'](https?:\/\/vidzy\.[^"']+)["']/i);
        if (!iframeMatch) return [];

        return fetch(iframeMatch[1], {
            headers: {
                'Referer': BASE + '/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
            }
        });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // Extraction du bloc Packer 'p,a,c,k,e,d'
        var p = html.match(/\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split/);
        if (!p) return [];

        // Fonction unpack intégrée (la même que Vidzy)
        var unpacked = (function(p, a, c, k) {
            while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            return p;
        })(p[1], parseInt(p[2]), parseInt(p[3]), p[4].split('|'));

        // Extraction du lien avec son token complet (?t=...&s=...&e=...)
        var m3u8 = unpacked.match(/file:["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
        if (!m3u8) return [];

        return [{
            name: 'YopFlix (Vidzy)',
            url: m3u8[1],
            quality: 'HD',
            format: 'm3u8',
            headers: {
                'Referer': 'https://vidzy.live/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }];
    })
    .catch(function() { return []; });
}

if (typeof module !== 'undefined') module.exports = { getStreams };
