const axios = require('axios');

const TMDB_API_KEY = 'YOUR_TMDB_API_KEY';
const ANIME_SAMA_URL = 'https://anime-sama.fr';

function getAnimeTitles(query) {
    return axios.get(`${ANIME_SAMA_URL}/search`, { params: { q: query } })
        .then(response => {
            const titles = response.data.results.map(anime => anime.title);
            return titles;
        });
}

function fetchAnimeFromTMDB(title) {
    return axios.get(`https://api.themoviedb.org/3/search/anime?api_key=${TMDB_API_KEY}&query=${title}`)
        .then(response => {
            return response.data.results;
        });
}

function scrapeAnimeSama(query) {
    return getAnimeTitles(query)
        .then(titles => {
            const promises = titles.map(title => fetchAnimeFromTMDB(title));
            return Promise.all(promises);
        })
        .then(animeData => {
            return animeData.flat();  // Flatten the array of results
        });
}

module.exports = { scrapeAnimeSama };