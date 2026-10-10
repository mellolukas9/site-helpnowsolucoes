# 05 — Backlog

## Antes do lançamento (até 12/10)
- [x] Gerar `public_html/assets/img/og-image.png` (1200×630, fundo navy, logo + "A gestão do seu negócio, organizada passo a passo.") — já referenciada nas metatags.
- [x] Revisão visual com `/frontend-design` e `/ui-ux-pro-max-skill` (sem mudar copy/direção).
- [x] Lighthouse mobile ≥ 90 nas 4 categorias (local: 99/100/100/100). Reconferir em produção (compressão e cache vêm do .htaccess).
- [ ] Teste ponta a ponta em produção (ver guia, etapa 06).
- [ ] Revisão jurídica da Política de Privacidade (está como rascunho).

- [ ] Rodar Lighthouse na URL real após o deploy e conferir `?action=health` → `"mode":"live"`.
- [ ] Atualizar o Apps Script publicando **nova versão na mesma implantação** (Code.gs mudou nesta rodada).
- [ ] Se o site ficar atrás de proxy/CDN: o rate limit usa `REMOTE_ADDR`; avaliar `X-Forwarded-For` confiável.

## Fase 2
- [ ] Gravar leads também no **MySQL** da HostGator (ponto de extensão em `api/agenda.php`).
- [ ] Seção **"Quem está por trás"** (foto, nome do fundador, anos de TOTVS) — texto e foto a definir pelo cliente.
- [ ] Remarcar/cancelar pelo próprio site (link no e-mail de confirmação).
- [ ] Google Tag Manager / GA4 (o front já dispara `dataLayer.push({event:'agendamento_confirmado'})`).
- [ ] Cases e depoimentos reais quando houver.
- [ ] Abas extras na seção "Na prática" (ex.: Folha de pagamento, Fechamento contábil).
- [ ] Atualizar Instagram e próximos cartões com o logo novo.
