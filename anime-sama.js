const axios = require('axios');

const JikanAPI = 'https://api.jikan.moe/v4/anime';
const AnimeSamaFR = 'https://anime-sama.fr';

function getAnimeInfo(animeId) {
    return axios.get(`${JikanAPI}/${animeId}`)
        .then(response => response.data)
        .catch(error => console.error('Error fetching anime info:', error));
}

function scrapeStreams(animeTitle) {
    return axios.get(`${AnimeSamaFR}/search?title=${encodeURIComponent(animeTitle)}`)
        .then(response => {
            // Dummy implementation for scraping streams
            // This would need real scraping logic with Cheerio / Puppeteer in a real scenario
            return response.data.streams || [];
        })
        .catch(error => console.error('Error scraping streams:', error));
}

function getAnimeStreams(animeId) {
    return getAnimeInfo(animeId)
        .then(animeInfo => {
            console.log('Anime Info:', animeInfo);
            return scrapeStreams(animeInfo.title);
        })
        .then(streams => {
            console.log('Streams:', streams);
            return streams;
        });
}

module.exports = { getAnimeStreams };