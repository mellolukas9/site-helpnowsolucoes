# 05 — Backlog

## Antes do lançamento (até 12/10)
- [x] Backend do /agendamento publicado (Apps Script + planilha "leads"/aba Leads) e testado local contra a agenda real (11/10).
- [ ] **Republicar o `apps-script/Code.gs` atual (obrigatório na rodada 2: `hold`, `release` e `stats`)** no editor do Apps Script: Implantar → Gerenciar implantações → editar → **Nova versão** (mesma implantação, a URL `/exec` não muda). A versão no ar é a original; a atual acrescenta neutralização de fórmulas na planilha, nova tentativa + e-mail de emergência se a gravação falhar, e validação igual à do PHP. O contrato da API não mudou — o site funciona com qualquer das duas versões, mas publique a nova antes do lançamento.
- [ ] Upload: `dist/public_html.zip` extraído em `public_html/` e `helpnow-config.php` em `/home/este7243/` (fora do `public_html`). Conferir `https://helpnowsolucoes.com.br/api/agenda.php?action=health` → `"mode":"live","config":true`.
- [ ] Teste ponta a ponta em produção (1 agendamento real com e-mail de teste: evento + Meet + linha na planilha + e-mail de confirmação + aviso ao comercial@).
- [ ] DKIM no Google Workspace e DNS (SPF/DMARC) — sem isso os e-mails de confirmação podem cair em spam.
- [ ] Mensagem de saudação do WhatsApp Business com `https://helpnowsolucoes.com.br/agendamento?origem=universo-totvs`.
- [x] Gerar `public_html/assets/img/og-image.png` (1200×630, fundo navy, logo + "A gestão do seu negócio, organizada passo a passo.") — já referenciada nas metatags.
- [x] Revisão visual com `/frontend-design` e `/ui-ux-pro-max-skill` (sem mudar copy/direção).
- [x] Lighthouse mobile ≥ 90 nas 4 categorias (local: 99/100/100/100). Reconferir em produção (compressão e cache vêm do .htaccess).
- [ ] Teste ponta a ponta em produção (ver guia, etapa 06).
- [ ] Revisão jurídica da Política de Privacidade (está como rascunho).

- [ ] Rodar Lighthouse na URL real após o deploy e conferir `?action=health` → `"mode":"live"`.
- [ ] Atualizar o Apps Script publicando **nova versão na mesma implantação** (Code.gs mudou nesta rodada).
- [ ] Se o site ficar atrás de proxy/CDN: o rate limit usa `REMOTE_ADDR`; avaliar `X-Forwarded-For` confiável.

- [ ] Conferir o contador da campanha em produção: `https://helpnowsolucoes.com.br/api/agenda.php?action=stats` → `{"ok":true,"used":N,"cap":100}` (mudar `CAMPAIGN_CAP`/`CAMPAIGN_ORIGIN` no `CONFIG` do Code.gs se preciso).
- [ ] Confirmar com o cliente a copy da faixa da campanha ("Universo TOTVS: 100 diagnósticos de 1 hora para quem passou pelo nosso estande.") e se pode usar "gratuito".
- [ ] Testar a importação do `.ics` no Google Agenda/Outlook e os links do Outlook com contas reais (só validado o formato localmente).
- [ ] Teste de reserva em produção com 2 navegadores (um segura o horário, o outro não o vê) — o `CacheService` não pôde ser exercitado fora do Google.

## Fase 2
- [ ] Gravar leads também no **MySQL** da HostGator (ponto de extensão em `api/agenda.php`).
- [ ] Seção **"Quem está por trás"** (foto, nome do fundador, anos de TOTVS) — texto e foto a definir pelo cliente.
- [ ] Remarcar/cancelar pelo próprio site (link no e-mail de confirmação).
- [ ] Google Tag Manager / GA4 (o front já dispara `dataLayer.push({event:'agendamento_confirmado'})`).
- [ ] Cases e depoimentos reais quando houver.
- [ ] Abas extras na seção "Na prática" (ex.: Folha de pagamento, Fechamento contábil).
- [ ] Atualizar Instagram e próximos cartões com o logo novo.
