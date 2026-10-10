<?php
/**
 * Servidor local que imita o .htaccess da HostGator (URLs limpas).
 *
 *   php -S localhost:8000 -t public_html tools/dev-router.php
 *
 * Sem /helpnow-config.php ao lado de public_html, o /api/agenda.php roda em MODO MOCK.
 */
$root = realpath(__DIR__ . '/../public_html');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

if ($path !== '/' && is_file($root . $path)) {
    return false; // arquivo existente: o servidor embutido entrega
}
$clean = rtrim($path, '/');
if ($clean === '') { readfile($root . '/index.html'); return true; }
if (is_file($root . $clean . '.html')) { header('Content-Type: text/html; charset=utf-8'); readfile($root . $clean . '.html'); return true; }

http_response_code(404);
readfile($root . '/404.html');
return true;
