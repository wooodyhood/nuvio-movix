function getStreams(tmdbId, mediaType, season, episode, title) {
  return Promise.resolve([{
    name: 'AnimeSama TEST',
    title: 'TEST OK - titre recu: ' + String(title),
    url: 'https://s22.anime-sama.fr/videos/Konosuba/VF/Saison%201/Konosuba_S1_01_VF.mp4',
    quality: 'HD'
  }]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
