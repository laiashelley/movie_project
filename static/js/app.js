/* ============================================================
   MY VIDEO STORE — app.js
   ============================================================ */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let allMovies = [];
let filteredMovies = [];
let chatHistory = [];
let posterQueue = [];
let isChatOpen = false;

// Pagination & Infinite Scroll
let currentPage = 1;
const PAGE_SIZE = 24;
let sentinelObserver;

// IntersectionObserver for lazy poster loading
let posterObserver;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const movieGrid    = document.getElementById('movieGrid');
const noResults    = document.getElementById('noResults');
const searchInput  = document.getElementById('searchInput');
const genreSelect  = document.getElementById('genreSelect');
const yearFrom     = document.getElementById('yearFrom');
const yearTo       = document.getElementById('yearTo');
const minRating    = document.getElementById('minRating');
const sortSelect   = document.getElementById('sortSelect');
const btnReset     = document.getElementById('btnReset');
const statCount    = document.getElementById('statCount');
const statShowing  = document.getElementById('statShowing');
const statAvg      = document.getElementById('statAvg');
const statYears    = document.getElementById('statYears');

// Modal
const modalBackdrop     = document.getElementById('modalBackdrop');
const modalClose        = document.getElementById('modalClose');
const modalPoster       = document.getElementById('modalPoster');
const modalVhsTitle     = document.getElementById('modalVhsTitle');
const modalSpineTitle   = document.getElementById('modalSpineTitle');
const modalBadge        = document.getElementById('modalBadge');
const modalTitle        = document.getElementById('modalTitle');
const modalOriginalTitle= document.getElementById('modalOriginalTitle');
const modalDirector     = document.getElementById('modalDirector');
const modalActors       = document.getElementById('modalActors');
const modalProvidersRow = document.getElementById('modalProvidersRow');
const modalProviders    = document.getElementById('modalProviders');
const modalYear         = document.getElementById('modalYear');
const modalRuntime      = document.getElementById('modalRuntime');
const modalGenres       = document.getElementById('modalGenres');
const modalDateRated    = document.getElementById('modalDateRated');
const modalImdbRating   = document.getElementById('modalImdbRating');
const modalVotes        = document.getElementById('modalVotes');
const modalYourStars    = document.getElementById('modalYourStars');
const modalYourRating   = document.getElementById('modalYourRating');
const modalImdbLink     = document.getElementById('modalImdbLink');
const modalDescription  = document.getElementById('modalDescription');

// Chat
const chatToggle   = document.getElementById('chatToggle');
const chatSidebar  = document.getElementById('chatSidebar');
const chatClose    = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatInput    = document.getElementById('chatInput');
const chatSend     = document.getElementById('chatSend');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVotes(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M votos`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K votos`;
  return `${n} votos`;
}

function formatRuntime(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function starsHtml(rating) {
  if (!rating) return '<span style="color:var(--text-muted)">Sin valorar</span>';
  const full  = Math.floor(rating / 2);
  const half  = rating % 2 >= 1 ? 1 : 0;
  const empty = 5 - full - half;
  let html = '';
  for (let i = 0; i < full;  i++) html += '<i class="fa fa-star"></i>';
  if (half)                        html += '<i class="fa fa-star-half-alt"></i>';
  for (let i = 0; i < empty; i++) html += '<i class="far fa-star"></i>';
  return html;
}

function typeBadge(titleType) {
  if (!titleType) return 'PELÍCULA';
  const t = titleType.toLowerCase();
  if (t.includes('tv'))    return 'TV';
  if (t.includes('vídeo') || t.includes('video')) return 'VIDEO';
  return 'PELÍCULA';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Boot: fetch movies
// ---------------------------------------------------------------------------
async function init() {
  try {
    const res = await fetch('/api/movies');
    allMovies = await res.json();
    populateGenreFilter();
    setupPosterObserver();
    applyFiltersAndRender();
    await loadChatHistory();
    setupSentinelObserver();
  } catch (err) {
    movieGrid.innerHTML = `<p style="color:var(--pink);font-size:1.4rem;padding:40px">
      Error cargando películas: ${escapeHtml(err.message)}
    </p>`;
  }
}

// ---------------------------------------------------------------------------
// Genre filter population
// ---------------------------------------------------------------------------
function populateGenreFilter() {
  const genres = new Set();
  allMovies.forEach(m => {
    (m.genres_list || []).forEach(g => genres.add(g));
  });
  [...genres].sort().forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    genreSelect.appendChild(opt);
  });
}

// ---------------------------------------------------------------------------
// Filters + sort
// ---------------------------------------------------------------------------
function getFilters() {
  return {
    search:    searchInput.value.trim().toLowerCase(),
    genre:     genreSelect.value,
    yearFrom:  yearFrom.value ? parseInt(yearFrom.value) : null,
    yearTo:    yearTo.value   ? parseInt(yearTo.value)   : null,
    minRating: parseInt(minRating.value) || 0,
    sort:      sortSelect.value,
  };
}

function applyFiltersAndRender() {
  const f = getFilters();

  const hasActiveFilters = !!(f.search || f.genre || f.yearFrom || f.yearTo || f.minRating > 0);
  if (hasActiveFilters) {
    btnReset.classList.remove('hidden');
  } else {
    btnReset.classList.add('hidden');
  }

  filteredMovies = allMovies.filter(m => {
    if (f.search) {
      const haystack = [
        m['Title']          || '',
        m['Original Title'] || '',
        m['Directors']      || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(f.search)) return false;
    }
    if (f.genre && !(m.genres_list || []).includes(f.genre)) return false;
    if (f.yearFrom && m['Year'] < f.yearFrom) return false;
    if (f.yearTo   && m['Year'] > f.yearTo)   return false;
    if (f.minRating > 0) {
      const yr = m['Your Rating'];
      if (!yr || yr < f.minRating) return false;
    }
    return true;
  });

  // Sort
  filteredMovies.sort((a, b) => {
    switch (f.sort) {
      case 'title':
        return (a['Title'] || '').localeCompare(b['Title'] || '', 'es');
      case 'year_desc':
        return (b['Year'] || 0) - (a['Year'] || 0);
      case 'year_asc':
        return (a['Year'] || 0) - (b['Year'] || 0);
      case 'imdb_desc':
        return (b['IMDb Rating'] || 0) - (a['IMDb Rating'] || 0);
      case 'your_desc':
        return ((b['Your Rating'] || 0) - (a['Your Rating'] || 0)) ||
               ((b['IMDb Rating'] || 0) - (a['IMDb Rating'] || 0));
      case 'rated_desc': {
        const da = a['Date Rated'] || '0000-00-00';
        const db = b['Date Rated'] || '0000-00-00';
        return db.localeCompare(da);
      }
      default: // position
        return (a['Position'] || 0) - (b['Position'] || 0);
    }
  });

  renderGrid();
  updateStats();
}

// ---------------------------------------------------------------------------
// Render grid
// ---------------------------------------------------------------------------
function renderGrid(append = false) {
  if (!append) {
    movieGrid.innerHTML = '';
    currentPage = 1;
  }

  if (filteredMovies.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const batch = filteredMovies.slice(start, end);

  const fragment = document.createDocumentFragment();

  batch.forEach(movie => {
    const card = buildCard(movie);
    fragment.appendChild(card);
  });

  movieGrid.appendChild(fragment);

  // Observe newly added cards for lazy poster loading
  movieGrid.querySelectorAll('.card-poster[data-imdb-id]:not([data-observed])').forEach(el => {
    el.dataset.observed = '1';
    posterObserver.observe(el);
  });
}

function setupSentinelObserver() {
  const sentinel = document.getElementById('sentinel');
  if (!sentinel) return;

  sentinelObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && filteredMovies.length > currentPage * PAGE_SIZE) {
        currentPage++;
        renderGrid(true);
      }
    });
  }, { rootMargin: '300px' });

  sentinelObserver.observe(sentinel);
}

function buildCard(movie) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.dataset.imdbId = movie['Const'];

  const yr = movie['Year'] || '?';
  const imdbRating = movie['IMDb Rating'] ? movie['IMDb Rating'].toFixed(1) : '—';
  const yourRating = movie['Your Rating'];
  const title = escapeHtml(movie['Title'] || 'Sin título');

  const badgeClass = yourRating ? '' : ' unrated';
  const badgeText  = yourRating ? `★ ${yourRating}` : '—';

  card.innerHTML = `
    <div class="card-poster" data-imdb-id="${movie['Const']}">
      <div class="card-poster-placeholder">
        <i class="fa fa-film"></i>
        <span>${title}</span>
      </div>
    </div>
    <div class="card-rating-badge${badgeClass}">${badgeText}</div>
    <div class="card-info">
      <div class="card-title" title="${title}">${title}</div>
      <div class="card-meta">
        <span class="card-year">${yr}</span>
        <span class="card-imdb"><i class="fa fa-star"></i> ${imdbRating}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openModal(movie));
  return card;
}

// ---------------------------------------------------------------------------
// Lazy poster loading via IntersectionObserver
// ---------------------------------------------------------------------------
function setupPosterObserver() {
  posterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const imdbId = el.dataset.imdbId;
      if (!imdbId || el.dataset.posterLoaded) return;

      el.dataset.posterLoaded = '1';
      posterObserver.unobserve(el);
      loadPoster(el, imdbId);
    });
  }, { rootMargin: '200px' });
}

async function loadPoster(posterEl, imdbId) {
  try {
    const res = await fetch(`/api/movies/${imdbId}/poster`);
    const data = await res.json();
    if (data.poster) {
      const img = document.createElement('img');
      img.alt = '';
      img.onload = () => {
        posterEl.innerHTML = '';
        posterEl.appendChild(img);
      };
      img.src = data.poster;
    }
  } catch {
    // keep placeholder
  }
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------
function updateStats() {
  const total   = allMovies.length;
  const showing = filteredMovies.length;

  // Global stats (all movies, not just filtered)
  const rated = allMovies.filter(m => m['Your Rating']);
  const avg   = rated.length
    ? (rated.reduce((s, m) => s + m['Your Rating'], 0) / rated.length).toFixed(1)
    : '—';

  const years = allMovies.map(m => m['Year']).filter(Boolean);
  const minY  = years.length ? Math.min(...years) : '?';
  const maxY  = years.length ? Math.max(...years) : '?';

  statCount.innerHTML   = `<i class="fa fa-film"></i> ${total} películas`;
  statShowing.innerHTML = `<i class="fa fa-eye"></i> Mostrando: ${showing}`;
  statAvg.innerHTML     = `<i class="fa fa-star"></i> Rating medio: ${avg}`;
  statYears.innerHTML   = `<i class="fa fa-calendar"></i> ${minY} – ${maxY}`;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
function openModal(movie) {
  const title  = movie['Title'] || 'Sin título';
  const origTitle = movie['Original Title'] || '';

  modalTitle.textContent    = title;
  modalVhsTitle.textContent = title;
  modalSpineTitle.textContent = `${title} · ${movie['Year'] || ''}`;
  modalBadge.textContent    = typeBadge(movie['Title Type']);

  modalOriginalTitle.textContent = (origTitle && origTitle !== title)
    ? `"${origTitle}"`
    : '';

  modalDirector.textContent  = movie['Directors']  || '—';
  modalYear.textContent      = movie['Year']        || '—';
  modalRuntime.textContent   = formatRuntime(movie['Runtime (mins)']);
  modalGenres.textContent    = movie['Genres']      || '—';
  modalDateRated.textContent = movie['Date Rated']  || 'No vista';

  const imdbR = movie['IMDb Rating'];
  modalImdbRating.textContent = imdbR ? imdbR.toFixed(1) : '—';
  modalVotes.textContent      = formatVotes(movie['Num Votes']);

  const yourR = movie['Your Rating'];
  modalYourStars.innerHTML  = starsHtml(yourR);
  modalYourRating.textContent = yourR ? `${yourR} / 10` : 'Sin valorar';

  modalImdbLink.href = movie['URL'] || '#';

  // Poster + description + actors + providers
  modalPoster.src = '';
  modalPoster.style.display = 'none';
  modalDescription.textContent = '';
  modalDescription.classList.add('hidden');
  modalActors.textContent = 'Cargando...';
  modalProvidersRow.classList.add('hidden');
  modalProviders.innerHTML = '';

  const imdbId = movie['Const'];
  if (imdbId) {
    fetch(`/api/movies/${imdbId}/poster`)
      .then(r => r.json())
      .then(data => {
        if (data.poster) {
          modalPoster.src = data.poster;
          modalPoster.style.display = 'block';
        }
        if (data.overview) {
          modalDescription.textContent = data.overview;
          modalDescription.classList.remove('hidden');
        }
        if (data.actors && data.actors.length > 0) {
          modalActors.textContent = data.actors.join(', ');
        } else {
          modalActors.textContent = '—';
        }
        if (data.providers && data.providers.length > 0) {
          modalProvidersRow.classList.remove('hidden');
          modalProviders.innerHTML = data.providers.map(p => `
            <span class="provider-badge" title="${p.name}">
              ${p.logo ? `<img src="${p.logo}" alt="${p.name}" class="provider-logo" />` : ''}
              <span class="provider-name">${p.name}</span>
            </span>
          `).join('');
        } else {
          modalProvidersRow.classList.remove('hidden');
          modalProviders.innerHTML = '<span class="provider-not-available">Not available in Spain 🇪🇸</span>';
        }
      })
      .catch(() => {
        modalActors.textContent = '—';
        modalProvidersRow.classList.remove('hidden');
        modalProviders.innerHTML = '<span class="provider-not-available">Not available in Spain 🇪🇸</span>';
      });
  } else {
    modalActors.textContent = '—';
    modalProvidersRow.classList.remove('hidden');
    modalProviders.innerHTML = '<span class="provider-not-available">Not available in Spain 🇪🇸</span>';
  }

  modalBackdrop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  modalClose.focus();
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
async function loadChatHistory() {
  try {
    const res = await fetch('/api/chat/history');
    const history = await res.json();
    if (history && history.length > 0) {
      chatMessages.innerHTML = '';
      history.forEach(msg => {
        appendChatMsg(msg.role, msg.content);
        chatHistory.push({ role: msg.role, content: msg.content });
      });
    }
  } catch (err) {
    console.error('Error loading chat history:', err);
  }
}

function openChat() {
  isChatOpen = true;
  chatSidebar.classList.remove('hidden');
  chatToggle.classList.add('hidden');
  chatInput.focus();
}

function closeChat() {
  isChatOpen = false;
  chatSidebar.classList.add('hidden');
  chatToggle.classList.remove('hidden');
}

function appendChatMsg(role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  const prefix = role === 'user' ? '&gt; ' : '&gt;&gt; ';
  div.innerHTML = `<span class="msg-prefix">${prefix}</span>${escapeHtml(text).replace(/\n/g, '<br>')}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'chat-msg typing';
  div.id = 'typingIndicator';
  div.innerHTML = `<span class="msg-prefix">&gt;&gt; </span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

async function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  chatInput.value = '';
  appendChatMsg('user', msg);
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory }),
    });
    const data = await res.json();
    hideTyping();

    const reply = data.reply || '(sin respuesta)';
    appendChatMsg('assistant', reply);

    // Update history
    chatHistory.push({ role: 'user',      content: msg   });
    chatHistory.push({ role: 'assistant', content: reply });

    // Keep history to last 20 turns to avoid huge payloads
    if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
  } catch (err) {
    hideTyping();
    appendChatMsg('assistant', `Error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Filters
[searchInput, genreSelect, yearFrom, yearTo, minRating, sortSelect].forEach(el => {
  el.addEventListener('input', applyFiltersAndRender);
  el.addEventListener('change', applyFiltersAndRender);
});

btnReset.addEventListener('click', () => {
  searchInput.value = '';
  genreSelect.value = '';
  yearFrom.value    = '';
  yearTo.value      = '';
  minRating.value   = '0';
  sortSelect.value  = 'position';
  applyFiltersAndRender();
});

// Modal
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => {
  if (e.target === modalBackdrop) closeModal();
});

// Chat
chatToggle.addEventListener('click', openChat);
chatClose.addEventListener('click', closeChat);
chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

// Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!modalBackdrop.classList.contains('hidden')) {
      closeModal();
    } else if (isChatOpen) {
      closeChat();
    }
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);
