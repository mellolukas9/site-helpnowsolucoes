#!/usr/bin/env bash
# Publica a PRÉVIA para aprovação do cliente em https://previa.artemisys.com.br/<slug>/
# (GitHub Pages do repositório mellolukas9/previas). Não toca na produção (HostGator).
#
# Fluxo: build de prévia (tools/build-pages-demo.sh) -> clone/pull do previas ->
#        checagem do .origem -> cópia + commit -> PAUSA para o seu ok -> push -> HTTP 200.
# Uso:   bash tools/publicar-previa.sh [slug] [nome-do-projeto]
#        padrão: slug=helpnow, projeto=site-helpnowsolucoes
# Tirar do ar: apagar a pasta <slug>/ no repositório previas, commit e push (com o ok do responsável).
# Variáveis: PREVIAS_REPO (padrão https://github.com/mellolukas9/previas.git), PREVIAS_DIR (clone local),
#            YES=1 (não pergunta; só use se já revisou o resumo).
set -euo pipefail

SLUG="${1:-helpnow}"
PROJETO="${2:-site-helpnowsolucoes}"
REPO_URL="${PREVIAS_REPO:-https://github.com/mellolukas9/previas.git}"
DOMINIO="https://previa.artemisys.com.br"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/helpnow-previa"
BUILD="$TMP/build"
CLONE="${PREVIAS_DIR:-$TMP/previas}"

mkdir -p "$TMP"

echo "==> 1/6 Gerando a prévia (prefixo /$SLUG)"
bash "$RAIZ/tools/build-pages-demo.sh" "/$SLUG" "$BUILD"

echo "==> 2/6 Conferindo a saída"
erros=0
for f in index.html agendamento/index.html politica-de-privacidade/index.html; do
  [ -f "$BUILD/$f" ] || { echo "  FALTA: $f"; erros=1; continue; }
  grep -q 'name="robots" content="noindex' "$BUILD/$f" || { echo "  SEM noindex: $f"; erros=1; }
done
grep -q "href=\"/$SLUG/assets/css/styles.css" "$BUILD/index.html" || { echo "  CSS sem prefixo na home"; erros=1; }
# nenhum caminho absoluto sem prefixo (ignora URLs completas e o prefixo certo)
if grep -rnE '(href|src)="/[^/]' "$BUILD" --include=*.html | grep -v "=\"/$SLUG/"; then
  echo "  caminhos sem prefixo (acima)"; erros=1
fi
if grep -rnE 'url\("/assets' "$BUILD/assets/css"; then echo "  fonte sem prefixo no CSS"; erros=1; fi
[ "$erros" = 0 ] || { echo "ERRO: a prévia não passou na conferência." >&2; exit 1; }
echo "  ok: CSS, fontes, agendamento, política e noindex"

echo "==> 3/6 Clonando/atualizando $REPO_URL"
if [ -d "$CLONE/.git" ]; then
  git -C "$CLONE" fetch -q origin && git -C "$CLONE" checkout -q main 2>/dev/null || true
  git -C "$CLONE" pull -q --rebase origin main
else
  git clone -q "$REPO_URL" "$CLONE"
fi

echo "==> 4/6 Conferindo a pasta $SLUG/"
if [ -d "$CLONE/$SLUG" ]; then
  origem="$(cat "$CLONE/$SLUG/.origem" 2>/dev/null || true)"
  case "$origem" in
    "$PROJETO"*) echo "  já existe e é deste projeto ($origem): será substituída" ;;
    *) echo "PARE: $SLUG/ já existe e NÃO é deste projeto (.origem = '${origem:-ausente}'). Pode ser prévia de um lead do motor." >&2; exit 2 ;;
  esac
fi
rm -rf "$CLONE/$SLUG"
mkdir -p "$CLONE/$SLUG"
cp -R "$BUILD"/. "$CLONE/$SLUG"/
printf '%s %s\n' "$PROJETO" "$(date +%Y-%m-%d)" > "$CLONE/$SLUG/.origem"

git -C "$CLONE" add -A "$SLUG"
# só a pasta do slug pode mudar; CNAME, .nojekyll, robots.txt, index.html e outras prévias ficam intactos
fora="$(git -C "$CLONE" status --porcelain | grep -v " $SLUG/" || true)"
[ -z "$fora" ] || { echo "ERRO: mudanças fora de $SLUG/:" >&2; echo "$fora" >&2; exit 1; }
if git -C "$CLONE" diff --cached --quiet; then
  echo "Sem mudanças em relação ao que já está publicado."
else
  git -C "$CLONE" commit -q -m "previa: $SLUG ($PROJETO)"
fi

echo "==> 5/6 Resumo antes do push"
echo "  arquivos em $SLUG/: $(find "$CLONE/$SLUG" -type f | wc -l)"
echo "  tamanho: $(du -sh "$CLONE/$SLUG" | cut -f1)"
echo "  git status da raiz:"; git -C "$CLONE" status --short | sed 's/^/    /'
git -C "$CLONE" log --oneline -1 | sed 's/^/  commit: /'
if [ "${YES:-0}" != "1" ]; then
  read -r -p "Dar push e publicar em $DOMINIO/$SLUG/ ? [s/N] " r
  case "$r" in s|S|sim|SIM) ;; *) echo "Cancelado (o commit ficou só no clone local: $CLONE)."; exit 0 ;; esac
fi

echo "==> 6/6 Push e checagem"
if ! git -C "$CLONE" push -q origin HEAD:main; then
  echo "Push rejeitado; atualizando com rebase e tentando de novo (sem force)."
  git -C "$CLONE" pull -q --rebase origin main
  git -C "$CLONE" push -q origin HEAD:main
fi
echo "  enviado. Aguardando o GitHub Pages atualizar (até alguns minutos)..."
ok=0
for i in $(seq 1 30); do
  codigo=$(curl -s -o /dev/null -w '%{http_code}' "$DOMINIO/$SLUG/politica-de-privacidade/?t=$i" || true)
  if [ "$codigo" = "200" ] && curl -s "$DOMINIO/$SLUG/" | grep -q "$(grep -o 'styles.css?v=[0-9]*' "$BUILD/index.html" | head -1)"; then ok=1; break; fi
  sleep 10
done
[ "$ok" = 1 ] || echo "  AVISO: o Pages ainda não serviu a versão nova; confira daqui a pouco."
for u in "" agendamento/ politica-de-privacidade/ assets/css/styles.css assets/img/og-image.png; do
  printf '  %s -> %s\n' "$DOMINIO/$SLUG/$u" "$(curl -s -o /dev/null -w '%{http_code}' "$DOMINIO/$SLUG/$u")"
done
echo "Prévia: $DOMINIO/$SLUG/"
