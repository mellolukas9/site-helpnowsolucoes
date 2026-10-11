# 03 — Agendamento

## Fluxo
```
Cliente (QR Code / site)
   │
   ▼
/agendamento  (agendamento.html + assets/js/agendamento.js)
   │  GET  /api/agenda.php?action=slots&from&to
   │  POST /api/agenda.php?action=book
   ▼
api/agenda.php  (HostGator · rate limit · validação · segredo)
   │  GET/POST  APPS_SCRIPT_URL  (+ secret)
   ▼
Apps Script  (comercial@ · Code.gs)
   ├─ Calendar.Freebusy  → horários livres
   ├─ CacheService       → reserva temporária (hold) de 5 min por horário
   ├─ Calendar.Events.insert (Meet, convite ao cliente)
   ├─ Planilha "HelpNow — Leads" (aba Leads)
   └─ MailApp → confirmação ao cliente + aviso ao comercial@ + lembrete 24h (gatilho horário)
```

## Regras da agenda (`CONFIG` em `apps-script/Code.gs`)
| Regra | Valor |
|---|---|
| Fuso | America/Sao_Paulo (UTC-03:00) |
| Início | 15/10/2026 |
| Dias | segunda a sexta |
| Horários | 09, 10, 11, 14, 15, 16, 17h (reuniões de 60 min; almoço 12–14h bloqueado) |
| Intervalo entre reuniões | nenhum |
| Antecedência mínima | 2 horas |
| Horizonte | 30 dias a partir de hoje |
| Feriados | agenda "Feriados no Brasil" + lista de reserva no código |
| Bloqueio manual | qualquer evento "Ocupado" na agenda do comercial@ |

O front (`agendamento.js`) repete `START_DATE` e `HORIZON_DAYS` apenas para navegação; quem decide é o Apps Script.

## Contrato da API (front ↔ PHP)
### `GET /api/agenda.php?action=slots&from=YYYY-MM-DD&to=YYYY-MM-DD`
Intervalo máximo 31 dias. O front pede semana a semana (seg–sex).
```json
200 { "timezone": "America/Sao_Paulo",
      "days": [ { "date": "2026-10-15", "slots": ["09:00","10:00","14:00"] } ] }
```
### `POST /api/agenda.php?action=book` (JSON)
```json
{ "date":"2026-10-15", "time":"09:00", "nome":"", "empresa":"", "whatsapp":"(21) 99999-9999",
  "email":"", "erp":"TOTVS RM", "canal":"Universo TOTVS", "problema":"",
  "origem":"universo-totvs", "assunto":"reforma", "momento":"03",
  "consent":true, "website":"", "startedAt": 1760000000000 }
```
Valores aceitos:
- `erp`: TOTVS RM · TOTVS Protheus · Outro ERP · Planilhas / ainda sem ERP
- `canal`: Universo TOTVS · LinkedIn · Instagram · Google

Respostas:
| HTTP | Corpo | Front faz |
|---|---|---|
| 200 | `{ ok:true, eventId, start, end, meetLink }` | Passo 3 |
| 409 | `{ ok:false, code:"SLOT_TAKEN" }` | Volta ao passo 1, recarrega, avisa |
| 422 | `{ ok:false, code:"VALIDATION", fields:{campo:msg} }` | Marca campos |
| 429 | `{ ok:false, code:"RATE_LIMIT" }` | Pede para aguardar / WhatsApp |
| 502 | `{ ok:false, code:"UPSTREAM" }` | Erro + WhatsApp |

Campos opcionais acrescentados na rodada 2: `holdId` (string 16–64 `[A-Za-z0-9_-]`, gerada no navegador) em `book` e como parâmetro de `slots`.
O `book` bem-sucedido devolve `start`/`end` em ISO UTC e `meetLink`; o front monta Google/Outlook/Outlook.com/.ics a partir deles.

### `GET /api/agenda.php?action=stats`  (campanha Universo TOTVS)
```json
200 { "ok": true, "used": 37, "cap": 100 }        // número REAL: leads com origem=universo-totvs e status ≠ Cancelado
200 { "ok": true, "mock": true }                  // modo mock: sem números
502 { "ok": false, "code": "UPSTREAM" }
```
O front só mostra "Restam X de N" com número real; qualquer falha (ou mock/demo) mostra só o texto da campanha.
`used >= cap` → "Vagas da campanha esgotadas — agende normalmente" (não bloqueia o agendamento).

### `POST /api/agenda.php?action=hold`  (reserva temporária)
```json
{ "date": "2026-10-15", "time": "09:00", "holdId": "<gerado no navegador>" }
200 { "ok": true, "ttl": 300 }                                  // segundos; o front conta a partir do ttl devolvido
409 { "ok": false, "code": "SLOT_TAKEN" }                       // outra pessoa já segura (ou o horário foi ocupado)
422 { "ok": false, "code": "VALIDATION", "fields": { ... } }
429 { "ok": false, "code": "RATE_LIMIT" }  ·  502 { "ok": false, "code": "UPSTREAM" }
```
### `POST /api/agenda.php?action=release`
Mesmo corpo do `hold`. Idempotente: `200 { "ok": true }` mesmo sem reserva. Aceita `Content-Type: text/plain` (usado pelo `navigator.sendBeacon` ao fechar a página).

Regras da reserva (Code.gs):
- Chave `hold:<date>:<time>` = `holdId` no `CacheService`, TTL `CONFIG.HOLD_SECONDS` (300 s), sob `LockService`.
- Um `holdId` segura **um** horário: reservar outro libera o anterior (índice `holder:<holdId>`).
- `slots` não lista horários reservados por **outro** `holdId`; a reserva própria continua visível. As reservas são aplicadas **depois** do cache de 60 s dos horários (por isso não é preciso invalidar o cache a cada hold/release e a lista nunca fica defasada).
- `book` aceita se o horário não tem reserva ou se ela é do mesmo `holdId`; reserva de outro → `SLOT_TAKEN`. Após agendar, a reserva é removida.
- O `CacheService` é "melhor esforço" (o Google pode descartar entradas). Se uma reserva se perder, o `book` continua protegido por `LockService` + `Freebusy` — não há risco de agenda duplicada, só deixa de haver a reserva.
- Falha na reserva (rede/502) → o front segue **sem timer e sem texto de reserva**.

Anti-spam: honeypot `website` e `startedAt` < 4s → o PHP responde `ok:true` sem agendar.
Rate limit (por IP, com `flock`): slots 60/10 min · stats 60/10 min · hold 40/10 min · release 80/10 min · book 5/hora.

Origem: em produção valem **somente** as `ALLOWED_ORIGINS` do `helpnow-config.php`. Origens `localhost`/`127.0.0.1` só são aceitas quando o próprio servidor é local (`PHP_SAPI === 'cli-server'`, ou `SERVER_NAME` local com cliente em loopback) — o cabeçalho `Host`/`Origin` enviado pelo cliente nunca habilita isso.

Só para desenvolvimento: `?simulate=409|422|429|502` no `/api/agenda.php` devolve a resposta correspondente. Funciona apenas em servidor local (`is_local_server()`) **e** cliente em loopback; em produção é ignorado.

Validação: `agenda.php` (`clean()`) e `Code.gs` (`sanitize_`/`validate_`) aplicam as mesmas regras. Se mudar uma, mude a outra. Textos de planilha que começam com `= + - @` ganham prefixo `'`.

### PHP ↔ Apps Script
- Slots: `GET {URL}?action=slots&from&to&secret[&holdId]`
- Stats: `GET {URL}?action=stats&secret`
- Hold/Release: `POST {URL}` com `{action:"hold"|"release", secret, date, time, holdId}` (mesmo formato do book)
- Book: `POST {URL}` com corpo JSON `{action:"book", secret, ...dados}` e `Content-Type: text/plain`.
- O Apps Script sempre responde HTTP 200; o resultado vem em `ok`/`code` (`UNAUTHORIZED`, `SLOT_TAKEN`, `VALIDATION`, `BUSY`, `INTERNAL`). O PHP traduz para o status HTTP.
- O `/exec` redireciona (302) para `script.googleusercontent.com`; o cURL segue como GET — comportamento correto.

## Parâmetros de URL do /agendamento
| Parâmetro | Efeito |
|---|---|
| `origem=universo-totvs\|linkedin\|instagram\|google` | Pré-seleciona "Como nos encontrou?" e é gravado na planilha |
| `assunto=reforma` | Pré-escreve o problema ("Quero avaliar se minha equipe está preparada para a Reforma Tributária (CBS/IBS).") |
| `momento=01..04` | Pré-escreve o problema conforme o card "Seu momento" |
| `mock=1` | Modo demonstração 100% no navegador (reserva entre abas via localStorage) |
| `holdttl=15` | Reserva de 15 s para testar a expiração (**só localhost** e `mock=1`) |
| `simular=409\|422\|429\|502\|hold502\|holdrede` | Força a resposta do mock (teste) |

## Campanha Universo TOTVS (`CONFIG` do Code.gs)
`CAMPAIGN_ORIGIN: 'universo-totvs'` e `CAMPAIGN_CAP: 100` definem o contador; `HOLD_SECONDS: 300` a reserva; `STATS_CACHE_SECONDS: 60` o cache do `stats` (invalidado a cada agendamento).
Faixa no hero da home e do `/agendamento` (`assets/js/campaign.js`). Copy: "Universo TOTVS: 100 diagnósticos de 1 hora para quem passou pelo nosso estande." — ajustável no HTML; **não prometer "gratuito" sem confirmação do cliente**.

## "Adicionar à minha agenda" (passo 3)
Gerado no navegador a partir do `start`/`end` ISO (UTC) da API: Google Agenda, Outlook/Microsoft 365 (`outlook.office.com`), Outlook.com (`outlook.live.com`) e `.ics` (`diagnostico-helpnow.ics`; UID, DTSTAMP, DTSTART/DTEND em UTC, SUMMARY "Diagnóstico HelpNow", DESCRIPTION/URL/LOCATION com o link do Meet). Sem `meetLink`, os botões aparecem sem o link.

## Planilha "HelpNow — Leads" (aba Leads)
`Registrado em | Data reunião | Horário | Nome | Empresa | WhatsApp | E-mail | ERP | Como nos encontrou | Origem (URL) | Assunto/Momento | Problema | ID do evento | Link do Meet | Status | Lembrete enviado`

Status: Agendado · Realizado · No-show · Proposta enviada · Fechado · Cancelado (lista suspensa).
O lembrete muda o status para "Cancelado" se o evento foi apagado ou o convidado recusou.

## E-mails (MailApp, remetente comercial@)
- **Confirmação ao cliente** (HTML com a marca, botão do Meet, dicas de preparo). O Google também envia o convite da agenda.
- **Aviso interno** para comercial@ com todos os dados e link do evento.
- **Lembrete** ~24h antes (gatilho a cada hora; janela de 22–25h).
Cota do Starter: ~1.500 destinatários/dia — muito acima da necessidade.

## Funções do Apps Script para rodar à mão
- `setup()` — cria cabeçalhos, formatos, validação, `SHARED_SECRET` e o gatilho de lembrete. Pode rodar de novo sem duplicar.
- `testSlots()` — mostra os horários dos próximos 7 dias no log.
- `testEmailPreview()` — envia uma confirmação de teste para quem está logado.
- `sendReminders()` — força a rotina de lembrete.
