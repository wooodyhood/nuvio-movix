// =============================================================
// Provider Nuvio : ToFlix (VF français) - Version série améliorée
// Support Node Sources avec zeus.php HLS
// =============================================================

var TOFLIX_API = 'https://api.toflix.space/toflix_api.php';
var TOFLIX_REFERER = 'https://toflix.space/';
var TOFLIX_TOKEN = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
var TELEGRAM_CHANNEL = 'https://t.me/s/toflixofficiel';
var TOFLIX_MOM = 'https://toflix.mom/';

function log(msg, data) {
    console.log('[ToFlix] ' + msg + (data ? ': ' + JSON.stringify(data) : ''));
}

function detectFromTelegram() {
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/toflix\.[a-z]+/gi);
      if (!matches) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('telegram') && !url.includes('mom');
      });
      if (domains.length === 0) return null;
      var lastDomain = domains[domains.length - 1];
      var domainMatch = lastDomain.match(/^(https?:\/\/[^\/\s]+)/);
      if (!domainMatch) return null;
      var frontend = domainMatch[1];
      var api = frontend.replace(/^(https?:\/\/)toflix\./, '$1api.toflix.') + '/toflix_api.php';
      return { api: api, referer: frontend + '/' };
    })
    .catch(function() { return null; });
}

function detectFromMom() {
  return fetch(TOFLIX_MOM, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/toflix\.[a-z]+/gi);
      if (!matches) return null;
      var domains = matches.filter(function(url) {
        return !url.includes('mom') && !url.includes('t.me') && !url.includes('telegram');
      });
      if (domains.length === 0) return null;
      var lastDomain = domains[domains.length - 1];
      var domainMatch = lastDomain.match(/^(https?:\/\/[^\/\s]+)/);
      if (!domainMatch) return null;
      var frontend = domainMatch[1];
      var api = frontend.replace(/^(https?:\/\/)toflix\./, '$1api.toflix.') + '/toflix_api.php';
      return { api: api, referer: frontend + '/' };
    })
    .catch(function() { return null; });
}

function callApi(apiUrl, referer, body) {
  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'tfxtoken': TOFLIX_TOKEN,
      'Origin': referer.replace(/\/$/, ''),
      'Referer': referer
    },
    body: JSON.stringify(body)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
}

// =============================================================
// FILMS
// =============================================================

function fetchMovie(apiUrl, referer, tmdbId) {
  return callApi(apiUrl, referer, { api: 'fastflux', endpoint: 'movie', tmdb_id: String(tmdbId) })
    .then(function(data) {
      if (!data || !data.success || !data.source_url) throw new Error('Film non disponible');
      return [{
        name: 'ToFlix',
        title: (data.title || 'ToFlix') + ' - VF',
        url: data.source_url,
        quality: 'HD',
        format: data.source && data.source.type === 'm3u8' ? 'm3u8' : 'mp4',
        headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }];
    });
}

// =============================================================
// SÉRIES - Nouvelle approche avec lecteurs
// =============================================================

function getSeriesId(apiUrl, referer, tmdbId) {
  return callApi(apiUrl, referer, { api: 'fastflux', endpoint: 'series', tmdb_id: String(tmdbId), page: 1 })
    .then(function(data) {
      if (!data || !data.success || !data.results || data.results.length === 0) {
        throw new Error('Série non trouvée');
      }
      for (var i = 0; i < data.results.length; i++) {
        if (String(data.results[i].tmdb_id) === String(tmdbId)) {
          return data.results[i].id;
        }
      }
      throw new Error('Série TMDB ID ' + tmdbId + ' non trouvée');
    });
}

// Récupérer les lecteurs d'un épisode
function getEpisodePlayers(apiUrl, referer, seriesId, tmdbId, season, episode) {
  log('Récupération lecteurs', { seriesId, season, episode });
  
  // Essayer différentes variantes d'API
  var attempts = [
    { api: 'players', series_id: seriesId, tmdb_id: String(tmdbId), season: season, episode: episode },
    { api: 'get_players', series_id: seriesId, tmdb_id: String(tmdbId), season: season, episode: episode },
    { api: 'fastflux', endpoint: 'players', series_id: seriesId, tmdb_id: String(tmdbId), season: season, episode: episode },
    { api: 'episode_players', series_id: seriesId, season: season, episode: episode }
  ];
  
  function tryAttempt(index) {
    if (index >= attempts.length) {
      throw new Error('Aucune API players ne fonctionne');
    }
    
    return callApi(apiUrl, referer, attempts[index])
      .then(function(data) {
        log('API players réussite', { variant: index, data: data });
        
        // Détecter la structure de la réponse
        var players = data.players || data.data || data.sources || data.results;
        if (!players || players.length === 0) {
          throw new Error('Réponse vide');
        }
        return players;
      })
      .catch(function(err) {
        log('Tentative ' + index + ' échouée', err.message);
        return tryAttempt(index + 1);
      });
  }
  
  return tryAttempt(0);
}

// Parser la page de l'épisode pour extraire les lecteurs
function scrapeEpisodePage(frontend, tmdbId, season, episode) {
  var url = frontend + '/serie/' + tmdbId + '/s' + season + '/e' + episode;
  log('Scraping page épisode', url);
  
  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': frontend
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      var players = [];
      
      // Chercher les lecteurs dans le HTML
      // Pattern pour Node Source avec zeus.php
      var zeusPattern = /data-src=["']([^"']*zeus\.php[^"']*)["'][^>]*>([^<]*Node Source[^<]*)</gi;
      var match;
      
      while ((match = zeusPattern.exec(html)) !== null) {
        var url = match[1];
        var name = match[2].trim();
        
        if (url.startsWith('/')) url = frontend + url;
        if (url.startsWith('//')) url = 'https:' + url;
        
        var lang = 'VF';
        if (name.toLowerCase().includes('vostfr')) lang = 'VOSTFR';
        
        players.push({
          name: name,
          url: url,
          lang: lang,
          type: 'zeus'
        });
      }
      
      // Pattern alternatif pour iframe players
      var iframePattern = /data-src=["']([^"']+)["'][^>]*class=["'][^"']*player[^"']*["'][^>]*>([^<]+)</gi;
      while ((match = iframePattern.exec(html)) !== null) {
        var url2 = match[1];
        var name2 = match[2].trim();
        
        if (url2.startsWith('/')) url2 = frontend + url2;
        if (url2.startsWith('//')) url2 = 'https:' + url2;
        
        if (!url2.includes('zeus.php')) {
          players.push({
            name: name2,
            url: url2,
            lang: 'VF',
            type: 'iframe'
          });
        }
      }
      
      log('Lecteurs scrapés', players);
      return players;
    });
}

// Extraire le M3U8 master depuis zeus.php
function getZeusM3U8(zeusUrl, referer) {
  log('Extraction M3U8 depuis zeus', zeusUrl);
  
  return fetch(zeusUrl, {
    method: 'GET',
    headers: {
      'Referer': referer,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(html) {
      // Pattern pour trouver le M3U8 master
      var patterns = [
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /source[^>]+src=["']([^"']+\.m3u8[^"']*)["']/i,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)["']/i,
        /sources\s*:\s*\[{[^}]*file\s*:\s*["']([^"']+)["']/i
      ];
      
      for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match) {
          var url = match[1];
          if (url.startsWith('//')) url = 'https:' + url;
          if (url.startsWith('http') && url.includes('.m3u8')) {
            log('M3U8 master trouvé', url);
            return url;
          }
        }
      }
      
      // Si aucun M3U8 master trouvé, retourner l'URL zeus directement
      // Le player HLS gérera les segments
      log('Pas de M3U8 master, utilisation directe de zeus.php');
      return zeusUrl;
    });
}

// Convertir les lecteurs en streams
function playersToStreams(players, referer, season, episode) {
  var streams = [];
  
  for (var i = 0; i < players.length; i++) {
    var player = players[i];
    
    if (player.type === 'zeus' || (player.url && player.url.includes('zeus.php'))) {
      streams.push({
        name: 'ToFlix',
        title: player.name + ' - S' + season + 'E' + episode,
        url: player.url,
        quality: 'HD',
        format: 'zeus',
        lang: player.lang || 'VF',
        needsResolve: true,
        headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
    } else if (player.url) {
      streams.push({
        name: 'ToFlix',
        title: player.name + ' - S' + season + 'E' + episode,
        url: player.url,
        quality: 'HD',
        format: player.url.includes('.m3u8') ? 'm3u8' : 'iframe',
        lang: player.lang || 'VF',
        needsResolve: false,
        headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
    }
  }
  
  return streams;
}

// Résoudre les streams zeus.php
function resolveStreams(streams, referer) {
  return Promise.all(streams.map(function(stream) {
    if (!stream.needsResolve) {
      return Promise.resolve(stream);
    }
    
    return getZeusM3U8(stream.url, referer)
      .then(function(m3u8Url) {
        return {
          name: stream.name,
          title: stream.title,
          url: m3u8Url,
          quality: stream.quality,
          format: 'm3u8',
          lang: stream.lang,
          headers: stream.headers
        };
      })
      .catch(function(err) {
        log('Erreur résolution zeus', err.message);
        // En cas d'échec, retourner l'URL zeus directement
        return {
          name: stream.name,
          title: stream.title,
          url: stream.url,
          quality: stream.quality,
          format: 'm3u8',
          lang: stream.lang,
          headers: stream.headers
        };
      });
  }));
}

// Méthode avec API players
function fetchSeriesWithPlayers(apiUrl, referer, tmdbId, season, episode) {
  return getSeriesId(apiUrl, referer, tmdbId)
    .then(function(seriesId) {
      return getEpisodePlayers(apiUrl, referer, seriesId, tmdbId, season, episode);
    })
    .then(function(players) {
      var streams = playersToStreams(players, referer, season, episode);
      return resolveStreams(streams, referer);
    });
}

// Méthode avec scraping de la page
function fetchSeriesWithScraping(frontend, referer, tmdbId, season, episode) {
  return scrapeEpisodePage(frontend, tmdbId, season, episode)
    .then(function(players) {
      var streams = playersToStreams(players, referer, season, episode);
      return resolveStreams(streams, referer);
    });
}

// Fallback: ancienne méthode episodes
function fetchSeriesLegacy(apiUrl, referer, tmdbId, season, episode) {
  return getSeriesId(apiUrl, referer, tmdbId)
    .then(function(seriesId) {
      return callApi(apiUrl, referer, { 
        api: 'episodes', 
        series_id: seriesId, 
        tmdb_id: String(tmdbId), 
        season: season 
      });
    })
    .then(function(data) {
      if (!data || !data.episodes || data.episodes.length === 0) {
        throw new Error('Aucun épisode');
      }
      
      for (var i = 0; i < data.episodes.length; i++) {
        var ep = data.episodes[i];
        if (ep.episode === episode || ep.episode_number === episode) {
          return [{
            name: 'ToFlix',
            title: 'S' + season + 'E' + episode + ' - VF',
            url: ep.url,
            quality: 'HD',
            format: 'mp4',
            headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          }];
        }
      }
      throw new Error('Épisode non trouvé');
    });
}

// Méthode unifiée pour séries
function fetchSeries(apiUrl, referer, tmdbId, season, episode) {
  var frontend = referer.replace(/\/$/, '');
  
  // Tentative 1: API players
  return fetchSeriesWithPlayers(apiUrl, referer, tmdbId, season, episode)
    .catch(function(err) {
      log('API players échouée, scraping', err.message);
      // Tentative 2: Scraping
      return fetchSeriesWithScraping(frontend, referer, tmdbId, season, episode);
    })
    .catch(function(err) {
      log('Scraping échoué, fallback legacy', err.message);
      // Tentative 3: Legacy episodes
      return fetchSeriesLegacy(apiUrl, referer, tmdbId, season, episode);
    });
}

// =============================================================
// POINT D'ENTRÉE PRINCIPAL
// =============================================================

function getStreamsWithApi(apiUrl, referer, tmdbId, mediaType, season, episode) {
  if (mediaType === 'tv') {
    return fetchSeries(apiUrl, referer, tmdbId, season || 1, episode || 1);
  }
  return fetchMovie(apiUrl, referer, tmdbId);
}

function getStreams(tmdbId, mediaType, season, episode, title) {
  log('getStreams', { tmdbId, mediaType, season, episode, title });
  
  return getStreamsWithApi(TOFLIX_API, TOFLIX_REFERER, tmdbId, mediaType, season, episode)
    .catch(function(err) {
      log('Fallback Telegram', err.message);
      return detectFromTelegram().then(function(detected) {
        if (detected) {
          return getStreamsWithApi(detected.api, detected.referer, tmdbId, mediaType, season, episode);
        }
        return detectFromMom().then(function(detected2) {
          if (!detected2) throw new Error('Aucun domaine trouvé');
          return getStreamsWithApi(detected2.api, detected2.referer, tmdbId, mediaType, season, episode);
        });
      });
    })
    .catch(function(err) {
      console.error('[ToFlix] Erreur globale:', err.message || err);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
