function getStreams(tmdbId, mediaType, season, episode) {
  return fetch('https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=2696829a81b1b5827d515ff121700838')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return [{
        name: 'DEBUG TV',
        title: 'TMDB ok: ' + String(d.name) + ' S' + season + 'E' + episode,
        url: 'https://s22.anime-sama.fr/videos/Konosuba/VF/Saison%201/Konosuba_S1_01_VF.mp4',
        quality: 'HD'
      }];
    })
    .catch(function(e) {
      return [{
        name: 'DEBUG TV ERREUR',
        title: 'TMDB fail: ' + e.message,
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
