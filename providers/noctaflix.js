// =============================================================
// Provider Nuvio : Noctaflix (VF français)
// Version : 1.1.0 - Détection automatique du domaine via Telegram
// =============================================================
 
var NOCTAFLIX_DEFAULT = 'https://noctaflix.lol';
var NOCTAFLIX_TELEGRAM = 'https://t.me/s/noctaflix';
 
// Récupère le domaine actuel depuis la description du canal Telegram
function detectDomainFromTelegram() {
  return fetch(NOCTAFLIX_TELEGRAM, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // Chercher une URL noctaflix dans la description du canal
      var matches = html.match(/https?:\/\/noctaflix\.[a-z.]+/gi);
      if (!matches || matches.length === 0) return null;
      // Filtrer les liens Telegram eux-mêmes
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram');
      });
      if (domains.length === 0) return null;
      // Prendre le dernier domaine trouvé (le plus récent)
      return domains[domains.length - 1].replace(/\/$/, '');
    })
    .catch(function() { return null; });
}
 
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[àáâãä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
 
function getEmbedId(base, pageUrl) {
  return fetch(base + pageUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': base + '/'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var snapMatches = html.match(/wire:snapshot="([^"]+)"/g);
      if (!snapMatches) throw new Error('Pas de snapshot Livewire');
 
      for (var i = 0; i < snapMatches.length; i++) {
        var raw = snapMatches[i]
          .replace('wire:snapshot="', '')
          .replace(/"$/, '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'");
        try {
          var obj = JSON.parse(raw);
          if (obj.memo && obj.memo.name === 'watch-component') {
            var videos = obj.data && obj.data.videos;
            if (videos && videos[0] && videos[0][0] && videos[0][0][0] && videos[0][0][0].link) {
              var embedUrl = videos[0][0][0].link;
              var embedId = embedUrl.match(/embed\/(\d+)/);
              if (embedId) return embedId[1];
            }
          }
        } catch (e) {}
      }
      throw new Error('Embed ID non trouvé');
    });
}
 
function getStreamFromEmbed(base, embedId) {
  return fetch(base + '/embed/' + embedId, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': base + '/'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var encMatch = html.match(/id="encrypted-source" value="([^"]+)"/);
      if (!encMatch) throw new Error('encrypted-source non trouvé');
      var decoded = atob(encMatch[1]);
      if (!decoded || !decoded.startsWith('http')) throw new Error('URL invalide');
      return decoded;
    });
}
 
function tryGetStreams(base, pageUrl) {
  return getEmbedId(base, pageUrl)
    .then(function(embedId) {
      console.log('[Noctaflix] Embed ID: ' + embedId + ' sur ' + base);
      return getStreamFromEmbed(base, embedId);
    })
    .then(function(streamUrl) {
      var format = streamUrl.match(/\.m3u8/i) ? 'm3u8' : 'mp4';
      return [{
        name: 'Noctaflix',
        title: 'Noctaflix VF',
        url: streamUrl,
        quality: 'HD',
        format: format,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': base + '/'
        }
      }];
    });
}
 
function getStreams(tmdbId, mediaType, season, episode, title) {
  console.log('[Noctaflix] tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode + ' title=' + title);
 
  var slug = slugify(title || String(tmdbId));
  var pageUrl = mediaType === 'tv'
    ? '/episode/' + slug + '/' + (season || 1) + '-' + (episode || 1)
    : '/movie/' + slug;
 
  console.log('[Noctaflix] Page: ' + pageUrl);
 
  // Étape 1 : essayer avec le domaine par défaut
  return tryGetStreams(NOCTAFLIX_DEFAULT, pageUrl)
    .catch(function() {
      // Étape 2 : domaine par défaut en échec, récupérer le nouveau depuis Telegram
      console.log('[Noctaflix] Domaine par défaut en échec, tentative Telegram...');
      return detectDomainFromTelegram().then(function(newBase) {
        if (!newBase) throw new Error('Impossible de détecter le domaine');
        if (newBase === NOCTAFLIX_DEFAULT) throw new Error('Même domaine, toujours en échec');
        console.log('[Noctaflix] Nouveau domaine détecté: ' + newBase);
        return tryGetStreams(newBase, pageUrl);
      });
    })
    .catch(function(err) {
      console.error('[Noctaflix] Erreur globale: ' + (err.message || err));
      return [];
    });
}
 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
 
