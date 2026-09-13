const titleCache = new Map();

async function resolveMediaTitle(id, type = 'movie', config = {}) {
    if (!id) {
        return id;
    }

    const normalizedType = type === 'series' ? 'series' : 'movie';
    const cacheKey = `${normalizedType}:${id}`;
    if (titleCache.has(cacheKey)) {
        return titleCache.get(cacheKey);
    }

    try {
        const stremioUrl = `https://v3-cinemeta.stremio.com/meta/${normalizedType}/${encodeURIComponent(id)}.json`;
        const response = await fetch(stremioUrl, {
            headers: { Accept: 'application/json' }
        });

        if (response && response.ok) {
            const data = await response.json();
            const meta = data?.meta || data;
            const title = meta?.name || meta?.title || meta?.title || data?.name || data?.title;
            if (title) {
                titleCache.set(cacheKey, title);
                return title;
            }
        }
    } catch (err) {
        console.warn('Stremio metadata lookup failed:', err);
    }

    const omdbKey = config?.omdbApiKey?.trim();
    if (omdbKey) {
        try {
            const response = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(omdbKey)}&i=${encodeURIComponent(id)}`);
            if (!response || !response.ok) {
                if (response?.status === 401 || response?.status === 403) {
                    console.warn('OMDb API key is invalid or unauthorized; using IMDb ID as fallback.');
                } else {
                    throw new Error(`OMDb request failed with status ${response?.status || 'unknown'}`);
                }
            } else {
                const data = await response.json();
                if (data?.Response === 'True' && data?.Title) {
                    titleCache.set(cacheKey, data.Title);
                    return data.Title;
                }
            }
        } catch (err) {
            console.warn('OMDb lookup failed:', err);
        }
    }

    titleCache.set(cacheKey, id);
    return id;
}

module.exports = {
    resolveMediaTitle
};
