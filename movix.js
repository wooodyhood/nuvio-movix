async function getStreams(item) {
    try {
        // item.title est fourni directement par Nuvio
        const query = encodeURIComponent(item.title);
        const searchUrl = "https://movix.blog/search?q=" + query;
        
        const response = await fetch(searchUrl);
        const text = await response.text();

        // On cherche le premier lien de film dans la page de recherche
        const match = text.match(/href="\/movie\/([^"]+)"/);
        if (!match) return [];

        const movieUrl = "https://movix.blog/movie/" + match[1];

        return [
            {
                name: "Movix HD",
                title: item.title + " [VF]",
                url: movieUrl,
                quality: "1080p"
            }
        ];
    } catch (e) {
        return [];
    }
}

export default { getStreams };
 
