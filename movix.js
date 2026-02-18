async function getStreams(tmdbId) {
    try {
        // 1. Récupérer le titre via TMDB
        const apiUrl = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=8d6d91784c04f98f6e241852615c441b&language=fr-FR";
        const meta = await fetch(apiUrl).then(r => r.json());
        const title = meta.title;
        
        // 2. Chercher sur Movix
        const searchUrl = "https://movix.blog/search?q=" + encodeURIComponent(title);
        const response = await fetch(searchUrl);
        const html = await response.text();

        // 3. Extraire l'ID Movix (ex: /movie/11q8Ls...)
        const match = html.match(/href="\/movie\/([^"]+)"/);
        if (!match) return [];

        const movieUrl = "https://movix.blog/movie/" + match[1];

        return [
            {
                name: "Movix - Streaming HD",
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

export default { getStreams };
 
