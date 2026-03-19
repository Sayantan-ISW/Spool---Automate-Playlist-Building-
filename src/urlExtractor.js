'use strict';

/**
 * YouTube URL extractor.
 * Handles all common YouTube URL formats and extracts video IDs, playlist IDs, channel info.
 */

// Video URL patterns
const VIDEO_PATTERNS = [
  // Standard watch URL: youtube.com/watch?v=ID
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?[^\s]*v=([\w-]{11})/g,
  // Short URL: youtu.be/ID
  /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/g,
  // Shorts URL: youtube.com/shorts/ID
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([\w-]{11})/g,
  // Embed URL: youtube.com/embed/ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/g,
];

// Playlist URL pattern
const PLAYLIST_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:playlist\?|watch\?[^\s]*&?)list=([\w-]+)/g;

// Channel URL patterns
const CHANNEL_PATTERNS = [
  // /channel/UCxxxxxx
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[\w-]+)/g,
  // /@handle
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([\w.-]+)/g,
  // /c/customname
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/c\/([\w.-]+)/g,
];

/**
 * Extract all YouTube URLs from text.
 * Returns array of { type, id, raw }
 */
function extractYouTubeURLs(text) {
  if (!text) return [];

  const results = [];
  const seenVideoIds = new Set();
  const seenPlaylistIds = new Set();

  // Extract video IDs
  for (const pattern of VIDEO_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    let match;
    while ((match = re.exec(text)) !== null) {
      const videoId = match[1];
      if (!seenVideoIds.has(videoId)) {
        seenVideoIds.add(videoId);
        results.push({ type: 'video', id: videoId, raw: match[0] });
      }
    }
  }

  // Extract playlist IDs
  const playlistRe = new RegExp(PLAYLIST_PATTERN.source, 'g');
  let match;
  while ((match = playlistRe.exec(text)) !== null) {
    const playlistId = match[1];
    if (!seenPlaylistIds.has(playlistId)) {
      seenPlaylistIds.add(playlistId);
      results.push({ type: 'playlist', id: playlistId, raw: match[0] });
    }
  }

  // Extract channel references
  for (const pattern of CHANNEL_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    while ((match = re.exec(text)) !== null) {
      results.push({ type: 'channel', id: match[1], raw: match[0] });
    }
  }

  return results;
}

/**
 * Extract just video IDs from text (convenience).
 */
function extractVideoIds(text) {
  return extractYouTubeURLs(text)
    .filter(u => u.type === 'video')
    .map(u => u.id);
}

module.exports = { extractYouTubeURLs, extractVideoIds };
