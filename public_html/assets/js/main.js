/* HelpNow — interações da home (sem dependências). */
(function () {
  'use strict';

  /* ---------- Header: sombra ao rolar + menu mobile ---------- */
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav-principal');

  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (toggle && nav) {
    var root = document.documentElement;
    var firstLink = nav.querySelector('a');
    var setOpen = function (open, restoreFocus) {
      if (open === nav.classList.contains('is-open')) return;
      nav.classList.toggle('is-open', open);
      root.classList.toggle('nav-open', open); // trava o scroll do fundo e esconde o WhatsApp
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      if (open && firstLink) firstLink.focus({ preventScroll: true });
      if (!open && restoreFocus) toggle.focus({ preventScroll: true });
    };
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open'), true); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false, true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false, true); });
    // toque fora do menu fecha (sem roubar o foco do que foi tocado)
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false, false);
    });
    // Tab para fora do menu aberto também fecha
    nav.addEventListener('focusout', function (e) {
      if (e.relatedTarget && !nav.contains(e.relatedTarget) && e.relatedTarget !== toggle) setOpen(false, false);
    });
    // ao ampliar para o layout de desktop, o menu volta ao normal
    var desktop = window.matchMedia('(min-width: 1024px)');
    var onDesktop = function () { if (desktop.matches) setOpen(false, false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onDesktop); else desktop.addListener(onDesktop);
  }

  /* ---------- Cronômetro do CTA: começa a carregar quando a página abre (ver chrono.js) ---------- */
  var big = document.querySelector('.chrono--big');
  if (big && window.HelpNowChrono) window.HelpNowChrono(big).start();

  /* ---------- WhatsApp flutuante: some sobre o CTA final e o rodapé ---------- */
  var wa = document.querySelector('.wa-float');
  if (wa && 'IntersectionObserver' in window) {
    var covering = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) covering.add(en.target); else covering.delete(en.target); });
      wa.classList.toggle('is-hidden', covering.size > 0);
    });
    document.querySelectorAll('.cta, .site-footer').forEach(function (el) { io.observe(el); });
  }

  /* ---------- WhatsApp flutuante: nunca fica em cima de um botão, link ou aba ---------- */
  if (wa) {
    var INTERACTIVE = 'a, button, input, select, textarea, [role="tab"], [role="button"]';
    var checking = false;
    var checkCover = function () {
      checking = false;
      var r = wa.getBoundingClientRect();
      if (!r.width) return;
      var xs = [r.left + 3, r.left + r.width / 2, r.right - 3], ys = [r.top + 3, r.top + r.height / 2, r.bottom - 3];
      var covering = false;
      for (var i = 0; i < xs.length && !covering; i++) {
        for (var j = 0; j < ys.length && !covering; j++) {
          var stack = document.elementsFromPoint(xs[i], ys[j]);
          for (var k = 0; k < stack.length; k++) {
            var e = stack[k];
            if (e === wa || wa.contains(e)) continue;     // o próprio botão
            if (e.closest('.site-header, .nav')) break;   // header por cima: não conta
            if (e.matches(INTERACTIVE) || e.closest(INTERACTIVE)) { covering = true; }
            break;                                         // só o elemento do topo da pilha importa
          }
        }
      }
      wa.classList.toggle('is-covering', covering);
    };
    var scheduleCheck = function () { if (!checking) { checking = true; window.requestAnimationFrame(checkCover); } };
    window.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck);
    // o carrossel do "Na prática" rola na horizontal e muda o que está sob o botão
    document.addEventListener('scroll', scheduleCheck, { passive: true, capture: true });
    scheduleCheck();
  }

  /* ---------- WhatsApp flutuante: sai de cena enquanto se rola para baixo ---------- */
  if (wa) {
    var lastY = window.scrollY, idle = null;
    window.addEventListener('scroll', function () {
      var y = window.scrollY, dy = y - lastY;
      if (Math.abs(dy) < 6) return;
      lastY = y;
      wa.classList.toggle('is-away', dy > 0 && y > 160); // descendo: some; subindo: volta
      clearTimeout(idle);
      idle = setTimeout(function () { wa.classList.remove('is-away'); }, 700); // parou de rolar: volta
    }, { passive: true });
  }

  /* ---------- Tablists acessíveis (setas do teclado) ---------- */
  function wireTablist(tabs, onSelect) {
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });
    function select(i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tabs[i].focus();
      onSelect(i, tabs[i], focus);
    }
  }

  /* ---------- "Na prática": pontos + fade do carrossel (só aparecem no mobile, via CSS) ---------- */
  var flow = document.querySelector('.flow');
  var dotsBox = document.querySelector('.flow-dots');
  if (flow && dotsBox) {
    var cards = flow.querySelectorAll('.fcard');
    Array.prototype.forEach.call(cards, function () { dotsBox.appendChild(document.createElement('i')); });
    var dots = dotsBox.children;
    var syncFlow = function () {
      var max = flow.scrollWidth - flow.clientWidth;
      flow.classList.toggle('is-end', flow.scrollLeft >= max - 4);
      var idx = 0, best = Infinity, left = flow.getBoundingClientRect().left;
      Array.prototype.forEach.call(cards, function (c, i) {
        var d = Math.abs(c.getBoundingClientRect().left - left - 18);
        if (d < best) { best = d; idx = i; }
      });
      if (flow.scrollLeft >= max - 4) idx = cards.length - 1;
      Array.prototype.forEach.call(dots, function (d, i) { d.classList.toggle('is-active', i === idx); });
    };
    flow.addEventListener('scroll', function () { window.requestAnimationFrame(syncFlow); }, { passive: true });
    window.addEventListener('resize', syncFlow);
    syncFlow();
  }

  /* ---------- "Na prática": Como é hoje × Com a HelpNow ---------- */
  var processo = document.getElementById('processo');
  if (processo) {
    var ptabs = Array.prototype.slice.call(processo.querySelectorAll('.toggle [role="tab"]'));
    wireTablist(ptabs, function (_i, tab) {
      processo.classList.toggle('is-help', tab.getAttribute('data-view') === 'help');
    });
  }

  /* ---------- "Seu momento" ---------- */
  var MOMENTOS = [
    { tag: 'AINDA SEM ERP', title: 'Estruturamos antes de informatizar.',
      body: 'Antes de pensar em sistema, organizamos o que já existe: processos, cadastros e regras. Você descobre o que faz sentido agora — inclusive se ainda não é hora de um ERP.',
      items: ['Mapa dos processos atuais', 'Planilhas padronizadas e confiáveis enquanto isso', 'Roteiro de quando e como adotar um ERP'] },
    { tag: 'ESCOLHA E IMPLANTAÇÃO', title: 'Implantação aderente ao seu negócio.',
      body: 'Apoiamos a escolha entre RM e Protheus e acompanhamos a implantação para que o sistema reflita a sua operação desde o primeiro dia.',
      items: ['Levantamento de requisitos por área', 'Parametrização orientada ao processo', 'Treinamento da equipe na virada'] },
    { tag: 'OTIMIZAÇÃO', title: 'Seu TOTVS entregando o que prometeu.',
      body: 'Revisamos parametrização, rotinas e relatórios para eliminar retrabalho, planilhas paralelas e gargalos no fechamento.',
      items: ['Diagnóstico dos gargalos por módulo', 'Ajustes de parametrização e rotinas', 'Relatórios gerenciais direto do ERP'] },
    { tag: 'SUSTENTAÇÃO', title: 'Um time TOTVS sem precisar contratar um.',
      body: 'Suporte especializado e melhoria contínua para a operação não parar — e evoluir junto com o seu negócio, incluindo a Reforma Tributária.',
      items: ['Atendimento direto com especialista', 'Melhoria contínua com indicadores', 'Adequação às mudanças legais'] }
  ];
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  var panel = document.getElementById('stage-panel');
  if (panel) {
    var stabs = Array.prototype.slice.call(document.querySelectorAll('.stages [role="tab"]'));
    var f = function (name) { return panel.querySelector('[data-field="' + name + '"]'); };
    var mobile = window.matchMedia('(max-width: 767px)');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    wireTablist(stabs, function (i, tab, viaKeyboard) {
      var m = MOMENTOS[i];
      f('tag').textContent = m.tag;
      f('title').textContent = m.title;
      f('body').textContent = m.body;
      var ul = f('items');
      ul.innerHTML = '';
      m.items.forEach(function (txt) {
        var li = document.createElement('li');
        li.innerHTML = CHECK;
        var span = document.createElement('span');
        span.textContent = txt;
        li.appendChild(span);
        ul.appendChild(li);
      });
      panel.setAttribute('aria-labelledby', tab.id);
      // no mobile, leva ao início do painel (o scroll-margin do CSS desconta o header sticky)
      if (mobile.matches && !viaKeyboard) panel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  /* ---------- Ano no rodapé ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
