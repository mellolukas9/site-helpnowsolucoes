# 01 — Contexto e decisões

## A empresa
- **HelpNow — Consultoria e Gestão de Negócios.** Slogan: "Juntos vamos mais longe!"
- Atua com gestão, eficiência e processos sobre **TOTVS RM** e **TOTVS Protheus**.
- Segmentos: **Backoffice**, **Imobiliário**, **Educacional**, **RH**.
- Também atende empresas sem ERP ("gerencio meu negócio em planilha hoje — o que faz sentido para mim agora?").
- Oferta de entrada: **diagnóstico gratuito de 30 minutos** com um especialista, online, para investigar um problema real do backoffice.
- Canais: WhatsApp (21) 96844-1647 · Instagram @help_nowsolucoes · contato@helpnowsolucoes.com.br.
- Domínio: helpnowsolucoes.com.br · CNPJ 49.739.083/0001-24.

## Momento e objetivo
- Posicionar a empresa na web pela primeira vez.
- Lançamento atrelado ao **Universo TOTVS (terça, 13/10/2026)**: o dono distribui cartões com QR Code → WhatsApp Business → saudação automática com o link do /agendamento.
- Agenda aberta **a partir de 15/10/2026**.

## Referências de mercado
- **Worknow** (worknow.com.br): comunicação direta, "problema real → antes/depois", CTA de diagnóstico.
- **Microsystem** (microsystembr.com): simplicidade e site "atual" (bloco de Reforma Tributária); agenda própria em agenda.microsystembr.com — inspirou o /agendamento.
- **Askdata** (askdata.com.br): referência de mercado (consultoria + dados, nicho bem definido).
- **TOTVS Gestão** e **Falconi**: contraste alto, blocos arredondados, ciano como acento (inspiração estética da v3).

## Decisões
| Decisão | Por quê |
|---|---|
| Logo: H inclinado (haste azul + haste prata) com seta curva subindo; versão plana, sem brilho | Evolução do logo dos cartões já impressos; funciona em favicon e WhatsApp |
| Navbar com logo + "HELPNOW" em uma linha; "Consultoria e Gestão de Negócios" vai no `<title>` | Pedido do cliente |
| Primeira seção = jornada passo a passo (Iniciamos → Diagnosticamos → Estruturamos → Acompanhamos) | Pedido do cliente: gestão "passo a passo"; substitui a antiga seção "Como trabalhamos" |
| Reforma Tributária logo após o hero | Dá o ar de site atualizado (referência Microsystem) |
| Reforma Tributária com foco na **preparação da equipe**; cards "o que muda por área" (Fiscal, Faturamento, Financeiro, Compras) no lugar do calendário 2026–2033 | Copy aprovada pelo cliente em 10/10/2026: o ERP recebe a atualização, mas quem opera as novas regras é o time |
| "Na prática" mostra um processo de ponta a ponta (Procure-to-Pay) com toggle Hoje × HelpNow | Pedido de "processo campeão que mostre a proposta" |
| Seções removidas: faixa de ERPs, "Soluções", "Quem está por trás" | Pedido do cliente. "Quem está por trás" volta no futuro (backlog) |
| Site em HTML/CSS/JS puros | Plano P não roda Node; simplicidade de manutenção e deploy |
| Agendamento próprio (PHP + Apps Script) em vez da página pronta do Google | O fluxo precisa funcionar exatamente como desenhado e gravar leads na planilha |
| Planilha no Drive do comercial@ em vez de MySQL | Mais rápido para o lançamento; MySQL na fase 2 |
| "Como nos encontrou?": Universo TOTVS (1º), LinkedIn, Instagram, Google | Pedido do cliente |
| Regras: seg–sex, 9h–12h e 14h–18h, 1h, sem intervalo, feriados bloqueados, lembrete 24h antes | Pedido do cliente |

## Posicionamento v2 (30/10/2026)
Autorizado pelo cliente (Estevão) para a home; referência aprovada em `docs/design/home-v2-design.html`.
- **Mudança de foco:** de "consultoria de TOTVS RM/Protheus" para **consultoria de gestão estratégica**: organizar processos, preparar a empresa para a **Reforma Tributária** e crescer com controle. Pill do hero: "GESTÃO ESTRATÉGICA · PROCESSOS · REFORMA TRIBUTÁRIA".
- **TOTVS vira especialidade**, não o centro: aparece só em "Especialistas" (TOTVS RM, TOTVS Protheus) e no aviso de marca do rodapé. "Seu momento" fala em "sistema".
- **Jornada em 4 passos** (substitui a jornada do hero e a seção "Na prática"): 01 Reunião de diagnóstico · 02 Seu momento (Estratégia, Gestão, Processos) · 03 Especialistas (gerentes de projetos por sistema) · 04 Acompanhamento ("Ficamos com você até sua operação andar sozinha").
- **Reforma Tributária** com oferta própria: "Diagnóstico de impacto" (CTA com mensagem de WhatsApp específica), voltada a médias e grandes empresas.
- **Quem conduz:** Estevão Sant Anna (iniciais "ES" no lugar da foto, que vem depois), 3 números (2017, 15+, 28) e 3 projetos **sem nome de cliente**. A grafia do nome ainda é a confirmar: está em um único ponto do `index.html` (`.person__name`, mais o `alt` previsto no comentário da foto).
- **Para quem:** dois públicos (médias e grandes · negócios locais) no lugar da seção Segmentos (Backoffice/Imobiliário/Educacional/RH).
- **Integração e IA:** nova seção com diagrama (hub "Seu processo").
- **Regras de conteúdo:** não citar a Artemisys; não falar em plano mensal/mensalidade (o acompanhamento é "seguimos por perto"); nomes de clientes dos projetos não aparecem.
- **CTAs:** todos os de agendar vão ao WhatsApp (decisão da rodada 8); os da Reforma usam a mensagem "Quero o Diagnóstico de impacto da Reforma Tributária". O `/agendamento` segue existindo, sem link na home.
- **Rodapé e menu:** Reforma Tributária · Como trabalhamos · Especialistas · Quem somos · Integração e IA (o rodapé acrescenta "Para quem").
- Seção "Na prática" (Procure-to-Pay, Hoje × HelpNow) removida junto com o código das abas dela.

