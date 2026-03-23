// =============================================================
// Provider Nuvio : Noctaflix (VF français)
// Version : 2.0.0 - Recherche Livewire + détection domaine Telegram
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
      var matches = html.match(/https?:\/\/noctaflix\.[a-z.]+/gi);
      if (!matches || matches.length === 0) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram');
      });
      if (domains.length === 0) return null;
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
 
// Recherche le slug exact via Livewire en matchant le titre
function findSlugByTitle(base, title, mediaType) {
  var searchQuery = title;
 
  return fetch(base + '/', {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': base + '/'
    }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var tokenMatch = html.match(/meta name="csrf-token" content="([^"]+)"/);
      if (!tokenMatch) throw new Error('CSRF token non trouvé');
      var token = tokenMatch[1];
 
      var snapMatches = html.match(/wire:snapshot="([^"]+)"/g);
      if (!snapMatches) throw new Error('Pas de snapshot');
 
      var searchSnap = null;
      snapMatches.forEach(function(s) {
        var raw = s.replace('wire:snapshot="', '').replace(/"$/, '').replace(/&quot;/g, '"');
        try {
          var obj = JSON.parse(raw);
          if (obj.memo && obj.memo.name === 'search-component') searchSnap = raw;
        } catch (e) {}
      });
      if (!searchSnap) throw new Error('search-component non trouvé');
 
      return fetch(base + '/livewire/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': token,
          'Referer': base + '/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          _token: token,
          components: [{ snapshot: searchSnap, updates: { q: searchQuery }, calls: [] }]
        })
      });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var html = data.components[0].effects.html;
 
      // Extraire tous les résultats : slug + titre (alt)
      var pattern = /href="[^"]+\/(movie|tv-show)\/([a-z0-9-]+)"[\s\S]{0,500}?alt="([^"]+)"/g;
      var match;
      var results = [];
      while ((match = pattern.exec(html)) !== null) {
        results.push({ type: match[1], slug: match[2], altTitle: match[3] });
      }
 
      if (results.length === 0) throw new Error('Aucun résultat de recherche');
 
      // Chercher le résultat dont le titre correspond exactement
      var titleLower = title.toLowerCase().trim();
      var exact = results.find(function(r) {
        return r.altTitle.toLowerCase().trim() === titleLower;
      });
 
      // Sinon prendre le premier résultat
      var best = exact || results[0];
      console.log('[Noctaflix] Slug trouvé: ' + best.slug + ' pour "' + title + '"');
      return best;
    });
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
 
function tryGetStreams(base, tmdbId, mediaType, season, episode, title) {
  // Étape 1 : trouver le slug via la recherche Livewire
  return findSlugByTitle(base, title, mediaType)
    .then(function(result) {
      var pageUrl;
      if (mediaType === 'tv') {
        pageUrl = '/episode/' + result.slug + '/' + (season || 1) + '-' + (episode || 1);
      } else {
        pageUrl = '/movie/' + result.slug;
      }
      console.log('[Noctaflix] Page URL: ' + pageUrl);
      return getEmbedId(base, pageUrl);
    })
    .then(function(embedId) {
      console.log('[Noctaflix] Embed ID: ' + embedId);
      return getStreamFromEmbed(base, embedId);
    })
    .then(function(streamUrl) {
      console.log('[Noctaflix] Stream: ' + streamUrl);
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
 
  // Si pas de titre, on ne peut pas chercher
  if (!title || title === '') {
    console.error('[Noctaflix] Titre manquant, impossible de chercher');
    return Promise.resolve([]);
  }
 
  // Étape 1 : essayer avec le domaine par défaut
  return tryGetStreams(NOCTAFLIX_DEFAULT, tmdbId, mediaType, season, episode, title)
    .catch(function(err) {
      // Étape 2 : domaine par défaut en échec, récupérer le nouveau depuis Telegram
      console.log('[Noctaflix] Domaine par défaut en échec (' + err.message + '), tentative Telegram...');
      return detectDomainFromTelegram().then(function(newBase) {
        if (!newBase) throw new Error('Impossible de détecter le domaine');
        if (newBase === NOCTAFLIX_DEFAULT) throw new Error('Même domaine, toujours en échec');
        console.log('[Noctaflix] Nouveau domaine: ' + newBase);
        return tryGetStreams(newBase, tmdbId, mediaType, season, episode, title);
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
 
