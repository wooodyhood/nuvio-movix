function getStreams(tmdbId, mediaType, season, episode, title) {
  return Promise.resolve([{
    name: 'DEBUG',
    title: 'id=' + String(tmdbId) + ' type=' + String(mediaType) + ' s=' + String(season) + ' e=' + String(episode),
    url: 'https://s22.anime-sama.fr/videos/Konosuba/VF/Saison%201/Konosuba_S1_01_VF.mp4',
    quality: 'HD'
  }]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
