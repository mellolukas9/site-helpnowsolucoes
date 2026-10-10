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
| `--cyan-400` | `#3DDCFF` | acento: Reforma Tributária, tags, detalhes no escuro |
| `--orange-500` | `#FF7A45` | **somente** estado "Como é hoje / Gargalo" |
| `--silver-100` | `#E6EBF5` | haste clara do logo |
| `--gray-50` | `#F2F4FA` | fundos claros |
| `--ink-600` | `#2B3757` | texto secundário no claro |
| `--mist-300` | `#C9D2E6` | texto secundário no escuro |
| `--line` | `#DCE2EF` | bordas no claro |

Ritmo das seções (alternância forte de contraste): hero navy → Reforma **ciano** → Na prática cinza-claro → Seu momento navy → Segmentos branco → CTA **azul** → footer navy.

## Tipografia
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
- **Marquinha inclinada** (40×8px, `skewX(-20deg)`) no topo dos cards de segmento.
- **Números com contorno** (`-webkit-text-stroke`) nos passos da jornada; o passo 02 (diagnóstico) é sempre o card azul cheio.

## Componentes
- Botões: `.btn--primary` (azul), `.btn--dark` (navy), `.btn--ghost-light`, `.btn--outline-white`, `.btn--outline`. Altura ≥ 48px (`--sm` 44px).
- Tabs acessíveis (setas do teclado): toggle "Na prática" e cards de "Seu momento" — `main.js`.
- Agendamento: stepper, grade de 5 dias úteis por semana, slots "09:00 – 10:00", skeletons, alertas, formulário com labels reais.

## Regras
- Contraste AA; foco visível (contorno ciano); `prefers-reduced-motion` respeitado.
- Ícones: SVG de traço inline (estilo Lucide). Nada de emoji.
- Mobile-first: menu hambúrguer < 1024px; nada de scroll horizontal em 360px.
