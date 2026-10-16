// Testes do apps-script/Code.gs sem Google: o script roda num vm com os serviços simulados.
// Uso: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const BRT = 3 * 3600 * 1000; // UTC-3 fixo

/** Cria um ambiente novo. `now` = ISO com offset (ex.: '2026-10-11T10:00:00-03:00'). */
function env(now, rows) {
  let NOW = new Date(now).getTime();
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  const log = { inserts: [], appended: [], mails: [], cacheRemoved: [] };
  const store = new Map();
  const cache = {
    get: (k) => (store.has(k) ? store.get(k) : null),
    put: (k, v) => { store.set(k, v); },
    remove: (k) => { log.cacheRemoved.push(k); store.delete(k); },
    getAll: (ks) => { const o = {}; ks.forEach((k) => { if (store.has(k)) o[k] = store.get(k); }); return o; }
  };
  const sheetRows = [['header']].concat(rows || []);
  const sheet = {
    getLastRow: () => sheetRows.length,
    getRange: (r, c, nr, nc) => ({ getValues: () => sheetRows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)) }),
    appendRow: (row) => { log.appended.push(row); sheetRows.push(row); }
  };
  const ctx = {
    console, Date: FakeDate, JSON, Math, Object, Array, String, Number, RegExp, Set, Map, Promise, Error,
    Utilities: {
      formatDate: (d, tz, fmt) => {
        assert.equal(fmt, 'yyyy-MM-dd');
        return new Date(d.getTime() - BRT).toISOString().slice(0, 10);
      },
      getUuid: () => 'uuid-' + Math.random().toString(16).slice(2),
      sleep: () => {}
    },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'secret' }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    CalendarApp: { getCalendarById: () => null }, // sem agenda de feriados → vale HOLIDAYS_FALLBACK
    Calendar: {
      Freebusy: { query: () => ({ calendars: { primary: { busy: [] } } }) },
      Events: { insert: (ev) => { log.inserts.push(ev); return { id: 'ev1', hangoutLink: 'https://meet.google.com/x', htmlLink: 'https://cal/x' }; } }
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
    MailApp: { sendEmail: (m) => { log.mails.push(m); } },
    Session: { getActiveUser: () => ({ getEmail: () => 'x@x' }) }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { run, log, store, setNow: (iso) => { NOW = new Date(iso).getTime(); } };
}

const ROW = (over) => {
  const r = new Array(16).fill('');
  r[5] = over.whatsapp || ''; r[6] = over.email || ''; r[14] = over.status === undefined ? 'Agendado' : over.status;
  return r;
};
const BOOK = (over) => Object.assign({
  action: 'book', date: '2026-10-20', time: '10:00', nome: 'Maria Silva', empresa: 'Acme', whatsapp: '(21) 96844-1647',
  email: 'maria@acme.com.br', erp: 'TOTVS RM', canal: 'Universo TOTVS', problema: '', origem: 'universo-totvs',
  holdId: 'abcdefghijklmnop1234'
}, over || {});

/* ------------------------------ Agenda até 20/12 ------------------------------ */
test('END_DATE fixo em 2026-12-20 e sem HORIZON_DAYS', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  assert.equal(e.run('CONFIG.END_DATE'), '2026-12-20');
  assert.equal(e.run('typeof CONFIG.HORIZON_DAYS'), 'undefined');
});

test('isCandidate_: aceita até 18/12 (sexta), recusa 21/12 e depois', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  assert.equal(e.run("isCandidate_('2026-12-18','17:00')"), true);
  assert.equal(e.run("isCandidate_('2026-12-21','09:00')"), false);
  assert.equal(e.run("isCandidate_('2027-01-04','09:00')"), false);
});

test('END_DATE é inclusivo: se cair num dia útil, esse dia tem horários', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  e.run("CONFIG.END_DATE = '2026-12-18'");
  assert.equal(e.run("isCandidate_('2026-12-18','09:00')"), true);
  assert.equal(e.run("isCandidate_('2026-12-19','09:00')"), false); // sábado
  e.run("CONFIG.END_DATE = '2026-12-17'");
  assert.equal(e.run("isCandidate_('2026-12-18','09:00')"), false);
});

test('getSlots_: semana de 20/12 tem seg–sex, fim de semana vazio; depois de 20/12 tudo vazio', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const w = JSON.parse(JSON.stringify(e.run("getSlots_('2026-12-14','2026-12-20')")));
  assert.deepEqual(w.days.map((d) => d.slots.length), [14, 14, 14, 14, 14, 0, 0]);
  const after = JSON.parse(JSON.stringify(e.run("getSlots_('2026-12-21','2026-12-27')")));
  assert.ok(after.days.every((d) => d.slots.length === 0));
});

test('getSlots_: abre em max(hoje, START_DATE) e respeita antecedência mínima', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const r = JSON.parse(JSON.stringify(e.run("getSlots_('2026-10-12','2026-10-16')")));
  assert.deepEqual(r.days.map((d) => d.slots.length), [0, 0, 0, 14, 14]); // 12–14 antes do START_DATE (15/10)
  const e2 = env('2026-11-30T08:30:00-03:00'); // hoje > START_DATE; 09:00 já está dentro das 2h de antecedência
  const t = JSON.parse(JSON.stringify(e2.run("getSlots_('2026-11-30','2026-11-30')")));
  // 08:30 + 2h de antecedência = 10:30: o horário das 10:30 ainda entra
  assert.deepEqual(t.days[0].slots, ['10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']);
});

/* ------------------------------ Feriados ------------------------------ */
test('Feriados: 02/11 (Finados) e 20/11 (Consciência Negra) bloqueados; 15/11 é domingo', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const fb = JSON.parse(JSON.stringify(e.run('CONFIG.HOLIDAYS_FALLBACK')));
  ['2026-11-02', '2026-11-20', '2026-11-15', '2026-12-25'].forEach((d) => assert.ok(fb.includes(d), d));
  assert.equal(e.run("weekday_('2026-11-15')"), 0); // domingo
  assert.equal(e.run("weekday_('2026-11-02')"), 1);
  assert.equal(e.run("weekday_('2026-11-20')"), 5);
  assert.equal(e.run("isCandidate_('2026-11-02','09:00')"), false);
  assert.equal(e.run("isCandidate_('2026-11-20','09:00')"), false);
  assert.equal(e.run("isCandidate_('2026-11-03','09:00')"), true);
  const w = JSON.parse(JSON.stringify(e.run("getSlots_('2026-11-02','2026-11-06')")));
  assert.equal(w.days[0].slots.length, 0);
  assert.equal(w.days[1].slots.length, 14);
});

test('Feriados: agenda "Feriados no Brasil" também bloqueia (e ignora "facultativo")', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  e.run(`CalendarApp.getCalendarById = () => ({ getEvents: () => [
    { isAllDayEvent: () => true, getTitle: () => 'Dia X', getAllDayStartDate: () => new Date('2026-11-10T03:00:00Z') },
    { isAllDayEvent: () => true, getTitle: () => 'Ponto facultativo', getAllDayStartDate: () => new Date('2026-11-11T03:00:00Z') }
  ] })`);
  assert.equal(e.run("isCandidate_('2026-11-10','09:00')"), false);
  assert.equal(e.run("isCandidate_('2026-11-11','09:00')"), true);
});

test('Regras mantidas: almoço 12–14h fora e sem fim de semana', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  assert.equal(e.run('CONFIG.SLOT_MINUTES'), 30);
  assert.equal(e.run("isCandidate_('2026-10-20','12:30')"), false);
  assert.equal(e.run("isCandidate_('2026-10-20','13:30')"), false);
  assert.equal(e.run("isCandidate_('2026-10-20','12:00')"), false);
  assert.equal(e.run("isCandidate_('2026-10-20','13:00')"), false);
  assert.equal(e.run("isCandidate_('2026-10-24','10:00')"), false); // sábado
});

/* ------------------------------ Duplicidade ------------------------------ */
test('phoneKey_: com/sem 55, máscara, +, prefixo \' e 9º dígito', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const k = (v) => e.run(`phoneKey_(${JSON.stringify(v)})`);
  const base = k('(21) 96844-1647');
  assert.equal(base, '2168441647');
  ['21968441647', '+55 21 96844-1647', '5521968441647', "'(21) 96844-1647", '(21) 6844-1647', '55 (21) 6844-1647'].forEach((v) => assert.equal(k(v), base, v));
  assert.equal(k('(21) 96844-1648'), '2168441648');
  assert.equal(k('(11) 96844-1647'), '1168441647'); // DDD diferente → chave diferente
  assert.equal(k('1234'), '');
  assert.equal(k(''), '');
  assert.equal(k(null), '');
});

test('isDuplicateLead_: e-mail igual com maiúsculas/espaços/prefixo \'', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const rows = [ROW({ email: 'Maria@Acme.com.br', whatsapp: '(21) 90000-1111' })];
  const f = (email, zap) => e.run(`isDuplicateLead_(${JSON.stringify(rows)}, ${JSON.stringify(email)}, ${JSON.stringify(zap)})`);
  assert.equal(f('maria@acme.com.br', '(31) 98888-7777'), true);
  assert.equal(f('  MARIA@ACME.COM.BR ', '(31) 98888-7777'), true);
  assert.equal(f('outra@acme.com.br', '(31) 98888-7777'), false);
  const rows2 = [ROW({ email: "'x@y.com", whatsapp: '' })];
  assert.equal(e.run(`isDuplicateLead_(${JSON.stringify(rows2)}, 'x@y.com', '(31) 98888-7777')`), true);
});

test('isDuplicateLead_: WhatsApp com/sem 55, máscara e prefixo \' na planilha', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const f = (stored, typed) => e.run(`isDuplicateLead_(${JSON.stringify([ROW({ whatsapp: stored, email: 'a@b.com' })])}, 'novo@x.com', ${JSON.stringify(typed)})`);
  assert.equal(f('(21) 96844-1647', '21968441647'), true);
  assert.equal(f('5521968441647', '(21) 96844-1647'), true);
  assert.equal(f('+55 21 96844-1647', '(21) 96844-1647'), true);
  assert.equal(f("'+55 21 96844-1647", '(21) 96844-1647'), true); // prefixo ' da proteção de fórmula
  assert.equal(f('(21) 96844-1647', '(21) 96844-1648'), false);
  assert.equal(f('(21) 96844-1647', '(11) 96844-1647'), false);
});

test('isDuplicateLead_: linha "Cancelado" não bloqueia; outros status bloqueiam', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const f = (status) => e.run(`isDuplicateLead_(${JSON.stringify([ROW({ whatsapp: '(21) 96844-1647', email: 'a@b.com', status })])}, 'a@b.com', '(21) 96844-1647')`);
  assert.equal(f('Cancelado'), false);
  assert.equal(f(' Cancelado '), false);
  ['Agendado', 'Realizado', 'No-show', 'Proposta enviada', 'Fechado', ''].forEach((s) => assert.equal(f(s), true, s));
});

test('book_: duplicado por e-mail → DUPLICATE, sem evento, sem linha, sem e-mail, hold liberado', () => {
  const e = env('2026-10-11T10:00:00-03:00', [ROW({ email: 'MARIA@acme.com.br', whatsapp: '(11) 90000-0000' })]);
  const b = BOOK();
  e.store.set('hold:2026-10-20:10:00', b.holdId);
  e.store.set('holder:' + b.holdId, 'hold:2026-10-20:10:00');
  const res = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(b)})`)));
  assert.deepEqual(res, { ok: false, code: 'DUPLICATE' });
  assert.equal(e.log.inserts.length, 0);
  assert.equal(e.log.appended.length, 0);
  assert.equal(e.log.mails.length, 0);
  assert.equal(e.store.has('hold:2026-10-20:10:00'), false);
  assert.equal(e.store.has('holder:' + b.holdId), false);
});

test('book_: duplicado por WhatsApp (com 55 na planilha, máscara na entrada)', () => {
  const e = env('2026-10-11T10:00:00-03:00', [ROW({ email: 'outra@pessoa.com', whatsapp: "'+55 21 96844-1647" })]);
  const res = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK())})`)));
  assert.equal(res.code, 'DUPLICATE');
  assert.equal(e.log.inserts.length, 0);
});

test('book_: resposta DUPLICATE não vaza dados (só ok/code)', () => {
  const e = env('2026-10-11T10:00:00-03:00', [ROW({ email: 'maria@acme.com.br', whatsapp: '(21) 96844-1647' })]);
  const res = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK())})`)));
  assert.deepEqual(Object.keys(res).sort(), ['code', 'ok']);
});

test('book_: lead "Cancelado" não bloqueia — agenda normalmente', () => {
  const e = env('2026-10-11T10:00:00-03:00', [ROW({ email: 'maria@acme.com.br', whatsapp: '(21) 96844-1647', status: 'Cancelado' })]);
  const res = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK())})`)));
  assert.equal(res.ok, true);
  assert.equal(e.log.inserts.length, 1);
  assert.equal(e.log.appended.length, 1);
  assert.ok(e.log.mails.length >= 1);
});

test('book_: sem lead anterior agenda; segunda tentativa com os mesmos dados vira DUPLICATE', () => {
  const e = env('2026-10-11T10:00:00-03:00', []);
  assert.equal(JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK())})`))).ok, true);
  const again = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK({ time: '11:00', email: 'novo@acme.com.br' }))})`)));
  assert.equal(again.code, 'DUPLICATE'); // mesmo WhatsApp
  assert.equal(e.log.inserts.length, 1);
});

test('book_: data depois de 20/12 → SLOT_TAKEN (sem evento)', () => {
  const e = env('2026-10-11T10:00:00-03:00', []);
  const res = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK({ date: '2026-12-21' }))})`)));
  assert.equal(res.code, 'SLOT_TAKEN');
  assert.equal(e.log.inserts.length, 0);
});

/* ------------------------------ Diagnóstico de 30 minutos ------------------------------ */
test('slotTimes_: 14 horários a cada 30 min; último início 11:30 e 17:30', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const t = JSON.parse(JSON.stringify(e.run('slotTimes_()')));
  assert.deepEqual(t, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']);
});

test('isCandidate_: aceita :30 dentro das janelas; recusa 12:00, 12:30, 17:45, 18:00 e formatos fora do passo', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  ['09:30', '11:30', '14:30', '17:30'].forEach((t) => assert.equal(e.run(`isCandidate_('2026-10-20','${t}')`), true, t));
  ['08:30', '12:00', '12:30', '17:45', '18:00', '09:15', '9:30', '09:30:00', ''].forEach((t) => assert.equal(e.run(`isCandidate_('2026-10-20','${t}')`), false, t));
});

test('getSlots_: ocupação de 30 min tira só aquele horário', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  // ocupado 10:00–10:30 (BRT = 13:00–13:30Z): some só o horário das 10:00
  e.run("Calendar.Freebusy.query = () => ({ calendars: { primary: { busy: [{ start: '2026-10-20T13:00:00Z', end: '2026-10-20T13:30:00Z' }] } } })");
  const r = JSON.parse(JSON.stringify(e.run("getSlots_('2026-10-20','2026-10-20')")));
  assert.equal(r.days[0].slots.length, 13);
  assert.ok(!r.days[0].slots.includes('10:00'));
  assert.ok(r.days[0].slots.includes('09:30') && r.days[0].slots.includes('10:30'));
});

test('hold_/release_: reserva de :30 funciona e é independente do horário cheio', () => {
  const e = env('2026-10-11T10:00:00-03:00');
  const a = 'aaaaaaaaaaaaaaaa1111', b = 'bbbbbbbbbbbbbbbb2222';
  const hold = (id, time) => JSON.parse(JSON.stringify(e.run(`hold_({ date: '2026-10-20', time: '${time}', holdId: '${id}' })`)));
  assert.equal(hold(a, '10:30').ok, true);
  assert.equal(hold(b, '10:30').code, 'SLOT_TAKEN');
  assert.equal(hold(b, '10:00').ok, true); // 10:00 e 10:30 não se sobrepõem
  assert.equal(hold(a, '12:30').code, 'VALIDATION'); // fora da janela
  assert.equal(hold(a, '10:15').code, 'VALIDATION');
  const slots = JSON.parse(JSON.stringify(e.run(`getSlots_('2026-10-20','2026-10-20','${b}')`)));
  assert.ok(!slots.days[0].slots.includes('10:30') && slots.days[0].slots.includes('10:00'));
  e.run(`release_({ date: '2026-10-20', time: '10:30', holdId: '${a}' })`);
  assert.equal(hold(b, '10:30').ok, true);
});

test('book_: horário :30 cria evento de 30 min, rótulo e e-mails com 30 minutos', () => {
  const e = env('2026-10-11T10:00:00-03:00', []);
  const res = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK({ time: '10:30' }))})`)));
  assert.equal(res.ok, true);
  const ev = e.log.inserts[0];
  assert.equal(ev.start.dateTime, '2026-10-20T10:30:00-03:00');
  assert.equal(ev.end.dateTime, '2026-10-20T11:00:00-03:00');
  assert.ok(ev.description.includes('30 minutos') && !ev.description.includes('60'));
  assert.equal(new Date(res.end).getTime() - new Date(res.start).getTime(), 30 * 60000);
  assert.equal(e.log.appended[0][2], '10:30');
  const mails = e.log.mails.map((m) => m.subject + m.htmlBody).join('\n');
  assert.ok(mails.includes('das 10:30 às 11:00'));
  assert.ok(mails.includes('30 minutos') && mails.includes('30 MIN'));
  assert.ok(!/60 min|uma hora|1 hora/i.test(mails));
});

test('book_: 17:30 termina às 18:00; 12:00 e 18:00 são recusados', () => {
  const e = env('2026-10-11T10:00:00-03:00', []);
  const ok = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK({ time: '17:30' }))})`)));
  assert.equal(ok.ok, true);
  assert.equal(e.log.inserts[0].end.dateTime, '2026-10-20T18:00:00-03:00');
  ['12:00', '18:00'].forEach((time, i) => {
    const r = JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK({ time, email: 'x' + i + '@acme.com.br', whatsapp: '(21) 9000' + i + '-0000' }))})`)));
    assert.equal(r.code, 'VALIDATION', time);
  });
  assert.equal(e.log.inserts.length, 1);
});

test('book_: ocupação só na meia hora seguinte não bloqueia o horário anterior', () => {
  const busy = "Calendar.Freebusy.query = () => ({ calendars: { primary: { busy: [{ start: '2026-10-20T13:30:00Z', end: '2026-10-20T14:00:00Z' }] } } })";
  const e = env('2026-10-11T10:00:00-03:00', []);
  e.run(busy);
  assert.equal(JSON.parse(JSON.stringify(e.run(`book_(${JSON.stringify(BOOK({ time: '10:00' }))})`))).ok, true);
  const e2 = env('2026-10-11T10:00:00-03:00', []);
  e2.run(busy);
  assert.equal(JSON.parse(JSON.stringify(e2.run(`book_(${JSON.stringify(BOOK({ time: '10:30' }))})`))).code, 'SLOT_TAKEN');
});

test('sendReminders: reserva :30 recebe lembrete ~24h antes com intervalo de 30 min', () => {
  const row = new Array(16).fill('');
  row[1] = '2026-10-21'; row[2] = '10:30'; row[3] = 'Maria Silva'; row[6] = 'maria@acme.com.br';
  row[12] = 'ev1'; row[13] = 'https://meet.google.com/x'; row[14] = 'Agendado';
  const e = env('2026-10-20T10:30:00-03:00', [row]);
  e.run("Calendar.Events.get = () => ({ status: 'confirmed', attendees: [] })");
  e.run('sheet_ = function () { return { getDataRange: () => ({ getValues: () => [["h"]].concat(' + JSON.stringify([row]) + ') }), getRange: () => ({ setValue() {} }) }; }');
  e.run('sendReminders()');
  assert.equal(e.log.mails.length, 1);
  assert.ok(e.log.mails[0].htmlBody.includes('das 10:30 às 11:00'));
});
