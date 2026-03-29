// Provider HDS pour Nuvio TV
// Site: on2.hds.quest
// Version: 1.1.0 - Fixed

const HDS_DOMAIN = 'https://on2.hds.quest';
const HDS_API = 'https://on2.hds.quest/wp-admin/admin-ajax.php';
const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = 'YOUR_TMDB_KEY'; // Remplace par ta clé TMDB si besoin

// Récupère le titre depuis TMDB à partir de l'ID
async function getTitleFromTmdb(tmdbId, mediaType) {
    const endpoint = mediaType === 'movie'
        ? `${TMDB_API}/movie/${tmdbId}?api_key=${TMDB_KEY}&language=fr-FR`
        : `${TMDB_API}/tv/${tmdbId}?api_key=${TMDB_KEY}&language=fr-FR`;

    const response = await fetch(endpoint);
    const data = await response.json();

    const title = data.title || data.name || data.original_title || data.original_name;
    const year = (data.release_date || data.first_air_date || '').slice(0, 4);
    return { title, year };
}

// Recherche le film/série sur HDS par titre
async function searchOnHDS(title) {
    const query = encodeURIComponent(title);
    const searchUrl = `${HDS_DOMAIN}/?s=${query}`;

    const response = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    const html = await response.text();

    // Extraire les liens de résultats
    const linkPattern = /href=["'](https:\/\/on2\.hds\.quest\/(?:films|series)\/[^"']+)["']/gi;
    const links = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        if (!links.includes(match[1])) links.push(match[1]);
    }

    return links;
}

// Extrait l'ID du post depuis la page
async function extractPostId(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': HDS_DOMAIN
        }
    });
    const html = await response.text();

    const patterns = [
        /data-post=["']?(\d+)/i,
        /postid["']?\s*:\s*["']?(\d+)/i,
        /post=(\d+)/i,
        /"post":(\d+)/i,
        /id="post-(\d+)"/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) return match[1];
    }

    throw new Error("ID non trouvé sur la page: " + url);
}

// Récupère l'URL embed via admin-ajax
async function getEmbedUrl(postId, type, season, episode) {
    const tryPlayer = async (nume) => {
        const formData = new URLSearchParams();
        formData.append('action', 'doo_player_ajax');
        formData.append('post', postId);
        formData.append('nume', String(nume));
        formData.append('type', type);

        // Pour les séries, ajouter saison et épisode
        if (type === 'tv' && season && episode) {
            formData.append('season', String(season));
            formData.append('episode', String(episode));
        }

        const response = await fetch(HDS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': HDS_DOMAIN,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: formData
        });

        const data = await response.json();
        return (data.embed_url && data.embed_url !== '') ? data.embed_url : null;
    };

    // Essayer player 1, puis 2, puis 3
    for (let i = 1; i <= 3; i++) {
        const url = await tryPlayer(i);
        if (url) return url;
    }

    throw new Error("Aucune source vidéo trouvée pour postId=" + postId);
}

// Fonction principale appelée par Nuvio TV
async function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[HDS] Recherche pour tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

    try {
        // 1. Récupérer le titre via TMDB
        let title, year;
        try {
            ({ title, year } = await getTitleFromTmdb(tmdbId, mediaType));
            console.log('[HDS] Titre TMDB:', title, year);
        } catch (e) {
            console.warn('[HDS] TMDB échoué, tmdbId utilisé directement');
            title = String(tmdbId);
            year = '';
        }

        // 2. Chercher sur HDS
        const links = await searchOnHDS(title);
        if (links.length === 0) {
            console.warn('[HDS] Aucun résultat pour:', title);
            return [];
        }

        console.log('[HDS] Liens trouvés:', links.length);

        // 3. Prendre le premier résultat pertinent
        const contentUrl = links[0];
        const postId = await extractPostId(contentUrl);
        console.log('[HDS] Post ID:', postId);

        // 4. Récupérer l'embed
        const type = mediaType === 'movie' ? 'movie' : 'tv';
        const embedUrl = await getEmbedUrl(postId, type, season, episode);
        console.log('[HDS] Embed URL:', embedUrl);

        return [{
            name: 'HDS',
            title: 'Streaming HDS',
            url: embedUrl,
            quality: 'HD',
            format: 'm3u8',
            headers: {
                'Referer': HDS_DOMAIN,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }];

    } catch (error) {
        console.error('[HDS] Erreur:', error.message);
        return [];
    }
}

// Export pour Nuvio TV
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
