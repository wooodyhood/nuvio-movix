const BASE_URL = 'https://noctaflix.lol';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. Récupérer les infos sur TMDB
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;
        
        console.log(`Recherche Noctaflix pour : ${title}`);

        // 2. Faire la recherche
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': BASE_URL
            }
        });
        
        const html = await response.text();

        // 3. Trouver le lien de la page (Plus flexible)
        // On cherche un lien qui contient "movie" ou "series" et qui semble être le bon
        const searchPattern = new RegExp(`href="(https://noctaflix.lol/(movie|series)/([^"]+))"`, 'gi');
        let match;
        let pageUrl = null;

        while ((match = searchPattern.exec(html)) !== null) {
            const slug = match[3].toLowerCase();
            const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
            // Si le titre est dans l'URL, c'est probablement le bon film
            if (slug.includes(cleanTitle.substring(0, 5))) { 
                pageUrl = match[1];
                break;
            }
        }

        // Si on n'a rien trouvé avec le titre, on prend le tout premier résultat de recherche
        if (!pageUrl) {
            const firstResult = html.match(/class="result-item".*?href="(https:\/\/noctaflix\.lol\/(movie|series)\/[^"]+)"/s);
            if (firstResult) pageUrl = firstResult[1];
        }

        if (!pageUrl) return [];

        // 4. Si c'est une série, on cherche l'épisode
        if (type === 'tv') {
            const seriesRes = await fetch(pageUrl);
            const seriesHtml = await seriesRes.text();
            const epRegex = new RegExp(`href="([^"]+-${season}x${episode}/)"`, 'i');
            const epMatch = seriesHtml.match(epRegex);
            if (epMatch) pageUrl = epMatch[1];
            else return [];
        }

        // 5. Trouver l'ID du post (le fameux 3610)
        const pageRes = await fetch(pageUrl);
        const pageHtml = await pageRes.text();
        
        // On cherche partout où l'ID pourrait être
        const idMatch = pageHtml.match(/\?p=(\d+)/) || 
                        pageHtml.match(/postid-(\d+)/) || 
                        pageHtml.match(/["']postid["']\s*:\s*(\d+)/) ||
                        pageHtml.match(/data-id=["'](\d+)["']/);

        if (idMatch) {
            const postId = idMatch[1];
            
            // On retourne le lien embed direct
            return [{
                name: "Noctaflix (Multi)",
                url: `${BASE_URL}/embed/${postId}`,
                type: "iframe",
                quality: "HD",
                headers: {
                    "Referer": pageUrl,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                }
            }];
        }

        return [];
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
