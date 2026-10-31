const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STEPS = {
  email:    { title: 'Willkommen bei VAIs', sub: () => 'Die besten KI-Modelle an einem Ort. Kostenlos.' },
  login:    { title: 'Willkommen zurück',   sub: () => 'Melde dich mit deinem Passwort an.' },
  register: { title: 'Konto erstellen',     sub: () => 'Wähle ein Passwort für dein neues Konto.' },
  verify:   { title: 'Prüfe dein Postfach', sub: (e) => `Wir haben einen 6-stelligen Code an <strong>${e}</strong> gesendet.` },
  reset:    { title: 'Neues Passwort',      sub: (e) => `Falls ein Konto existiert, haben wir einen Code an <strong>${e}</strong> gesendet.` },
};

const RESEND_SECONDS = 45;
let email = '';
let current = 'email';

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── API ───────────────────────────────────────────────────────────
async function api(path, body) {
  let res;
  try {
    res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Keine Verbindung. Prüfe dein Internet.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Etwas ist schiefgelaufen.'), { status: res.status, data });
  return data;
}

// ── Schritte ──────────────────────────────────────────────────────
function show(step) {
  current = step;
  const cfg = STEPS[step];
  $('#title').textContent = cfg.title;
  $('#sub').innerHTML = cfg.sub(escapeHtml(email));
  $$('[data-email]').forEach((el) => (el.textContent = email));
  $$('[data-email-hidden]').forEach((el) => (el.value = email));
  $$('.step').forEach((el) => el.classList.toggle('active', el.dataset.step === step));
  $$('.msg').forEach((el) => (el.textContent = ''));
  $$('.input').forEach((el) => el.removeAttribute('aria-invalid'));

  const section = $(`.step[data-step="${step}"]`);
  requestAnimationFrame(() => $('input:not([hidden])', section)?.focus());
}

function setError(form, text, input) {
  $('.msg', form).textContent = text;
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
}

async function submitting(form, fn) {
  const btn = $('.btn', form);
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('loading');
  $('.msg', form).textContent = '';
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

const goToApp = () => location.replace('/');

// ── Code-Eingabe (6 Kästchen) ─────────────────────────────────────
function setupOtp(wrap, onComplete) {
  const input = $('input', wrap);
  const boxes = $('.otp-boxes', wrap);
  boxes.innerHTML = '<div></div>'.repeat(6);

  const render = () => {
    const v = input.value;
    [...boxes.children].forEach((box, i) => {
      box.textContent = v[i] ?? '';
      box.classList.toggle('current', i === Math.min(v.length, 5));
    });
  };

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    wrap.classList.remove('invalid');
    render();
    if (input.value.length === 6) onComplete?.();
  });
  // Cursor immer ans Ende, damit die Kästchen der Reihe nach gefüllt werden
  const toEnd = () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  input.addEventListener('focus', () => { wrap.classList.add('focused'); toEnd(); });
  input.addEventListener('click', toEnd);
  input.addEventListener('blur', () => wrap.classList.remove('focused'));

  render();
  return {
    input,
    clear() { input.value = ''; render(); },
    fail() {
      wrap.classList.add('invalid', 'shake');
      setTimeout(() => wrap.classList.remove('shake'), 400);
      input.select();
    },
  };
}

// ── „Code erneut senden“ mit Countdown ────────────────────────────
const timers = {};
function startCooldown(purpose, seconds = RESEND_SECONDS) {
  const btn = $(`[data-resend="${purpose}"]`);
  clearInterval(timers[purpose]);
  let left = seconds;
  const tick = () => {
    if (left <= 0) {
      clearInterval(timers[purpose]);
      btn.disabled = false;
      btn.textContent = 'Code erneut senden';
      return;
    }
    btn.disabled = true;
    btn.textContent = `Erneut senden in ${left--} s`;
  };
  tick();
  timers[purpose] = setInterval(tick, 1000);
}

// ── Passwort anzeigen/verbergen ───────────────────────────────────
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';

$$('[data-toggle-pw]').forEach((btn) => {
  const input = btn.previousElementSibling;
  btn.innerHTML = EYE;
  btn.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    btn.innerHTML = hidden ? EYE_OFF : EYE;
    btn.setAttribute('aria-label', hidden ? 'Passwort verbergen' : 'Passwort anzeigen');
    input.focus();
  });
});

// ── Formulare ─────────────────────────────────────────────────────
const fEmail = $('#form-email');
const fLogin = $('#form-login');
const fRegister = $('#form-register');
const fVerify = $('#form-verify');
const fReset = $('#form-reset');

const verifyOtp = setupOtp($('[data-otp]', fVerify), () => fVerify.requestSubmit());
const resetOtp = setupOtp($('[data-otp]', fReset), () => $('#reset-password').focus());

fEmail.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#email');
  const value = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return setError(fEmail, 'Bitte gib eine gültige E-Mail-Adresse ein.', input);
  }
  submitting(fEmail, async () => {
    try {
      const { mode } = await api('start', { email: value });
      email = value;
      $('#login-password').value = '';
      $('#register-password').value = '';
      show(mode);
    } catch (err) {
      setError(fEmail, err.message, input);
    }
  });
});

fLogin.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#login-password');
  if (!input.value) return setError(fLogin, 'Bitte gib dein Passwort ein.', input);
  submitting(fLogin, async () => {
    try {
      const data = await api('login', { email, password: input.value });
      if (data.next === 'verify') {
        verifyOtp.clear();
        show('verify');
        startCooldown('verify');
      } else {
        goToApp();
      }
    } catch (err) {
      setError(fLogin, err.message, input);
      input.select();
    }
  });
});

fRegister.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#register-password');
  if (input.value.length < 8) return setError(fRegister, 'Das Passwort muss mindestens 8 Zeichen lang sein.', input);
  submitting(fRegister, async () => {
    try {
      await api('register', { email, password: input.value });
      verifyOtp.clear();
      show('verify');
      startCooldown('verify');
    } catch (err) {
      if (err.status === 429 && err.data?.retryAfter) {
        // Code wurde gerade erst gesendet → direkt zur Eingabe
        show('verify');
        startCooldown('verify', err.data.retryAfter);
      } else {
        setError(fRegister, err.message, input);
      }
    }
  });
});

fVerify.addEventListener('submit', (e) => {
  e.preventDefault();
  if (verifyOtp.input.value.length !== 6) {
    $('.msg', fVerify).textContent = 'Bitte gib den 6-stelligen Code ein.';
    return verifyOtp.fail();
  }
  submitting(fVerify, async () => {
    try {
      await api('verify', { email, code: verifyOtp.input.value });
      goToApp();
    } catch (err) {
      $('.msg', fVerify).textContent = err.message;
      verifyOtp.fail();
    }
  });
});

$('#forgot').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await api('forgot', { email });
    resetOtp.clear();
    $('#reset-password').value = '';
    show('reset');
    startCooldown('reset');
  } catch (err) {
    if (err.status === 429 && err.data?.retryAfter) {
      show('reset');
      startCooldown('reset', err.data.retryAfter);
    } else {
      setError(fLogin, err.message);
    }
  } finally {
    btn.disabled = false;
  }
});

fReset.addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = $('#reset-password');
  if (resetOtp.input.value.length !== 6) {
    $('.msg', fReset).textContent = 'Bitte gib den 6-stelligen Code ein.';
    return resetOtp.fail();
  }
  if (pw.value.length < 8) return setError(fReset, 'Das Passwort muss mindestens 8 Zeichen lang sein.', pw);
  submitting(fReset, async () => {
    try {
      await api('reset', { email, code: resetOtp.input.value, password: pw.value });
      goToApp();
    } catch (err) {
      $('.msg', fReset).textContent = err.message;
      resetOtp.fail();
    }
  });
});

$$('[data-resend]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const purpose = btn.dataset.resend;
    const form = btn.closest('form');
    btn.disabled = true;
    try {
      await api('resend', { email, purpose });
      const msg = $('.msg', form);
      msg.textContent = '';
      startCooldown(purpose);
    } catch (err) {
      $('.msg', form).textContent = err.message;
      if (err.data?.retryAfter) startCooldown(purpose, err.data.retryAfter);
      else btn.disabled = false;
    }
  });
});

$$('[data-back]').forEach((btn) =>
  btn.addEventListener('click', () => {
    // Vom Reset zurück zur Anmeldung, sonst zur E-Mail-Eingabe
    if (current === 'reset') return show('login');
    show('email');
    $('#email').select();
  }),
);

$('#year').textContent = new Date().getFullYear();
