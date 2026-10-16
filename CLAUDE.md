# CLAUDE.md — Site HelpNow

Leia este arquivo inteiro antes de qualquer alteração. Detalhes em `docs/`.

## O projeto
Site institucional + agendamento da **HelpNow — Consultoria e Gestão de Negócios** (`helpnowsolucoes.com.br`).
A HelpNow faz gestão, eficiência e processos para empresas com **TOTVS RM** e **TOTVS Protheus** (Backoffice, Imobiliário, Educacional, RH) e também atende quem ainda gerencia o negócio em planilha.

**Objetivo do site:** converter visitantes em **reuniões de diagnóstico de 30 minutos**.
A peça mais importante é o **/agendamento**: consulta a agenda real do `comercial@helpnowsolucoes.com.br`, cria o evento com Google Meet e grava o lead numa planilha.
Origem principal de tráfego no lançamento: QR Code do cartão (evento Universo TOTVS, 13/10/2026) → WhatsApp Business → `https://helpnowsolucoes.com.br/agendamento?origem=universo-totvs`.

## Stack e decisões (não mudar sem discutir)
- **HTML + CSS + JavaScript puros, sem build.** Hospedagem é HostGator **Plano P** (Apache + PHP 8.x, sem Node). O que está em `public_html/` é exatamente o que vai para o servidor.
- **Agendamento:** navegador → `public_html/api/agenda.php` (proxy PHP) → **Google Apps Script** (Web App do comercial@) → Google Agenda + Meet + Planilha + Gmail.
- **Leads:** Google Sheets "HelpNow — Leads" no Drive do comercial@. MySQL da HostGator é **fase 2** (ponto de extensão marcado em `agenda.php`).
- Workspace **Business Starter**. Fuso **America/Sao_Paulo** (UTC-3 fixo, sem horário de verão).
- Sem frameworks CSS/JS, sem jQuery, sem bibliotecas de terceiros no front. Fontes via Google Fonts (Sora, Manrope, JetBrains Mono).

## Estrutura
```
public_html/                 → conteúdo do public_html da HostGator
  index.html                 Home
  agendamento.html           /agendamento (URL limpa via .htaccess)
  politica-de-privacidade.html, 404.html
  assets/css/styles.css      Todos os estilos (tokens no :root)
  assets/js/main.js          Interações da home (menu, tabs "Na prática" e "Seu momento")
  assets/js/agendamento.js   Fluxo de 3 passos + cliente da API + modo ?mock=1
  assets/img/                logo-dark.svg, logo-light.svg (og-image.png pendente)
  api/agenda.php             Proxy PHP (rate limit, validação, chamada ao Apps Script; MOCK sem config)
  .htaccess                  HTTPS, sem www, URLs limpas, cache, headers
apps-script/                 Code.gs + appsscript.json (colar no editor do Apps Script)
server-config/               helpnow-config.sample.php → vai para /home/USUARIO/helpnow-config.php
tools/dev-router.php         Servidor local que imita o .htaccess
docs/                        Base de conhecimento (comece por docs/README.md)
```

## Rodar localmente
```bash
php -S localhost:8000 -t public_html tools/dev-router.php
# http://localhost:8000            home
# http://localhost:8000/agendamento   (sem helpnow-config.php → API em modo MOCK)
# http://localhost:8000/agendamento?mock=1   mock 100% no navegador (sem PHP)
```

## Regras de trabalho
- **Textos aprovados pelo cliente:** não reescrever copy sem pedido explícito. Ajustes de layout/código são livres.
- **Design aprovado:** seguir `docs/02-design-system.md` (cores, fontes, faixas inclinadas do logo, ritmo claro/escuro). Use as skills `/frontend-design` e `/ui-ux-pro-max-skill` para refinar execução, nunca para trocar a direção.
- **Logo:** use os SVGs/inline existentes. O "recorte" da seta é um traço na cor do fundo — se mudar o fundo, mude o `stroke` do recorte.
- **Regras da agenda vivem no Apps Script** (`CONFIG` em `apps-script/Code.gs`). O front só reflete. Se mudar horários/dias, mude lá e em `docs/03-agendamento.md`.
- **Contrato da API** (`docs/03-agendamento.md`) é a fronteira entre front, PHP e Apps Script — mantenha os três sincronizados.
- **Segredos:** nunca commitar `helpnow-config.php`, URL do Web App ou `SHARED_SECRET`.
- Acessibilidade AA, mobile-first (testar em 360/390/768/1024/1440), touch targets ≥ 44px, `prefers-reduced-motion`, sem emoji como ícone.
- pt-BR em toda a interface e nos comentários.
- Apps Script: ao atualizar, publicar **nova versão na mesma implantação** (Gerenciar implantações → editar → Nova versão) para não mudar a URL.

## Status (10/10/2026)
- [x] Home e /agendamento implementados (HTML/CSS/JS), testados em modo mock (desktop e 390px).
- [x] Proxy PHP com validação, rate limit (flock) e mock; `?simulate=409|422|429|502` só em localhost.
- [x] Apps Script completo (slots, book com Meet, planilha, e-mails, lembrete 24h, setup); fórmulas neutralizadas e fallback por e-mail se a planilha falhar.
- [x] Revisão de segurança/robustez (PHP e Apps Script com as mesmas regras de validação) — contrato da API inalterado.
- [x] Fluxo testado com PHP 8.3 real: sucesso, 409, 422, 429, 502, erro de rede, honeypot, concorrência do rate limit.
- [x] `og-image.png` (1200×630) gerada.
- [x] Fontes hospedadas em `assets/fonts` (woff2 latin); Lighthouse mobile local 99/100/100/100 (home, agendamento, política).
- [x] Acessibilidade: contraste AA, ordem de headings, skip link em todas as páginas, alvos ≥ 44px.
- [x] Revisão mobile (10/10): faixas cobrem a seção, carrossel em "Na prática", "Seu momento" 2×2, menu com X/scroll lock/foco, WhatsApp some sobre CTA/rodapé, home em 390px de ~9.900px para ~6.300px. CSS/JS/HTML com `?v=3`.
- [x] Backend publicado (11/10): Apps Script no ar (Web App do comercial@, `setup()` rodado, gatilho do lembrete criado) e `helpnow-config.php` pronto. Testado local contra a agenda REAL: `health` = live, horários de 15/10 em diante (seg–sex, 9–12h/14–18h), feriado de 02/11 bloqueado, origem `universo-totvs` no payload.
- [x] Rodada 2 (11/10): reserva temporária de 5 min (`hold`/`release`), contador real da campanha (`stats`), cronômetro SVG, "Adicionar à minha agenda" (Google/Outlook/Outlook.com/.ics), botões de WhatsApp "Fale conosco", correções mobile (header opaco, âncoras, WhatsApp flutuante). `?v=5`.
- [x] Rodada 4 (11/10): arco do cronômetro vira barra de carregamento (enche 0→100 %; laranja nos últimos 30 s); CTA da home com o relógio INTEIRO em 2 colunas (mobile: acima do título); /agendamento cabe na tela em desktop (sem WhatsApp, logo 44/24); animação de entrada sem opacidade (Lighthouse desktop 100); `?v=7`.
- [x] Rodada 3 (11/10): relógio gigante no CTA da home; cronômetro do /agendamento vira timer real da reserva (**3 min**, aviso aos 30 s); campanha sem "estande" (opção A); card 02 com urgência; "Fale conosco" em #25D366/navy; `?v=6`.
- [x] Rodada 7 (11/10, só no GitHub Pages para aprovação do cliente): texto novo da campanha e contador desligado (`CAMPAIGN_COUNTER = false`), agenda até 20/12/2026 (`CONFIG.END_DATE`), 1 agendamento por e-mail/WhatsApp (`DUPLICATE` → 409), hero mais curto, link pós-agendamento. `?v=10`. Testes do Code.gs: `node --test tests/code-gs.test.js`. **Code.gs mudou: republicar junto com o upload na HostGator, só após a aprovação.**
- [ ] **Republicar o `Code.gs`** no Apps Script — OBRIGATÓRIO agora (`HOLD_SECONDS` virou 180): `hold`, `release` e `stats` só existem na versão nova (sem isso o site segue funcionando, mas sem reserva e sem contador). Ver `docs/05-backlog.md`.
- [ ] Upload (`dist/public_html.zip` + `helpnow-config.php` em `/home/este7243/`), teste ponta a ponta em produção, DKIM e mensagem de saudação do WhatsApp (ver `docs/05-backlog.md`).
- [ ] Pendências em `docs/05-backlog.md`.

## Testes locais com PHP
PHP 8.3 precisa de `mbstring` e `curl` habilitados no php.ini. Para falar com o Google (agenda real) no Windows é preciso também `curl.cainfo` apontando para um `cacert.pem` (senão: `UPSTREAM` por "unable to get local issuer certificate"); na HostGator isso já vem configurado. `localhost` já é aceito pelo `check_origin` — não é preciso mexer em `ALLOWED_ORIGINS`. Simulação de erros (só localhost, ignorada em produção):
`POST /api/agenda.php?action=book&simulate=409` (ou 422, 429, 502).
