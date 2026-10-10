/**
 * HelpNow — Agendamento (Google Apps Script)
 *
 * Projeto vinculado à planilha "HelpNow — Leads" no Drive de comercial@helpnowsolucoes.com.br.
 * Publicado como Web App: Executar como "Eu" (comercial@) · Acesso "Qualquer pessoa".
 * Só o proxy PHP do site chama este script, sempre com o SHARED_SECRET.
 *
 * O que faz:
 *  - doGet  ?action=slots : devolve os horários livres (regras de CONFIG + agenda real + feriados)
 *  - doPost  action=book  : revalida o horário, cria o evento com Google Meet, convida o cliente,
 *                           grava a linha na aba "Leads" e envia e-mails
 *  - sendReminders()      : gatilho de hora em hora — e-mail de lembrete ~24h antes
 *
 * Requer o serviço avançado "Google Calendar API" (Editor → Serviços → +).
 * Documentação: docs/03-agendamento.md
 */

const CONFIG = {
  CALENDAR_ID: 'primary', // agenda do comercial@
  HOLIDAY_CALENDAR_ID: 'pt-br.brazilian#holiday@group.v.calendar.google.com',
  TIMEZONE: 'America/Sao_Paulo',
  UTC_OFFSET: '-03:00', // Brasil sem horário de verão desde 2019
  START_DATE: '2026-10-15',
  WEEKDAYS: [1, 2, 3, 4, 5], // seg..sex
  SLOT_HOURS: [9, 10, 11, 14, 15, 16, 17], // 9–12h e 14–18h (almoço 12–14 bloqueado)
  SLOT_MINUTES: 60,
  MIN_NOTICE_HOURS: 2,
  HORIZON_DAYS: 30,
  NOTIFY_EMAIL: 'comercial@helpnowsolucoes.com.br',
  SENDER_NAME: 'HelpNow',
  WHATSAPP: 'https://wa.me/5521968441647',
  SITE: 'https://helpnowsolucoes.com.br',
  SHEET_NAME: 'Leads',
  CACHE_SECONDS: 60,
  // Reserva caso a agenda "Feriados no Brasil" não esteja assinada no comercial@
  HOLIDAYS_FALLBACK: [
    '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
    '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01',
    '2027-05-27', '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'
  ]
};

const COLS = ['Registrado em', 'Data reunião', 'Horário', 'Nome', 'Empresa', 'WhatsApp', 'E-mail', 'ERP',
  'Como nos encontrou', 'Origem (URL)', 'Assunto/Momento', 'Problema', 'ID do evento', 'Link do Meet',
  'Status', 'Lembrete enviado'];
const STATUS = ['Agendado', 'Realizado', 'No-show', 'Proposta enviada', 'Fechado', 'Cancelado'];
const ERP_OPTIONS = ['TOTVS RM', 'TOTVS Protheus', 'Outro ERP', 'Planilhas / ainda sem ERP'];
const CANAL_OPTIONS = ['Universo TOTVS', 'LinkedIn', 'Instagram', 'Google'];

/* =========================================================================
   Entradas HTTP
   ========================================================================= */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (!checkSecret_(p.secret)) return json_({ ok: false, code: 'UNAUTHORIZED' });
    if (p.action === 'ping') return json_({ ok: true, now: new Date().toISOString() });
    if (p.action === 'slots') return json_(Object.assign({ ok: true }, getSlots_(p.from, p.to)));
    return json_({ ok: false, code: 'BAD_ACTION' });
  } catch (err) {
    console.error('doGet', err && err.stack || err);
    return json_({ ok: false, code: 'INTERNAL' });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkSecret_(body.secret)) return json_({ ok: false, code: 'UNAUTHORIZED' });
    if (body.action === 'book') return json_(book_(body));
    return json_({ ok: false, code: 'BAD_ACTION' });
  } catch (err) {
    console.error('doPost', err && err.stack || err);
    return json_({ ok: false, code: 'INTERNAL' });
  }
}

/* =========================================================================
   Horários
   ========================================================================= */
function getSlots_(from, to) {
  const today = todayStr_();
  const first = maxStr_(today, CONFIG.START_DATE);
  const last = addDays_(today, CONFIG.HORIZON_DAYS);
  if (!isDate_(from)) from = first;
  if (!isDate_(to)) to = addDays_(from, 6);
  if (to < from) to = from;

  const cache = CacheService.getScriptCache();
  const key = 'slots:' + cacheVersion_() + ':' + from + ':' + to;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const qFrom = maxStr_(from, first);
  const qTo = to < last ? to : last;
  let busy = [];
  let holidays = {};
  if (qFrom <= qTo) {
    busy = getBusy_(qFrom, addDays_(qTo, 1));
    holidays = getHolidays_(qFrom, addDays_(qTo, 1));
  }

  const minStart = Date.now() + CONFIG.MIN_NOTICE_HOURS * 3600 * 1000;
  const days = [];
  for (let d = from; d <= to; d = addDays_(d, 1)) {
    const slots = [];
    if (d >= first && d <= last && CONFIG.WEEKDAYS.indexOf(weekday_(d)) >= 0 && !holidays[d]) {
      CONFIG.SLOT_HOURS.forEach(function (h) {
        const s = slotStart_(d, h);
        const e = new Date(s.getTime() + CONFIG.SLOT_MINUTES * 60000);
        if (s.getTime() < minStart) return;
        if (overlaps_(s, e, busy)) return;
        slots.push(pad_(h) + ':00');
      });
    }
    days.push({ date: d, slots: slots });
  }
  const out = { timezone: CONFIG.TIMEZONE, days: days };
  cache.put(key, JSON.stringify(out), CONFIG.CACHE_SECONDS);
  return out;
}

/** Valida se date+time é um horário oferecido pelas regras (sem olhar a agenda). */
function isCandidate_(date, time) {
  if (!isDate_(date) || !/^\d{2}:00$/.test(time)) return false;
  const h = parseInt(time, 10);
  const today = todayStr_();
  if (date < maxStr_(today, CONFIG.START_DATE) || date > addDays_(today, CONFIG.HORIZON_DAYS)) return false;
  if (CONFIG.WEEKDAYS.indexOf(weekday_(date)) < 0) return false;
  if (CONFIG.SLOT_HOURS.indexOf(h) < 0) return false;
  if (slotStart_(date, h).getTime() < Date.now() + CONFIG.MIN_NOTICE_HOURS * 3600 * 1000) return false;
  if (getHolidays_(date, addDays_(date, 1))[date]) return false;
  return true;
}

function getBusy_(fromDate, toDateExclusive) {
  const res = Calendar.Freebusy.query({
    timeMin: dayStart_(fromDate).toISOString(),
    timeMax: dayStart_(toDateExclusive).toISOString(),
    timeZone: CONFIG.TIMEZONE,
    items: [{ id: CONFIG.CALENDAR_ID }]
  });
  const cals = res.calendars || {};
  const key = Object.keys(cals)[0];
  const list = (key && cals[key].busy) || [];
  return list.map(function (b) { return { start: new Date(b.start), end: new Date(b.end) }; });
}

function getHolidays_(fromDate, toDateExclusive) {
  const map = {};
  CONFIG.HOLIDAYS_FALLBACK.forEach(function (d) { map[d] = true; });
  try {
    const cal = CalendarApp.getCalendarById(CONFIG.HOLIDAY_CALENDAR_ID);
    if (cal) {
      cal.getEvents(dayStart_(fromDate), dayStart_(toDateExclusive)).forEach(function (ev) {
        if (!ev.isAllDayEvent()) return;
        // Ignora pontos facultativos/observâncias quando o título indicar
        const t = (ev.getTitle() || '').toLowerCase();
        if (t.indexOf('facultativo') >= 0) return;
        map[Utilities.formatDate(ev.getAllDayStartDate(), CONFIG.TIMEZONE, 'yyyy-MM-dd')] = true;
      });
    }
  } catch (err) {
    console.warn('Agenda de feriados indisponível; usando lista de reserva.', err);
  }
  return map;
}

function overlaps_(s, e, busy) {
  for (let i = 0; i < busy.length; i++) {
    if (s < busy[i].end && e > busy[i].start) return true;
  }
  return false;
}

/* =========================================================================
   Agendar
   ========================================================================= */
function book_(b) {
  const data = sanitize_(b);
  const fields = validate_(data);
  if (Object.keys(fields).length) return { ok: false, code: 'VALIDATION', fields: fields };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, code: 'BUSY' };
  try {
    if (!isCandidate_(data.date, data.time)) return { ok: false, code: 'SLOT_TAKEN' };
    const h = parseInt(data.time, 10);
    const start = slotStart_(data.date, h);
    const end = new Date(start.getTime() + CONFIG.SLOT_MINUTES * 60000);
    const busy = getBusy_(data.date, addDays_(data.date, 1));
    if (overlaps_(start, end, busy)) return { ok: false, code: 'SLOT_TAKEN' };

    let event = Calendar.Events.insert({
      summary: 'Diagnóstico HelpNow — ' + data.empresa,
      description: eventDescription_(data),
      start: { dateTime: isoLocal_(data.date, h), timeZone: CONFIG.TIMEZONE },
      end: { dateTime: isoLocal_(data.date, h + 1), timeZone: CONFIG.TIMEZONE },
      attendees: [{ email: data.email, displayName: data.nome }],
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      guestsCanModify: false,
      guestsCanInviteOthers: false
    }, CONFIG.CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'all' });

    // O horário já está ocupado a partir daqui: invalida o cache antes de qualquer outra coisa.
    bumpCache_();
    const meetLink = event.hangoutLink || meetFromConference_(event) || '';
    const when = longDate_(data.date) + ', das ' + data.time + ' às ' + pad_(h + 1) + ':00 (horário de Brasília)';

    // O evento já existe e o cliente foi convidado. Se a planilha falhar, tenta de novo e,
    // em último caso, avisa o comercial@ por e-mail com os dados do lead (nada se perde).
    const saved = saveLead_([
      new Date(), data.date, data.time, data.nome, data.empresa, data.whatsapp, data.email, data.erp,
      data.canal, data.origem, [data.assunto, data.momento && ('momento ' + data.momento)].filter(String).join(' · '),
      data.problema, event.id, meetLink, 'Agendado', ''
    ]);
    if (!saved) safe_(function () { sendLeadFallback_(data, when, meetLink, event.htmlLink); });

    safe_(function () { sendClientConfirmation_(data, when, meetLink); });
    safe_(function () { sendInternalNotice_(data, when, meetLink, event.htmlLink); });

    return { ok: true, eventId: event.id, start: start.toISOString(), end: end.toISOString(), meetLink: meetLink };
  } finally {
    lock.releaseLock();
  }
}

/** Grava o lead na planilha com até 3 tentativas. Retorna true se gravou. */
function saveLead_(row) {
  const safeRow = row.map(cell_);
  for (let i = 1; i <= 3; i++) {
    try {
      sheet_().appendRow(safeRow);
      return true;
    } catch (err) {
      console.error('Falha ao gravar lead (tentativa ' + i + ')', err && err.stack || err);
      if (i < 3) Utilities.sleep(700 * i);
    }
  }
  return false;
}

/** E-mail de emergência: o evento existe mas a linha não entrou na planilha. */
function sendLeadFallback_(d, when, meet, eventLink) {
  const rows = [['Quando', when], ['Nome', d.nome], ['Empresa', d.empresa], ['WhatsApp', d.whatsapp], ['E-mail', d.email],
    ['ERP', d.erp], ['Como nos encontrou', d.canal], ['Origem (URL)', d.origem || '—'], ['Assunto/Momento', [d.assunto, d.momento].filter(String).join(' · ') || '—'],
    ['Problema', d.problema || '—'], ['Meet', meet || '—']];
  const table = '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows.map(function (r) {
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #DCE2EF;color:#46516E;white-space:nowrap;vertical-align:top">' + r[0] + '</td><td style="padding:6px 10px;border-bottom:1px solid #DCE2EF">' + esc_(r[1]) + '</td></tr>';
  }).join('') + '</table>';
  const html = emailLayout_('Lead NÃO gravado na planilha',
    '<p style="margin:0 0 14px">O evento foi criado na agenda e o cliente foi convidado, mas a gravação na planilha falhou após 3 tentativas. Copie os dados abaixo para a aba Leads.</p>' + table +
    (eventLink ? '<p style="margin:16px 0 0"><a href="' + eventLink + '" style="color:#2456F0">Abrir evento na agenda</a></p>' : ''));
  MailApp.sendEmail({ to: CONFIG.NOTIFY_EMAIL, subject: 'ATENÇÃO: lead sem registro na planilha — ' + d.empresa + ' — ' + when, htmlBody: html, name: 'Site HelpNow', replyTo: d.email });
}

/** Neutraliza fórmulas: texto que começa com = + - @ (ou tab/CR) ganha prefixo ' e vira texto puro. */
function cell_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
}

/** Mesma regra do clean() de api/agenda.php: sem < >, controle removido, espaços colapsados. */
function sanitize_(b) {
  const s = function (v, max, multiline) {
    let t = String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    t = multiline ? t.replace(/\r/g, '').replace(/[ \t]+/g, ' ') : t.replace(/\s+/g, ' ');
    return t.trim().slice(0, max);
  };
  return {
    date: s(b.date, 10), time: s(b.time, 5), nome: s(b.nome, 120), empresa: s(b.empresa, 120),
    whatsapp: s(b.whatsapp, 20), email: s(b.email, 160).toLowerCase(), erp: s(b.erp, 40), canal: s(b.canal, 40),
    problema: s(b.problema, 1500, true), origem: s(b.origem, 40), assunto: s(b.assunto, 40), momento: s(b.momento, 4)
  };
}

function validate_(d) {
  const f = {};
  if (!isDate_(d.date)) f.date = 'Data inválida.';
  if (!/^\d{2}:00$/.test(d.time) || CONFIG.SLOT_HOURS.indexOf(parseInt(d.time, 10)) < 0) f.time = 'Horário inválido.';
  if (d.nome.length < 3) f.nome = 'Informe seu nome completo.';
  if (d.empresa.length < 2) f.empresa = 'Informe o nome da empresa.';
  const digits = d.whatsapp.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) f.whatsapp = 'Informe o WhatsApp com DDD.';
  if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/.test(d.email)) f.email = 'Informe um e-mail válido.';
  if (ERP_OPTIONS.indexOf(d.erp) < 0) f.erp = 'Selecione uma opção.';
  if (CANAL_OPTIONS.indexOf(d.canal) < 0) f.canal = 'Selecione uma opção.';
  return f;
}

function eventDescription_(d) {
  return [
    'Diagnóstico HelpNow — 60 minutos', '',
    'Nome: ' + d.nome, 'Empresa: ' + d.empresa, 'WhatsApp: ' + d.whatsapp, 'E-mail: ' + d.email,
    'ERP: ' + d.erp, 'Como nos encontrou: ' + d.canal,
    d.origem ? 'Origem (URL): ' + d.origem : '', d.assunto ? 'Assunto: ' + d.assunto : '', d.momento ? 'Momento: ' + d.momento : '',
    '', 'Problema a investigar:', d.problema || '(não informado)', '',
    'Agendado via ' + CONFIG.SITE + '/agendamento'
  ].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\n');
}

function meetFromConference_(ev) {
  const eps = (ev.conferenceData && ev.conferenceData.entryPoints) || [];
  const v = eps.filter(function (p) { return p.entryPointType === 'video'; })[0];
  return v ? v.uri : '';
}

/* =========================================================================
   E-mails
   ========================================================================= */
function sendClientConfirmation_(d, when, meet) {
  const first = d.nome.split(/\s+/)[0];
  const html = emailLayout_('Reunião confirmada, ' + esc_(first) + '!',
    '<p style="margin:0 0 16px">Seu diagnóstico de 60 minutos com um especialista HelpNow está agendado.</p>' +
    infoBox_(when, meet) +
    '<p style="margin:20px 0 8px;font-weight:700">Para aproveitar melhor a conversa</p>' +
    '<ul style="margin:0 0 16px;padding-left:20px;color:#2B3757">' +
    '<li>Pense em um processo que hoje gera retrabalho ou atraso.</li>' +
    '<li>Se possível, tenha à mão um exemplo real (relatório, planilha ou tela do sistema).</li>' +
    '<li>Convide quem vive esse processo no dia a dia.</li></ul>' +
    '<p style="margin:0;color:#2B3757">Precisa remarcar? Responda este e-mail ou fale no <a href="' + CONFIG.WHATSAPP + '" style="color:#2456F0">WhatsApp (21) 96844-1647</a>.</p>');
  MailApp.sendEmail({ to: d.email, subject: 'Confirmado: Diagnóstico HelpNow — ' + when, htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.NOTIFY_EMAIL });
}

function sendInternalNotice_(d, when, meet, eventLink) {
  const rows = [['Quando', when], ['Nome', d.nome], ['Empresa', d.empresa], ['WhatsApp', d.whatsapp], ['E-mail', d.email],
    ['ERP', d.erp], ['Como nos encontrou', d.canal], ['Origem (URL)', d.origem || '—'], ['Assunto/Momento', [d.assunto, d.momento].filter(String).join(' · ') || '—'],
    ['Problema', d.problema || '—'], ['Meet', meet || '—']];
  const table = '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows.map(function (r) {
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #DCE2EF;color:#46516E;white-space:nowrap;vertical-align:top">' + r[0] + '</td><td style="padding:6px 10px;border-bottom:1px solid #DCE2EF">' + esc_(r[1]) + '</td></tr>';
  }).join('') + '</table>';
  const html = emailLayout_('Novo diagnóstico agendado', table + (eventLink ? '<p style="margin:16px 0 0"><a href="' + eventLink + '" style="color:#2456F0">Abrir evento na agenda</a></p>' : ''));
  MailApp.sendEmail({ to: CONFIG.NOTIFY_EMAIL, subject: 'Novo agendamento: ' + d.empresa + ' — ' + when, htmlBody: html, name: 'Site HelpNow', replyTo: d.email });
}

function infoBox_(when, meet) {
  return '<div style="background:#F2F4FA;border-radius:12px;padding:16px 18px">' +
    '<div style="font-family:monospace;font-size:12px;color:#46516E;letter-spacing:.08em">DIAGNÓSTICO HELPNOW · 60 MIN</div>' +
    '<div style="font-weight:800;font-size:17px;margin:6px 0">' + esc_(when) + '</div>' +
    (meet ? '<a href="' + meet + '" style="display:inline-block;margin-top:6px;background:#2E6BFF;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Entrar no Google Meet</a>' : '') +
    '</div>';
}

function emailLayout_(title, inner) {
  return '<div style="background:#F2F4FA;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0A1433">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">' +
    '<div style="background:#060D2B;padding:18px 24px;font-weight:800;font-size:20px;color:#fff;letter-spacing:-.5px">HELP<span style="color:#2E6BFF">NOW</span></div>' +
    '<div style="padding:24px"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.25">' + title + '</h1>' + inner + '</div>' +
    '<div style="padding:16px 24px;background:#F2F4FA;font-size:12px;color:#46516E">HelpNow — Consultoria e Gestão de Negócios · ' +
    '<a href="' + CONFIG.SITE + '" style="color:#46516E">helpnowsolucoes.com.br</a> · Juntos vamos mais longe!</div>' +
    '</div></div>';
}

/* =========================================================================
   Lembrete (gatilho a cada hora)
   ========================================================================= */
function sendReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const sh = sheet_();
    const values = sh.getDataRange().getValues();
    const idx = function (name) { return COLS.indexOf(name); };
    const now = Date.now();
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      if (row[idx('Status')] !== 'Agendado' || row[idx('Lembrete enviado')]) continue;
      const date = cellDate_(row[idx('Data reunião')]);
      const time = String(row[idx('Horário')]).slice(0, 5);
      if (!date || !/^\d{2}:\d{2}$/.test(time)) continue;
      const start = slotStart_(date, parseInt(time, 10)).getTime();
      const diffH = (start - now) / 3600000;
      if (diffH < 22 || diffH > 25) continue;

      const eventId = row[idx('ID do evento')];
      let cancelled = false;
      try {
        const ev = Calendar.Events.get(CONFIG.CALENDAR_ID, eventId);
        const guest = (ev.attendees || []).filter(function (a) { return String(a.email).toLowerCase() === String(row[idx('E-mail')]).toLowerCase(); })[0];
        cancelled = ev.status === 'cancelled' || (guest && guest.responseStatus === 'declined');
      } catch (err) { cancelled = true; }
      if (cancelled) { sh.getRange(r + 1, idx('Status') + 1).setValue('Cancelado'); continue; }

      const nome = String(row[idx('Nome')]);
      const when = longDate_(date) + ', das ' + time + ' às ' + pad_(parseInt(time, 10) + 1) + ':00 (horário de Brasília)';
      const meet = String(row[idx('Link do Meet')] || '');
      const html = emailLayout_('Amanhã: seu diagnóstico HelpNow',
        '<p style="margin:0 0 16px">Olá, ' + esc_(nome.split(/\s+/)[0]) + '! Passando para lembrar da nossa conversa.</p>' + infoBox_(when, meet) +
        '<p style="margin:16px 0 0;color:#2B3757">Imprevisto? Responda este e-mail ou fale no <a href="' + CONFIG.WHATSAPP + '" style="color:#2456F0">WhatsApp</a> para remarcar.</p>');
      MailApp.sendEmail({ to: String(row[idx('E-mail')]), subject: 'Lembrete: Diagnóstico HelpNow amanhã às ' + time, htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.NOTIFY_EMAIL });
      sh.getRange(r + 1, idx('Lembrete enviado') + 1).setValue(new Date());
    }
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
   Setup e testes (rodar manualmente no editor)
   ========================================================================= */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#060D2B').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  // Data, horário e WhatsApp como texto puro (evita conversões automáticas)
  sh.getRange('B:C').setNumberFormat('@');
  sh.getRange('F:F').setNumberFormat('@');
  sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
  sh.getRange('P:P').setNumberFormat('dd/MM/yyyy HH:mm');
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).setAllowInvalid(false).build();
  sh.getRange(2, COLS.indexOf('Status') + 1, 1000, 1).setDataValidation(statusRule);
  sh.setColumnWidths(1, COLS.length, 150);
  sh.setColumnWidth(COLS.indexOf('Problema') + 1, 320);
  const def = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SHARED_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SHARED_SECRET', secret);
  }

  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendReminders') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();

  console.log('Setup concluído. SHARED_SECRET (copie para o helpnow-config.php): ' + secret);
}

function testSlots() {
  const from = maxStr_(todayStr_(), CONFIG.START_DATE);
  console.log(JSON.stringify(getSlots_(from, addDays_(from, 6)), null, 2));
}

function testEmailPreview() {
  const d = { nome: 'Teste Silva', empresa: 'Empresa Teste', email: Session.getActiveUser().getEmail(), whatsapp: '(21) 90000-0000', erp: 'TOTVS RM', canal: 'Universo TOTVS', problema: 'Teste de layout', origem: '', assunto: '', momento: '' };
  sendClientConfirmation_(d, 'Quinta-feira, 15 de outubro, das 09:00 às 10:00 (horário de Brasília)', 'https://meet.google.com/abc-defg-hij');
  console.log('E-mail de teste enviado para ' + d.email);
}

/* =========================================================================
   Utilitários
   ========================================================================= */
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function checkSecret_(s) { const real = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET'); return !!real && s === real; }
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.SHEET_NAME) || (setup(), ss.getSheetByName(CONFIG.SHEET_NAME));
}
function cacheVersion_() { return CacheService.getScriptCache().get('slots:v') || '1'; }
function bumpCache_() { CacheService.getScriptCache().put('slots:v', String(Date.now()), 21600); }
function safe_(fn) { try { fn(); } catch (err) { console.error('Falha não crítica', err && err.stack || err); } }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function isDate_(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function maxStr_(a, b) { return a > b ? a : b; }
function todayStr_() { return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd'); }
function addDays_(s, n) { const p = s.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return d.toISOString().slice(0, 10); }
function weekday_(s) { const p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
function isoLocal_(date, h) { return date + 'T' + pad_(h) + ':00:00' + CONFIG.UTC_OFFSET; }
function slotStart_(date, h) { return new Date(isoLocal_(date, h)); }
function dayStart_(date) { return new Date(date + 'T00:00:00' + CONFIG.UTC_OFFSET); }
function cellDate_(v) { if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd'); const s = String(v).trim(); return isDate_(s) ? s : ''; }
function longDate_(s) {
  const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const p = s.split('-').map(Number);
  return dias[weekday_(s)] + ', ' + p[2] + ' de ' + meses[p[1] - 1];
}
