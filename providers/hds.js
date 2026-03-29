// Provider HDS pour Nuvio TV
// Site: on2.hds.quest
// Version: 1.0.0

const HDS_DOMAIN = 'https://on2.hds.quest';
const HDS_API = 'https://on2.hds.quest/wp-admin/admin-ajax.php';

// Extrait l'ID du post depuis la page
async function extractPostId(url) {
    const response = await fetch(url);
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
    
    throw new Error("ID non trouvé");
}

// Récupère l'URL embed via admin-ajax
async function getEmbedUrl(postId, type) {
    const formData = new URLSearchParams();
    formData.append('action', 'doo_player_ajax');
    formData.append('post', postId);
    formData.append('nume', '1');
    formData.append('type', type);
    
    const response = await fetch(HDS_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
    });
    
    const data = await response.json();
    
    if (data.embed_url && data.embed_url !== '') {
        return data.embed_url;
    }
    
    // Si player 1 ne fonctionne pas, essayer player 2 pour les films
    if (type === 'movie') {
        formData.set('nume', '2');
        const response2 = await fetch(HDS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData
        });
        const data2 = await response2.json();
        if (data2.embed_url && data2.embed_url !== '') {
            return data2.embed_url;
        }
    }
    
    throw new Error("Aucune source vidéo");
}

// Fonction principale appelée par Nuvio TV
async function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[HDS] Recherche pour tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);
    
    try {
        // Pour HDS, on a besoin de l'URL complète, pas juste du TMDB ID
        // Nuvio TV passe l'URL du contenu dans tmdbId ? Ou il faut construire l'URL ?
        // Alternative: on utilise le domaine + recherche par titre
        
        // Version simplifiée : on retourne une URL de test
        // À adapter selon comment Nuvio TV appelle le provider
        
        const url = HDS_DOMAIN + '/films/';  // À compléter
        
        const postId = await extractPostId(url);
        const type = mediaType === 'movie' ? 'movie' : 'tv';
        const embedUrl = await getEmbedUrl(postId, type);
        
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
