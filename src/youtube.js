'use strict';

const { google } = require('googleapis');

const QUOTA_COSTS = {
  'search.list': 100,
  'videos.list': 1,
  'playlists.insert': 50,
  'playlists.list': 1,
  'playlistItems.insert': 50,
  'playlistItems.list': 1,
};

/**
 * Delay helper for rate limiting.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff retry wrapper.
 */
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status || err?.code;
      const errorReason = err?.response?.data?.error?.errors?.[0]?.reason || '';
      const errorMessage = err?.response?.data?.error?.message || err.message || '';

      // Log detailed error for debugging
      console.error(`YouTube API error (attempt ${attempt + 1}/${maxRetries + 1}):`, {
        status,
        reason: errorReason,
        message: errorMessage,
      });

      const isQuotaExceeded = status === 403 && errorReason === 'quotaExceeded';
      if (isQuotaExceeded) {
        throw Object.assign(new Error('YouTube API quota exceeded. Try again tomorrow or request a quota increase.'), { quotaExceeded: true });
      }

      // 401 Unauthorized — token may be expired, let googleapis auto-refresh and retry once
      if (status === 401 && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 300;
        await delay(backoff);
        continue;
      }

      if ((status === 403 || status === 429) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        await delay(backoff);
        continue;
      }

      // Throw a more descriptive error
      const enrichedErr = new Error(`YouTube API error: ${errorMessage || err.message}`);
      enrichedErr.status = status;
      enrichedErr.quotaExceeded = false;
      throw enrichedErr;
    }
  }
}

/**
 * Create a YouTube API service object.
 * Tracks quota usage per session.
 */
function createYouTubeService(oauth2Client, session) {
  const yt = google.youtube({ version: 'v3', auth: oauth2Client });

  // Initialize session quota tracking
  if (!session.quotaUsed) session.quotaUsed = 0;
  if (!session.searchCache) session.searchCache = {};

  function trackQuota(operation) {
    const cost = QUOTA_COSTS[operation] || 0;
    session.quotaUsed += cost;
    return cost;
  }

  /**
   * Search YouTube for videos matching a query.
   * Returns array of video objects.
   */
  async function searchVideos(query, maxResults) {
    const resultsPerQuery = maxResults || parseInt(process.env.SEARCH_RESULTS_PER_QUERY, 10) || 3;

    // Check cache
    const cacheKey = `${query}__${resultsPerQuery}`;
    if (session.searchCache[cacheKey]) {
      return session.searchCache[cacheKey];
    }

    const cost = trackQuota('search.list');
    await delay(250); // Rate limiting

    const response = await withRetry(() =>
      yt.search.list({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: resultsPerQuery,
        videoEmbeddable: 'true',
      })
    );

    const videos = (response.data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      description: item.snippet.description,
      sourceQuery: query,
    }));

    // Cache results
    session.searchCache[cacheKey] = videos;

    return videos;
  }

  /**
   * Fetch video details by IDs (batched, up to 50 per call).
   */
  async function getVideoDetails(videoIds) {
    if (!videoIds.length) return [];

    const results = [];
    // Batch in groups of 50
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      trackQuota('videos.list');
      await delay(250);

      const response = await withRetry(() =>
        yt.videos.list({
          part: 'snippet,contentDetails',
          id: batch.join(','),
        })
      );

      for (const item of response.data.items || []) {
        results.push({
          videoId: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          description: item.snippet.description,
          duration: item.contentDetails?.duration || null,
          sourceQuery: 'direct URL',
        });
      }
    }

    return results;
  }

  /**
   * Fetch all video IDs from a YouTube playlist.
   */
  async function getPlaylistItems(playlistId) {
    const videoIds = [];
    let pageToken = null;

    do {
      trackQuota('playlistItems.list');
      await delay(250);

      const response = await withRetry(() =>
        yt.playlistItems.list({
          part: 'contentDetails',
          playlistId,
          maxResults: 50,
          pageToken: pageToken || undefined,
        })
      );

      for (const item of response.data.items || []) {
        videoIds.push(item.contentDetails.videoId);
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return videoIds;
  }

  /**
   * Create a YouTube playlist.
   */
  async function createPlaylist(title, description, privacyStatus = 'private') {
    trackQuota('playlists.insert');
    await delay(250);

    const response = await withRetry(() =>
      yt.playlists.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: title.slice(0, 150), // YouTube limit
            description: (description || '').slice(0, 5000),
          },
          status: {
            privacyStatus,
          },
        },
      })
    );

    return {
      playlistId: response.data.id,
      title: response.data.snippet.title,
      url: `https://www.youtube.com/playlist?list=${response.data.id}`,
    };
  }

  /**
   * List the authenticated user's playlists.
   */
  async function listUserPlaylists(maxResults = 50) {
    const allPlaylists = [];
    let pageToken = null;

    do {
      trackQuota('playlists.list');
      await delay(250);

      const response = await withRetry(() =>
        yt.playlists.list({
          part: 'snippet,contentDetails',
          mine: true,
          maxResults: Math.min(maxResults, 50),
          pageToken: pageToken || undefined,
        })
      );

      for (const item of response.data.items || []) {
        allPlaylists.push({
          playlistId: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          videoCount: item.contentDetails?.itemCount || 0,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
          url: `https://www.youtube.com/playlist?list=${item.id}`,
        });
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken && allPlaylists.length < maxResults);

    return allPlaylists;
  }

  /**
   * Add a video to a playlist.
   */
  async function addVideoToPlaylist(playlistId, videoId) {
    trackQuota('playlistItems.insert');
    await delay(250);

    const response = await withRetry(() =>
      yt.playlistItems.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      })
    );

    return response.data;
  }

  /**
   * Estimate the quota cost for a preview operation.
   */
  function estimatePreviewCost(topics) {
    let cost = 0;
    for (const topic of topics) {
      // Each non-cached query costs a search
      for (const q of topic.queries || []) {
        const query = q.queryWithChannel || q.query;
        const cacheKey = `${query}__${process.env.SEARCH_RESULTS_PER_QUERY || 3}`;
        if (!session.searchCache[cacheKey]) {
          cost += QUOTA_COSTS['search.list'];
        }
      }
      // Direct video URLs resolved via videos.list (batched)
      const directVideos = (topic.urls || []).filter(u => u.type === 'video');
      if (directVideos.length > 0) {
        cost += Math.ceil(directVideos.length / 50) * QUOTA_COSTS['videos.list'];
      }
      // Playlist URLs
      const playlists = (topic.urls || []).filter(u => u.type === 'playlist');
      cost += playlists.length * QUOTA_COSTS['playlistItems.list'];
    }
    return cost;
  }

  /**
   * Estimate the quota cost for creating playlists.
   */
  function estimateCreateCost(topics) {
    let cost = 0;
    let totalVideos = 0;
    for (const topic of topics) {
      if ((topic.videos || []).length === 0) continue;
      // Only charge playlist insert cost if not using an existing playlist
      if (!topic.existingPlaylistId) {
        cost += QUOTA_COSTS['playlists.insert'];
      }
      totalVideos += topic.videos.length;
    }
    cost += totalVideos * QUOTA_COSTS['playlistItems.insert'];
    return cost;
  }

  return {
    searchVideos,
    getVideoDetails,
    getPlaylistItems,
    createPlaylist,
    addVideoToPlaylist,
    listUserPlaylists,
    estimatePreviewCost,
    estimateCreateCost,
    getQuotaUsed: () => session.quotaUsed,
    QUOTA_COSTS,
  };
}

module.exports = { createYouTubeService, QUOTA_COSTS };
