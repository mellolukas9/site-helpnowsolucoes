<?php
/**
 * HelpNow — configuração secreta do proxy de agendamento.
 *
 * COPIE este arquivo para o DIRETÓRIO INICIAL da HostGator (fora do public_html):
 *   /home/USUARIO/helpnow-config.php
 * O proxy (public_html/api/agenda.php) procura em dirname(DOCUMENT_ROOT)/helpnow-config.php.
 *
 * Nunca versione o arquivo preenchido (ele está no .gitignore).
 */
return [
    // URL do Web App do Apps Script (Implantar → Gerenciar implantações). Termina em /exec.
    'APPS_SCRIPT_URL' => 'https://script.google.com/macros/s/COLE_AQUI_O_ID/exec',

    // Mesmo valor da Script Property SHARED_SECRET (gerado pela função setup()).
    'SHARED_SECRET'   => 'COLE_AQUI_O_SECRET',

    // Origens aceitas para chamadas do navegador.
    'ALLOWED_ORIGINS' => ['https://helpnowsolucoes.com.br', 'https://www.helpnowsolucoes.com.br'],

    // true = responde com dados simulados (não chama o Google). Use só para testes.
    'MOCK'            => false,

    // Log de erros técnicos (sem dados pessoais). Fora do public_html.
    // 'LOG_FILE'     => '/home/USUARIO/helpnow-agenda.log',
];
