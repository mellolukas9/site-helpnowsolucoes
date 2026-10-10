# Prompt inicial — Claude Code

> Abra o Claude Code na raiz da pasta `helpnow-site/` e cole o texto abaixo.

---

Você vai continuar o desenvolvimento do site da **HelpNow** (helpnowsolucoes.com.br). A base já existe e funciona.

**Antes de qualquer coisa:**
1. Leia `CLAUDE.md` e todos os arquivos de `docs/` (comece por `docs/README.md`).
2. Suba o servidor local: `php -S localhost:8000 -t public_html tools/dev-router.php` e navegue por `/` e `/agendamento` (a API roda em modo MOCK sem `helpnow-config.php`).
3. Me devolva um resumo curto do que entendeu e um plano de trabalho antes de editar.

**Restrições que não mudam:**
- HTML/CSS/JS puros, sem build e sem frameworks — hospedagem HostGator Plano P (Apache + PHP 8, sem Node).
- Textos aprovados pelo cliente não mudam sem eu pedir. Direção visual aprovada (docs/02-design-system.md) não muda.
- O contrato da API em `docs/03-agendamento.md` é a fronteira entre `agendamento.js`, `api/agenda.php` e `apps-script/Code.gs`. Se mexer em um, mantenha os três e o doc sincronizados.
- Nunca commitar segredos (`helpnow-config.php`, URL do Web App, `SHARED_SECRET`).

**Tarefas desta rodada (prioridade: lançamento em 13/10/2026):**
1. Use **/frontend-design** e **/ui-ux-pro-max-skill** para revisar `index.html`, `agendamento.html` e `styles.css`: acabamento visual, hierarquia, microinterações sutis, estados de hover/foco, responsividade em 360/390/768/1024/1440px. Refinar, não redesenhar.
2. Revisar acessibilidade (AA, teclado nos tablists e no fluxo de agendamento, `aria-live`, labels, contraste) e performance (Lighthouse mobile ≥ 90 nas 4 categorias). Considere `font-display`/preload das fontes e `fetchpriority` onde fizer sentido.
3. Gerar `public_html/assets/img/og-image.png` (1200×630) com a identidade da marca.
4. Revisar `api/agenda.php` e `apps-script/Code.gs` com olhar de segurança e robustez (validação, concorrência, mensagens de erro, fuso). Não mudar o contrato sem me avisar.
5. Testar o fluxo completo do /agendamento em modo mock (incluindo 409 SLOT_TAKEN, 422, erro de rede) e no mobile.
6. Atualizar `CLAUDE.md` (seção Status) e `docs/05-backlog.md` ao final.

Ao terminar, liste o que mudou, o que testou e o que ainda depende de configuração do ambiente (ver `docs/guia-implantacao.html`).
