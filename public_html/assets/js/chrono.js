/* HelpNow — arco de carregamento do cronômetro "30 minutos" (animação ambiente, sem dependências).
   0 -> 100 % em 3 min reais (linear), segura cheio 1,5 s, some em 0,4 s e recomeça do zero.
   Baseado em performance.now() + setInterval (nunca só rAF): não atrasa com aba/janela em segundo plano. Nada é salvo; F5 reinicia. */
(function () {
  'use strict';
  var CYCLE = 180000, HOLD = 1500, FADE = 400;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TICK = 250; // ms. setInterval (e não requestAnimationFrame): o Chrome pausa o rAF quando acha a janela oculta/ocluída

  window.HelpNowChrono = function (svg) {
    var fill = svg && svg.querySelector('.chrono__fill'), tip = svg && svg.querySelector('.chrono__tip');
    var t0 = 0, timer = 0, lastT = 0;

    function paint(f, op) {
      fill.style.strokeDashoffset = String(100 * (1 - f));
      tip.style.transform = 'rotate(' + (f * 360) + 'deg)';
      fill.style.opacity = tip.style.opacity = String(op);
    }
    /* Progresso pelo relógio real; a transition CSS (.25 s linear) suaviza entre um tick e outro. */
    function update() {
      var t = (performance.now() - t0) % (CYCLE + HOLD + FADE);
      var wrapped = t < lastT;
      lastT = t;
      if (wrapped) { fill.style.transition = tip.style.transition = 'none'; } // recomeço: sem "rebobinar" visível
      if (t < CYCLE) paint(t / CYCLE, 1);
      else if (t < CYCLE + HOLD) paint(1, 1);
      else paint(1, 1 - (t - CYCLE - HOLD) / FADE);
      if (wrapped) { void fill.getBoundingClientRect(); fill.style.transition = tip.style.transition = ''; }
    }
    function onWake() { if (timer) update(); }

    return {
      running: function () { return !!timer; },
      /* sem efeito se já estiver rodando; reduced-motion: mantém o arco estático em ~75 % (CSS) */
      start: function () {
        if (!fill || !tip || reduced || timer) return;
        fill.style.animation = tip.style.animation = 'none';
        t0 = performance.now(); lastT = 0;
        update();
        timer = setInterval(update, TICK);
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        window.addEventListener('pageshow', onWake);
      },
      /* devolve o controle do arco ao chamador (reserva, "done") */
      stop: function () {
        if (timer) {
          clearInterval(timer); timer = 0;
          document.removeEventListener('visibilitychange', onWake);
          window.removeEventListener('focus', onWake);
          window.removeEventListener('pageshow', onWake);
        }
        if (!fill || !tip) return;
        fill.style.transition = tip.style.transition = '';
        fill.style.opacity = tip.style.opacity = '';
      }
    };
  };
})();
