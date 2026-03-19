'use strict';

/* ═══════════════════════════════════════════════════════════════════
   SPOOL — Client Application
   ═══════════════════════════════════════════════════════════════════ */

/* ── Helpers ───────────────────────────────────────────────────────── */

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

async function api(url, opts = {}) {
  const defaults = {
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': getCsrfToken() },
  };
  const merged = { ...defaults, ...opts };
  if (opts.headers) merged.headers = { ...defaults.headers, ...opts.headers };
  const res = await fetch(url, merged);
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function extractVideoIdFromUrl(url) {
  const m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(url)) return url;
  return null;
}

/* ── Toast System ──────────────────────────────────────────────────── */

const toastContainer = document.getElementById('toast-container');

function toast(msg, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  const icons = { error: '✕', success: '✓', warning: '△', info: '●' };
  const colors = { error: 'var(--error)', success: 'var(--success)', warning: 'var(--warning)', info: 'var(--electric)' };

  el.innerHTML = `<span style="color:${colors[type]};font-weight:700;flex-shrink:0;">${icons[type]}</span><span>${esc(msg)}</span>`;
  toastContainer.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

/* ── State ─────────────────────────────────────────────────────────── */

let previewData = null;
let userPlaylists = [];
let profileData = null;
let selectedAvatarIdx = null;

/* Notion-style illustrated avatar SVGs (flat, minimal, diverse) */
const AVATARS = [
  // 0: short dark hair, warm skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#FFCBA4"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#4A90D9"/><circle cx="60" cy="52" r="30" fill="#FFCBA4"/><path d="M30 42c0-18 14-30 30-30s30 12 30 30c0 0-8-14-30-14S30 42 30 42z" fill="#3D2B1F"/><circle cx="48" cy="52" r="3" fill="#2D2D2D"/><circle cx="72" cy="52" r="3" fill="#2D2D2D"/><ellipse cx="60" cy="64" rx="4" ry="2" fill="#E8967A"/></svg>`,
  // 1: long hair, light skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#FDE8D0"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#E06C75"/><circle cx="60" cy="52" r="30" fill="#FDE8D0"/><path d="M28 44c0-20 14-34 32-34s32 14 32 34c0 0-4-16-32-16S28 44 28 44z" fill="#8B4513"/><path d="M28 44c0 0-2 30-2 40s4 8 4 8" stroke="#8B4513" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M92 44c0 0 2 30 2 40s-4 8-4 8" stroke="#8B4513" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="48" cy="52" r="3" fill="#2D2D2D"/><circle cx="72" cy="52" r="3" fill="#2D2D2D"/><ellipse cx="60" cy="64" rx="4" ry="2" fill="#D9896C"/></svg>`,
  // 2: curly hair, dark skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#8D5524"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#56B870"/><circle cx="60" cy="52" r="30" fill="#8D5524"/><ellipse cx="60" cy="30" rx="34" ry="22" fill="#1A1A2E"/><circle cx="36" cy="32" r="8" fill="#1A1A2E"/><circle cx="84" cy="32" r="8" fill="#1A1A2E"/><circle cx="48" cy="52" r="3" fill="#F0F0F0"/><circle cx="72" cy="52" r="3" fill="#F0F0F0"/><ellipse cx="60" cy="64" rx="5" ry="2.5" fill="#7A3E1B"/></svg>`,
  // 3: buzz cut, medium skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#C68642"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#6C5CE7"/><circle cx="60" cy="52" r="30" fill="#C68642"/><path d="M32 40c0-16 12-28 28-28s28 12 28 28" fill="#2D2D2D"/><circle cx="48" cy="52" r="3" fill="#2D2D2D"/><circle cx="72" cy="52" r="3" fill="#2D2D2D"/><ellipse cx="60" cy="64" rx="4" ry="2" fill="#A0522D"/></svg>`,
  // 4: bob cut, pale skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#FFE0BD"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#F7B731"/><circle cx="60" cy="52" r="30" fill="#FFE0BD"/><path d="M30 46c0-18 14-32 30-32s30 14 30 32c0 0-2-12-14-16h-32C32 34 30 46 30 46z" fill="#2D1B00"/><rect x="28" y="44" width="10" height="30" rx="5" fill="#2D1B00"/><rect x="82" y="44" width="10" height="30" rx="5" fill="#2D1B00"/><circle cx="48" cy="52" r="3" fill="#2D2D2D"/><circle cx="72" cy="52" r="3" fill="#2D2D2D"/><ellipse cx="60" cy="64" rx="4" ry="2" fill="#D9896C"/></svg>`,
  // 5: spiky hair, warm skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#FFCBA4"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#00B894"/><circle cx="60" cy="52" r="30" fill="#FFCBA4"/><path d="M34 38l6-16 8 10 6-14 6 12 6-14 8 10 8-12 4 16c0-22-12-36-28-36S32 16 34 38z" fill="#4A4A4A"/><circle cx="48" cy="52" r="3" fill="#2D2D2D"/><circle cx="72" cy="52" r="3" fill="#2D2D2D"/><ellipse cx="60" cy="64" rx="4" ry="2" fill="#E8967A"/></svg>`,
  // 6: headband, dark skin
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#6F4E37"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#E17055"/><circle cx="60" cy="52" r="30" fill="#6F4E37"/><ellipse cx="60" cy="28" rx="32" ry="18" fill="#1A1A2E"/><rect x="28" y="36" width="64" height="6" rx="3" fill="#E17055"/><circle cx="48" cy="52" r="3" fill="#F0F0F0"/><circle cx="72" cy="52" r="3" fill="#F0F0F0"/><ellipse cx="60" cy="64" rx="5" ry="2.5" fill="#5C3A1E"/></svg>`,
  // 7: glasses, light skin, side part
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#FDE8D0"/><ellipse cx="60" cy="100" rx="38" ry="24" fill="#636E72"/><circle cx="60" cy="52" r="30" fill="#FDE8D0"/><path d="M30 40c0-18 14-30 30-30s30 12 30 30c0 0-4-14-16-16l-28 2C34 28 30 40 30 40z" fill="#C0392B"/><circle cx="48" cy="52" r="8" fill="none" stroke="#2D2D2D" stroke-width="2"/><circle cx="72" cy="52" r="8" fill="none" stroke="#2D2D2D" stroke-width="2"/><line x1="56" y1="52" x2="64" y2="52" stroke="#2D2D2D" stroke-width="2"/><circle cx="48" cy="52" r="2.5" fill="#2D2D2D"/><circle cx="72" cy="52" r="2.5" fill="#2D2D2D"/><ellipse cx="60" cy="64" rx="4" ry="2" fill="#D9896C"/></svg>`,
];

/* ── DOM ───────────────────────────────────────────────────────────── */

const screens = {
  auth:    document.getElementById('auth-screen'),
  input:   document.getElementById('input-screen'),
  preview: document.getElementById('preview-screen'),
  success: document.getElementById('success-screen'),
  profile: document.getElementById('profile-screen'),
};

const progress = {
  overlay: document.getElementById('progress-overlay'),
  text:    document.getElementById('progress-text'),
  detail:  document.getElementById('progress-detail'),
  bar:     document.getElementById('progress-bar'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showProgress(text, detail, pct) {
  progress.overlay.classList.add('active');
  progress.text.textContent = text || 'Processing\u2026';
  progress.detail.textContent = detail || '';
  progress.bar.style.width = (pct || 0) + '%';
}

function hideProgress() { progress.overlay.classList.remove('active'); }

function showInlineError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

function hideInlineError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('visible');
}

/* ── Header scroll effect ──────────────────────────────────────────── */
const header = document.getElementById('app-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

/* ── Char count ────────────────────────────────────────────────────── */
const textInput = document.getElementById('text-input');
const charCount = document.getElementById('char-count');
textInput.addEventListener('input', () => {
  const len = textInput.value.length;
  charCount.textContent = len.toLocaleString() + ' chars';
});

/* ── Auth ──────────────────────────────────────────────────────────── */

async function checkAuth() {
  try {
    const data = await api('/auth/status');
    if (data.authenticated) {
      showScreen('input');
      document.getElementById('logout-btn').style.display = '';
      document.getElementById('quota-pill').style.display = '';
      document.getElementById('profile-btn').style.display = '';
      updateQuota(data.quotaUsed || 0);
      // Set profile button avatar
      if (data.profile?.picture) {
        document.getElementById('profile-btn-content').innerHTML =
          `<img src="${esc(data.profile.picture)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        document.getElementById('profile-btn-content').innerHTML =
          `<img src="${avatarSvgToDataUri(AVATARS[0])}" alt="" style="width:100%;height:100%;border-radius:50%;">`;
      }
    } else {
      showScreen('auth');
    }
  } catch {
    showScreen('auth');
  }
}

function updateQuota(used) {
  document.getElementById('quota-value').textContent = used.toLocaleString();
}

/* ── Logout ────────────────────────────────────────────────────────── */

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ok */ }
  showScreen('auth');
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('quota-pill').style.display = 'none';
  document.getElementById('profile-btn').style.display = 'none';
  toast('Signed out', 'info');
});

/* ── Preview ───────────────────────────────────────────────────────── */

document.getElementById('preview-btn').addEventListener('click', async () => {
  const text = textInput.value.trim();
  const resultsPerQuery = document.getElementById('results-per-query').value;

  hideInlineError('input-error');

  if (!text) {
    showInlineError('input-error', 'Paste some text first.');
    return;
  }

  showProgress('Searching YouTube\u2026', 'Parsing topics and looking up videos', 10);

  try {
    previewData = await api('/api/preview', {
      method: 'POST',
      body: JSON.stringify({ text, resultsPerQuery: parseInt(resultsPerQuery, 10) }),
    });

    // Fetch user playlists in parallel
    try {
      const plRes = await api('/api/playlists');
      userPlaylists = plRes.playlists || [];
    } catch { userPlaylists = []; }

    renderPreview(previewData);
    hideProgress();
    showScreen('preview');
    toast(`Found ${previewData.summary.totalVideos} videos across ${previewData.summary.topicCount} topics`, 'success');
  } catch (err) {
    hideProgress();
    const msg = err.error || err.message || 'Preview failed.';
    showInlineError('input-error', msg + (err.hint ? ' ' + err.hint : ''));
    toast(msg, 'error');
  }
});

/* ── Render Preview ────────────────────────────────────────────────── */

function renderPreview(data) {
  // Warnings
  const warningsEl = document.getElementById('preview-warnings');
  if (data.warnings?.length) {
    warningsEl.style.display = 'block';
    warningsEl.querySelector('ul').innerHTML = data.warnings.map(w => `<li>${esc(w)}</li>`).join('');
  } else {
    warningsEl.style.display = 'none';
  }

  updateSummary();

  // Topics
  const container = document.getElementById('topics-container');
  container.innerHTML = '';

  data.topics.forEach((topic, ti) => {
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.dataset.topicIdx = ti;
    card.style.animationDelay = `${ti * 60}ms`;

    // Head
    const head = document.createElement('div');
    head.className = 'topic-head';
    head.innerHTML = `
      <span class="topic-chevron">&#9660;</span>
      <span class="topic-num">${ti + 1}</span>
      <input class="topic-title-input" type="text" value="${esc(topic.title)}"
        aria-label="Playlist title" data-topic-idx="${ti}">
      <span class="topic-vid-count">${topic.videos.length} videos</span>
      <button class="topic-remove" data-topic-idx="${ti}" aria-label="Remove topic">&#10005;</button>
    `;

    head.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      card.classList.toggle('collapsed');
    });

    head.querySelector('.topic-title-input').addEventListener('change', (e) => {
      previewData.topics[ti].title = e.target.value;
    });

    card.appendChild(head);

    // Playlist picker — choose existing or create new
    const picker = document.createElement('div');
    picker.className = 'playlist-picker';
    picker.innerHTML = `
      <label for="playlist-pick-${ti}">Destination:</label>
      <select id="playlist-pick-${ti}" data-topic-idx="${ti}">
        <option value="">＋ Create new playlist</option>
        ${userPlaylists.map(p => `<option value="${esc(p.id)}"${topic.existingPlaylistId === p.id ? ' selected' : ''}>${esc(p.title)} (${p.videoCount} videos)</option>`).join('')}
      </select>
      <span class="picker-info">${userPlaylists.length ? userPlaylists.length + ' existing' : 'No playlists found'}</span>
    `;
    picker.querySelector('select').addEventListener('change', (e) => {
      previewData.topics[ti].existingPlaylistId = e.target.value || undefined;
    });
    card.appendChild(picker);

    // Queries badge
    if (topic.queries?.length) {
      const q = document.createElement('div');
      q.className = 'topic-queries';
      q.textContent = topic.queries.map(s => `"${s}"`).join('  ');
      card.appendChild(q);
    }

    // Body
    const body = document.createElement('div');
    body.className = 'topic-body';

    if (topic.videos.length === 0) {
      body.innerHTML = '<div class="topic-empty">&#9888; No videos found for this topic.</div>';
    } else {
      topic.videos.forEach((v, vi) => body.appendChild(makeVideoRow(v, ti, vi)));
    }

    // Add row
    const addRow = document.createElement('div');
    addRow.className = 'add-row';
    addRow.innerHTML = `
      <input class="add-input" type="text" placeholder="Add video by URL" data-topic-idx="${ti}">
      <button class="btn btn-xs btn-glass add-video-btn" data-topic-idx="${ti}">+ Add</button>
    `;
    body.appendChild(addRow);

    card.appendChild(body);
    container.appendChild(card);
  });

  // Quota
  const s = data.summary;
  document.getElementById('quota-estimate').textContent =
    `Create cost: ~${s.estimatedCreateCost.toLocaleString()} units  ·  Used so far: ${s.quotaUsedForPreview.toLocaleString()}`;
  updateQuota(s.quotaUsedForPreview);
}

/* ── Video Row ─────────────────────────────────────────────────────── */

function makeVideoRow(video, ti, vi) {
  const row = document.createElement('div');
  row.className = 'vid-row';
  row.draggable = true;
  row.dataset.topicIdx = ti;
  row.dataset.videoIdx = vi;

  row.innerHTML = `
    <span class="drag-grip" aria-hidden="true">&#10495;</span>
    <img class="vid-thumb" src="${esc(video.thumbnail || '')}" alt="" loading="lazy"
      onerror="this.style.background='var(--bg-overlay)'; this.alt='No thumbnail';">
    <div class="vid-meta">
      <div class="vid-title">${esc(video.title || 'Unknown')}</div>
      <div class="vid-channel">${esc(video.channelTitle || '')}</div>
      <div class="vid-source">via: ${esc(video.sourceQuery || '')}</div>
    </div>
    <button class="vid-remove" data-topic-idx="${ti}" data-video-idx="${vi}"
      aria-label="Remove video">&#10005;</button>
  `;

  // Drag & drop
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ topicIdx: ti, videoIdx: vi }));
    row.style.opacity = '0.4';
  });
  row.addEventListener('dragend', () => {
    row.style.opacity = '';
    document.querySelectorAll('.vid-row.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));
  });
  row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over-top'); });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over-top'));
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('drag-over-top');
    try {
      const src = JSON.parse(e.dataTransfer.getData('text/plain'));
      const tgt = { topicIdx: parseInt(row.dataset.topicIdx), videoIdx: parseInt(row.dataset.videoIdx) };
      if (src.topicIdx === tgt.topicIdx) {
        const vids = previewData.topics[tgt.topicIdx].videos;
        const [moved] = vids.splice(src.videoIdx, 1);
        vids.splice(tgt.videoIdx, 0, moved);
        renderPreview(previewData);
      }
    } catch { /* ignore */ }
  });

  return row;
}

/* ── Summary ───────────────────────────────────────────────────────── */

function updateSummary() {
  if (!previewData) return;
  const topics = previewData.topics;
  const totalVids = topics.reduce((s, t) => s + t.videos.length, 0);
  animateCounter('stat-playlists', topics.length);
  animateCounter('stat-videos', totalVids);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const duration = 400;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ── Event Delegation — Topics Container ───────────────────────────── */

document.getElementById('topics-container').addEventListener('click', (e) => {
  const target = e.target;

  // Remove topic
  if (target.classList.contains('topic-remove')) {
    const idx = parseInt(target.dataset.topicIdx);
    const title = previewData.topics[idx].title;
    previewData.topics.splice(idx, 1);
    renderPreview(previewData);
    toast(`Removed "${title}"`, 'info');
    return;
  }

  // Remove video
  if (target.classList.contains('vid-remove')) {
    const ti = parseInt(target.dataset.topicIdx);
    const vi = parseInt(target.dataset.videoIdx);
    previewData.topics[ti].videos.splice(vi, 1);
    previewData.topics[ti].videoCount = previewData.topics[ti].videos.length;
    renderPreview(previewData);
    return;
  }

  // Add video
  if (target.classList.contains('add-video-btn')) {
    const ti = parseInt(target.dataset.topicIdx);
    const input = target.previousElementSibling;
    const url = input.value.trim();
    if (!url) return;

    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) {
      toast('Invalid YouTube URL', 'error');
      input.style.borderColor = 'var(--error)';
      setTimeout(() => input.style.borderColor = '', 2000);
      return;
    }

    previewData.topics[ti].videos.push({
      videoId,
      title: `Video: ${videoId}`,
      channelTitle: 'Manually added',
      thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`,
      sourceQuery: 'manual',
    });
    previewData.topics[ti].videoCount = previewData.topics[ti].videos.length;
    input.value = '';
    renderPreview(previewData);
    toast('Video added', 'success');
  }
});

/* ── Back ──────────────────────────────────────────────────────────── */

document.getElementById('back-to-input-btn').addEventListener('click', () => showScreen('input'));

/* ── Create Playlists ──────────────────────────────────────────────── */

document.getElementById('create-btn').addEventListener('click', async () => {
  if (!previewData?.topics?.length) return;

  hideInlineError('preview-error');

  const privacy = document.getElementById('privacy-select').value;
  const titlePrefix = document.getElementById('title-prefix').value.trim();
  const titleSuffix = document.getElementById('title-suffix').value.trim();

  const topicsToCreate = previewData.topics
    .map(t => ({
      title: t.title,
      queries: t.queries,
      videos: t.videos.map(v => ({ videoId: v.videoId })),
      existingPlaylistId: t.existingPlaylistId || undefined,
    }))
    .filter(t => t.videos.length > 0);

  if (topicsToCreate.length === 0) {
    showInlineError('preview-error', 'No topics with videos to create.');
    return;
  }

  showProgress('Creating playlists\u2026', `0 / ${topicsToCreate.length}`, 0);

  try {
    const result = await api('/api/create', {
      method: 'POST',
      body: JSON.stringify({ topics: topicsToCreate, privacyStatus: privacy, titlePrefix, titleSuffix }),
    });

    hideProgress();
    renderSuccess(result);
    showScreen('success');
    toast('Playlists created!', 'success');
  } catch (err) {
    hideProgress();
    const msg = err.error || err.message || 'Creation failed.';
    showInlineError('preview-error', msg);
    toast(msg, 'error');

    if (err.partialResults?.length) {
      renderSuccess({ results: err.partialResults, errors: [], summary: { created: err.partialResults.length } });
      showScreen('success');
    }
  }
});

/* ── Success ───────────────────────────────────────────────────────── */

function renderSuccess(data) {
  const summaryEl = document.getElementById('success-summary');
  const linksEl = document.getElementById('playlist-links');
  const errorsEl = document.getElementById('success-errors');

  const s = data.summary || {};
  const parts = [];
  if (s.created) parts.push(`${s.created} playlist(s) created`);
  if (s.totalVideosAdded) parts.push(`${s.totalVideosAdded} videos added`);
  if (s.alreadyExisted) parts.push(`${s.alreadyExisted} already existed`);
  if (s.quotaUsed) parts.push(`${s.quotaUsed} quota units used`);
  summaryEl.textContent = parts.join('  \u00B7  ');

  linksEl.innerHTML = '';
  for (const r of data.results || []) {
    if (r.skipped) continue;
    const card = document.createElement('div');
    card.className = 'playlist-result-card';
    card.style.animationDelay = `${linksEl.children.length * 80}ms`;
    card.innerHTML = `
      <div>
        <div class="pl-result-title">${esc(r.title || '')}</div>
        <div class="pl-result-meta">${r.videosAdded || 0} videos${r.addedToExisting ? ' \u00B7 added to existing' : ''}${r.alreadyExisted ? ' (existed)' : ''}${r.videosFailed?.length ? ' \u00B7 ' + r.videosFailed.length + ' failed' : ''}</div>
      </div>
      <a href="${esc(r.url || '#')}" target="_blank" rel="noopener noreferrer" class="btn-open">
        Open <span>\u2197</span>
      </a>
    `;
    linksEl.appendChild(card);
  }

  if (data.errors?.length) {
    errorsEl.textContent = 'Some topics failed: ' + data.errors.map(e => `${e.title}: ${e.error}`).join('; ');
    errorsEl.classList.add('visible');
  } else {
    errorsEl.classList.remove('visible');
  }
}

/* ── Start Over ────────────────────────────────────────────────────── */

document.getElementById('start-over-btn').addEventListener('click', () => {
  previewData = null;
  textInput.value = '';
  charCount.textContent = '0 chars';
  showScreen('input');
});

/* ── Init ──────────────────────────────────────────────────────────── */

checkAuth();

/* ── Profile ───────────────────────────────────────────────────────── */

document.getElementById('profile-btn').addEventListener('click', async () => {
  showScreen('profile');
  loadProfile();
});

document.getElementById('back-from-profile').addEventListener('click', () => {
  showScreen('input');
});

async function loadProfile() {
  try {
    profileData = await api('/api/profile');
    renderProfile(profileData);
  } catch (err) {
    toast('Failed to load profile', 'error');
  }
}

function getAvatarSrc(profile, customAvatar) {
  if (customAvatar !== null && customAvatar !== undefined) return null; // use emoji
  if (profile?.picture) return profile.picture;
  return null;
}

function renderProfile(data) {
  const { profile, customAvatar, quotaUsed, quotaLimit, playlists } = data;

  // Name & email
  document.getElementById('profile-name').textContent = profile.name || 'User';
  document.getElementById('profile-email').textContent = profile.email || '';

  // Avatar
  const avatarImg = document.getElementById('profile-avatar');
  if (customAvatar !== null && customAvatar !== undefined) {
    avatarImg.src = avatarSvgToDataUri(AVATARS[customAvatar] || AVATARS[0]);
  } else if (profile.picture) {
    avatarImg.src = profile.picture;
  } else {
    avatarImg.src = avatarSvgToDataUri(AVATARS[0]);
  }

  // Quota
  const pct = Math.min((quotaUsed / quotaLimit) * 100, 100);
  const remaining = Math.max(quotaLimit - quotaUsed, 0);
  const barFill = document.getElementById('quota-bar-fill');
  barFill.style.width = pct + '%';
  barFill.className = 'quota-bar-fill' + (pct > 80 ? ' critical' : pct > 50 ? ' high' : '');
  document.getElementById('quota-used-label').textContent = quotaUsed.toLocaleString() + ' used';
  document.getElementById('quota-remaining-label').textContent = remaining.toLocaleString() + ' remaining';

  // Playlists
  document.getElementById('playlists-count').textContent = playlists.length;
  const container = document.getElementById('profile-playlists');
  container.innerHTML = '';

  if (playlists.length === 0) {
    container.innerHTML = '<div class="profile-pl-empty">No playlists yet. Create your first one!</div>';
    return;
  }

  playlists.forEach((pl, i) => {
    const card = document.createElement('div');
    card.className = 'profile-pl-card';
    card.style.animationDelay = `${i * 50}ms`;
    card.innerHTML = `
      <img class="profile-pl-thumb" src="${esc(pl.thumbnail || '')}" alt=""
        loading="lazy" onerror="this.style.background='var(--bg-overlay)';">
      <div class="profile-pl-meta">
        <div class="profile-pl-title">${esc(pl.title || 'Untitled')}</div>
        <div class="profile-pl-sub">${pl.videoCount || 0} videos</div>
      </div>
      <a href="${esc(pl.url || '#')}" target="_blank" rel="noopener noreferrer" class="profile-pl-open">
        Open \u2197
      </a>
    `;
    container.appendChild(card);
  });
}

function avatarSvgToDataUri(svgStr) {
  return 'data:image/svg+xml,' + encodeURIComponent(svgStr);
}

/* ── Avatar Picker ────────────────────────────────────────────────── */

const avatarModal = document.getElementById('avatar-modal');
const avatarGrid = document.getElementById('avatar-grid');

// Populate avatar grid
AVATARS.forEach((svg, i) => {
  const btn = document.createElement('button');
  btn.className = 'avatar-option';
  btn.innerHTML = `<img src="${avatarSvgToDataUri(svg)}" alt="Avatar ${i + 1}" style="width:100%;height:100%;border-radius:50%;">`;
  btn.dataset.idx = i;
  btn.addEventListener('click', () => {
    avatarGrid.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedAvatarIdx = i;
  });
  avatarGrid.appendChild(btn);
});

document.getElementById('avatar-wrap').addEventListener('click', () => {
  avatarModal.classList.add('active');
  // Pre-select current
  if (profileData?.customAvatar !== null && profileData?.customAvatar !== undefined) {
    selectedAvatarIdx = profileData.customAvatar;
    avatarGrid.querySelectorAll('.avatar-option').forEach(b => {
      b.classList.toggle('selected', parseInt(b.dataset.idx) === selectedAvatarIdx);
    });
  }
});

document.getElementById('avatar-cancel').addEventListener('click', () => {
  avatarModal.classList.remove('active');
  selectedAvatarIdx = null;
});

document.getElementById('avatar-save').addEventListener('click', async () => {
  if (selectedAvatarIdx === null) {
    avatarModal.classList.remove('active');
    return;
  }
  try {
    await api('/api/profile/avatar', {
      method: 'POST',
      body: JSON.stringify({ avatar: selectedAvatarIdx }),
    });
    avatarModal.classList.remove('active');
    if (profileData) profileData.customAvatar = selectedAvatarIdx;
    // Update avatar display
    const avatarImg = document.getElementById('profile-avatar');
    avatarImg.src = avatarSvgToDataUri(AVATARS[selectedAvatarIdx]);
    // Update header button
    document.getElementById('profile-btn-content').innerHTML =
      `<img src="${avatarSvgToDataUri(AVATARS[selectedAvatarIdx])}" alt="" style="width:100%;height:100%;border-radius:50%;">`;
    toast('Avatar updated', 'success');
  } catch {
    toast('Failed to update avatar', 'error');
  }
});

// Close modal on backdrop click
avatarModal.addEventListener('click', (e) => {
  if (e.target === avatarModal) {
    avatarModal.classList.remove('active');
    selectedAvatarIdx = null;
  }
});

/* ── Button Ripple Effect ──────────────────────────────────────────── */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn, .btn-google, .btn-open');
  if (!btn || btn.disabled) return;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

/* ── Scroll Reveal Observer ────────────────────────────────────────── */

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

// Auto-observe elements with .reveal class on screen transitions
const originalShowScreen = showScreen;
showScreen = function(name) {
  originalShowScreen(name);
  // After screen transition, observe any .reveal elements in the new screen
  requestAnimationFrame(() => {
    const currentScreen = screens[name];
    if (currentScreen) {
      currentScreen.querySelectorAll('.reveal').forEach(el => {
        el.classList.remove('visible');
        revealObserver.observe(el);
      });
    }
  });
};

/* ── Smooth scroll for anchor links ────────────────────────────────── */

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.querySelector(link.getAttribute('href'));
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* ── Hover tilt for cards ──────────────────────────────────────────── */

document.addEventListener('mousemove', (e) => {
  if (!e.target || !e.target.closest) return;
  const card = e.target.closest('.auth-card, .options-panel');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  card.style.transform = `perspective(800px) rotateY(${x * 3}deg) rotateX(${-y * 3}deg) translateY(-2px)`;
});

document.addEventListener('mouseleave', (e) => {
  if (!e.target || !e.target.closest) return;
  const card = e.target.closest('.auth-card, .options-panel');
  if (card) card.style.transform = '';
}, true);
