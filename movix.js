// Plugin Movix pour Nuvio
const BASE_URL = 'https://movix.blog';
const TMDB_API = 'https://api.themoviedb.org/3';
const API_KEY = '8d6d91784c04f98f6e241852615c441b'; // Clé publique pour les infos de base

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // 1. Récupérer le titre du film/série en français
        const metaResp = await fetch(`${TMDB_API}/${mediaType}/${tmdbId}?api_key=${API_KEY}&language=fr-FR`);
        const meta = await metaResp.json();
        const title = meta.title || meta.name;
        const year = (meta.release_date || meta.first_air_date || '').split('-')[0];

        // 2. Chercher sur Movix
        const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(title)}`;
        const searchPage = await fetch(searchUrl);
        const html = await searchPage.text();

        // 3. Trouver le lien de la fiche film (on cherche l'ID Movix)
        const idMatch = html.match(new RegExp(`href="/movie/([^"]+)"[^>]*>.*?${title}`, 'i'));
        if (!idMatch) return [];

        const movixId = idMatch[1];
        const movieUrl = `${BASE_URL}/movie/${movixId}`;

        // 4. On prépare les sources (Nexus/Dragiv, Omega, Lynx)
        // Note : Dans un plugin Nuvio, on renvoie les URL des lecteurs
        // Nuvio s'occupe d'ouvrir l'iframe ou de résoudre le lien
        return [
            {
                name: "Movix - Nexus/Dragiv HD",
                title: `${title} (VF 1080p)`,
                url: movieUrl, // Le lecteur principal de la page
                quality: "1080p",
                headers: { "Referer": BASE_URL }
            },
            {
                name: "Movix - Source Omega",
                title: `${title} (VF HD)`,
                url: movieUrl + "?player=omega", 
                quality: "720p",
                headers: { "Referer": BASE_URL }
            }
        ];
    } catch (e) {
        console.error("Erreur Movix:", e);
        return [];
    }
}

module.exports = { getStreams };
