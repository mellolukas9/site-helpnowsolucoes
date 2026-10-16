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
