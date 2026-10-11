/* ==========================================================================
   HelpNow — fluxo do /agendamento
   Front → /api/agenda.php (proxy PHP na HostGator) → Google Apps Script (comercial@)
   Contrato da API: docs/03-agendamento.md
   As regras de agenda valem de verdade no Apps Script; aqui elas só orientam a interface.
   Modo demonstração (sem backend): abra /agendamento?mock=1
     - ?holdttl=15            reserva de 15 s (testar a expiração; máx. 180) — só em localhost
     - ?simular=409|422|429|502|duplicado|hold502|holdrede   força a resposta do mock
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    API: '/api/agenda.php',
    START_DATE: '2026-10-15',      // primeiro dia com agenda aberta
    END_DATE: '2026-12-20',        // último dia da agenda (inclusive) — igual a CONFIG.END_DATE do Code.gs
    TIMEZONE: 'America/Sao_Paulo',
    TIMEOUT_MS: 15000,
    HOLD_SECONDS: 180,             // valor padrão (3 min); quem manda é o ttl devolvido pela API
    WHATSAPP: 'https://wa.me/5521968441647'
  };

  var params = new URLSearchParams(location.search);
  var MOCK = params.get('mock') === '1' || location.protocol === 'file:';
  var IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var DEV_TTL = IS_LOCAL || MOCK ? Math.max(0, Math.min(180, parseInt(params.get('holdttl'), 10) || 0)) : 0;
  var SIMULAR = IS_LOCAL || MOCK ? (params.get('simular') || '') : '';

  /* ---------- Datas (strings YYYY-MM-DD, sem depender do fuso do navegador) ---------- */
  function todaySP() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function toUTC(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function fromUTC(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return fromUTC(d); }
  function dow(s) { return toUTC(s).getUTCDay(); }
  function mondayOf(s) { return addDays(s, -((dow(s) + 6) % 7)); }
  function maxStr(a, b) { return a > b ? a : b; }
  var fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  var DOW_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function longLabelPretty(s) {
    var d = toUTC(s);
    var wd = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(d);
    var mo = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(d);
    return cap(wd) + ', ' + d.getUTCDate() + ' de ' + mo;
  }
  function slotLabel(t) { var h = parseInt(t.slice(0, 2), 10); var e = String(h + 1).padStart(2, '0'); return t + ' – ' + e + t.slice(2); }

  var TODAY = todaySP();
  var FIRST = maxStr(TODAY, CONFIG.START_DATE);
  var LAST = CONFIG.END_DATE;
  var MIN_WEEK = mondayOf(FIRST);
  var MAX_WEEK = mondayOf(LAST);

  /* ---------- Estado ---------- */
  var state = {
    step: 1, week: MIN_WEEK, days: {}, date: null, time: null, startedAt: 0, reqId: 0,
    holdId: newId(),          // identifica ESTE navegador nas reservas
    hold: null,               // reserva ativa: { date, time, total, expiresAt, warned, announced }
    holdReq: 0,               // invalida respostas de reservas antigas
    holdChain: Promise.resolve(),
    holdPromise: null,
    timer: null,
    booking: null             // dados do agendamento confirmado (start/end/meet)
  };
  var cache = {}; // week -> { at, days }
  var submitting = false;
  var advancing = false;

  function newId() {
    var a = new Uint8Array(18);
    try { (window.crypto || window.msCrypto).getRandomValues(a); }
    catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    endNote: $('ag-endnote'), dupNote: $('dup-note'), alert: $('ag-alert'), weekLabel: $('week-label'), prev: $('week-prev'), next: $('week-next'),
    days: $('days'), slotsTitle: $('slots-title'), slots: $('slots'), selection: $('selection-text'),
    toStep2: $('to-step-2'), summary: $('summary-text'), form: $('ag-form'), submit: $('submit-btn'),
    confirmTitle: $('confirm-title'), confirmWhen: $('confirm-when'), confirmEmail: $('confirm-email'),
    calGoogle: $('cal-google'), calOutlook: $('cal-outlook'), calLive: $('cal-live'), ics: $('ics-btn'),
    holdBar: $('hold-bar'), holdTime: $('hold-time'), holdFill: $('hold-fill'), holdLive: $('hold-live'), chrono: $('ag-chrono')
  };

  /* ---------- Alertas ---------- */
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  function showAlert(type, html) { el.alert.innerHTML = '<div class="alert alert--' + type + '">' + ICON_ALERT + '<div>' + html + '</div></div>'; el.alert.style.marginBottom = '18px'; }
  function clearAlert() { el.alert.innerHTML = ''; el.alert.style.marginBottom = '0'; }
  /** Só TEXTO (sem link/botão): o /agendamento tem um único objetivo. O WhatsApp fica como alternativa escrita. */
  function waLink(text) { return (text || 'fale com a gente pelo WhatsApp') + ' (21) 96844-1647'; }

  /* ---------- API ---------- */
  function request(url, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, CONFIG.TIMEOUT_MS);
    opts = opts || {};
    opts.signal = ctrl.signal;
    opts.headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      clearTimeout(t);
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
    }, function (err) { clearTimeout(t); throw err; });
  }
  function holdBody(date, time) { return JSON.stringify({ date: date, time: time, holdId: state.holdId }); }

  var api = MOCK ? mockApi() : {
    slots: function (from, to) {
      return request(CONFIG.API + '?action=slots&from=' + from + '&to=' + to + '&holdId=' + state.holdId).then(function (r) {
        if (r.status !== 200 || !r.data || !Array.isArray(r.data.days)) throw new Error('slots ' + r.status);
        return r.data.days;
      });
    },
    book: function (payload) {
      return request(CONFIG.API + '?action=book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    },
    hold: function (date, time) {
      return request(CONFIG.API + '?action=hold' + (DEV_TTL ? '&ttl=' + DEV_TTL : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: holdBody(date, time) });
    },
    release: function (date, time) {
      try { fetch(CONFIG.API + '?action=release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: holdBody(date, time), keepalive: true }).catch(function () {}); } catch (e) { /* sem rede: a reserva expira sozinha */ }
    },
    releaseOnExit: function (date, time) {
      if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.API + '?action=release', new Blob([holdBody(date, time)], { type: 'text/plain;charset=UTF-8' }));
    }
  };

  /* ---------- Reserva temporária (hold) ---------- */
  function holdOk(r) { return r && r.status === 200 && r.data && r.data.ok === true; }
  function fmtClock(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function announce(msg) { if (!el.holdLive) return; el.holdLive.textContent = ''; setTimeout(function () { el.holdLive.textContent = msg; }, 60); }

  function startTimer() { stopTimer(); state.timer = setInterval(tick, 250); tick(); }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  function tick() {
    if (!state.hold) { stopTimer(); return; }
    var left = state.hold.expiresAt - Date.now();
    if (left <= 0) { if (!submitting) onHoldExpired(); return; }
    renderHold(left);
  }

  /**
   * Cronômetro do hero: idle ("60" + animação de carregamento em loop, só CSS) · hold (mm:ss; o arco CARREGA de 0 a 100 %
   * conforme a reserva passa) · done (anel cheio + check). `frac` = fração de tempo RESTANTE; `low` = últimos 30 s (laranja).
   */
  var ambient = window.HelpNowChrono ? window.HelpNowChrono(document.getElementById('ag-chrono')) : { running: function () { return false; }, start: function () {}, stop: function () {} };
  ambient.start();   // o arco já corre ao abrir a página (180 s, linear)
  function setChrono(name, frac, clock, low) {
    var c = el.chrono;
    if (!c) return;
    c.setAttribute('data-state', name);
    var fill = c.querySelector('.chrono__fill'), tip = c.querySelector('.chrono__tip');
    if (name === 'idle') {
      c.classList.remove('is-low');
      if (!ambient.running()) { fill.removeAttribute('style'); tip.removeAttribute('style'); ambient.start(); }   // animação ambiente: recomeça do zero, sem texto
      return;
    }
    ambient.stop();
    var remaining = name === 'done' ? 0 : Math.max(0, Math.min(1, frac));
    fill.style.strokeDashoffset = (remaining * 100).toFixed(2);                    // pathLength = 100
    tip.style.transform = 'rotate(' + ((1 - remaining) * 360).toFixed(1) + 'deg)';
    c.classList.toggle('is-low', name === 'hold' && !!low);
    if (clock != null) c.querySelector('.chrono__time').textContent = clock;
  }

  /** Única fonte de tempo: o cronômetro, a barra do passo 2 e os avisos saem daqui. */
  function renderHold(left) {
    var h = state.hold;
    if (!h) return;
    var sec = Math.ceil(left / 1000);
    var frac = Math.max(0, Math.min(1, left / h.total));
    setChrono('hold', frac, fmtClock(sec), sec <= 30);
    if (state.step !== 2) return;
    el.holdTime.textContent = fmtClock(sec);
    el.holdFill.style.transform = 'scaleX(' + frac + ')';
    el.holdBar.classList.toggle('is-low', sec <= 30);
    if (sec <= 30 && !h.warned && h.total > 30000) { h.warned = true; announce('Faltam 30 segundos para o fim da reserva do horário.'); }
  }

  function showHoldUI() {
    var h = state.hold;
    if (!h) { el.holdBar.hidden = true; return; }
    el.holdBar.hidden = false;
    renderHold(Math.max(0, h.expiresAt - Date.now()));
    if (!h.announced) {
      h.announced = true;
      var mins = Math.round(h.total / 60000);
      announce('Horário reservado para você por ' + (h.total >= 60000 ? mins + (mins === 1 ? ' minuto.' : ' minutos.') : Math.round(h.total / 1000) + ' segundos.'));
    }
  }
  function hideHoldBar() { el.holdBar.hidden = true; }
  /** Esconde a barra e devolve o cronômetro ao estado inicial. */
  function hideHoldUI() { hideHoldBar(); setChrono('idle'); }

  /** Descarta a reserva local; com release=true avisa o servidor (troca de horário/dia). */
  function dropHold(release) {
    state.holdReq++; // qualquer reserva em andamento passa a ser "antiga"
    var h = state.hold;
    stopTimer(); hideHoldUI(); state.hold = null;
    if (h && release) api.release(h.date, h.time);
  }

  function onHoldExpired() {
    stopTimer(); state.hold = null; state.time = null; hideHoldUI();
    delete cache[state.week];
    if (state.step !== 1) goStep(1);
    updateSelection();
    showAlert('warn', '<strong>O tempo de reserva acabou.</strong> Escolha o horário novamente.');
    loadWeek(state.week, { force: true });
  }

  function onHoldTaken(date, time) {
    if (state.date === date && state.time === time) state.time = null;
    delete cache[state.week];
    updateSelection();
    showAlert('warn', '<strong>Esse horário acabou de ser reservado por outra pessoa.</strong> Escolha outro, por favor.');
    loadWeek(state.week, { force: true });
  }

  /** Pede a reserva do horário. Falha de rede/servidor → segue SEM timer e sem texto de reserva. */
  function requestHold(date, time) {
    if (state.hold && state.hold.date === date && state.hold.time === time) return state.holdPromise;
    var prev = state.hold;
    if (prev) { stopTimer(); hideHoldUI(); state.hold = null; api.release(prev.date, prev.time); }
    var token = ++state.holdReq;
    var p = state.holdChain = state.holdChain.then(function () {
      if (token !== state.holdReq) return 'stale';
      return api.hold(date, time).then(function (r) {
        if (token !== state.holdReq) { if (holdOk(r)) api.release(date, time); return 'stale'; }
        if (holdOk(r)) {
          var ttl = Number(r.data.ttl) > 0 ? Number(r.data.ttl) : CONFIG.HOLD_SECONDS;
          state.hold = { date: date, time: time, total: ttl * 1000, expiresAt: Date.now() + ttl * 1000, warned: false, announced: false };
          startTimer();
          if (state.step === 2) showHoldUI();
          return 'ok';
        }
        if (r.status === 409 || (r.data && r.data.code === 'SLOT_TAKEN')) { onHoldTaken(date, time); return 'taken'; }
        return 'none';
      }, function () { return token === state.holdReq ? 'none' : 'stale'; });
    });
    state.holdPromise = p;
    return p;
  }

  /** Espera a reserva MAIS RECENTE terminar (o usuário pode ter trocado de horário no meio). */
  function settleHold() {
    var p = state.holdPromise;
    return Promise.resolve(p).then(function (r) { return state.holdPromise === p ? r : settleHold(); });
  }

  window.addEventListener('pagehide', function () {
    if (state.hold && state.step !== 3) api.releaseOnExit(state.hold.date, state.hold.time);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('focus', tick);
  window.addEventListener('pageshow', tick);

  /* ---------- Passo 1: dias e horários ---------- */
  function renderSkeleton() {
    el.days.setAttribute('aria-busy', 'true');
    el.days.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    el.slots.innerHTML = '<div class="skeleton skeleton--slot"></div><div class="skeleton skeleton--slot"></div><div class="skeleton skeleton--slot"></div>';
    el.slotsTitle.textContent = 'Carregando horários…';
  }

  function loadWeek(week, opts) {
    opts = opts || {};
    state.week = week;
    el.prev.disabled = week <= MIN_WEEK;
    el.next.disabled = week >= MAX_WEEK;
    el.endNote.hidden = !(week >= MAX_WEEK || FIRST > LAST);
    var mid = addDays(week, 2);
    el.weekLabel.innerHTML = fmtMonth.format(toUTC(mid)).replace(' de ', ' ').toUpperCase() + '<span class="ag-month__hint"> · ESCOLHA O DIA</span>';

    var cached = cache[week];
    if (cached && !opts.force && Date.now() - cached.at < 60000) { applyWeek(cached.days); return Promise.resolve(); }

    renderSkeleton();
    var id = ++state.reqId;
    return api.slots(week, addDays(week, 4)).then(function (days) {
      if (id !== state.reqId) return;
      var map = {};
      days.forEach(function (d) { map[d.date] = d.slots || []; });
      cache[week] = { at: Date.now(), days: map };
      applyWeek(map);
    }).catch(function () {
      if (id !== state.reqId) return;
      el.days.setAttribute('aria-busy', 'false');
      el.days.innerHTML = '';
      el.slots.innerHTML = '';
      el.slotsTitle.textContent = '';
      showAlert('error', '<strong>Não conseguimos carregar a agenda agora.</strong><br>Verifique sua conexão e tente de novo, ou ' + waLink() + '.<br><button class="btn btn--sm btn--outline" type="button" id="retry-btn">Tentar de novo</button>');
      var retry = $('retry-btn');
      if (retry) retry.addEventListener('click', function () { clearAlert(); loadWeek(state.week, { force: true }); });
    });
  }

  function applyWeek(map) {
    state.days = map;
    el.days.setAttribute('aria-busy', 'false');
    el.days.innerHTML = '';
    var firstWithSlots = null;
    for (var i = 0; i < 5; i++) {
      var date = addDays(state.week, i);
      var slots = map[date] || [];
      var available = slots.length > 0 && date >= FIRST && date <= LAST;
      if (available && !firstWithSlots) firstWithSlots = date;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'day-btn';
      b.dataset.date = date;
      b.disabled = !available;
      b.setAttribute('aria-pressed', 'false');
      // Nome acessível completo via texto oculto (aria-label divergente do texto visível falha em "label in name").
      b.innerHTML = '<span class="day-btn__dow" aria-hidden="true">' + DOW_SHORT[dow(date)] + '</span><span class="day-btn__num" aria-hidden="true">' + toUTC(date).getUTCDate() + '</span>' +
        '<span class="sr-only">' + longLabelPretty(date) + (available ? ' — ' + slots.length + ' horário(s) livre(s)' : ' — sem horários') + '</span>';
      b.addEventListener('click', onPickDay);
      el.days.appendChild(b);
    }
    var keep = state.date && (map[state.date] || []).length ? state.date : firstWithSlots;
    if (keep) { selectDay(keep); }
    else {
      if (state.hold || state.time) dropHold(true);
      state.date = null; state.time = null; updateSelection();
      el.slotsTitle.textContent = '';
      el.slots.innerHTML = (state.week >= MAX_WEEK || FIRST > LAST)
        ? '<p class="ag-empty" style="grid-column:1/-1">Agenda disponível até 20 de dezembro. Para outras datas, ' + waLink() + '.</p>'
        : '<p class="ag-empty" style="grid-column:1/-1">Nenhum horário livre nesta semana. Veja a próxima semana ou ' + waLink() + '.</p>';
    }
  }

  function onPickDay(e) { selectDay(e.currentTarget.dataset.date); }

  function selectDay(date) {
    if (state.date !== date) { state.time = null; dropHold(true); }
    state.date = date;
    Array.prototype.forEach.call(el.days.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset && b.dataset.date === date)); });
    var slots = state.days[date] || [];
    el.slotsTitle.textContent = longLabelPretty(date) + ' — horários disponíveis';
    el.slots.innerHTML = '';
    slots.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot-btn';
      b.dataset.time = t;
      b.textContent = slotLabel(t);
      b.setAttribute('aria-pressed', String(state.time === t));
      b.addEventListener('click', function () { selectTime(t); });
      el.slots.appendChild(b);
    });
    updateSelection();
  }

  function selectTime(t) {
    state.time = t;
    updateSelection();
    requestHold(state.date, t);
  }

  function selectionText() { return longLabelPretty(state.date) + ' · ' + slotLabel(state.time) + ' (Brasília)'; }

  function updateSelection() {
    var ok = !!(state.date && state.time);
    el.toStep2.disabled = !ok || advancing;
    el.selection.innerHTML = ok ? '<strong>' + selectionText() + '</strong>' : 'Selecione um horário para continuar.';
    Array.prototype.forEach.call(el.slots.children, function (b) { if (b.dataset && b.dataset.time) b.setAttribute('aria-pressed', String(!!state.time && b.dataset.time === state.time)); });
  }

  el.prev.addEventListener('click', function () { if (state.week > MIN_WEEK) { clearAlert(); loadWeek(addDays(state.week, -7)); } });
  el.next.addEventListener('click', function () { if (state.week < MAX_WEEK) { clearAlert(); loadWeek(addDays(state.week, 7)); } });

  /* ---------- Navegação entre passos ---------- */
  function goStep(n) {
    state.step = n;
    [1, 2, 3].forEach(function (i) { $('step-' + i).hidden = i !== n; });
    document.querySelectorAll('[data-step-ind]').forEach(function (li) {
      var i = Number(li.getAttribute('data-step-ind'));
      li.classList.toggle('is-active', i === n);
      li.classList.toggle('is-done', i < n);
      li.querySelector('.stepper__dot').textContent = i < n ? '✓' : String(i);
      if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (n === 2) showHoldUI(); else hideHoldBar(); // sair do passo 2 não interrompe a reserva
    var card = document.querySelector('.booking');
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  el.toStep2.addEventListener('click', function () {
    if (!state.date || !state.time || advancing) return;
    clearAlert();
    advancing = true; el.toStep2.disabled = true;
    settleHold().then(function (res) {
      advancing = false; updateSelection();
      if (res === 'taken' || !state.time) return;       // alguém levou o horário: onHoldTaken já avisou
      el.summary.textContent = selectionText();
      if (!state.startedAt) state.startedAt = Date.now();
      goStep(2);
      $('f-nome').focus({ preventScroll: true });
    });
  });
  $('back-to-1').addEventListener('click', function () { clearAlert(); goStep(1); });
  $('back-to-1b').addEventListener('click', function () { clearAlert(); goStep(1); });

  /* ---------- Passo 2: formulário ---------- */
  var ORIGENS = { 'universo-totvs': 'Universo TOTVS', 'linkedin': 'LinkedIn', 'instagram': 'Instagram', 'google': 'Google' };
  var origem = (params.get('origem') || '').toLowerCase();
  if (ORIGENS[origem]) $('f-canal').value = ORIGENS[origem];

  var MOMENTO_TXT = {
    '01': 'Hoje gerenciamos o negócio em planilhas e queremos entender o próximo passo.',
    '02': 'Vamos implantar um ERP e queremos apoio na escolha/implantação.',
    '03': 'Já usamos TOTVS, mas o sistema não entrega o que deveria.',
    '04': 'Queremos sustentação e melhoria contínua do nosso TOTVS.'
  };
  var assunto = params.get('assunto') || '';
  var momento = params.get('momento') || '';
  var problema = $('f-problema');
  if (assunto === 'reforma') problema.value = 'Quero avaliar se minha equipe está preparada para a Reforma Tributária (CBS/IBS).';
  else if (MOMENTO_TXT[momento]) problema.value = MOMENTO_TXT[momento];

  var phone = $('f-whatsapp');
  phone.addEventListener('input', function () {
    var d = phone.value.replace(/\D/g, '').slice(0, 11);
    var out = d;
    if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 7) out = '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length === 11 ? 7 : 6) + '-' + d.slice(d.length === 11 ? 7 : 6);
    phone.value = out;
  });

  /** Aviso de duplicidade junto aos campos de e-mail e WhatsApp (mensagem genérica: não diz qual campo bateu). */
  function showDuplicate() {
    ['whatsapp', 'email'].forEach(function (k) {
      var input = $('f-' + k);
      input.closest('.field').classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', 'dup-note');
    });
    el.dupNote.hidden = false;
    el.dupNote.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function clearDuplicate() {
    if (el.dupNote.hidden) return;
    el.dupNote.hidden = true;
    ['whatsapp', 'email'].forEach(function (k) {
      var input = $('f-' + k);
      input.closest('.field').classList.remove('has-error');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    });
  }
  $('f-email').addEventListener('input', clearDuplicate);
  $('f-whatsapp').addEventListener('input', clearDuplicate);

  function setError(name, msg) {
    var input = $('f-' + name);
    var span = $('e-' + name);
    var field = input && input.closest('.field');
    if (field) field.classList.toggle('has-error', !!msg);
    if (input) { if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'e-' + name); } else { input.removeAttribute('aria-invalid'); } }
    if (span) span.textContent = msg || '';
  }

  function validate(v) {
    var errs = {};
    if (v.nome.length < 3) errs.nome = 'Informe seu nome completo.';
    if (v.empresa.length < 2) errs.empresa = 'Informe o nome da empresa.';
    var digits = v.whatsapp.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) errs.whatsapp = 'Informe o WhatsApp com DDD.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errs.email = 'Informe um e-mail válido.';
    if (!v.erp) errs.erp = 'Selecione uma opção.';
    if (!v.canal) errs.canal = 'Selecione uma opção.';
    if (!v.consent) errs.consent = 'Precisamos do seu consentimento para enviar a confirmação.';
    return errs;
  }

  function values() {
    return {
      nome: $('f-nome').value.trim(), empresa: $('f-empresa').value.trim(), whatsapp: phone.value.trim(),
      email: $('f-email').value.trim(), erp: $('f-erp').value, canal: $('f-canal').value,
      problema: problema.value.trim(), consent: $('f-consent').checked, website: $('f-website').value
    };
  }

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;
    clearAlert();
    clearDuplicate();
    var v = values();
    var errs = validate(v);
    ['nome', 'empresa', 'whatsapp', 'email', 'erp', 'canal', 'consent'].forEach(function (k) { setError(k, errs[k]); });
    var first = Object.keys(errs)[0];
    if (first) { var f = $('f-' + first); if (f) f.focus(); return; }

    var payload = Object.assign({}, v, {
      date: state.date, time: state.time,
      origem: origem || '', assunto: assunto, momento: momento,
      startedAt: state.startedAt,
      holdId: state.holdId
    });

    submitting = true;
    el.submit.disabled = true;
    el.submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Confirmando…';

    api.book(payload).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok) return showConfirmation(v, r.data);
      var code = r.data && r.data.code;
      if (code === 'DUPLICATE') {
        // sem revelar data, horário, nome nem qual campo bateu; mantém o que foi digitado e fica no passo 2
        dropHold(false);
        showDuplicate();
        return;
      }
      if (r.status === 409 || code === 'SLOT_TAKEN') {
        dropHold(false);
        delete cache[state.week];
        state.time = null;
        goStep(1);
        showAlert('warn', '<strong>Esse horário acabou de ser reservado.</strong> Escolha outro, por favor.');
        return loadWeek(state.week, { force: true });
      }
      if (r.status === 422 && r.data && r.data.fields) {
        Object.keys(r.data.fields).forEach(function (k) { setError(k, r.data.fields[k]); });
        showAlert('error', 'Confira os campos destacados.');
        return;
      }
      if (r.status === 429) { showAlert('error', 'Muitas tentativas em pouco tempo. Aguarde alguns minutos ou ' + waLink() + '.'); return; }
      throw new Error('book ' + r.status);
    }).catch(function () {
      showAlert('error', '<strong>Não foi possível confirmar agora.</strong> Seus dados não foram perdidos: tente de novo em instantes ou ' + waLink('agende pelo WhatsApp') + '.');
    }).then(function () {
      submitting = false;
      el.submit.disabled = false;
      el.submit.textContent = 'Confirmar agendamento';
    });
  });

  /* ---------- Passo 3: confirmação + "Adicionar à minha agenda" ---------- */
  var CAL_TITLE = 'Diagnóstico HelpNow';
  function calDescription(meet) { return 'Reunião de diagnóstico de 60 min com a HelpNow.' + (meet ? ' Link: ' + meet : ''); }
  function stampUTC(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function isoUTC(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  var enc = encodeURIComponent;

  /** Início/fim SEMPRE do ISO (UTC) devolvido pela API; só sem ele cai no horário escolhido (Brasília = UTC-3). */
  function calTimes(data) {
    var s = data && data.start && !isNaN(Date.parse(data.start)) ? new Date(data.start) : null;
    var e = data && data.end && !isNaN(Date.parse(data.end)) ? new Date(data.end) : null;
    if (!s) {
      var p = state.date.split('-').map(Number);
      s = new Date(Date.UTC(p[0], p[1] - 1, p[2], parseInt(state.time.slice(0, 2), 10) + 3, 0, 0));
    }
    if (!e || e <= s) e = new Date(s.getTime() + 3600000);
    return { s: s, e: e };
  }

  function googleUrl(t, meet) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + enc(CAL_TITLE) +
      '&dates=' + stampUTC(t.s) + '/' + stampUTC(t.e) + '&details=' + enc(calDescription(meet)) + (meet ? '&location=' + enc(meet) : '');
  }
  function outlookUrl(host, t, meet) {
    return 'https://' + host + '/calendar/0/deeplink/compose?subject=' + enc(CAL_TITLE) +
      '&startdt=' + enc(isoUTC(t.s)) + '&enddt=' + enc(isoUTC(t.e)) + '&body=' + enc(calDescription(meet)) +
      (meet ? '&location=' + enc(meet) : '') + '&path=/calendar/action/compose&rru=addevent';
  }

  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(line) { // linhas de até 75 octetos (RFC 5545)
    var out = '', n = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i), b = unescape(encodeURIComponent(ch)).length;
      if (n + b > 74) { out += '\r\n '; n = 1; }
      out += ch; n += b;
    }
    return out;
  }
  function buildICS(t, meet, uid) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HelpNow//Agendamento//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + uid + '@helpnowsolucoes.com.br', 'DTSTAMP:' + stampUTC(new Date()), 'DTSTART:' + stampUTC(t.s), 'DTEND:' + stampUTC(t.e),
      'SUMMARY:' + icsText(CAL_TITLE), 'DESCRIPTION:' + icsText(calDescription(meet))];
    if (meet) { lines.push('URL:' + meet); lines.push('LOCATION:' + icsText(meet)); }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function showConfirmation(v, data) {
    dropHold(false); // o servidor já removeu a reserva ao agendar
    setChrono('done');
    var first = v.nome.split(/\s+/)[0];
    el.confirmTitle.textContent = 'Reunião confirmada, ' + first + '!';
    el.confirmWhen.textContent = selectionText();
    el.confirmEmail.textContent = 'Enviamos o convite com o link do Google Meet para ' + v.email + '.';

    var t = calTimes(data), meet = (data && data.meetLink) || '';
    var uid = (data && data.eventId) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    el.calGoogle.href = googleUrl(t, meet);
    el.calOutlook.href = outlookUrl('outlook.office.com', t, meet);
    el.calLive.href = outlookUrl('outlook.live.com', t, meet);
    el.ics.onclick = function () {
      var url = URL.createObjectURL(new Blob([buildICS(t, meet, uid)], { type: 'text/calendar;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = 'diagnostico-helpnow.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    };
    state.booking = { start: t.s.toISOString(), end: t.e.toISOString(), meet: meet };

    goStep(3);
    $('step-3').focus({ preventScroll: true });
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'agendamento_confirmado', canal: v.canal, erp: v.erp });
  }

  /* ---------- API simulada (?mock=1) ---------- */
  function mockApi() {
    var HOURS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
    var HOLIDAYS = ['2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'];
    var LS_KEY = 'helpnow-mock-holds';       // compartilhado entre abas do mesmo navegador → "duas abas disputando"
    var booked = {};
    var mem = {};                            // reserva em memória se o localStorage estiver bloqueado
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    function readHolds() {
      var o;
      try { o = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { o = mem; }
      var now = Date.now();
      Object.keys(o).forEach(function (k) { if (!o[k] || o[k].exp <= now) delete o[k]; });
      return o;
    }
    function writeHolds(o) { mem = o; try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) { /* ok: usa memória */ } }
    function iso(date, time) {
      var p = date.split('-').map(Number), h = parseInt(time.slice(0, 2), 10);
      var s = new Date(Date.UTC(p[0], p[1] - 1, p[2], h + 3, 0, 0));
      return { start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString() };
    }

    return {
      slots: function (from, to) {
        return wait(700).then(function () {
          var holds = readHolds(), out = [];
          for (var d = from; d <= to; d = addDays(d, 1)) {
            var w = dow(d);
            var slots = [];
            if (w >= 1 && w <= 5 && d >= FIRST && d <= LAST && HOLIDAYS.indexOf(d) < 0) {
              var day = toUTC(d).getUTCDate();
              slots = HOURS.filter(function (h, i) {
                var hold = holds[d + ' ' + h];
                return (day + i) % 4 !== 0 && !booked[d + h] && (!hold || hold.id === state.holdId);
              });
            }
            out.push({ date: d, slots: slots });
          }
          return out;
        });
      },
      hold: function (date, time) {
        return wait(250).then(function () {
          if (SIMULAR === 'holdrede') throw new Error('rede');
          if (SIMULAR === 'hold502') return { status: 502, data: { ok: false, code: 'UPSTREAM' } };
          var holds = readHolds(), k = date + ' ' + time;
          if (holds[k] && holds[k].id !== state.holdId) return { status: 409, data: { ok: false, code: 'SLOT_TAKEN' } };
          Object.keys(holds).forEach(function (key) { if (holds[key].id === state.holdId) delete holds[key]; }); // um horário por pessoa
          var ttl = DEV_TTL || CONFIG.HOLD_SECONDS;
          holds[k] = { id: state.holdId, exp: Date.now() + ttl * 1000 };
          writeHolds(holds);
          return { status: 200, data: { ok: true, ttl: ttl } };
        });
      },
      release: function (date, time) {
        var holds = readHolds(), k = date + ' ' + time;
        if (holds[k] && holds[k].id === state.holdId) { delete holds[k]; writeHolds(holds); }
      },
      releaseOnExit: function (date, time) { this.release(date, time); },
      book: function (p) {
        return wait(1200).then(function () {
          var dupMail = String(p.email || '').trim().toLowerCase() === 'duplicado@teste.com';
          var dupZap = String(p.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') === '11900000000';
          if (SIMULAR === 'duplicado' || dupMail || dupZap) return { status: 409, data: { ok: false, code: 'DUPLICATE' } };
          if (SIMULAR === '409') return { status: 409, data: { ok: false, code: 'SLOT_TAKEN' } };
          if (SIMULAR === '422') return { status: 422, data: { ok: false, code: 'VALIDATION', fields: { email: 'Informe um e-mail válido.' } } };
          if (SIMULAR === '429') return { status: 429, data: { ok: false, code: 'RATE_LIMIT' } };
          if (SIMULAR === '502') return { status: 502, data: { ok: false, code: 'UPSTREAM' } };
          var holds = readHolds(), k = p.date + ' ' + p.time;
          if (holds[k] && holds[k].id !== p.holdId) return { status: 409, data: { ok: false, code: 'SLOT_TAKEN' } };
          delete holds[k]; writeHolds(holds);
          booked[p.date + p.time] = true;
          var t = iso(p.date, p.time);
          return { status: 200, data: { ok: true, eventId: 'mock-' + Date.now(), start: t.start, end: t.end, meetLink: 'https://meet.google.com/abc-defg-hij' } };
        });
      }
    };
  }

  if (MOCK) showAlert('warn', '<strong>Modo demonstração.</strong> Os horários são simulados e nada é gravado.');
  loadWeek(MIN_WEEK);
})();
