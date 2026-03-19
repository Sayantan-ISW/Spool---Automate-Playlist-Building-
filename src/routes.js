'use strict';

const express = require('express');
const { createOAuth2Client, getAuthUrl, getTokens, requireAuth, revokeToken } = require('./auth');
const { parseText } = require('./parser');
const { createYouTubeService } = require('./youtube');

const router = express.Router();

// ─── Auth Routes ────────────────────────────────────────────────────────────

router.get('/auth/login', (req, res) => {
  const oauth2Client = createOAuth2Client();
  const url = getAuthUrl(oauth2Client);
  res.redirect(url);
});

router.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    const oauth2Client = createOAuth2Client();
    const tokens = await getTokens(oauth2Client, code);
    // Store only essential token fields to keep cookie size small
    req.session.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
    };

    // Fetch Google profile info
    oauth2Client.setCredentials(tokens);
    const { google } = require('googleapis');
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    req.session.profile = {
      name: data.name || 'User',
      email: data.email || '',
      picture: data.picture || '',
    };

    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

router.get('/auth/status', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.tokens),
    quotaUsed: req.session?.quotaUsed || 0,
    profile: req.session?.profile || null,
  });
});

router.post('/auth/logout', async (req, res) => {
  if (req.session?.tokens?.access_token) {
    const oauth2Client = createOAuth2Client();
    await revokeToken(oauth2Client, req.session.tokens.access_token);
  }
  req.session = null;
  res.json({ success: true });
});

// ─── Profile Route ──────────────────────────────────────────────────────────

router.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const ytService = createYouTubeService(req.oauth2Client, req.session);
    const playlists = await ytService.listUserPlaylists(100);
    res.json({
      profile: req.session.profile || { name: 'User', email: '', picture: '' },
      customAvatar: req.session.customAvatar || null,
      quotaUsed: req.session.quotaUsed || 0,
      quotaLimit: 10000,
      playlists,
    });
  } catch (err) {
    console.error('Profile error:', err.message || err);
    res.json({
      profile: req.session.profile || { name: 'User', email: '', picture: '' },
      customAvatar: req.session.customAvatar || null,
      quotaUsed: req.session.quotaUsed || 0,
      quotaLimit: 10000,
      playlists: [],
    });
  }
});

router.post('/api/profile/avatar', requireAuth, (req, res) => {
  const { avatar } = req.body;
  // avatar is an index (0-7) for a predefined avatar set
  if (typeof avatar !== 'number' || avatar < 0 || avatar > 7) {
    return res.status(400).json({ error: 'Invalid avatar selection.' });
  }
  req.session.customAvatar = avatar;
  res.json({ success: true, avatar });
});

// ─── User Playlists Route ───────────────────────────────────────────────────

router.get('/api/playlists', requireAuth, async (req, res) => {
  try {
    const ytService = createYouTubeService(req.oauth2Client, req.session);
    const playlists = await ytService.listUserPlaylists(100);
    res.json({ playlists });
  } catch (err) {
    console.error('List playlists error:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch your playlists.' });
  }
});

// ─── Preview Route ──────────────────────────────────────────────────────────

router.post('/api/preview', requireAuth, async (req, res) => {
  const { text, resultsPerQuery } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      error: 'Please paste some text to parse.',
      hint: 'Expected format: Topic headers (e.g., "## Topic Name") with quoted search terms (e.g., "machine learning basics") or YouTube URLs.',
    });
  }

  try {
    // Parse text
    const parsed = parseText(text);

    if (parsed.topics.length === 0) {
      return res.status(400).json({
        error: 'No topics or search queries could be extracted from the text.',
        warnings: parsed.warnings,
        hint: 'Try adding topic headers like "## Topic Name" or quoting search terms like "search query".',
      });
    }

    const ytService = createYouTubeService(req.oauth2Client, req.session);
    const maxResults = Math.min(Math.max(parseInt(resultsPerQuery, 10) || 3, 1), 5);

    // Estimate cost before proceeding
    const estimatedCost = ytService.estimatePreviewCost(parsed.topics);

    // Process each topic: search for videos, resolve direct URLs
    const topicsWithVideos = [];

    for (let i = 0; i < parsed.topics.length; i++) {
      const topic = parsed.topics[i];
      const videos = [];
      const seenIds = new Set();
      const errors = [];

      // Resolve direct video URLs first (cheap: 1 unit per batch of 50)
      const directVideoIds = topic.urls
        .filter(u => u.type === 'video')
        .map(u => u.id);

      if (directVideoIds.length > 0) {
        try {
          const details = await ytService.getVideoDetails(directVideoIds);
          for (const v of details) {
            if (!seenIds.has(v.videoId)) {
              seenIds.add(v.videoId);
              videos.push(v);
            }
          }
        } catch (err) {
          if (err.quotaExceeded) throw err;
          errors.push(`Failed to resolve direct video URLs: ${err.message}`);
        }
      }

      // Resolve playlist URLs
      const playlistUrls = topic.urls.filter(u => u.type === 'playlist');
      for (const pl of playlistUrls) {
        try {
          const plVideoIds = await ytService.getPlaylistItems(pl.id);
          if (plVideoIds.length > 0) {
            const details = await ytService.getVideoDetails(plVideoIds);
            for (const v of details) {
              if (!seenIds.has(v.videoId)) {
                seenIds.add(v.videoId);
                v.sourceQuery = `playlist:${pl.id}`;
                videos.push(v);
              }
            }
          }
        } catch (err) {
          if (err.quotaExceeded) throw err;
          errors.push(`Could not access playlist ${pl.id}: ${err.message}`);
        }
      }

      // Search for each query
      for (const q of topic.queries) {
        const searchQuery = q.queryWithChannel || q.query;
        try {
          const results = await ytService.searchVideos(searchQuery, maxResults);
          for (const v of results) {
            if (!seenIds.has(v.videoId)) {
              seenIds.add(v.videoId);
              videos.push(v);
            }
          }
        } catch (err) {
          if (err.quotaExceeded) throw err;
          errors.push(`Search failed for "${q.query}": ${err.message}`);
        }
      }

      topicsWithVideos.push({
        title: topic.title,
        queries: topic.queries.map(q => q.query),
        videos,
        errors,
        videoCount: videos.length,
      });
    }

    // Summary stats
    const totalVideos = topicsWithVideos.reduce((sum, t) => sum + t.videoCount, 0);
    const estimatedCreateCost = ytService.estimateCreateCost(
      topicsWithVideos.map(t => ({ videos: t.videos }))
    );

    res.json({
      topics: topicsWithVideos,
      warnings: parsed.warnings,
      summary: {
        topicCount: topicsWithVideos.length,
        totalVideos,
        quotaUsedForPreview: ytService.getQuotaUsed(),
        estimatedCreateCost,
        estimatedTotalQuota: ytService.getQuotaUsed() + estimatedCreateCost,
      },
    });
  } catch (err) {
    if (err.quotaExceeded) {
      return res.status(429).json({
        error: err.message,
        quotaUsed: req.session.quotaUsed,
      });
    }
    console.error('Preview error:', err.message || err);
    const detail = err.status === 401
      ? 'Your Google session has expired. Please sign out and sign in again.'
      : 'An error occurred while generating the preview.';
    res.status(err.status || 500).json({ error: detail });
  }
});

// ─── Create Playlists Route ────────────────────────────────────────────────

router.post('/api/create', requireAuth, async (req, res) => {
  const { topics, privacyStatus, titlePrefix, titleSuffix } = req.body;

  if (!topics || !Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ error: 'No topics provided.' });
  }

  const privacy = ['private', 'unlisted', 'public'].includes(privacyStatus)
    ? privacyStatus
    : 'private';

  const ytService = createYouTubeService(req.oauth2Client, req.session);

  const results = [];
  const errors = [];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const videoIds = (topic.videos || [])
      .filter(v => v && v.videoId)
      .map(v => v.videoId);

    if (videoIds.length === 0) {
      results.push({
        title: topic.title,
        skipped: true,
        reason: 'No videos selected.',
      });
      continue;
    }

    // Build playlist title
    let playlistTitle = topic.title;
    if (titlePrefix) playlistTitle = `${titlePrefix} ${playlistTitle}`;
    if (titleSuffix) playlistTitle = `${playlistTitle} ${titleSuffix}`;

    // Build description
    const descParts = [];
    if (topic.queries?.length) {
      descParts.push(`Search queries: ${topic.queries.join(', ')}`);
    }
    descParts.push('');
    descParts.push('Auto-generated by Spool \u2014 youtube playlist builder');
    const description = descParts.join('\n').slice(0, 5000);

    try {
      // Use existing playlist if specified, otherwise create new
      let playlist;
      if (topic.existingPlaylistId) {
        playlist = {
          playlistId: topic.existingPlaylistId,
          title: playlistTitle,
          url: `https://www.youtube.com/playlist?list=${topic.existingPlaylistId}`,
        };
      } else {
        playlist = await ytService.createPlaylist(playlistTitle, description, privacy);
      }
      const topicResult = {
        title: playlistTitle,
        playlistId: playlist.playlistId,
        url: playlist.url,
        videosAdded: 0,
        videosFailed: [],
        addedToExisting: !!topic.existingPlaylistId,
      };

      // Add videos
      for (const videoId of videoIds) {
        try {
          await ytService.addVideoToPlaylist(playlist.playlistId, videoId);
          topicResult.videosAdded++;
        } catch (err) {
          if (err.quotaExceeded) throw err;
          topicResult.videosFailed.push({
            videoId,
            error: err.message || 'Failed to add video',
          });
        }
      }

      results.push(topicResult);
    } catch (err) {
      if (err.quotaExceeded) {
        return res.status(429).json({
          error: err.message,
          partialResults: results,
          quotaUsed: ytService.getQuotaUsed(),
        });
      }
      errors.push({
        title: topic.title,
        error: err.message || 'Failed to create playlist',
      });
    }
  }

  res.json({
    results,
    errors,
    summary: {
      created: results.filter(r => !r.skipped && !r.alreadyExisted).length,
      skipped: results.filter(r => r.skipped).length,
      alreadyExisted: results.filter(r => r.alreadyExisted).length,
      totalVideosAdded: results.reduce((s, r) => s + (r.videosAdded || 0), 0),
      totalVideosFailed: results.reduce((s, r) => s + (r.videosFailed?.length || 0), 0),
      quotaUsed: ytService.getQuotaUsed(),
    },
  });
});

module.exports = router;
