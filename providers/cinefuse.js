const BASE_URL = 'https://cinefuse.cc';
const API_URL = 'https://cinefuse.cc/api/v1';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. On récupère le titre propre via TMDB (pour éviter les erreurs de frappe)
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;

        // 2. Recherche sur l'API Cinefuse (la ligne "content" que tu as vue)
        const searchUrl = `${API_URL}/content?query=${encodeURIComponent(title)}&limit=5`;
        const searchRes = await fetch(searchUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': BASE_URL
            }
        });
        const searchData = await searchRes.json();

        // On prend le premier résultat qui correspond au titre
        if (!searchData || searchData.length === 0) return [];
        const content = searchData[0];
        const slug = content.slug;

        // 3. Récupération des serveurs vidéo (la ligne "video" que tu as vue)
        let videoApiUrl = `${API_URL}/content/${slug}/video`;
        
        // Si c'est une série, l'URL de l'API change légèrement pour cibler l'épisode
        if (type === 'tv') {
            videoApiUrl = `${API_URL}/content/${slug}/series/${season}/${episode}/video`;
        }

        const videoRes = await fetch(videoApiUrl, {
            headers: { 
                'Referer': `${BASE_URL}/watch/${slug}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        
        const videoData = await videoRes.json();
        const streams = [];

        // 4. On boucle sur les serveurs trouvés (Voe, Vidmoly, etc.)
        if (videoData && Array.isArray(videoData)) {
            for (const server of videoData) {
                const videoUrl = server.url || server.link;
                const serverName = server.name || "Serveur";

                // Si c'est du VOE, on extrait le lien direct pour éviter les erreurs de lecteur
                if (videoUrl.includes('voe.sx')) {
                    const voeRes = await fetch(videoUrl);
                    const voeHtml = await voeRes.text();
                    const m3u8Match = voeHtml.match(/'hls':\s*'([^']+)'/) || voeHtml.match(/"hls":\s*"([^"]+)"/);
                    
                    if (m3u8Match) {
                        streams.push({
                            name: `Cinefuse - ${serverName} (Direct)`,
                            url: m3u8Match[1],
                            type: "direct",
                            quality: "1080p"
                        });
                        continue; // On passe au serveur suivant
                    }
                }

                // Pour les autres serveurs (ou si Voe direct échoue), on met l'iframe
                streams.push({
                    name: `Cinefuse - ${serverName}`,
                    url: videoUrl,
                    type: "iframe",
                    quality: "HD"
                });
            }
        }

        return streams;

    } catch (e) {
        console.error("Erreur Cinefuse:", e);
        return [];
    }
}

module.exports = { getStreams };
