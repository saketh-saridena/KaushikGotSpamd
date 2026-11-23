/* The only public code. After a host signs in, the invitation and dashboard
   are fetched from private storage. Nothing else is published here. */
(function () {
  const CFG = {
    url: 'https://vmibktrnxfscuytnewtw.supabase.co',
    key: 'sb_publishable_sIxBzJuphnIW2tiWMu_x9Q_XRace78o'
  };
  const SESSION = 'ks-wedding.host.v1';
  const VIEW = 'ks-view';
  const $ = id => document.getElementById(id);
  const say = text => { $('message').textContent = text || ''; };

  const load = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } };
  const store = s => { try { if (s) localStorage.setItem(SESSION, JSON.stringify(s)); else localStorage.removeItem(SESSION); } catch { /* private window */ } };
  const view = {
    get() { try { return sessionStorage.getItem(VIEW); } catch { return null; } },
    set(v) { try { if (v) sessionStorage.setItem(VIEW, v); else sessionStorage.removeItem(VIEW); } catch { /* private window */ } }
  };
  let session = load();

  async function call(path, { method = 'GET', body, token } = {}) {
    const headers = { apikey: CFG.key };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(CFG.url + path, { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error('Could not connect. Check your internet and try again.');
    }
    if (!res.ok) { const e = new Error('Request failed'); e.status = res.status; throw e; }
    return res;
  }

  function keep(s, email) {
    session = {
      access: s.access_token, refresh: s.refresh_token,
      expires: Date.now() + (s.expires_in || 3600) * 1000,
      email: s.user?.email || email || session?.email || ''
    };
    store(session);
  }

  async function token() {
    if (!session) return null;
    if (Date.now() < session.expires - 60000) return session.access;
    try {
      const res = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh } });
      keep(await res.json());
      return session.access;
    } catch (err) {
      if (err.status) { session = null; store(null); return null; }
      throw err;
    }
  }

  async function isHost(t) {
    const res = await call('/rest/v1/rpc/is_host', { method: 'POST', body: {}, token: t });
    return (await res.json()) === true;
  }

  function showSignIn(message) {
    view.set(null);
    $('home').hidden = true;
    $('signin').hidden = false;
    say(message);
    $('email').focus();
  }

  function showHome() {
    $('signin').hidden = true;
    $('home').hidden = false;
    $('who').textContent = session?.email ? `Signed in as ${session.email}` : '';
    say('');
  }

  async function signOut(message) {
    const t = session?.access;
    session = null;
    store(null);
    if (t) await call('/auth/v1/logout', { method: 'POST', token: t }).catch(() => {});
    showSignIn(message);
  }

  async function open(name, btn) {
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Opening'; }
    say('');
    try {
      const t = await token();
      if (!t) { showSignIn('Please sign in again.'); return; }
      const res = await call(`/storage/v1/object/private-site/${name}.html`, { token: t });
      const html = await res.text();
      view.set(name);
      document.open();
      document.write(html);
      document.close();
    } catch (err) {
      view.set(null);
      showHome();
      say(err.status === 401 || err.status === 403 || err.status === 400 ? 'Your account cannot open this page.' : (err.message === 'Request failed' ? 'That page could not open. Try again.' : err.message));
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  $('signin').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email').value.trim().toLowerCase();
    const password = $('password').value;
    if (!email || !password) { say('Enter your email and password.'); return; }
    const btn = $('signinBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in';
    say('');
    try {
      const res = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
      keep(await res.json(), email);
      if (!(await isHost(session.access))) { await signOut('This account is not on the hosts list.'); return; }
      $('password').value = '';
      showHome();
    } catch (err) {
      say(err.status === 400 ? 'That email or password is not right.' : err.status === 429 ? 'Too many tries. Wait a minute and try again.' : err.message === 'Request failed' ? 'Could not sign in. Try again.' : err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
  $('openInvitation').addEventListener('click', e => open('invitation', e.currentTarget));
  $('openDashboard').addEventListener('click', e => open('dashboard', e.currentTarget));
  $('signout').addEventListener('click', () => signOut());

  (async function start() {
    if (!session) { showSignIn(); return; }
    try {
      const t = await token();
      if (!t || !(await isHost(t))) { await signOut('Please sign in again.'); return; }
      const last = view.get();
      if (last === 'invitation' || last === 'dashboard') { await open(last); return; }
      showHome();
    } catch (err) {
      if (err.status === 401 || err.status === 403) await signOut('Please sign in again.');
      else { showHome(); say(err.message === 'Request failed' ? 'Could not connect. Try again.' : err.message); }
    }
  })();
})();
