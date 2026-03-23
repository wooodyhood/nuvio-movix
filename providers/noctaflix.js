const BASE_URL = 'https://noctaflix.lol';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. Récupération titre TMDB
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;

        // 2. Recherche du slug sur Noctaflix
        const searchUrl = `${BASE_URL}/search/${encodeURIComponent(title)}`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const searchHtml = await searchRes.text();

        // On cherche le slug (ex: breaking-bad ou zootopie-2)
        const slugRegex = type === 'movie' ? /\/movie\/([a-z0-9-]+)/i : /\/(?:episode|serie)\/([a-z0-9-]+)/i;
        const slugMatch = searchHtml.match(slugRegex);
        if (!slugMatch) return [];
        const slug = slugMatch[1];

        // 3. Construction de l'URL de la page selon le type
        let pageUrl = "";
        if (type === 'movie') {
            pageUrl = `${BASE_URL}/movie/${slug}`;
        } else {
            // Format trouvé lors de ton Test 4
            pageUrl = `${BASE_URL}/episode/${slug}/${season}-${episode}`;
        }

        // 4. Extraction de l'ID d'embed (3121, 3610, etc.)
        const pageRes = await fetch(pageUrl, { headers: { 'Referer': BASE_URL } });
        const pageHtml = await pageRes.text();
        
        // On cherche le lien /embed/ avec un chiffre
        const embedIdMatch = pageHtml.match(/\/embed\/(\d+)/);
        if (!embedIdMatch) return [];
        const embedId = embedIdMatch[1];

        // 5. Extraction du lien vidéo final dans la page d'embed
        const embedUrl = `${BASE_URL}/embed/${embedId}`;
        const embedRes = await fetch(embedUrl, { headers: { 'Referer': pageUrl } });
        const embedHtml = await embedRes.text();

        // On cherche la source cryptée en Base64
        const encryptedSourceMatch = embedHtml.match(/id="encrypted-source" value="([^"]+)"/);
        
        if (encryptedSourceMatch) {
            const base64Url = encryptedSourceMatch[1];
            // Décodage du lien direct (ton test atob)
            const finalUrl = atob(base64Url);

            return [{
                name: "Noctaflix (Lien Direct 4K/HD)",
                url: finalUrl,
                type: "direct", // Pour que Nuvio utilise son propre lecteur
                quality: "Multi",
                headers: {
                    "Referer": "https://noctaflix.lol/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            }];
        }

        return [];
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
