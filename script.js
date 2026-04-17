/* ============================================
   YT2 — The Obsidian Stage
   Full Backend Integration Script
   ============================================ */

const API_BASE = 'https://flybee.onrender.com';

let currentVideoId = null;
let currentVideoData = null;
let currentQuery = '';
let likedVideos = new Set(JSON.parse(localStorage.getItem('yt2-liked') || '[]'));
let heroVideoId = null;

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', () => {
    initSearch();
    initModal();
    initCategoryChips();
    initCategoryChips();
    initHeroActions();
    loadRecommended('Trending');
});

/* ========== SEARCH ========== */
function initSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    const clearBtn = document.getElementById('searchClear');

    btn.addEventListener('click', triggerSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') triggerSearch(); });

    input.addEventListener('input', () => {
        clearBtn.classList.toggle('visible', input.value.length > 0);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('visible');
        showHomePage();
        input.focus();
    });

    document.addEventListener('keydown', e => {
        if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            input.focus();
        }
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Mobile search trigger
    const mobileTrigger = document.getElementById('mobileSearchTrigger');
    if (mobileTrigger) {
        mobileTrigger.addEventListener('click', () => {
            input.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

function triggerSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        showToast('Please enter a search query', 'error');
        shakeSearch();
        return;
    }
    currentQuery = query;
    performSearch(query);
}

async function performSearch(query) {
    showLoadingState();
    document.getElementById('searchPage').classList.add('hidden');
    document.getElementById('homePage').classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&maxResults=20`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        displaySearchResults(data.items || [], query);
    } catch (err) {
        console.error('Search error:', err);
        showToast('Search failed: ' + err.message, 'error');
        showHomePage();
    }
}

function displaySearchResults(videos, query) {
    hideAllStates();

    const page = document.getElementById('searchPage');
    const grid = document.getElementById('searchGrid');
    const noResults = document.getElementById('noResults');
    const label = document.getElementById('searchQueryLabel');

    label.textContent = `"${query}"`;
    page.classList.remove('hidden');

    if (!videos.length) {
        grid.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    grid.innerHTML = videos.map((v, i) => createVideoCardHTML(v, i)).join('');
    grid.className = 'video-grid';
    grid.style.padding = '0 24px';
    attachCardListeners(grid);
}

/* ========== RECOMMENDED / HOME ========== */
async function loadRecommended(category) {
    showLoadingState();

    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(category)}&maxResults=20`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const items = data.items || [];

        // Set hero from first result
        if (items.length > 0) {
            setHeroFromVideo(items[0]);
        }

        hideAllStates();
        const page = document.getElementById('homePage');
        const grid = document.getElementById('recommendGrid');

        page.classList.remove('hidden');
        grid.innerHTML = items.map((v, i) => createVideoCardHTML(v, i)).join('');
        attachCardListeners(grid);

        const meta = document.getElementById('sectionMeta');
        meta.textContent = `${items.length} videos`;

    } catch (err) {
        console.error('Recommend error:', err);
        showToast('Failed to load recommendations', 'error');
        hideAllStates();
        document.getElementById('homePage').classList.remove('hidden');
    }
}

function setHeroFromVideo(video) {
    const snippet = video.snippet;
    const thumbs = snippet.thumbnails;
    heroVideoId = video.id.videoId || video.id;

    const heroImg = document.getElementById('heroImg');
    const heroTitle = document.getElementById('heroTitle');
    const heroDesc = document.getElementById('heroDesc');

    heroImg.src = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url
        || 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=1600&q=80';
    heroImg.onerror = () => {
        heroImg.src = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=1600&q=80';
    };

    heroTitle.textContent = snippet.title;
    heroDesc.textContent = snippet.description || 'Watch now on YT2 — The Obsidian Stage.';
}

function initHeroActions() {
    document.getElementById('heroWatchBtn').addEventListener('click', () => {
        if (heroVideoId) openVideoModal(heroVideoId);
    });
    document.getElementById('heroDetailsBtn').addEventListener('click', () => {
        if (heroVideoId) openVideoModal(heroVideoId);
    });
    document.querySelector('.hero').addEventListener('click', e => {
        if (!e.target.closest('button') && heroVideoId) openVideoModal(heroVideoId);
    });
}

/* ========== CATEGORY CHIPS ========== */
function initCategoryChips() {
    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const query = chip.dataset.query;

            // Switch back to home page
            document.getElementById('searchPage').classList.add('hidden');
            document.getElementById('searchInput').value = '';
            document.getElementById('searchClear').classList.remove('visible');
            document.getElementById('sectionMeta').textContent = '';

            loadRecommended(query);
        });
    });
}

/* ========== VIDEO CARD ========== */
function createVideoCardHTML(video, index) {
    const snippet = video.snippet;
    const thumbs = snippet.thumbnails;
    const thumbUrl = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url
        || `https://picsum.photos/seed/${index}/640/360`;
    const videoId = video.id?.videoId || video.id;
    const timeAgo = formatTimeAgo(new Date(snippet.publishedAt));
    const views = video.viewCount ? formatViews(video.viewCount) : '';
    const duration = video.duration || '';
    const isLive = duration === 'LIVE' || duration === '';
    const channelThumb = snippet.channelThumbnail || '';

    const avatarHTML = channelThumb
        ? `<img src="${channelThumb}" alt="${snippet.channelTitle}" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-outlined\\' style=\\'font-size:20px;color:var(--text-dim)\\'>account_circle</span>'">`
        : `<span class="material-symbols-outlined" style="font-size:20px;color:var(--text-dim)">account_circle</span>`;

    const badgeHTML = isLive
        ? `<span class="card-live">LIVE</span>`
        : `<span class="card-duration">${duration}</span>`;

    return `
        <div class="video-card" data-video-id="${videoId}" data-index="${index}">
            <div class="card-thumb-wrap">
                <img class="card-thumb" src="${thumbUrl}" alt="${escapeHTML(snippet.title)}" loading="lazy"
                     onerror="this.src='https://picsum.photos/seed/${videoId}/640/360'"/>
                <div class="card-thumb-overlay"></div>
                ${badgeHTML}
            </div>
            <div class="card-meta">
                <div class="card-avatar">${avatarHTML}</div>
                <div class="card-text">
                    <h3 class="card-title">${escapeHTML(snippet.title)}</h3>
                    <p class="card-channel">${escapeHTML(snippet.channelTitle)}</p>
                    <p class="card-stats">${views ? views + ' views · ' : ''}${timeAgo}</p>
                </div>
            </div>
        </div>
    `;
}

function attachCardListeners(container) {
    container.querySelectorAll('.video-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.videoId;
            if (id) openVideoModal(id);
        });
    });
}

/* ========== VIDEO MODAL ========== */
function initModal() {
    document.getElementById('modalBackdrop').addEventListener('click', closeModal);
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('downloadBtn').addEventListener('click', toggleDownloadPanel);
    document.getElementById('closeDownloadPanel').addEventListener('click', toggleDownloadPanel);
    document.getElementById('shareBtn').addEventListener('click', shareVideo);
    document.getElementById('likeBtn').addEventListener('click', likeVideo);
    document.getElementById('subscribeBtn').addEventListener('click', toggleSubscribe);

    // Desc toggle
    document.getElementById('descToggle').addEventListener('click', () => {
        const desc = document.getElementById('videoDesc');
        const btn = document.getElementById('descToggle');
        const expanded = desc.classList.toggle('expanded');
        btn.textContent = expanded ? 'Show less' : 'Show more';
    });
}

async function openVideoModal(videoId) {
    currentVideoId = videoId;

    const modal = document.getElementById('videoModal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Reset state
    document.getElementById('playerContainer').innerHTML = `
        <div class="player-placeholder">
            <div class="player-spinner">
                <span class="material-symbols-outlined spin-icon">autorenew</span>
            </div>
        </div>
    `;
    document.getElementById('videoTitle').textContent = 'Loading...';
    document.getElementById('videoChannel').textContent = '';
    document.getElementById('videoStats').textContent = '';
    document.getElementById('videoDesc').textContent = '';
    document.getElementById('videoDesc').classList.remove('expanded');
    document.getElementById('descToggle').textContent = 'Show more';
    document.getElementById('downloadPanel').classList.add('hidden');
    document.getElementById('relatedGrid').innerHTML = '';

    // Update like state
    const likeBtn = document.getElementById('likeBtn');
    if (likedVideos.has(videoId)) {
        likeBtn.classList.add('liked');
    } else {
        likeBtn.classList.remove('liked');
    }

    try {
        const res = await fetch(`${API_BASE}/info?id=${videoId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        currentVideoData = data;
        populateModal(data, videoId);
    } catch (err) {
        console.error('Video info error:', err);
        // Fallback to embed
        embedPlayer(videoId);
        document.getElementById('videoTitle').textContent = 'YouTube Video';
        document.getElementById('videoChannel').textContent = 'YouTube';
        showToast('Using embedded player', 'info');
    }

    loadRelatedVideos(videoId);
    modal.querySelector('.modal-scroll-area').scrollTop = 0;
}

function populateModal(data, videoId) {
    document.getElementById('videoTitle').textContent = data.title || 'Video';
    document.getElementById('videoChannel').textContent = data.channel || 'YouTube Channel';
    document.getElementById('videoSubCount').textContent = data.subscriberCount ? formatViews(data.subscriberCount) + ' subscribers' : '';

    const views = data.viewCount ? formatViews(data.viewCount) + ' views' : '';
    const date = data.publishDate ? ' · ' + formatTimeAgo(new Date(data.publishDate)) : '';
    const likes = data.likes ? ' · ' + formatViews(data.likes) + ' likes' : '';
    document.getElementById('videoStats').textContent = views + date + likes;
    document.getElementById('likeCount').textContent = data.likes ? formatViews(data.likes) : 'Like';

    const desc = data.description || '';
    document.getElementById('videoDesc').textContent = desc;
    document.getElementById('descToggle').style.display = desc.length > 120 ? 'block' : 'none';

    embedPlayer(videoId);
}

function embedPlayer(videoId) {
    document.getElementById('playerContainer').innerHTML = `
        <iframe
            src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
        </iframe>
    `;
}

function closeModal() {
    const modal = document.getElementById('videoModal');
    modal.classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('playerContainer').innerHTML = '';
    document.getElementById('downloadPanel').classList.add('hidden');
    currentVideoId = null;
    currentVideoData = null;
}

/* ========== RELATED VIDEOS ========== */
async function loadRelatedVideos(videoId) {
    try {
        const query = currentVideoData?.title
            ? currentVideoData.title.split(' ').slice(0, 4).join(' ')
            : 'recommended videos';

        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&maxResults=8`);
        const data = await res.json();
        if (data.error) return;

        const items = (data.items || []).filter(v => (v.id?.videoId || v.id) !== videoId).slice(0, 6);
        const grid = document.getElementById('relatedGrid');
        grid.innerHTML = items.map(v => createRelatedCardHTML(v)).join('');

        grid.querySelectorAll('.related-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.videoId;
                if (id) openVideoModal(id);
            });
        });
    } catch (e) {
        console.error('Related load error:', e);
    }
}

function createRelatedCardHTML(video) {
    const snippet = video.snippet;
    const thumbs = snippet.thumbnails;
    const thumbUrl = thumbs.high?.url || thumbs.medium?.url || '';
    const videoId = video.id?.videoId || video.id;
    const timeAgo = formatTimeAgo(new Date(snippet.publishedAt));
    const views = video.viewCount ? formatViews(video.viewCount) + ' views · ' : '';
    const duration = video.duration && video.duration !== 'LIVE' ? video.duration : '';

    return `
        <div class="related-card" data-video-id="${videoId}">
            <div class="related-thumb">
                <img src="${thumbUrl}" alt="${escapeHTML(snippet.title)}" loading="lazy"
                     onerror="this.style.display='none'">
                ${duration ? `<span class="related-duration">${duration}</span>` : ''}
            </div>
            <div class="related-info">
                <p class="related-title-text">${escapeHTML(snippet.title)}</p>
                <p class="related-channel">${escapeHTML(snippet.channelTitle)}</p>
                <p class="related-stats">${views}${timeAgo}</p>
            </div>
        </div>
    `;
}

/* ========== DOWNLOAD ========== */
async function toggleDownloadPanel() {
    const panel = document.getElementById('downloadPanel');
    const isHidden = panel.classList.contains('hidden');

    if (isHidden) {
        panel.classList.remove('hidden');
        const list = document.getElementById('formatList');
        list.innerHTML = `
            <div style="text-align:center;padding:24px;color:var(--text-muted)">
                <span class="material-symbols-outlined spin-icon" style="font-size:28px;display:block;margin-bottom:8px">autorenew</span>
                Loading formats...
            </div>
        `;

        try {
            const res = await fetch(`${API_BASE}/info?id=${currentVideoId}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            renderFormats(data.formats || []);
        } catch (err) {
            list.innerHTML = `
                <div style="text-align:center;padding:24px;color:var(--text-muted)">
                    <span class="material-symbols-outlined" style="font-size:32px;display:block;margin-bottom:8px;color:var(--primary)">error</span>
                    Failed to load formats
                </div>
            `;
        }
    } else {
        panel.classList.add('hidden');
    }
}

function renderFormats(formats) {
    const list = document.getElementById('formatList');
    if (!formats.length) {
        list.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:16px">No formats available</p>`;
        return;
    }

    const vidFormats = formats.filter(f => f.hasVideo && f.hasAudio && f.quality);
    const audFormats = formats.filter(f => !f.hasVideo && f.hasAudio);

    let html = '';

    if (vidFormats.length) {
        html += `<div class="format-group-label">Video + Audio</div>`;
        vidFormats.forEach(f => { html += formatItemHTML(f, false); });
    }

    if (audFormats.length) {
        html += `<div class="format-group-label">Audio Only</div>`;
        audFormats.forEach(f => { html += formatItemHTML(f, true); });
    }

    list.innerHTML = html || `<p style="text-align:center;color:var(--text-muted);padding:16px">No formats</p>`;

    list.querySelectorAll('.format-item').forEach(item => {
        item.addEventListener('click', () => {
            downloadVideo(currentVideoId, item.dataset.itag);
        });
    });
}

function formatItemHTML(format, isAudio) {
    const icon = isAudio ? 'headphones' : 'movie';
    const quality = format.quality || 'Audio';
    const size = (format.size && format.size !== 'unknown') ? format.size : '—';
    const container = format.container || '';

    return `
        <div class="format-item" data-itag="${format.itag}">
            <div class="format-item-left">
                <div class="format-icon">
                    <span class="material-symbols-outlined">${icon}</span>
                </div>
                <div>
                    <span class="format-quality">${quality}</span>
                    <span class="format-sub">${container}</span>
                </div>
            </div>
            <span class="format-size">${size}</span>
        </div>
    `;
}

function downloadVideo(videoId, itag) {
    const url = `${API_BASE}/download?id=${videoId}&itag=${itag}`;
    showToast('Download started!', 'success');
    window.open(url, '_blank');
    setTimeout(() => {
        document.getElementById('downloadPanel').classList.add('hidden');
    }, 600);
}

/* ========== SHARE ========== */
function shareVideo() {
    const url = `https://youtube.com/watch?v=${currentVideoId}`;
    const title = currentVideoData?.title || 'YT2 Video';

    if (navigator.share) {
        navigator.share({ title, url }).catch(() => copyToClipboard(url));
    } else {
        copyToClipboard(url);
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('Link copied!', 'success'));
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Link copied!', 'success');
    }
}

/* ========== LIKE ========== */
function likeVideo() {
    if (!currentVideoId) return;
    const btn = document.getElementById('likeBtn');
    const isLiked = btn.classList.toggle('liked');

    if (isLiked) {
        likedVideos.add(currentVideoId);
        showToast('Added to liked videos', 'success');
    } else {
        likedVideos.delete(currentVideoId);
        showToast('Removed from liked', 'info');
    }

    localStorage.setItem('yt2-liked', JSON.stringify([...likedVideos]));
}

/* ========== SUBSCRIBE ========== */
function toggleSubscribe() {
    const btn = document.getElementById('subscribeBtn');
    const isSub = btn.classList.toggle('subscribed');
    btn.textContent = isSub ? 'Subscribed' : 'Subscribe';
    showToast(isSub ? 'Subscribed!' : 'Unsubscribed', isSub ? 'success' : 'info');
}

/* ========== UI STATES ========== */
function showLoadingState() {
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('searchPage').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('hidden');
}

function hideAllStates() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('searchPage').classList.add('hidden');
}

function showHomePage() {
    hideAllStates();
    document.getElementById('homePage').classList.remove('hidden');
    loadRecommended(getActiveCategory());
}

function getActiveCategory() {
    const active = document.querySelector('.cat-chip.active');
    return active ? active.dataset.query : 'Trending';
}

/* ========== TOAST ========== */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    toast.innerHTML = `
        <span class="material-symbols-outlined">${icons[type] || 'info'}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 2800);
}

/* ========== SEARCH SHAKE ========== */
function shakeSearch() {
    const wrap = document.getElementById('searchWrap');
    wrap.style.animation = 'none';
    wrap.offsetHeight; // reflow
    wrap.style.animation = 'searchShake 0.4s ease';
    setTimeout(() => { wrap.style.animation = ''; }, 400);
}

const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes searchShake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-5px); }
    80% { transform: translateX(5px); }
}`;
document.head.appendChild(shakeStyle);

/* ========== UTILITIES ========== */
function formatTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const mo = Math.floor(d / 30);
    const y = Math.floor(d / 365);

    if (y > 0) return `${y} year${y > 1 ? 's' : ''} ago`;
    if (mo > 0) return `${mo} month${mo > 1 ? 's' : ''} ago`;
    if (d > 0) return `${d} day${d > 1 ? 's' : ''} ago`;
    if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ago`;
    if (m > 0) return `${m} min ago`;
    return 'Just now';
}

function formatViews(num) {
    const n = parseInt(num, 10);
    if (isNaN(n)) return num;
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
}

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ========== SCROLL: hide header ========== */
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const topNav = document.getElementById('topNav');
    const curr = window.scrollY;
    if (curr > lastScroll && curr > 80) {
        topNav.style.transform = 'translateY(-100%)';
    } else {
        topNav.style.transform = 'translateY(0)';
    }
    lastScroll = curr;
}, { passive: true });