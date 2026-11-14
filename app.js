/* Opportunity Atlas — app.js (Chat 3)
 * Vanilla JS, no build step. Relies on:
 *   window.Globe                 (globe.gl UMD)
 *   window.supabase.createClient (supabase-js UMD)
 *   window.ATLAS_CONFIG          (config.js)
 */
(async function main() {
  'use strict';

  // ---------------------------------------------------------------
  // 0. Constants
  // ---------------------------------------------------------------
  const EARTH_NIGHT =
    'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg';

  const USE_DEMO_FALLBACK = true; // only kicks in when filters are at defaults

  const DEMO_MARKERS = [
    { city_id: 'berlin-de',        city_name: 'Berlin',        country: 'Germany',        country_code: 'DE', lat:  52.5200, lng:  13.4050, freelancer_count: 24, project_count:  9, total_count: 33 },
    { city_id: 'london-gb',        city_name: 'London',        country: 'United Kingdom', country_code: 'GB', lat:  51.5074, lng:  -0.1278, freelancer_count: 31, project_count: 12, total_count: 43 },
    { city_id: 'new-york-us',      city_name: 'New York',      country: 'United States',  country_code: 'US', lat:  40.7128, lng: -74.0060, freelancer_count: 42, project_count: 18, total_count: 60 },
    { city_id: 'san-francisco-us', city_name: 'San Francisco', country: 'United States',  country_code: 'US', lat:  37.7749, lng:-122.4194, freelancer_count: 28, project_count: 15, total_count: 43 },
    { city_id: 'bengaluru-in',     city_name: 'Bengaluru',     country: 'India',          country_code: 'IN', lat:  12.9716, lng:  77.5946, freelancer_count: 35, project_count:  8, total_count: 43 },
    { city_id: 'singapore-sg',     city_name: 'Singapore',     country: 'Singapore',      country_code: 'SG', lat:   1.3521, lng: 103.8198, freelancer_count: 14, project_count:  6, total_count: 20 },
    { city_id: 'tokyo-jp',         city_name: 'Tokyo',         country: 'Japan',          country_code: 'JP', lat:  35.6762, lng: 139.6503, freelancer_count: 19, project_count:  7, total_count: 26 },
    { city_id: 'sydney-au',        city_name: 'Sydney',        country: 'Australia',      country_code: 'AU', lat: -33.8688, lng: 151.2093, freelancer_count: 11, project_count:  4, total_count: 15 },
    { city_id: 'sao-paulo-br',     city_name: 'São Paulo',     country: 'Brazil',         country_code: 'BR', lat: -23.5505, lng: -46.6333, freelancer_count: 16, project_count:  5, total_count: 21 },
    { city_id: 'cape-town-za',     city_name: 'Cape Town',     country: 'South Africa',   country_code: 'ZA', lat: -33.9249, lng:  18.4241, freelancer_count:  8, project_count:  3, total_count: 11 },
    { city_id: 'dubai-ae',         city_name: 'Dubai',         country: 'UAE',            country_code: 'AE', lat:  25.2048, lng:  55.2708, freelancer_count: 12, project_count:  9, total_count: 21 },
    { city_id: 'toronto-ca',       city_name: 'Toronto',       country: 'Canada',         country_code: 'CA', lat:  43.6532, lng: -79.3832, freelancer_count: 15, project_count:  6, total_count: 21 },
  ];

  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };

  // ---------------------------------------------------------------
  // 1. Config + client
  // ---------------------------------------------------------------
  const cfg = window.ATLAS_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    renderStatus('Config missing. Check config.js.', true);
    return;
  }
  if (cfg.SUPABASE_ANON_KEY.length < 100) {
    renderStatus('Anon key looks truncated — paste the full key from the Supabase dashboard.', true);
    return;
  }

  const supabase = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  // ---------------------------------------------------------------
  // 2. State
  // ---------------------------------------------------------------
  const state = {
    categories: [],
    filters: {
      kind: 'both',
      categoryIds: [],
      minBudget: 0,
      remoteOnly: false,
      search: '',
    },
    markers: [],
    isDemo: false,
    city: null, // { city_id, city_name, country, lat, lng, ... }
    cityData: { talent: [], projects: [] },
    activeTab: 'talent',
  };

  // ---------------------------------------------------------------
  // 3. Globe init
  // ---------------------------------------------------------------
  const globe = new window.Globe(document.getElementById('globe'))
    .globeImageUrl(EARTH_NIGHT)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#7c9cff')
    .atmosphereAltitude(0.18)
    .htmlLat((d) => d.lat)
    .htmlLng((d) => d.lng)
    .htmlAltitude(0.004)
    .htmlElement((d) => buildMarkerEl(d, onMarkerClick));

  const controls = globe.controls();
  controls.autoRotate      = true;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping   = true;
  controls.dampingFactor   = 0.12;
  controls.minDistance     = 140;
  controls.maxDistance     = 600;

  globe.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 0);

  // ---------------------------------------------------------------
  // 4. Wire UI
  // ---------------------------------------------------------------
  wireFilterBar();
  wirePanel();
  wireGlobalKeys();

  // ---------------------------------------------------------------
  // 5. Boot: categories → markers
  // ---------------------------------------------------------------
  await loadCategories();
  await loadMarkers();

  // =============================================================
  // FILTER BAR
  // =============================================================
  function wireFilterBar() {
    // kind toggle
    document.querySelectorAll('.segmented__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.segmented__btn').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.filters.kind = btn.dataset.kind;
        updateFilterBadge();
        loadMarkers();
      });
    });

    // search (debounced)
    let searchTimer;
    document.getElementById('search').addEventListener('input', (e) => {
      const value = e.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.search = value;
        loadMarkers();
      }, 300);
    });

    // remote toggle
    const remoteBtn = document.getElementById('remote-toggle');
    remoteBtn.addEventListener('click', () => {
      state.filters.remoteOnly = !state.filters.remoteOnly;
      remoteBtn.setAttribute('aria-pressed', String(state.filters.remoteOnly));
      remoteBtn.classList.toggle('is-active', state.filters.remoteOnly);
      updateFilterBadge();
      loadMarkers();
    });

    // filters expand/collapse
    const filtersToggle = document.getElementById('filters-toggle');
    filtersToggle.addEventListener('click', () => {
      const expanded = filtersToggle.getAttribute('aria-expanded') === 'true';
      filtersToggle.setAttribute('aria-expanded', String(!expanded));
      document.getElementById('filterbar-advanced').hidden = expanded;
    });

    // category chips (event delegation — chips rendered dynamically)
    document.getElementById('category-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const id = chip.dataset.id;
      const idx = state.filters.categoryIds.indexOf(id);
      if (idx >= 0) state.filters.categoryIds.splice(idx, 1);
      else state.filters.categoryIds.push(id);
      chip.classList.toggle('is-active');
      updateFilterBadge();
      loadMarkers();
    });

    // budget slider (label updates live, RPC fires on release)
    const budgetInput = document.getElementById('budget');
    const budgetLabel = document.getElementById('budget-value');
    budgetInput.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      state.filters.minBudget = v;
      budgetLabel.textContent = v > 0 ? `${fmtMoney(v, 'USD')}+` : 'Any';
      updateFilterBadge();
    });
    budgetInput.addEventListener('change', () => loadMarkers());
  }

  function updateFilterBadge() {
    // badge counts what's hidden inside the expanded "Filters" row
    const count =
      state.filters.categoryIds.length + (state.filters.minBudget > 0 ? 1 : 0);
    const badge = document.getElementById('filter-count');
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  // =============================================================
  // PANEL
  // =============================================================
  function wirePanel() {
    document.getElementById('panel-close').addEventListener('click', closePanel);

    // tab switching
    document.querySelectorAll('.panel__tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.activeTab = tab.dataset.tab;
        updateTabUI();
        renderPanelBody();
      });
    });

    // clicking empty globe closes the panel
    document.getElementById('globe').addEventListener('click', () => {
      if (!document.getElementById('panel').hidden) closePanel();
    });
  }

  function wireGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  }

  function updateTabUI() {
    document.querySelectorAll('.panel__tab').forEach((tab) => {
      const isActive = tab.dataset.tab === state.activeTab;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  async function openPanel(marker) {
    state.city = marker;
    state.activeTab = 'talent';

    document.getElementById('panel-title').textContent    = marker.city_name;
    document.getElementById('panel-subtitle').textContent = marker.country;
    document.getElementById('talent-count').textContent   = marker.freelancer_count;
    document.getElementById('projects-count').textContent = marker.project_count;

    updateTabUI();
    document.getElementById('panel').hidden = false;
    document.getElementById('panel-body').innerHTML =
      '<p class="panel__empty">Loading…</p>';

    controls.autoRotate = false;
    globe.pointOfView({ lat: marker.lat, lng: marker.lng, altitude: 1.7 }, 900);

    await loadCityData(marker.city_id);
  }

  function closePanel() {
    const panel = document.getElementById('panel');
    if (panel.hidden) return;
    panel.hidden = true;
    state.city = null;
    state.cityData = { talent: [], projects: [] };
    controls.autoRotate = true;
  }

  // =============================================================
  // DATA — markers
  // =============================================================
  let markerReqToken = 0;
  async function loadMarkers() {
    const token = ++markerReqToken;
    const bar = document.getElementById('filterbar');
    bar.classList.add('is-loading');
    renderStatus('Loading the atlas…');

    const args = {
      p_kind: state.filters.kind,
      p_category_ids: state.filters.categoryIds.length ? state.filters.categoryIds : null,
      p_min_budget: state.filters.minBudget > 0 ? state.filters.minBudget : null,
      p_remote_only: state.filters.remoteOnly,
      p_search: state.filters.search || null,
      p_limit: 500,
    };

    let markers = [];
    let isDemo = false;
    let errorMsg = null;

    try {
      const { data, error } = await supabase.rpc('globe_markers', args);
      if (error) throw error;
      markers = Array.isArray(data) ? data : [];

      if (markers.length === 0 && USE_DEMO_FALLBACK && isDefaultFilters()) {
        markers = DEMO_MARKERS;
        isDemo = true;
      }
    } catch (err) {
      console.error('[atlas] RPC failed:', err);
      errorMsg = err && err.message ? err.message : String(err);
    }

    if (token !== markerReqToken) return; // a newer request won
    bar.classList.remove('is-loading');

    if (errorMsg) {
      renderStatus(`Couldn't load data: ${errorMsg}`, true);
      return;
    }

    state.markers = markers;
    state.isDemo = isDemo;
    globe.htmlElementsData(markers);
    renderStatusFromMarkers(markers, isDemo);
  }

  function isDefaultFilters() {
    const f = state.filters;
    return (
      f.kind === 'both' &&
      f.categoryIds.length === 0 &&
      f.minBudget === 0 &&
      f.remoteOnly === false &&
      f.search === ''
    );
  }

  // =============================================================
  // DATA — city detail
  // =============================================================
  let cityReqToken = 0;
  async function loadCityData(cityId) {
    const token = ++cityReqToken;
    const [talent, projects] = await Promise.all([
      fetchTalent(cityId),
      fetchProjects(cityId),
    ]);
    if (token !== cityReqToken) return;
    state.cityData = { talent, projects };
    renderPanelBody();
  }

  async function fetchTalent(cityId) {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, avatar_url, headline, bio, skills, ' +
        'hourly_rate, currency, website, github, linkedin'
      )
      .eq('city_id', cityId)
      .eq('open_to_work', true)
      .order('display_name', { ascending: true });
    if (error) {
      console.error('[atlas] talent fetch:', error);
      return [];
    }
    return data || [];
  }

  async function fetchProjects(cityId) {
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id, title, description, skills, budget_min, budget_max, currency, ' +
        'is_remote, deadline, status, ' +
        'poster:profiles!projects_poster_id_fkey(id, username, display_name, avatar_url)'
      )
      .eq('city_id', cityId)
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[atlas] projects fetch:', error);
      return [];
    }
    return data || [];
  }

  // =============================================================
  // RENDER — panel body
  // =============================================================
  function renderPanelBody() {
    const body = document.getElementById('panel-body');
    const { talent, projects } = state.cityData;

    if (state.activeTab === 'talent') {
      body.innerHTML = talent.length
        ? talent.map(renderProfile).join('')
        : '<p class="panel__empty">No freelancers here yet — be the first!</p>';
    } else {
      body.innerHTML = projects.length
        ? projects.map(renderProject).join('')
        : '<p class="panel__empty">No open projects here right now.</p>';
    }
  }

  function renderProfile(p) {
    const name = esc(p.display_name || p.username || 'Anonymous');
    const handle = p.username ? `@${esc(p.username)}` : '';
    const headline = p.headline ? esc(p.headline) : '';
    const subLine = [handle, headline].filter(Boolean).join(' · ');

    const skills = (p.skills || [])
      .slice(0, 5)
      .map((s) => `<span class="tag">${esc(s)}</span>`)
      .join('');

    const rate = p.hourly_rate
      ? `<span class="entry__meta-item">${esc(fmtMoney(p.hourly_rate, p.currency))}/h</span>`
      : '';
    const site = p.website
      ? `<a class="entry__meta-item" href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener">Website</a>`
      : '';
    const gh = p.github
      ? `<a class="entry__meta-item" href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">GitHub</a>`
      : '';
    const meta = [rate, site, gh].filter(Boolean).join('');

    const initials = getInitials(name);
    const avatarImg = p.avatar_url
      ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy" onerror="this.remove()">`
      : '';

    return `
      <article class="entry">
        <div class="avatar" aria-hidden="true">
          <span class="avatar__initials">${esc(initials)}</span>
          ${avatarImg}
        </div>
        <div class="entry__body">
          <h3 class="entry__title">${name}</h3>
          ${subLine ? `<p class="entry__sub">${subLine}</p>` : ''}
          ${skills ? `<div class="entry__tags">${skills}</div>` : ''}
          ${meta ? `<div class="entry__meta">${meta}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderProject(pj) {
    const title = esc(pj.title);
    const posterName = pj.poster
      ? esc(pj.poster.display_name || pj.poster.username || 'Someone')
      : 'Someone';
    const budget = budgetRange(pj.budget_min, pj.budget_max, pj.currency);
    const remoteBadge = pj.is_remote ? '<span class="badge">Remote</span>' : '';
    const desc = pj.description
      ? `<p class="entry__desc">${esc(truncate(pj.description, 180))}</p>`
      : '';
    const skills = (pj.skills || [])
      .slice(0, 5)
      .map((s) => `<span class="tag">${esc(s)}</span>`)
      .join('');

    return `
      <article class="entry entry--project">
        <div class="entry__body">
          <h3 class="entry__title">${title} ${remoteBadge}</h3>
          <p class="entry__sub">by ${posterName} · ${esc(budget)}</p>
          ${desc}
          ${skills ? `<div class="entry__tags">${skills}</div>` : ''}
        </div>
      </article>
    `;
  }

  // =============================================================
  // RENDER — categories + status
  // =============================================================
  async function loadCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, icon, color, sort_order')
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('[atlas] categories fetch:', error);
      return;
    }
    state.categories = data || [];
    renderCategoryChips();
  }

  function renderCategoryChips() {
    const wrap = document.getElementById('category-chips');
    if (!state.categories.length) {
      wrap.innerHTML = '<span style="font-size:12px;color:var(--fg-dim)">No categories yet.</span>';
      return;
    }
    wrap.innerHTML = state.categories
      .map(
        (c) => `
        <button class="chip" data-id="${esc(c.id)}" type="button">
          <span aria-hidden="true">${esc(c.icon || '·')}</span>
          <span>${esc(c.name)}</span>
        </button>`
      )
      .join('');
  }

  function renderStatus(html, isError = false) {
    const el = document.getElementById('status');
    el.innerHTML = isError
      ? `<span class="hud-status__error">${esc(html)}</span>`
      : html;
  }

  function renderStatusFromMarkers(rows, demo) {
    const f = rows.reduce((s, m) => s + (m.freelancer_count || 0), 0);
    const p = rows.reduce((s, m) => s + (m.project_count || 0), 0);
    const demoBadge = demo ? '<span class="hud-status__demo">DEMO</span>' : '';
    renderStatus(`
      <span><strong>${rows.length}</strong> hotspots</span>
      <span class="hud-status__sep">·</span>
      <span><strong>${f}</strong> freelancers</span>
      <span class="hud-status__sep">·</span>
      <span><strong>${p}</strong> projects</span>
      ${demoBadge}
    `);
  }

  // =============================================================
  // MARKER element
  // =============================================================
  function buildMarkerEl(marker, onClick) {
    const n = Math.max(1, marker.total_count || 1);
    const size = Math.min(36, 12 + Math.sqrt(n) * 4);

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'marker';
    el.style.setProperty('--size', `${size}px`);
    el.style.setProperty('--delay', `${(Math.random() * 2).toFixed(2)}s`);
    el.setAttribute(
      'aria-label',
      `${marker.city_name}: ${marker.freelancer_count} freelancers, ${marker.project_count} projects`
    );
    el.innerHTML = `
      <span class="marker__ring"></span>
      <span class="marker__ring marker__ring--delayed"></span>
      <span class="marker__dot"></span>
    `;
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // don't let the globe's click close the panel we're about to open
      onClick(marker);
    });
    return el;
  }

  function onMarkerClick(marker) {
    openPanel(marker);
  }

  // =============================================================
  // HELPERS
  // =============================================================
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(u) {
    const s = String(u || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    // reject anything that isn't http(s) — blocks javascript: etc.
    return 'https://' + s.replace(/^\/+/, '');
  }

  function getInitials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?';
  }

  function truncate(s, n) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
  }

  function fmtMoney(amount, currency) {
    const sym = CURRENCY_SYMBOLS[currency] || (currency ? currency + ' ' : '');
    const num = Number(amount);
    if (!isFinite(num)) return '—';
    return sym + num.toLocaleString();
  }

  function budgetRange(min, max, cur) {
    if (!min && !max) return 'Budget TBD';
    if (min && max && min !== max) {
      return `${fmtMoney(min, cur)} – ${fmtMoney(max, cur)}`;
    }
    return `From ${fmtMoney(min || max, cur)}`;
  }
})();
