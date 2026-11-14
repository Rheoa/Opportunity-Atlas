/* Opportunity Atlas — auth.js
 * Requires: window.atlas.supabase, #hud-user-* elements, #modal-auth markup.
 */
(function () {
  'use strict';

  const sb = window.atlas?.supabase;
  if (!sb) { console.error('[auth] window.atlas.supabase missing — check script order'); return; }

  const $ = (id) => document.getElementById(id);
  const els = {
    guest:       $('hud-user-guest'),
    signed:      $('hud-user-signed'),
    chip:        $('hud-user-chip'),
    chipName:    $('hud-user-name'),
    chipAvatar:  $('hud-user-avatar'),
    menu:        $('hud-user-menu'),
    btnSignin:   $('btn-signin'),
    btnSignout:  $('btn-signout'),
    btnEdit:     $('btn-edit-profile'),
    btnPost:     $('btn-post-project'),

    modal:       $('modal-auth'),
    modalClose:  $('modal-auth-close'),
    backdrop:    $('modal-auth').querySelector('.modal__backdrop'),
    tabSignin:   $('tab-signin'),
    tabSignup:   $('tab-signup'),
    form:        $('form-auth'),
    email:       $('auth-email'),
    password:    $('auth-password'),
    submit:      $('auth-submit'),
    err:         $('auth-error'),
    msg:         $('auth-message'),
  };

  let mode = 'signin';

  // ----------------------------------------------------------------
  // Auth modal
  // ----------------------------------------------------------------
  els.btnSignin.addEventListener('click', () => openModal('signin'));
  els.modalClose.addEventListener('click', closeModal);
  els.backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  els.tabSignin.addEventListener('click', () => setMode('signin'));
  els.tabSignup.addEventListener('click', () => setMode('signup'));

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    els.submit.disabled = true;

    const email = els.email.value.trim();
    const password = els.password.value;

    if (!email || !password) { showError('Enter your email and password.'); els.submit.disabled = false; return; }
    if (mode === 'signup' && password.length < 8) { showError('Password must be at least 8 characters.'); els.submit.disabled = false; return; }

    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeModal();
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && !data.session) {
          showMessage('Check your email to confirm your account, then sign in.');
          setMode('signin');
        } else {
          closeModal();
        }
      }
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      els.submit.disabled = false;
    }
  });

  function openModal(initialMode) {
    setMode(initialMode);
    clearMessages();
    els.form.reset();
    els.modal.hidden = false;
    setTimeout(() => els.email?.focus(), 50);
  }
  function closeModal() { els.modal.hidden = true; }
  function setMode(m) {
    mode = m;
    const isSignin = m === 'signin';
    els.tabSignin.classList.toggle('is-active', isSignin);
    els.tabSignup.classList.toggle('is-active', !isSignin);
    els.submit.textContent = isSignin ? 'Sign in' : 'Create account';
    els.password.autocomplete = isSignin ? 'current-password' : 'new-password';
    clearMessages();
  }
  function clearMessages() { els.err.hidden = true; els.msg.hidden = true; }
  function showError(text) { els.err.textContent = text; els.err.hidden = false; els.msg.hidden = true; }
  function showMessage(text) { els.msg.textContent = text; els.msg.hidden = false; els.err.hidden = true; }

  // ----------------------------------------------------------------
  // Header user menu
  // ----------------------------------------------------------------
  els.chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = els.menu.hidden;
    els.menu.hidden = !willOpen;
    els.chip.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e) => {
    if (els.menu.hidden) return;
    if (els.menu.contains(e.target) || els.chip.contains(e.target)) return;
    els.menu.hidden = true;
    els.chip.setAttribute('aria-expanded', 'false');
  });

  els.btnSignout.addEventListener('click', async () => {
    els.menu.hidden = true;
    await sb.auth.signOut();
  });

  els.btnEdit.addEventListener('click', () => {
    els.menu.hidden = true;
    window.AtlasForms?.openEditProfile();
  });
  els.btnPost.addEventListener('click', () => {
    els.menu.hidden = true;
    window.AtlasForms?.openPostProject();
  });

  // ----------------------------------------------------------------
  // Session → UI sync
  // ----------------------------------------------------------------
  sb.auth.onAuthStateChange((_event, session) => updateUI(session?.user || null));
  sb.auth.getSession().then(({ data }) => updateUI(data.session?.user || null));

  async function updateUI(user) {
    if (!user) {
      els.guest.hidden = false;
      els.signed.hidden = true;
      els.menu.hidden = true;
      return;
    }
    els.guest.hidden = true;
    els.signed.hidden = false;

    const { data: profile } = await sb
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const name = profile?.display_name || profile?.username || user.email?.split('@')[0] || 'You';
    els.chipName.textContent = name;

    const initials = name.trim().split(/\s+/).slice(0, 2)
      .map((w) => w[0]?.toUpperCase()).join('') || '?';
    els.chipAvatar.textContent = initials;

    if (profile?.avatar_url) {
      els.chipAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
      els.chipAvatar.classList.add('has-image');
    } else {
      els.chipAvatar.style.backgroundImage = '';
      els.chipAvatar.classList.remove('has-image');
    }
  }
})();
