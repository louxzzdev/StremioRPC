const mediaCache = new Map();
// Shared project key. OMDb keys are intended to be public when used by client apps.
const OMDB_API_KEY = '413d7395';

function normalizePosterUrl(poster) {
    if (typeof poster !== 'string' || poster === 'N/A') {
        return null;
    }

    return /^https?:\/\//i.test(poster) ? poster : null;
}

function parseRuntimeSeconds(runtime) {
    if (typeof runtime === 'number' && Number.isFinite(runtime) && runtime > 0) {
        return Math.round(runtime * 60);
    }

    if (typeof runtime !== 'string') {
        return null;
    }

    const hours = runtime.match(/(\d+)\s*h(?:ours?)?/i);
    const minutes = runtime.match(/(\d+)\s*m(?:in(?:utes?)?)?/i);
    const totalSeconds = ((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)) * 60;

    return totalSeconds > 0 ? totalSeconds : null;
}

async function resolveMediaInfo(id, type = 'movie') {
    if (!id) {
        return { title: id, poster: null, runtimeSeconds: null };
    }

    const normalizedType = type === 'series' ? 'series' : 'movie';
    const cacheKey = `${normalizedType}:${id}`;
    if (mediaCache.has(cacheKey)) {
        return mediaCache.get(cacheKey);
    }

    const media = {
        title: id,
        poster: null,
        runtimeSeconds: null
    };
    let resolvedTitle = false;

    try {
        const stremioUrl = `https://v3-cinemeta.strem.io/meta/${normalizedType}/${encodeURIComponent(id)}.json`;
        const response = await fetch(stremioUrl, {
            headers: { Accept: 'application/json' }
        });

        if (response && response.ok) {
            const data = await response.json();
            const meta = data?.meta || data;
            const title = meta?.name || meta?.title || data?.name || data?.title;
            if (title) {
                media.title = title;
                resolvedTitle = true;
            }
            media.poster = normalizePosterUrl(meta?.poster || data?.poster);
            media.runtimeSeconds = parseRuntimeSeconds(meta?.runtime || data?.runtime);
        }
    } catch (err) {
        console.warn('Stremio metadata lookup failed:', err);
    }

    // OMDb complements Cinemeta when a poster, runtime, or title is unavailable.
    if (!resolvedTitle || !media.poster || !media.runtimeSeconds) {
        try {
            const response = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(OMDB_API_KEY)}&i=${encodeURIComponent(id)}`);
            if (!response || !response.ok) {
                if (response?.status === 401 || response?.status === 403) {
                    console.warn('The shared OMDb API key is invalid or unauthorized; using available metadata.');
                } else {
                    throw new Error(`OMDb request failed with status ${response?.status || 'unknown'}`);
                }
            } else {
                const data = await response.json();
                if (data?.Response === 'True') {
                    if (!resolvedTitle && data.Title) {
                        media.title = data.Title;
                    }
                    media.poster = media.poster || normalizePosterUrl(data.Poster);
                    media.runtimeSeconds = media.runtimeSeconds || parseRuntimeSeconds(data.Runtime);
                }
            }
        } catch (err) {
            console.warn('OMDb lookup failed:', err);
        }
    }

    mediaCache.set(cacheKey, media);
    return media;
}

module.exports = {
    resolveMediaInfo,
    parseRuntimeSeconds
};
