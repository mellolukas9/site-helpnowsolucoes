/* HelpNow — faixa da campanha Universo TOTVS.
   O texto da campanha é fixo no HTML. O "Restam X de N" só aparece com número REAL
   (GET /api/agenda.php?action=stats → Apps Script → planilha). Sem dado (API fora do ar,
   modo mock, demonstração) → fica só o texto, sem número. */
(function () {
  'use strict';

  var DEMO = false; // o build da demonstração (GitHub Pages) troca para true: não há API lá
  var boxes = document.querySelectorAll('[data-campaign]');
  var params = new URLSearchParams(location.search);
  if (!boxes.length || DEMO || params.get('mock') === '1' || location.protocol === 'file:') return;

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
  }
})();
