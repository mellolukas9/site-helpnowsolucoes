/* HelpNow — faixa da campanha Universo TOTVS.
   O texto da campanha é fixo no HTML. Com CAMPAIGN_COUNTER = false (padrão) nenhuma chamada de stats é feita.
   O "Restam X de N" só aparece (flag = true) com número REAL
   (GET /api/agenda.php?action=stats → Apps Script → planilha). Sem dado (API fora do ar,
   modo mock, demonstração) → fica só o texto, sem número. */
(function () {
  'use strict';

  var CAMPAIGN_COUNTER = false; // contador "Restam X de N" DESLIGADO (rodada 7). true = volta a chamar action=stats e a mostrar o número.
  var DEMO = false; // o build da demonstração (GitHub Pages) troca para true: não há API lá
  var boxes = document.querySelectorAll('[data-campaign]');
  var params = new URLSearchParams(location.search);
  if (!CAMPAIGN_COUNTER || !boxes.length || DEMO || params.get('mock') === '1' || location.protocol === 'file:') return;

  var ctrl = 'AbortController' in window ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);

  fetch('/api/agenda.php?action=stats', { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      clearTimeout(timer);
      if (!d || d.ok !== true || d.mock || !isFinite(d.used) || !isFinite(d.cap) || d.cap < 1) return;
      render(Math.max(0, Math.floor(d.used)), Math.floor(d.cap));
    })
    .catch(function () { /* sem número: mantém só o texto */ });

  function render(used, cap) {
    Array.prototype.forEach.call(boxes, function (box) {
      var text = box.querySelector('[data-campaign-text]');
      var count = box.querySelector('[data-campaign-count]');
      if (!text || !count) return;
      if (used >= cap) {
        text.textContent = 'Vagas da campanha esgotadas — agende normalmente';
        count.hidden = true;
      } else {
        count.textContent = 'Restam ' + (cap - used) + ' de ' + cap;
        count.hidden = false;
      }
    });
    // linha de urgência do card "02 Diagnosticamos" (só com número real; sem dado, fica o texto padrão do HTML)
    Array.prototype.forEach.call(document.querySelectorAll('[data-campaign-card]'), function (line) {
      var left = cap - used;
      line.textContent = left <= 0
        ? 'Vagas da campanha esgotadas — agende normalmente.'
        : 'Gratuito por tempo limitado — ' + (left === 1 ? 'resta 1 vaga.' : 'restam ' + left + ' vagas.');
    });
  }
})();
