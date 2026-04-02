function getStreams(tmdbId, mediaType, season, episode, title) {
  var AS_BASE = 'https://anime-sama.to';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  // Étape 1 : recherche slug
  return fetch(AS_BASE + '/template-php/defaut/fetch.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': UA,
      'Referer': AS_BASE + '/'
    },
    body: 'query=' + encodeURIComponent(title || '')
  })
  .then(function(r) { return r.text(); })
  .then(function(html) {
    var m = /href=["']https?:\/\/anime-sama\.to\/catalogue\/([a-z0-9_-]+)\/["']/i.exec(html);
    var slug = m ? m[1] : null;

    // Retourne un stream de debug pour voir où on en est
    return [{
      name: 'DEBUG',
      title: 'slug=' + slug + ' title=' + title,
      url: 'https://s22.anime-sama.fr/videos/Konosuba/VF/Saison%201/Konosuba_S1_01_VF.mp4',
      quality: 'HD'
    }];
  })
  .catch(function(e) {
    return [{
      name: 'DEBUG ERREUR',
      title: 'Erreur fetch.php: ' + e.message,
      url: 'https://s22.anime-sama.fr/videos/Konosuba/VF/Saison%201/Konosuba_S1_01_VF.mp4',
      quality: 'HD'
    }];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
