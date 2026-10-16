#!/usr/bin/env bash
# Gera a versão de DEMONSTRAÇÃO para o GitHub Pages (não afeta o site de produção).
#
# O Pages serve o site em /NOME-DO-REPO/ e não roda PHP. Por isso, só na cópia de saída:
#   - caminhos absolutos (/assets/..., /agendamento) ganham o prefixo do repositório;
#   - URLs limpas viram pastas (agendamento/index.html);
#   - o /agendamento roda em modo mock (nada é gravado, nenhum e-mail é enviado; reserva e calendário funcionam no navegador);
#   - páginas marcadas noindex e robots.txt bloqueando indexação.
# Uso: tools/build-pages-demo.sh <prefixo> <pasta-de-saida>
#   ex.: tools/build-pages-demo.sh /site-helpnowsolucoes _site
set -euo pipefail

BASE="${1:?informe o prefixo, ex.: /site-helpnowsolucoes}"
OUT="${2:?informe a pasta de saída, ex.: _site}"
BASE="${BASE%/}"
SRC="$(cd "$(dirname "$0")/.." && pwd)/public_html"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$SRC"/. "$OUT"/
rm -rf "$OUT/api" "$OUT/.htaccess" "$OUT/sitemap.xml"

# HTML: href/src absolutos + noindex
find "$OUT" -name '*.html' -print0 | while IFS= read -r -d '' f; do
  perl -pi -e 's{(href|src)="/(?!/)}{$1="'"$BASE"'/}g; s{(<meta charset="utf-8">)}{$1\n  <meta name="robots" content="noindex, nofollow">}' "$f"
done

# CSS: fontes
perl -pi -e 's{url\("/assets}{url("'"$BASE"'/assets}g' "$OUT/assets/css/styles.css"

# JS: link do card "Seu momento" e modo mock forçado no agendamento
perl -pi -e "s{'/agendamento\\?}{'$BASE/agendamento?}g" "$OUT/assets/js/main.js"
perl -pi -e "s{var MOCK = params.get\\('mock'\\) === '1'}{var MOCK = true || params.get('mock') === '1'}" "$OUT/assets/js/agendamento.js"
grep -q "var MOCK = true" "$OUT/assets/js/agendamento.js" || { echo "ERRO: não consegui forçar o modo mock" >&2; exit 1; }

# URLs limpas: /agendamento e /politica-de-privacidade viram pastas
for page in agendamento politica-de-privacidade; do
  mkdir -p "$OUT/$page"
  mv "$OUT/$page.html" "$OUT/$page/index.html"
done

printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
touch "$OUT/.nojekyll"
echo "Demo gerada em $OUT (prefixo $BASE)"
