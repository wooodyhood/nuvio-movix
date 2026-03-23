const BASE_URL = 'https://cinefuse.cc';
const API_URL = 'https://cinefuse.cc/api/v1';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. Récupération des infos TMDB
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;

        // 2. Recherche via l'API interne de Cinefuse
        const searchRes = await fetch(`${API_URL}/content?query=${encodeURIComponent(title)}&limit=10`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const searchData = await searchRes.json();
        
        // On cherche le résultat qui correspond le mieux au titre
        const item = searchData.find(d => d.title.toLowerCase().includes(title.toLowerCase())) || searchData[0];
        if (!item) return [];

        const slug = item.slug;

        // 3. Appel à l'API "video" (celle que tu as vue dans F12)
        // Pour une série, l'URL change un peu
        let videoApiUrl = `${API_URL}/content/${slug}/video`;
        if (type === 'tv') {
            videoApiUrl = `${API_URL}/content/${slug}/series/${season}/${episode}/video`;
        }

        const videoRes = await fetch(videoApiUrl, {
            headers: { 
                'Referer': `${BASE_URL}/watch/${slug}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const videoData = await videoRes.json();

        // 4. Extraction des serveurs
        const streams = [];
        
        // videoData devrait contenir une liste de serveurs (Voe, Vidmoly, etc.)
        if (videoData && Array.isArray(videoData)) {
            for (const server of videoData) {
                const url = server.url || server.link;
                const name = server.name || "Serveur";

                if (url.includes('voe.sx')) {
                    // Resolver pour Voe (Lien direct)
                    const voeRes = await fetch(url);
                    const voeHtml = await voeRes.text();
                    const m3u8Match = voeHtml.match(/'hls':\s*'([^']+)'/) || voeHtml.match(/"hls":\s*"([^"]+)"/);
                    if (m3u8Match) {
                        streams.push({
                            name: `Cinefuse - ${name} (Direct)`,
                            url: m3u8Match[1],
                            type: "direct",
                            quality: "1080p"
                        });
                    }
                } else {
                    // Autres serveurs en mode Iframe (fallback)
                    streams.push({
                        name: `Cinefuse - ${name}`,
                        url: url,
                        type: "iframe",
                        quality: "HD"
                    });
                }
            }
        }

        return streams;
    } catch (e) {
        console.error("Erreur Cinefuse:", e);
        return [];
    }
}

module.exports = { getStreams };
