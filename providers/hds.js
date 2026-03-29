// Provider HDS Quest pour Nuvio TV
// Supporte les films et séries sur on2.hds.quest

const HDSQuestProvider = {
    name: "HDS Quest",
    domain: "https://on2.hds.quest",
    apiUrl: "https://on2.hds.quest/wp-admin/admin-ajax.php",

    getContentType(url) {
        if (url.includes('/films/')) return { paramType: 'movie', category: 'film' };
        if (url.includes('/episodes/')) return { paramType: 'tv', category: 'episode' };
        if (url.includes('/series/')) return { paramType: 'tv', category: 'series' };
        return null;
    },

    async extractPostId(url) {
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
        
        if (url.includes('/series/')) {
            const episodeMatch = html.match(/\/episodes\/[^"'\s]+/);
            if (episodeMatch) {
                const episodeUrl = this.domain + episodeMatch[0];
                return this.extractPostId(episodeUrl);
            }
        }
        
        throw new Error("ID non trouvé");
    },

    async getEmbedUrl(postId, contentType) {
        const formData = new URLSearchParams();
        formData.append('action', 'doo_player_ajax');
        formData.append('post', postId);
        formData.append('nume', '1');
        formData.append('type', contentType.paramType);
        
        const response = await fetch(this.apiUrl, {
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
        
        if (contentType.paramType === 'movie') {
            formData.set('nume', '2');
            const response2 = await fetch(this.apiUrl, {
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
    },

    async getStreamUrl(videoUrl) {
        const contentType = this.getContentType(videoUrl);
        if (!contentType) throw new Error("URL non supportée");
        
        const postId = await this.extractPostId(videoUrl);
        const embedUrl = await this.getEmbedUrl(postId, contentType);
        
        return embedUrl;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HDSQuestProvider;
}
