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
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
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
      onSelect(i, tabs[i]);
    }
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
    wireTablist(stabs, function (i, tab) {
      var m = MOMENTOS[i];
      f('tag').textContent = m.tag;
      f('title').textContent = m.title;
      f('body').textContent = m.body;
      f('cta').setAttribute('href', '/agendamento?momento=0' + (i + 1));
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
    });
  }

  /* ---------- Ano no rodapé ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
