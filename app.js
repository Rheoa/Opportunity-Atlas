/* Opportunity Atlas — app.js
 * Vanilla JS, no build step. Relies on:
 *   window.Globe                (globe.gl UMD)
 *   window.supabase.createClient (supabase-js UMD)
 *   window.ATLAS_CONFIG         (config.js)
 */
(async function main() {
  'use strict';

  // ---------------------------------------------------------------
  // 0. Constants
  // ---------------------------------------------------------------
  const EARTH_NIGHT =
    'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg';

  // Show demo markers when the RPC returns 0 rows AND we're not in prod.
  // Set to false once you have a few real signups.
  const USE_DEMO_FALLBACK = true;

  const DEMO_MARKERS = [
    { city_id: 'berlin-de',       city_name: 'Berlin',        country: 'Germany',        country_code: 'DE', lat:  52.5200, lng:  13.4050, freelancer_count: 24, project_count:  9, total_count: 33 },
    { city_id: 'london-gb',       city_name: 'London',        country: 'United Kingdom', country_code: 'GB', lat:  51.5074, lng:  -0.1278, freelancer_count: 31, project_count: 12, total_count: 43 },
    { city_id: 'new-york-us',     city_name: 'New York',      country: 'United States',  country_code: 'US', lat:  40.7128, lng: -74.0060, freelancer_count: 42, project_count: 18, total_count: 60 },
    { city_id: 'san-francisco-us',city_name: 'San Francisco', country: 'United States',  country_code: 'US', lat:  37.7749, lng:-122.4194, freelancer_count: 28, project_count: 15, total_count: 43 },
    { city_id: 'bengaluru-in',    city_name: 'Bengaluru',     country: 'India',          country_code: 'IN', lat:  12.9716, lng:  77.5946, freelancer_count: 35, project_count:  8, total_count: 43 },
    { city_id: 'singapore-sg',    city_name: 'Singapore',     country: 'Singapore',      country_code: 'SG', lat:   1.3521, lng: 103.8198, freelancer_count: 14, project_count:  6, total_count: 20 },
    { city_id: 'tokyo-jp',        city_name: 'Tokyo',         country: 'Japan',          country_code: 'JP', lat:  35.6762, lng: 139.6503, freelancer_count: 19, project_count:  7, total_count: 26 },
    { city_id: 'sydney-au',       city_name: 'Sydney',        country: 'Australia',      country_code: 'AU', lat: -33.8688, lng: 151.2093, freelancer_count: 11, project_count:  4, total_count: 15 },
    { city_id: 'sao-paulo-br',    city_name: 'São Paulo',     country: 'Brazil',         country_code: 'BR', lat: -23.5505, lng: -46.6333, freelancer_count: 16, project_count:  5, total_count: 21 },
    { city_id: 'cape-town-za',    city_name: 'Cape Town',     country: 'South Africa',   country_code: 'ZA', lat: -33.9249, lng:  18.4241, freelancer_count:  8, project_count:  3, total_count: 11 },
    { city_id: 'dubai-ae',        city_name: 'Dubai',         country: 'UAE',            country_code: 'AE', lat:  25.2048, lng:  55.2708, freelancer_count: 12, project_count:  9, total_count: 21 },
    { city_id: 'toronto-ca',      city_name: 'Toronto',       country: 'Canada',         country_code: 'CA', lat:  43.6532, lng: -79.3832, freelancer_count: 15, project_count:  6, total_count: 21 },
  ];

  // ---------------------------------------------------------------
  // 1. Config sanity check
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

  // ---------------------------------------------------------------
  // 2. Supabase client
  // ---------------------------------------------------------------
  const supabase = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

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

  // clicking empty ocean/land closes the card
  document.getElementById('card-close').addEventListener('click', closeCard);
  document.getElementById('globe').addEventListener('click', closeCard);

  // ---------------------------------------------------------------
  // 4. Data load
  // ---------------------------------------------------------------
  renderStatus('Loading the atlas…');

  let markers = [];
  let isDemo = false;
  try {
    const { data, error } = await supabase.rpc('globe_markers', {
      p_kind: 'both',
    });
    if (error) throw error;

    markers = Array.isArray(data) ? data : [];
    if (markers.length === 0 && USE_DEMO_FALLBACK) {
      markers = DEMO_MARKERS;
      isDemo = true;
    }
  } catch (err) {
    console.error('[atlas] RPC failed:', err);
    renderStatus(`Couldn't load data: ${err.message || err}`, true);
    return;
  }

  globe.htmlElementsData(markers);
  renderStatusFromMarkers(markers, isDemo);

  // ---------------------------------------------------------------
  // 5. Marker helpers
  // ---------------------------------------------------------------
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
      e.stopPropagation();
      onClick(marker);
    });
    return el;
  }

  function onMarkerClick(marker) {
    document.getElementById('card-title').textContent      = marker.city_name;
    document.getElementById('card-subtitle').textContent   = marker.country;
    document.getElementById('card-freelancers').textContent = marker.freelancer_count;
    document.getElementById('card-projects').textContent    = marker.project_count;
    document.getElementById('card').hidden = false;
  }

  function closeCard() {
    document.getElementById('card').hidden = true;
  }

  // ---------------------------------------------------------------
  // 6. Status bar
  // ---------------------------------------------------------------
  function renderStatus(html, isError = false) {
    const el = document.getElementById('status');
    el.innerHTML = isError
      ? `<span class="hud-status__error">${escapeHtml(html)}</span>`
      : html;
  }

  function renderStatusFromMarkers(rows, demo) {
    const f = rows.reduce((s, m) => s + (m.freelancer_count || 0), 0);
    const p = rows.reduce((s, m) => s + (m.project_count    || 0), 0);
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
