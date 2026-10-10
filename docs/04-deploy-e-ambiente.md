# 04 — Deploy e ambiente

O passo a passo completo, com checklist, está em **[guia-implantacao.html](guia-implantacao.html)** (abra no navegador). Resumo:

## Ordem
1. **Google Workspace** — domínio verificado, gerar DKIM, ativar compartilhamento externo (necessário para o Web App "Qualquer pessoa"), agenda do comercial@ em horário de Brasília + "Feriados no Brasil".
2. **DNS (Registro.br ou HostGator)** — A/CNAME do site para a HostGator; MX `smtp.google.com` (prio 1); SPF `v=spf1 include:_spf.google.com ~all`; DKIM `google._domainkey`; DMARC `_dmarc`; manter `google-site-verification`.
3. **HostGator** — domínio principal do Plano P; Roteamento de e-mail = **remoto**; PHP 8.2+ com cURL; SSL ativo.
4. **Apps Script** — planilha "HelpNow — Leads" no Drive do comercial@ → Extensões → Apps Script → colar `apps-script/Code.gs` e `appsscript.json` → adicionar serviço Google Calendar API → rodar `setup()` → Implantar como App da Web (Executar como: Eu · Acesso: Qualquer pessoa).
5. **Site** — enviar o conteúdo de `public_html/` (inclui `.htaccess`) para o `public_html` da HostGator; copiar `server-config/helpnow-config.sample.php` para `/home/USUARIO/helpnow-config.php` e preencher URL `/exec` + `SHARED_SECRET`.
6. **Testes** — `https://helpnowsolucoes.com.br/api/agenda.php?action=health` deve retornar `"mode":"live"`; depois um agendamento real ponta a ponta.
7. **WhatsApp Business** — mensagem de saudação com `https://helpnowsolucoes.com.br/agendamento?origem=universo-totvs`.

## Publicar uma alteração
- Front/PHP: reenviar só os arquivos alterados para `public_html/` (Gerenciador de Arquivos ou FTP). Os HTML não ficam em cache; CSS/JS ficam 7 dias → ao mudar CSS/JS, troque o sufixo de versão no `<link>`/`<script>` (ex.: `styles.css?v=2`).
- Apps Script: **Implantar → Gerenciar implantações → editar → Nova versão** (a URL continua a mesma).

## Plano B (se o site não estiver pronto)
Página de agendamento nativa do Google Agenda (Criar → Agendamento de horários) no comercial@, com o link na saudação do WhatsApp.

## Diagnóstico rápido
| Sintoma | Verificar |
|---|---|
| `health` mostra `"mode":"mock"` | `helpnow-config.php` ausente/fora do lugar ou `APPS_SCRIPT_URL` vazio |
| 502 UPSTREAM | `/home/USUARIO/helpnow-agenda.log`; URL `/exec`, acesso "Qualquer pessoa", secret igual |
| E-mail parou | MX e Roteamento de e-mail remoto |
| Sem link do Meet | Serviço avançado Calendar adicionado + nova versão publicada |
