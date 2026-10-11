/* HelpNow — arco de carregamento do cronômetro "60 minutos" (animação ambiente, sem dependências).
   0 -> 100 % em 3 min reais (linear), segura cheio 1,5 s, some em 0,4 s e recomeça do zero.
   Baseado em performance.now(): aba em segundo plano não atrasa. Nada é salvo; F5 reinicia. */
(function () {
  'use strict';
  var CYCLE = 180000, HOLD = 1500, FADE = 400;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.HelpNowChrono = function (svg) {
    var fill = svg && svg.querySelector('.chrono__fill'), tip = svg && svg.querySelector('.chrono__tip');
    var t0 = 0, raf = 0;

    function paint(f, op) {
      fill.style.strokeDashoffset = String(100 * (1 - f));
      tip.style.transform = 'rotate(' + (f * 360) + 'deg)';
      fill.style.opacity = tip.style.opacity = String(op);
    }
    function frame(now) {
      var t = (now - t0) % (CYCLE + HOLD + FADE);
      if (t < CYCLE) paint(t / CYCLE, 1);
      else if (t < CYCLE + HOLD) paint(1, 1);
      else paint(1, 1 - (t - CYCLE - HOLD) / FADE);
      raf = requestAnimationFrame(frame);
    }
    return {
      running: function () { return !!raf; },
      /* sem efeito se já estiver rodando; reduced-motion: mantém o arco estático em ~75 % (CSS) */
      start: function () {
        if (!fill || !tip || reduced || raf) return;
        fill.style.animation = tip.style.animation = 'none';
        fill.style.transition = tip.style.transition = 'none';
        t0 = performance.now();
        frame(t0);
      },
      /* devolve o controle do arco ao chamador (reserva, "done") */
      stop: function () {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (!fill || !tip) return;
        fill.style.transition = tip.style.transition = '';
        fill.style.opacity = tip.style.opacity = '';
      }
    };
  };
})();
