const BASE_URL = 'https://cinefuse.cc';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. Récupération titre TMDB
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;

        // 2. Recherche via l'API (qui fonctionnait dans tes logs)
        const searchUrl = `${BASE_URL}/api/v1/content?query=${encodeURIComponent(title)}&limit=10`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const searchData = await searchRes.json();

        if (!searchData || searchData.length === 0) return [];
        
        // On cherche le meilleur match
        const item = searchData.find(d => d.title.toLowerCase().includes(title.toLowerCase())) || searchData[0];
        const slug = item.slug;
        const contentType = (type === 'movie') ? 'movie' : 'tv';

        // 3. Aller sur la page de lecture pour extraire les serveurs
        // URL format: https://cinefuse.cc/watch/movie/slug ou /watch/tv/slug
        const watchUrl = `${BASE_URL}/watch/${contentType}/${slug}`;
        const watchRes = await fetch(watchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await watchRes.text();

        // 4. Extraction des liens vidéo
        // Cinefuse cache les liens dans un objet JSON appelé __NEXT_DATA__
        const streams = [];
        
        // On cherche les serveurs dans l'API video (plus fiable si la page watch est protégée)
        let videoUrl = `${BASE_URL}/api/v1/content/${slug}/video`;
        if (type === 'tv') {
            videoUrl = `${BASE_URL}/api/v1/content/${slug}/series/${season}/${episode}/video`;
        }

        const videoRes = await fetch(videoUrl, {
            headers: { 
                'Referer': watchUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const videoData = await videoRes.json();

        if (videoData && Array.isArray(videoData)) {
            for (const server of videoData) {
                const sUrl = server.url || server.link;
                const sName = server.name || "Serveur";

                if (sUrl.includes('voe.sx')) {
                    // RESOLVER VOE (Direct link)
                    const voeRes = await fetch(sUrl);
                    const voeHtml = await voeRes.text();
                    const m3u8 = voeHtml.match(/'hls':\s*'([^']+)'/) || voeHtml.match(/"hls":\s*"([^"]+)"/);
                    if (m3u8) {
                        streams.push({
                            name: `Cinefuse - ${sName} (Direct)`,
                            url: m3u8[1],
                            type: "direct",
                            quality: "1080p"
                        });
                    }
                } else {
                    streams.push({
                        name: `Cinefuse - ${sName}`,
                        url: sUrl,
                        type: "iframe",
                        quality: "HD"
                    });
                }
            }
        }

        // Si l'API video n'a rien donné, on tente de scraper les iframes dans le HTML
        if (streams.length === 0) {
            const iframes = html.match(/src="(https:\/\/(?:voe\.sx|vidmoly\.to)\/[^"]+)"/g);
            iframes?.forEach(ifrm => {
                const url = ifrm.match(/src="([^"]+)"/)[1];
                streams.push({
                    name: "Cinefuse - Serveur Externe",
                    url: url,
                    type: "iframe"
                });
            });
        }

        return streams;
    } catch (e) {
        return [];
    }
}

module.exports = { getStreams };
