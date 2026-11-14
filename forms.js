/* Opportunity Atlas — forms.js
 * Requires: window.atlas.supabase, #modal-profile, #modal-project.
 */
(function () {
  'use strict';

  const sb = window.atlas?.supabase;
  if (!sb) { console.error('[forms] window.atlas.supabase missing — check script order'); return; }

  const $ = (id) => document.getElementById(id);
  const toast = (msg, kind) => window.atlas?.toast?.(msg, kind);

  // Caches — one shot per page load
  let citiesCache = null, catsCache = null;

  async function getCities() {
    if (citiesCache) return citiesCache;
    const { data, error } = await sb
      .from('cities')
      .select('id, name, country')
      .order('name', { ascending: true });
    if (error) { console.error('[forms] cities:', error); citiesCache = []; }
    else citiesCache = data || [];
    return citiesCache;
  }
  async function getCategories() {
    if (catsCache) return catsCache;
    const { data, error } = await sb
      .from('categories')
      .select('id, name, icon, sort_order')
      .order('sort_order', { ascending: true });
    if (error) { console.error('[forms] categories:', error); catsCache = []; }
    else catsCache = data || [];
    return catsCache;
  }

  // =============================================================
  // EDIT PROFILE
  // =============================================================
  const profileModal  = $('modal-profile');
  const profileForm   = $('form-profile');
  const profileErr    = $('profile-error');
  const profileSubmit = $('profile-submit');
  const profileCats   = $('profile-categories');
  const profileCity   = $('profile-city');

  async function openEditProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { toast('Sign in first.', 'err'); return; }

    const [{ data: profile, error }, cities, cats] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      getCities(),
      getCategories(),
    ]);
    if (error) { toast('Could not load profile.', 'err'); return; }

    profileCity.innerHTML =
      '<option value="">— Choose a city —</option>' +
      cities.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}, ${esc(c.country)}</option>`).join('');

    const selected = new Set(profile?.category_ids || []);
    profileCats.innerHTML = cats.map((c) => `
      <button type="button" class="chip ${selected.has(c.id) ? 'is-active' : ''}" data-id="${esc(c.id)}">
        <span aria-hidden="true">${esc(c.icon || '·')}</span><span>${esc(c.name)}</span>
      </button>`).join('');

    const f = profileForm.elements;
    f.display_name.value = profile?.display_name || '';
    f.username.value     = profile?.username || '';
    f.headline.value     = profile?.headline || '';
    f.bio.value          = profile?.bio || '';
    f.city_id.value      = profile?.city_id || '';
    f.skills.value       = (profile?.skills || []).join(', ');
    f.hourly_rate.value  = profile?.hourly_rate ?? '';
    f.currency.value     = profile?.currency || 'USD';
    f.website.value      = profile?.website || '';
    f.github.value       = profile?.github || '';
    f.linkedin.value     = profile?.linkedin || '';
    f.avatar_url.value   = profile?.avatar_url || '';
    f.open_to_work.checked = profile?.open_to_work ?? true;

    profileErr.hidden = true;
    profileModal.hidden = false;
    setTimeout(() => f.display_name.focus(), 50);
  }

  profileCats.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) chip.classList.toggle('is-active');
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    profileErr.hidden = true;
    profileSubmit.disabled = true;

    const { data: { user } } = await sb.auth.getUser();
    if (!user) { toast('Session expired — sign in again.', 'err'); profileSubmit.disabled = false; return; }

    const fd = new FormData(profileForm);
    const payload = {
      id: user.id,
      display_name: String(fd.get('display_name') || '').trim(),
      username:     String(fd.get('username') || '').trim().toLowerCase(),
      headline:     String(fd.get('headline') || '').trim() || null,
      bio:          String(fd.get('bio') || '').trim() || null,
      city_id:      fd.get('city_id') || null,
      category_ids: Array.from(profileCats.querySelectorAll('.chip.is-active')).map((c) => c.dataset.id),
      skills:       parseList(fd.get('skills')),
      hourly_rate:  fd.get('hourly_rate') ? Number(fd.get('hourly_rate')) : null,
      currency:     fd.get('currency') || 'USD',
      website:      String(fd.get('website') || '').trim() || null,
      github:       String(fd.get('github') || '').trim() || null,
      linkedin:     String(fd.get('linkedin') || '').trim() || null,
      avatar_url:   String(fd.get('avatar_url') || '').trim() || null,
      open_to_work: fd.get('open_to_work') === 'on',
    };

    if (!payload.display_name) return formErr(profileErr, profileSubmit, 'Display name is required.');
    if (!/^[a-z0-9_]{3,30}$/.test(payload.username)) return formErr(profileErr, profileSubmit, 'Username must be 3–30 chars: a-z, 0-9, underscore.');

    const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'id' });
    profileSubmit.disabled = false;
    if (error) return formErr(profileErr, profileSubmit, error.message);

    profileModal.hidden = true;
    toast('Profile saved.', 'ok');
    window.atlas?.refresh?.();
  });

  // =============================================================
  // POST PROJECT
  // =============================================================
  const projModal  = $('modal-project');
  const projForm   = $('form-project');
  const projErr    = $('project-error');
  const projSubmit = $('project-submit');
  const projCats   = $('project-categories');
  const projCity   = $('project-city');

  async function openPostProject() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { toast('Sign in first.', 'err'); return; }

    const [cities, cats] = await Promise.all([getCities(), getCategories()]);

    projCity.innerHTML =
      '<option value="">— Choose a city —</option>' +
      cities.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}, ${esc(c.country)}</option>`).join('');

    projCats.innerHTML = cats.map((c) => `
      <button type="button" class="chip" data-id="${esc(c.id)}">
        <span aria-hidden="true">${esc(c.icon || '·')}</span><span>${esc(c.name)}</span>
      </button>`).join('');

    projForm.reset();
    projForm.elements.currency.value = 'USD';
    projForm.elements.is_remote.checked = false;
    projErr.hidden = true;
    projModal.hidden = false;
    setTimeout(() => projForm.elements.title.focus(), 50);
  }

  projCats.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) chip.classList.toggle('is-active');
  });

  projForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    projErr.hidden = true;
    projSubmit.disabled = true;

    const { data: { user } } = await sb.auth.getUser();
    if (!user) { toast('Session expired — sign in again.', 'err'); projSubmit.disabled = false; return; }

    const fd = new FormData(projForm);
    const payload = {
      poster_id:    user.id,
      title:        String(fd.get('title') || '').trim(),
      description:  String(fd.get('description') || '').trim(),
      city_id:      fd.get('city_id') || null,
      category_ids: Array.from(projCats.querySelectorAll('.chip.is-active')).map((c) => c.dataset.id),
      skills:       parseList(fd.get('skills')),
      budget_min:   fd.get('budget_min') ? Number(fd.get('budget_min')) : null,
      budget_max:   fd.get('budget_max') ? Number(fd.get('budget_max')) : null,
      currency:     fd.get('currency') || 'USD',
      is_remote:    fd.get('is_remote') === 'on',
      deadline:     fd.get('deadline') || null,
      status:       'open',
    };

    if (!payload.title || payload.title.length < 3) return formErr(projErr, projSubmit, 'Title must be at least 3 characters.');
    if (payload.budget_min != null && payload.budget_max != null && payload.budget_max < payload.budget_min) {
      return formErr(projErr, projSubmit, 'Max budget must be ≥ min budget.');
    }

    const { error } = await sb.from('projects').insert(payload);
    projSubmit.disabled = false;
    if (error) return formErr(projErr, projSubmit, error.message);

    projModal.hidden = true;
    toast('Project posted!', 'ok');
    window.atlas?.refresh?.();
  });

  // =============================================================
  // Shared modal close
  // =============================================================
  [profileModal, projModal].forEach((m) => {
    m.querySelector('.modal__backdrop').addEventListener('click', () => { m.hidden = true; });
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { m.hidden = true; }));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!profileModal.hidden) { profileModal.hidden = true; return; }
    if (!projModal.hidden)    { projModal.hidden    = true; return; }
  });

  // =============================================================
  // Helpers
  // =============================================================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function parseList(v) {
    return String(v || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  }
  function formErr(el, submitBtn, msg) {
    el.textContent = msg;
    el.hidden = false;
    submitBtn.disabled = false;
  }

  window.AtlasForms = { openEditProfile, openPostProject };
})();
