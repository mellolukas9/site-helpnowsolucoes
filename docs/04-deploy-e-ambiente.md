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

## Prévia para aprovação
Para o cliente aprovar mudanças **antes** de ir para a HostGator, a prévia fica em `https://previa.artemisys.com.br/helpnow/` (GitHub Pages do repositório `mellolukas9/previas`; domínio próprio e HTTPS já configurados). Não altera nada da produção.

- **Como publicar:** `bash tools/publicar-previa.sh` (padrão: slug `helpnow`, projeto `site-helpnowsolucoes`). O script:
  1. roda `tools/build-pages-demo.sh /helpnow <tmp>` (prefixa caminhos, URLs limpas viram pastas, `/agendamento` em **mock**: nada é gravado nem enviado; remove `api/`, `.htaccess` e `sitemap.xml`; `noindex` + `robots.txt`) e confere CSS, fontes, agendamento, política e noindex;
  2. clona (ou atualiza) `previas` numa pasta temporária fora do projeto;
  3. lê `helpnow/.origem`: se a pasta existir e **não** for deste projeto, **para** (pode ser prévia de um lead do motor);
  4. substitui `helpnow/`, grava `.origem` (`site-helpnowsolucoes AAAA-MM-DD`) e faz o commit `previa: helpnow (site-helpnowsolucoes)`, garantindo que só `helpnow/` mudou;
  5. **pausa** mostrando arquivos, tamanho e `git status` da raiz, e espera o ok (`s`);
  6. dá o push (se rejeitado: `pull --rebase` e tenta de novo, nunca force), espera o Pages e confere HTTP 200 em `/helpnow/`, `/agendamento/` e `/politica-de-privacidade/`.
- **Não pode ser alterado** na raiz do `previas`: `CNAME`, `.nojekyll`, `robots.txt`, `index.html` e as pastas de outros projetos/Motor Comercial. O `robots.txt` e o `.nojekyll` gerados pelo build ficam **dentro** de `helpnow/`.
- **Manter no ar:** o motor apaga prévias com mais de 30 dias sem atualização; basta publicar de novo.
- **Tirar do ar:** apagar a pasta `helpnow/` no clone, commit e push (com o ok do responsável).
- O workflow `pages.yml` deste repositório (demo em `/site-helpnowsolucoes`) continua usando o mesmo `build-pages-demo.sh`, com o prefixo dele.
- O site não tem Analytics nem pixel (conferido com `grep`).
