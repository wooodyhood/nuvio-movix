async function getStreams({ id }) {
    try {
        // 1. Appel TMDB pour avoir le titre propre
        const tmdbUrl = "https://api.themoviedb.org/3/movie/" + id + "?api_key=8d6d91784c04f98f6e241852615c441b&language=fr-FR";
        const meta = await fetch(tmdbUrl).then(res => res.json());
        const movieTitle = meta.title;
        
        // 2. Recherche sur Movix.blog
        const searchUrl = "https://movix.blog/search?q=" + encodeURIComponent(movieTitle);
        const searchRes = await fetch(searchUrl);
        const html = await searchRes.text();

        // 3. Extraction du lien de la fiche film
        const match = html.match(/href="\/movie\/([^"]+)"/);
        if (!match) return [];

        const movieUrl = "https://movix.blog/movie/" + match[1];

        // 4. Renvoi du lien vers le lecteur Nexus/Dragiv
        return [
            {
                name: "Movix - Nexus/Dragiv HD",
                title: movieTitle + " [VF]",
                url: movieUrl,
                quality: "1080p",
                headers: { 
                    "Referer": "https://movix.blog/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            }
        ];
    } catch (error) {
        return [];
    }
}

export default { getStreams };
 
