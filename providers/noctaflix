const BASE_URL = 'https://noctaflix.lol';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. Récupération du titre via TMDB
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;

        // 2. Recherche sur Noctaflix avec Headers de navigation
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });
        const searchHtml = await searchRes.text();

        // 3. Extraction du lien de la page
        const pageMatch = searchHtml.match(new RegExp(`href="(https://noctaflix.lol/(movie|series)/[^"]+)"[^>]*>${title}`, 'i'));
        if (!pageMatch) return [];
        let finalUrl = pageMatch[1];

        // 4. Gestion des épisodes pour les séries
        if (type === 'tv') {
            const seriesRes = await fetch(finalUrl);
            const seriesHtml = await seriesRes.text();
            const epRegex = new RegExp(`href="(https://noctaflix.lol/episodes/[^"]+-${season}x${episode}/)"`, 'i');
            const epMatch = seriesHtml.match(epRegex);
            if (epMatch) finalUrl = epMatch[1];
            else return [];
        }

        // 5. Extraction du fameux ID (ex: 3610)
        const pageContentRes = await fetch(finalUrl);
        const pageContentHtml = await pageContentRes.text();
        
        // On cherche l'ID dans plusieurs endroits possibles du code source
        const idMatch = pageContentHtml.match(/\?p=(\d+)/) || 
                        pageContentHtml.match(/postid-(\d+)/) || 
                        pageContentHtml.match(/var\s+post_id\s*=\s*"(\d+)"/);
        
        if (idMatch) {
            const postId = idMatch[1];
            const embedUrl = `${BASE_URL}/embed/${postId}`;

            // On renvoie le flux
            return [{
                name: "Noctaflix (Cloudflare Pass)",
                url: embedUrl,
                type: "iframe", // L'iframe aide à passer Cloudflare sur Android
                headers: {
                    "Referer": BASE_URL,
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
