/* ==========================================================================
   HelpNow — fluxo do /agendamento
   Front → /api/agenda.php (proxy PHP na HostGator) → Google Apps Script (comercial@)
   Contrato da API: docs/03-agendamento.md
   As regras de agenda valem de verdade no Apps Script; aqui elas só orientam a interface.
   Modo demonstração (sem backend): abra /agendamento?mock=1
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    API: '/api/agenda.php',
    START_DATE: '2026-10-15',      // primeiro dia com agenda aberta
    HORIZON_DAYS: 30,              // até quantos dias à frente mostrar
    TIMEZONE: 'America/Sao_Paulo',
    TIMEOUT_MS: 15000,
    WHATSAPP: 'https://wa.me/5521968441647'
  };

  var params = new URLSearchParams(location.search);
  var MOCK = params.get('mock') === '1' || location.protocol === 'file:';

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
  var LAST = addDays(TODAY, CONFIG.HORIZON_DAYS);
  var MIN_WEEK = mondayOf(FIRST);
  var MAX_WEEK = mondayOf(LAST);

  /* ---------- Estado ---------- */
  var state = { step: 1, week: MIN_WEEK, days: {}, date: null, time: null, startedAt: 0, reqId: 0 };
  var cache = {}; // week -> { at, days }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    alert: $('ag-alert'), weekLabel: $('week-label'), prev: $('week-prev'), next: $('week-next'),
    days: $('days'), slotsTitle: $('slots-title'), slots: $('slots'), selection: $('selection-text'),
    toStep2: $('to-step-2'), summary: $('summary-text'), form: $('ag-form'), submit: $('submit-btn'),
    confirmTitle: $('confirm-title'), confirmWhen: $('confirm-when'), confirmEmail: $('confirm-email'),
    gcal: $('gcal-link'), ics: $('ics-btn')
  };

  /* ---------- Alertas ---------- */
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  function showAlert(type, html) { el.alert.innerHTML = '<div class="alert alert--' + type + '">' + ICON_ALERT + '<div>' + html + '</div></div>'; el.alert.style.marginBottom = '18px'; }
  function clearAlert() { el.alert.innerHTML = ''; el.alert.style.marginBottom = '0'; }
  function waLink(text) { return '<a href="' + CONFIG.WHATSAPP + '" target="_blank" rel="noopener">' + (text || 'fale com a gente no WhatsApp') + '</a>'; }

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

  var api = MOCK ? mockApi() : {
    slots: function (from, to) {
      return request(CONFIG.API + '?action=slots&from=' + from + '&to=' + to).then(function (r) {
        if (r.status !== 200 || !r.data || !Array.isArray(r.data.days)) throw new Error('slots ' + r.status);
        return r.data.days;
      });
    },
    book: function (payload) {
      return request(CONFIG.API + '?action=book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
  };

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
    var mid = addDays(week, 2);
    el.weekLabel.textContent = fmtMonth.format(toUTC(mid)).replace(' de ', ' ').toUpperCase() + ' · ESCOLHA O DIA';

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
      b.setAttribute('aria-label', longLabelPretty(date) + (available ? ' — ' + slots.length + ' horário(s) livre(s)' : ' — sem horários'));
      b.innerHTML = '<span class="day-btn__dow">' + DOW_SHORT[dow(date)] + '</span><span class="day-btn__num">' + toUTC(date).getUTCDate() + '</span>';
      b.addEventListener('click', onPickDay);
      el.days.appendChild(b);
    }
    var keep = state.date && (map[state.date] || []).length ? state.date : firstWithSlots;
    if (keep) { selectDay(keep); }
    else {
      state.date = null; state.time = null; updateSelection();
      el.slotsTitle.textContent = '';
      el.slots.innerHTML = '<p class="ag-empty" style="grid-column:1/-1">Nenhum horário livre nesta semana. Veja a próxima semana ou ' + waLink() + '.</p>';
    }
  }

  function onPickDay(e) { selectDay(e.currentTarget.dataset.date); }

  function selectDay(date) {
    if (state.date !== date) state.time = null;
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
    Array.prototype.forEach.call(el.slots.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.time === t)); });
    updateSelection();
  }

  function selectionText() { return longLabelPretty(state.date) + ' · ' + slotLabel(state.time) + ' (Brasília)'; }

  function updateSelection() {
    var ok = !!(state.date && state.time);
    el.toStep2.disabled = !ok;
    el.selection.innerHTML = ok ? '<strong>' + selectionText() + '</strong>' : 'Selecione um horário para continuar.';
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
    var card = document.querySelector('.booking');
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  el.toStep2.addEventListener('click', function () {
    if (!state.date || !state.time) return;
    clearAlert();
    el.summary.textContent = selectionText();
    if (!state.startedAt) state.startedAt = Date.now();
    goStep(2);
    $('f-nome').focus({ preventScroll: true });
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
  if (assunto === 'reforma') problema.value = 'Quero avaliar se nosso ERP está pronto para a Reforma Tributária (CBS/IBS).';
  else if (MOMENTO_TXT[momento]) problema.value = MOMENTO_TXT[momento];

  var phone = $('f-whatsapp');
  phone.addEventListener('input', function () {
    var d = phone.value.replace(/\D/g, '').slice(0, 11);
    var out = d;
    if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 7) out = '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length === 11 ? 7 : 6) + '-' + d.slice(d.length === 11 ? 7 : 6);
    phone.value = out;
  });

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

  var submitting = false;
  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;
    clearAlert();
    var v = values();
    var errs = validate(v);
    ['nome', 'empresa', 'whatsapp', 'email', 'erp', 'canal', 'consent'].forEach(function (k) { setError(k, errs[k]); });
    var first = Object.keys(errs)[0];
    if (first) { var f = $('f-' + first); if (f) f.focus(); return; }

    var payload = Object.assign({}, v, {
      date: state.date, time: state.time,
      origem: origem || '', assunto: assunto, momento: momento,
      startedAt: state.startedAt
    });

    submitting = true;
    el.submit.disabled = true;
    el.submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Confirmando…';

    api.book(payload).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok) return showConfirmation(v, r.data);
      var code = r.data && r.data.code;
      if (r.status === 409 || code === 'SLOT_TAKEN') {
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

  /* ---------- Passo 3: confirmação ---------- */
  function utcStamp(date, time, plusHours) {
    // Brasília = UTC-3 o ano todo (sem horário de verão desde 2019)
    var p = date.split('-').map(Number); var h = parseInt(time.slice(0, 2), 10) + 3 + (plusHours || 0);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], h, 0, 0)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function showConfirmation(v, data) {
    var first = v.nome.split(/\s+/)[0];
    el.confirmTitle.textContent = 'Reunião confirmada, ' + first + '!';
    el.confirmWhen.textContent = selectionText();
    el.confirmEmail.textContent = 'Enviamos o convite com o link do Google Meet para ' + v.email + '.';

    var title = 'Diagnóstico HelpNow — 60 min';
    var details = 'Reunião de diagnóstico com um especialista HelpNow.' + (data.meetLink ? '\nGoogle Meet: ' + data.meetLink : '') + '\nDúvidas: WhatsApp (21) 96844-1647';
    var start = utcStamp(state.date, state.time, 0), end = utcStamp(state.date, state.time, 1);
    el.gcal.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
      '&dates=' + start + '/' + end + '&details=' + encodeURIComponent(details) + (data.meetLink ? '&location=' + encodeURIComponent(data.meetLink) : '');

    el.ics.onclick = function () {
      var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HelpNow//Agendamento//PT', 'BEGIN:VEVENT',
        'UID:' + (data.eventId || Date.now()) + '@helpnowsolucoes.com.br', 'DTSTAMP:' + utcStamp(TODAY, '00:00', 0),
        'DTSTART:' + start, 'DTEND:' + end, 'SUMMARY:' + title, 'DESCRIPTION:' + details.replace(/\n/g, '\\n'),
        data.meetLink ? 'LOCATION:' + data.meetLink : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
      var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = 'diagnostico-helpnow.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    };

    goStep(3);
    $('step-3').focus({ preventScroll: true });
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'agendamento_confirmado', canal: v.canal, erp: v.erp });
  }

  /* ---------- API simulada (?mock=1) ---------- */
  function mockApi() {
    var HOURS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
    var HOLIDAYS = ['2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'];
    var booked = {};
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    return {
      slots: function (from, to) {
        return wait(700).then(function () {
          var out = [];
          for (var d = from; d <= to; d = addDays(d, 1)) {
            var w = dow(d);
            var slots = [];
            if (w >= 1 && w <= 5 && d >= FIRST && d <= LAST && HOLIDAYS.indexOf(d) < 0) {
              var day = toUTC(d).getUTCDate();
              slots = HOURS.filter(function (h, i) { return (day + i) % 4 !== 0 && !booked[d + h]; });
            }
            out.push({ date: d, slots: slots });
          }
          return out;
        });
      },
      book: function (p) {
        return wait(1200).then(function () {
          if (Math.random() < 0.1) return { status: 409, data: { ok: false, code: 'SLOT_TAKEN' } };
          booked[p.date + p.time] = true;
          return { status: 200, data: { ok: true, eventId: 'mock-' + Date.now(), meetLink: 'https://meet.google.com/abc-defg-hij' } };
        });
      }
    };
  }

  if (MOCK) showAlert('warn', '<strong>Modo demonstração.</strong> Os horários são simulados e nada é gravado.');
  loadWeek(MIN_WEEK);
})();
