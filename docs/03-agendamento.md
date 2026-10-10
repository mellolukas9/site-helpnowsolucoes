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

Anti-spam: honeypot `website` e `startedAt` < 4s → o PHP responde `ok:true` sem agendar.
Rate limit (por IP, com `flock`): slots 60/10 min · book 5/hora.

Só para desenvolvimento: `?simulate=409|422|429|502` no `/api/agenda.php` devolve a resposta correspondente. Funciona apenas com Host `localhost` **e** cliente em loopback; em produção é ignorado.

Validação: `agenda.php` (`clean()`) e `Code.gs` (`sanitize_`/`validate_`) aplicam as mesmas regras. Se mudar uma, mude a outra. Textos de planilha que começam com `= + - @` ganham prefixo `'`.

### PHP ↔ Apps Script
- Slots: `GET {URL}?action=slots&from&to&secret`
- Book: `POST {URL}` com corpo JSON `{action:"book", secret, ...dados}` e `Content-Type: text/plain`.
- O Apps Script sempre responde HTTP 200; o resultado vem em `ok`/`code` (`UNAUTHORIZED`, `SLOT_TAKEN`, `VALIDATION`, `BUSY`, `INTERNAL`). O PHP traduz para o status HTTP.
- O `/exec` redireciona (302) para `script.googleusercontent.com`; o cURL segue como GET — comportamento correto.

## Parâmetros de URL do /agendamento
| Parâmetro | Efeito |
|---|---|
| `origem=universo-totvs\|linkedin\|instagram\|google` | Pré-seleciona "Como nos encontrou?" e é gravado na planilha |
| `assunto=reforma` | Pré-escreve o problema (Reforma Tributária) |
| `momento=01..04` | Pré-escreve o problema conforme o card "Seu momento" |
| `mock=1` | Modo demonstração 100% no navegador |

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
