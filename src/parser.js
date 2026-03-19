'use strict';

const { extractYouTubeURLs } = require('./urlExtractor');

// Normalize unicode quotes, dashes
function normalizeText(text) {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')  // curly double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")  // curly single quotes
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-')               // dashes → hyphen
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

// Topic boundary patterns (ordered by specificity)
const TOPIC_PATTERNS = [
  // "Topic N — Title" / "Topic N: Title" / "Topic N. Title"
  /^(?:topic|module|section|chapter|part|unit|week|day|lecture|lesson)\s+\d+\s*[-:.\u2014\u2013]\s*(.+)/i,
  // Markdown headers: ## Title, ### Title
  /^#{1,6}\s+(.+)/,
  // Numbered lists at line start: "1. Title", "2. Title"
  /^(\d{1,3})\.\s+(.+)/,
  // Bold markers: **Title** or __Title__
  /^\*\*(.+?)\*\*\s*$/,
  /^__(.+?)__\s*$/,
];

// Patterns that indicate a search directive
const SEARCH_DIRECTIVE_RE = /(?:search|watch|see|also|check\s+out|look\s+up|find|try)\s*:\s*/i;

// Channel mention patterns
const CHANNEL_MENTION_RE = /@([\w.-]+)/g;
const CHANNEL_NATURAL_RE = /(?:on|by|from)\s+([A-Z][\w\s]+?)(?:'s)?\s+(?:channel|youtube)/gi;

/**
 * Extract quoted strings from text (straight or curly quotes).
 * Returns array of {query, startIndex, endIndex}
 */
function extractQuotedStrings(text) {
  const results = [];
  const re = /"([^"]{5,})"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const query = match[1].trim();
    if (query.length >= 5) {
      results.push({
        query,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }
  return results;
}

/**
 * Extract channel mentions from text.
 */
function extractChannelMentions(text) {
  const channels = [];

  let match;
  const handleRe = new RegExp(CHANNEL_MENTION_RE.source, 'g');
  while ((match = handleRe.exec(text)) !== null) {
    channels.push({ handle: match[1], raw: match[0] });
  }

  const naturalRe = new RegExp(CHANNEL_NATURAL_RE.source, 'gi');
  while ((match = naturalRe.exec(text)) !== null) {
    channels.push({ name: match[1].trim(), raw: match[0] });
  }

  return channels;
}

/**
 * Split text into topic blocks based on header/boundary patterns.
 * Returns array of { title, bodyText, startLine, endLine }
 */
function splitIntoTopics(text) {
  const lines = text.split('\n');
  const topics = [];
  let currentTopic = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let matched = false;
    for (const pattern of TOPIC_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        // Save previous topic
        if (currentTopic) {
          currentTopic.endLine = i - 1;
          topics.push(currentTopic);
        }

        let title;
        if (pattern === TOPIC_PATTERNS[2]) {
          // Numbered list: group 2 is the title text
          title = m[2] || m[1];
        } else {
          title = m[1];
        }

        currentTopic = {
          title: title.trim().replace(/[:\-—]+$/, '').trim(),
          bodyLines: [],
          startLine: i,
          endLine: null,
        };
        matched = true;
        break;
      }
    }

    if (!matched && currentTopic) {
      currentTopic.bodyLines.push(lines[i]);
    } else if (!matched && !currentTopic) {
      // Text before any topic header — accumulate for potential single-topic fallback
      if (!topics._preambleLines) topics._preambleLines = [];
      topics._preambleLines = topics._preambleLines || [];
      topics._preambleLines.push(lines[i]);
    }
  }

  if (currentTopic) {
    currentTopic.endLine = lines.length - 1;
    topics.push(currentTopic);
  }

  return { topics, preambleLines: topics._preambleLines || [] };
}

/**
 * Generate search queries from body text that doesn't have explicit quoted queries.
 * Uses search directives and falls back to the title itself.
 */
function extractImplicitQueries(bodyText, title) {
  const queries = [];

  // Check for search directives
  const directiveRe = new RegExp(SEARCH_DIRECTIVE_RE.source, 'gi');
  let match;
  while ((match = directiveRe.exec(bodyText)) !== null) {
    // Take the rest of the line after the directive
    const afterDirective = bodyText.slice(match.index + match[0].length);
    const lineEnd = afterDirective.indexOf('\n');
    const directive = (lineEnd === -1 ? afterDirective : afterDirective.slice(0, lineEnd)).trim();
    if (directive.length > 3) {
      queries.push(directive.replace(/^["']|["']$/g, ''));
    }
  }

  return queries;
}

/**
 * Main parse function.
 * Takes raw unstructured text and returns structured topics with queries and URLs.
 */
function parseText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { topics: [], warnings: ['Empty or invalid input.'] };
  }

  // Truncate extremely long input to prevent hangs
  const MAX_INPUT = 50000;
  const text = normalizeText(rawText.slice(0, MAX_INPUT));
  const warnings = [];

  if (rawText.length > MAX_INPUT) {
    warnings.push(`Input was truncated to ${MAX_INPUT} characters.`);
  }

  // Step 1: Extract all YouTube URLs (highest priority)
  const allUrls = extractYouTubeURLs(text);

  // Step 2: Extract all quoted strings
  const allQuoted = extractQuotedStrings(text);

  // Step 3: Split into topics
  const { topics: rawTopics, preambleLines } = splitIntoTopics(text);

  // Step 4: If no topics found, treat as single topic
  if (rawTopics.length === 0) {
    const hasContent = allQuoted.length > 0 || allUrls.length > 0;
    if (!hasContent) {
      // Try treating the whole text as title-derived queries
      const trimmed = text.trim();
      if (trimmed.length < 5) {
        return { topics: [], warnings: ['No recognizable topics or search queries found. Try adding topic headers (e.g., "## Topic Name") or quoting search terms (e.g., "search query").'] };
      }
      // Fallback: use non-empty lines as queries in one topic
      const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      if (lines.length === 0) {
        return { topics: [], warnings: ['No recognizable content found.'] };
      }
      return {
        topics: [{
          title: 'Playlist',
          queries: lines.slice(0, 20).map(l => ({ query: l, source: 'line' })),
          urls: [],
          channels: [],
        }],
        warnings: ['No topic structure detected. Treating each line as a search query in a single playlist.'],
      };
    }

    // We have queries or URLs but no structure — single topic
    return {
      topics: [{
        title: 'Playlist',
        queries: allQuoted.map(q => ({ query: q.query, source: 'quoted' })),
        urls: allUrls,
        channels: extractChannelMentions(text),
      }],
      warnings: ['No topic headers found. All content grouped into a single playlist.'],
    };
  }

  // Step 5: Associate URLs and queries with topics by position
  const parsedTopics = rawTopics.map((topic, idx) => {
    const bodyText = topic.bodyLines.join('\n');
    const fullText = topic.title + '\n' + bodyText;

    // URLs within this topic's body
    const topicUrls = extractYouTubeURLs(bodyText);

    // Quoted queries within this topic's body
    const topicQuoted = extractQuotedStrings(bodyText);

    // Implicit queries from directives
    const implicitQueries = extractImplicitQueries(bodyText, topic.title);

    // Channel mentions
    const channels = extractChannelMentions(fullText);

    // Build query list
    const queries = [];
    for (const q of topicQuoted) {
      queries.push({ query: q.query, source: 'quoted' });
    }
    for (const q of implicitQueries) {
      queries.push({ query: q, source: 'directive' });
    }

    // If no queries found from text, use the topic title as a query
    if (queries.length === 0 && topicUrls.length === 0) {
      queries.push({ query: topic.title, source: 'title' });
    }

    // Append channel context to queries
    if (channels.length > 0) {
      const channelStr = channels.map(c => c.handle || c.name).join(' ');
      for (const q of queries) {
        q.queryWithChannel = `${q.query} ${channelStr}`;
      }
    }

    return {
      title: topic.title,
      queries,
      urls: topicUrls,
      channels,
    };
  });

  // Handle preamble URLs/queries — associate with first topic or warn
  if (preambleLines.length > 0) {
    const preambleText = preambleLines.join('\n');
    const preambleUrls = extractYouTubeURLs(preambleText);
    const preambleQuoted = extractQuotedStrings(preambleText);

    if (preambleUrls.length > 0 || preambleQuoted.length > 0) {
      if (parsedTopics.length > 0) {
        parsedTopics[0].urls.push(...preambleUrls);
        for (const q of preambleQuoted) {
          parsedTopics[0].queries.unshift({ query: q.query, source: 'quoted' });
        }
        warnings.push('Some content before the first topic header was associated with the first topic.');
      }
    }
  }

  // Warn about topics with no content
  for (const t of parsedTopics) {
    if (t.queries.length === 0 && t.urls.length === 0) {
      warnings.push(`Topic "${t.title}" has no search queries or URLs. It will be skipped.`);
    }
  }

  return { topics: parsedTopics, warnings };
}

module.exports = { parseText, extractQuotedStrings, extractChannelMentions, normalizeText };
