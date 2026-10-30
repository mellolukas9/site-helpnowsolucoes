# 02 — Design system

Fonte da verdade no código: `:root` de `public_html/assets/css/styles.css`.
O design foi aprovado em canvas (versão v3). Refinar execução é bem-vindo; mudar direção, não.

## Cores
| Token | Hex | Uso |
|---|---|---|
| `--navy-950` | `#060D2B` | header, hero, footer, cards escuros |
| `--navy-900` | `#0A1433` | texto principal; fundo de "Seu momento" |
| `--blue-500` | `#2E6BFF` | cor da marca: CTAs, "NOW", destaques |
| `--blue-600` | `#2456F0` | azul sobre fundo claro (logo claro, links) |
| `--cyan-400` | `#3DDCFF` | acento: Reforma Tributária (cards por área em Sora 800, `ms--dark` no primeiro), tags, detalhes no escuro |
| `--orange-500` | `#FF7A45` | **somente** estado "Como é hoje / Gargalo" |
| `--silver-100` | `#E6EBF5` | haste clara do logo |
| `--gray-50` | `#F2F4FA` | fundos claros |
| `--ink-600` | `#2B3757` | texto secundário no claro |
| `--mist-300` | `#C9D2E6` | texto secundário no escuro |
| `--line` | `#DCE2EF` | bordas no claro |
| `--blue-50` | `#EAF0FF` | fundo das tags (`.spec__tag`) sobre branco |
| `--navy-line` | `#1E2A5A` | borda do cartão do diagrama sobre navy |

Ritmo das seções (alternância forte de contraste), home v2: hero navy → Reforma **ciano** → Como trabalhamos branco → Passo 01 cinza → Passo 02 (Seu momento) navy → Passo 03 (Especialistas) branco → Passo 04 cinza → Quem conduz branco → Para quem cinza → Integração e IA navy → CTA **azul** → footer navy.

## Tipografia
- Fontes hospedadas em `assets/fonts/*.woff2` (subset latino, variáveis); `@font-face` no topo do `styles.css`.
- **Sora** 700/800 — títulos. Tracking negativo (-0.035 a -0.045em), line-height 1.0–1.05.
- **Manrope** 400–800 — texto e botões.
- **JetBrains Mono** — kickers, tags, rótulos (caixa alta, tracking 0.08–0.1em).
- H1 hero 72px (mín. 40px no mobile) · H2 52px (mín. 34px) · corpo 16–20px.

## Logo
- Símbolo `viewBox 0 0 120 120`: haste esquerda azul, haste direita prata (escuro) / marinho (claro), seta curva subindo da haste esquerda e atravessando a direita.
- Arquivos: `assets/img/logo-dark.svg`, `assets/img/logo-light.svg`, `favicon.svg`.
- O recorte entre seta e haste direita é um traço da **cor do fundo** (stroke 25). Em fundo diferente, troque essa cor.
- Wordmark: **HELP** + **NOW** (azul), Sora 800, tracking -0.03em. No header só "HELPNOW"; no footer com subtítulo "CONSULTORIA E GESTÃO DE NEGÓCIOS".

## Motivos gráficos
- **Faixas inclinadas** (`.slant`, `skewX(-9deg)`), herdadas das hastes do H, em baixa opacidade no hero, "Seu momento" e CTA.
- **Marquinha inclinada** (40×8px, `skewX(-20deg)`) no topo dos cards "Para quem".
- **Passos numerados** em círculo (`.step__n`); o 01 (diagnóstico) é sempre o preenchido em azul.

## Componentes
- Botões: `.btn--primary` (azul), `.btn--dark` (navy), `.btn--ghost-light`, `.btn--outline-white`, `.btn--outline`. Altura ≥ 48px (`--sm` 44px).
- Tabs acessíveis (setas do teclado): cards de "Seu momento" — `main.js`.
- Agendamento: stepper, grade de 5 dias úteis por semana, slots "09:00 – 10:00", skeletons, alertas, formulário com labels reais.

### Componentes da home v2 (rodada 9)
Todos em `styles.css`, bloco "Rodada 9"; nada de estilo inline, exceto as faixas inclinadas (`.slant`), como já era.
- **Seção:** `.sec` + `.sec--white | --gray | --navy` (respiro `--section-y`). `.split` / `.split__main` / `.split__aside` = duas colunas que empilham sozinhas.
- **Rótulos e links:** `.eyebrow` (mono pequeno; `--mist` no escuro), `.link-arrow` (link com seta, alvo ≥ 44px), `.card` (cartão branco).
- **Linha do tempo "Como trabalhamos":** `ol.steps > li.step` com `.step__n` (círculo numerado; `.step--first` preenchido). ≥ 900px: 4 colunas com a régua azul no topo. < 900px: lista vertical com a régua na esquerda.
- **Reunião (Passo 01):** `.agenda` / `.agenda__row` / `.agenda__time`.
- **Seu momento (Passo 02):** `.pillars` / `.pillar` (3 frentes, 1 coluna < 900px) + `.stages` / `.stage` / `.stage-panel` (abas, `main.js`).
- **Especialistas (Passo 03):** `.specs` / `.spec` (`h3` + `p` + `.spec__tag` ou `.link-arrow`); a última linha é cinza.
- **Acompanhamento (Passo 04):** `.phases` / `.phase` com `.phase__bar` (`--fill` via `--60`, `--25`) e o aviso `.followup` (borda ciano).
- **Quem conduz:** `.person` (navy; `.person__avatar` com iniciais, `.stats` em `dl`) + `.projects` / `.project`.
- **Para quem:** `.segs.segs--duo` com `.seg--navy` e `.seg--blue`.
- **Integração e IA:** `.points` (lista numerada) + `.diagram`. O SVG é só para ≥ 640px; abaixo disso entra `.diagram__list` (hub + lista de sistemas), porque o texto do SVG ficaria com ~7px.
- **CTA:** `.cta__note` (link para o Diagnóstico de impacto).
- Menu com 5 links + botão: abaixo de 1180px a fonte/gap diminuem; < 1024px vira hambúrguer.
- Removidos: `.journey`/`.jcard`, `.processo`/`.flow`/`.fcard`/`.toggle`/`.result`, `.segmentos__head`.

## Regras
- Contraste AA; foco visível (contorno ciano); `prefers-reduced-motion` respeitado.
- Ícones: SVG de traço inline (estilo Lucide). Nada de emoji.
- Mobile-first: menu hambúrguer < 1024px; nada de scroll horizontal em 360px.
