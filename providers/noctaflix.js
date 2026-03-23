const BASE_URL = 'https://noctaflix.lol';

async function getStreams(tmdbId, type, season, episode) {
    try {
        // 1. Récupération des infos TMDB
        const metaRes = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=c03975765c3459c5d18f7596056589f3&language=fr-FR`);
        const meta = await metaRes.json();
        const title = meta.title || meta.name;

        // 2. Utilisation de l'API AJAX interne (souvent moins protégée par Cloudflare)
        // On simule une requête de recherche dynamique
        const formData = new URLSearchParams();
        formData.append('action', 'dooplay_ajax_search');
        formData.append('keyword', title);
        formData.append('nonce', '69e006616e'); // Ce code peut changer, mais souvent il est statique pour les invités

        const searchRes = await fetch(`${BASE_URL}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': BASE_URL
            },
            body: formData.toString()
        });

        const searchData = await searchRes.json();
        
        // 3. On cherche le bon résultat dans la réponse JSON
        let pageUrl = "";
        if (searchData && searchData.length > 0) {
            // On cherche le résultat qui a le titre le plus proche
            const match = searchData.find(item => 
                item.title.toLowerCase().includes(title.toLowerCase()) || 
                item.url.includes(title.toLowerCase().replace(/ /g, '-'))
            );
            if (match) pageUrl = match.url;
            else pageUrl = searchData[0].url; // Par défaut le premier
        }

        // 4. Si pas de résultat AJAX, on tente de deviner l'URL (Fallback)
        if (!pageUrl) {
            const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
            pageUrl = `${BASE_URL}/${type === 'movie' ? 'movie' : 'series'}/${slug}`;
        }

        // 5. On récupère la page finale pour l'ID
        const pageRes = await fetch(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });
        const pageHtml = await pageRes.text();

        // 6. Extraction de l'ID (le 3610)
        const idMatch = pageHtml.match(/\?p=(\d+)/) || pageHtml.match(/postid-(\d+)/) || pageHtml.match(/var\s+post_id\s*=\s*"(\d+)"/);

        if (idMatch) {
            const postId = idMatch[1];
            
            // On renvoie l'iframe
            return [{
                name: "Noctaflix (Serveur Direct)",
                url: `${BASE_URL}/embed/${postId}`,
                type: "iframe",
                quality: "Multi-Qualité",
                headers: { "Referer": BASE_URL }
            }];
        }

        return [];
    } catch (e) {
        // En cas d'erreur totale, on tente une dernière chance : deviner l'ID n'est pas possible, 
        // mais on peut renvoyer un lien de recherche global
        return [];
    }
}

module.exports = { getStreams };
