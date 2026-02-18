async function getStreams(tmdbId) {
    try {
        // 1. On récupère le titre via l'API de Nuvio
        const meta = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=8d6d91784c04f98f6e241852615c441b&language=fr-FR`).then(r => r.json());
        const title = meta.title;
        
        // 2. Recherche sur Movix
        const searchUrl = `https://movix.blog/search?q=${encodeURIComponent(title)}`;
        const response = await fetch(searchUrl);
        const html = await response.text();

        // 3. Extraction de l'ID Movix dans le code
        const match = html.match(/href="\/movie\/([^"]+)"/);
        if (!match) return [];

        const movieUrl = `https://movix.blog/movie/${match[1]}`;

        // 4. Renvoi des sources vers Nuvio
        return [
            {
                name: "Movix - Nexus/Dragiv HD",
                title: title + " [VF]",
                url: movieUrl,
                quality: "1080p",
                headers: { "Referer": "https://movix.blog/" }
            }
        ];
    } catch (e) {
        return [];
    }
}

// Pour Nuvio
export default { getStreams };
