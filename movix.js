async function getStreams(item) {
    try {
        const title = item.title || item.name;
        const searchUrl = "https://movix.blog/search?q=" + encodeURIComponent(title);
        
        const response = await fetch(searchUrl);
        const html = await response.text();

        const match = html.match(/href="\/movie\/([^"]+)"/);
        if (!match) return [];

        const movieUrl = "https://movix.blog/movie/" + match[1];

        return [
            {
                name: "Movix VF",
                title: title + " [HD]",
                url: movieUrl,
                quality: "1080p",
                headers: { "Referer": "https://movix.blog/" }
            }
        ];
    } catch (e) {
        return [];
    }
}
 
