var BASE = 'https://yopflix.my';
var TMDB = 'https://api.themoviedb.org/3';
var KEY = 'a9e49b08496469614f9d0e74b1219084';

// Décodeur universel (Packer) validé en console
function unpack(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p;}

function getStreams(tmdbId, mediaType, season, episode, title) {
    var type = (mediaType === 'tv') ? 'tv' : 'movie';
    
    // 1. Recherche du titre via TMDB
    return fetch(TMDB + '/' + type + '/' + tmdbId + '?api_key=' + KEY + '&language=fr-FR')
    .then(function(r) { return r.json(); })
    .then(function(m) {
        var q = m.title || m.name;
        // 2. Appel à l'API YopFlix (validé Status 200)
        return fetch(BASE + '/api_search.php?q=' + encodeURIComponent(q));
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data.results || !data.results[0]) return [];
        var id = data.results[0].id;
        
        // 3. Construction de l'URL de la page (Film ou Série)
        var watchUrl = (type === 'tv') ? 
            BASE + '/series.php?id=' + id + '&season=' + season + '&ep=' + episode :
            BASE + '/watch.php?id=' + id;
        
        return fetch(watchUrl, { headers: { 'Referer': BASE + '/' } });
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        // 4. Capture de l'iframe Vidzy (Structure HTML validée)
        var frame = html.match(/src=["'](https?:\/\/vidzy\.[^"']+)["']/i);
        if (!frame) return [];

        // 5. Bypass du 403 Forbidden (Headers extraits de ta console Brave/Chrome)
        return fetch(frame[1], { 
            headers: { 
                'Referer': BASE + '/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Sec-Fetch-Dest': 'iframe',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site'
            } 
        });
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        // 6. Extraction et décodage du Packer (validé "CHAT GAGNÉ")
        var p = html.match(/\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split/);
        if (!p) return [];

        var decoded = unpack(p[1], parseInt(p[2]), parseInt(p[3]), p[4].split('|'));
        
        // 7. Extraction du lien .m3u8 avec ses jetons (?t=...&s=...)
        var m3u8 = decoded.match(/https?:\/\/[^"']+\.m3u8[^"']*/i);
        if (!m3u8) return [];

        return [{
            name: 'YopFlix (Vidzy)',
            url: m3u8[0],
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
