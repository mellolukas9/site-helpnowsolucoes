<?php
/**
 * HelpNow — proxy do agendamento (HostGator, PHP 8+)
 *
 * Front (/agendamento) → este arquivo → Google Apps Script (Web App do comercial@)
 *
 * Por que um proxy?
 *  - evita bloqueio de CORS entre o site e o script.google.com;
 *  - esconde a URL do Apps Script e o segredo compartilhado;
 *  - aplica rate limit e validação antes de chegar ao Google;
 *  - ponto de extensão para gravar também no MySQL (fase 2).
 *
 * Configuração: /home/USUARIO/helpnow-config.php (FORA do public_html).
 * Sem esse arquivo o proxy responde em MODO MOCK (útil para desenvolvimento local).
 * Contrato: docs/03-agendamento.md
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

/* ---------- Config ---------- */
$docRoot   = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..'), '/');
$cfgPath   = dirname($docRoot) . '/helpnow-config.php';
$cfg       = is_file($cfgPath) ? (array)require $cfgPath : [];
$MOCK      = !empty($cfg['MOCK']) || empty($cfg['APPS_SCRIPT_URL']);
$SCRIPT    = (string)($cfg['APPS_SCRIPT_URL'] ?? '');
$SECRET    = (string)($cfg['SHARED_SECRET'] ?? '');
$ORIGINS   = (array)($cfg['ALLOWED_ORIGINS'] ?? ['https://helpnowsolucoes.com.br', 'https://www.helpnowsolucoes.com.br']);
$LOG_FILE  = (string)($cfg['LOG_FILE'] ?? dirname($docRoot) . '/helpnow-agenda.log');

const ERP_OPTIONS   = ['TOTVS RM', 'TOTVS Protheus', 'Outro ERP', 'Planilhas / ainda sem ERP'];
const CANAL_OPTIONS = ['Universo TOTVS', 'LinkedIn', 'Instagram', 'Google'];
const SLOT_TIMES    = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

function respond(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function log_error(string $file, string $msg): void {
    // Nunca registrar dados pessoais aqui.
    @error_log('[' . date('c') . '] ' . $msg . PHP_EOL, 3, $file);
}

function client_ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** Rate limit simples por IP, em arquivo temporário. */
function rate_limit(string $bucket, int $max, int $windowSec): bool {
    $file = sys_get_temp_dir() . '/helpnow_rl_' . $bucket . '_' . md5(client_ip()) . '.json';
    $now  = time();
    $hits = [];
    if (is_file($file)) {
        $hits = json_decode((string)@file_get_contents($file), true) ?: [];
    }
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - $windowSec));
    if (count($hits) >= $max) return false;
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return true;
}

/** Aceita só chamadas do próprio site (quando o navegador informa a origem). */
function check_origin(array $allowed, bool $strict): void {
    $origin  = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $host    = (string)($_SERVER['HTTP_HOST'] ?? '');
    $isLocal = preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host) === 1;
    if ($isLocal) return;
    $ok = false;
    foreach ($allowed as $a) {
        if ($origin !== '' && rtrim($origin, '/') === rtrim($a, '/')) $ok = true;
        if ($origin === '' && $referer !== '' && str_starts_with($referer, rtrim($a, '/') . '/')) $ok = true;
    }
    if (!$ok && ($strict || $origin !== '')) respond(403, ['ok' => false, 'code' => 'FORBIDDEN']);
}

function valid_date(string $d): bool {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
    [$y, $m, $day] = array_map('intval', explode('-', $d));
    return checkdate($m, $day, $y);
}

function clean(mixed $v, int $max): string {
    $s = trim(strip_tags((string)$v));
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $s) ?? '';
    return mb_substr($s, 0, $max);
}

/** Chama o Apps Script. O /exec responde 302 → googleusercontent; o cURL segue como GET (correto). */
function call_script(string $url, string $method, array $data): array {
    $ch = curl_init();
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ];
    if ($method === 'GET') {
        $opts[CURLOPT_URL] = $url . (str_contains($url, '?') ? '&' : '?') . http_build_query($data);
    } else {
        $opts[CURLOPT_URL] = $url;
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($data, JSON_UNESCAPED_UNICODE);
        $opts[CURLOPT_HTTPHEADER][] = 'Content-Type: text/plain;charset=utf-8';
    }
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($body === false) return ['__error' => 'curl: ' . $err];
    $json = json_decode((string)$body, true);
    if (!is_array($json)) return ['__error' => 'resposta não-JSON (HTTP ' . $code . ') — confira a URL /exec e o acesso "Qualquer pessoa"'];
    return $json;
}

/* ---------- MOCK (sem Apps Script configurado) ---------- */
function mock_slots(string $from, string $to): array {
    $tz = new DateTimeZone('America/Sao_Paulo');
    $now = new DateTimeImmutable('now', $tz);
    $first = max($now->format('Y-m-d'), '2026-10-15');
    $days = [];
    for ($d = new DateTimeImmutable($from, $tz); $d->format('Y-m-d') <= $to; $d = $d->modify('+1 day')) {
        $date = $d->format('Y-m-d');
        $slots = [];
        $w = (int)$d->format('N');
        if ($w <= 5 && $date >= $first) {
            foreach (SLOT_TIMES as $i => $t) {
                if (((int)$d->format('j') + $i) % 4 !== 0) $slots[] = $t;
            }
        }
        $days[] = ['date' => $date, 'slots' => $slots];
    }
    return ['timezone' => 'America/Sao_Paulo', 'days' => $days, 'mock' => true];
}

/* ---------- Roteamento ---------- */
$action = (string)($_GET['action'] ?? '');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($action === 'slots' && $method === 'GET') {
    check_origin($ORIGINS, false);
    if (!rate_limit('slots', 60, 600)) respond(429, ['ok' => false, 'code' => 'RATE_LIMIT']);

    $from = (string)($_GET['from'] ?? '');
    $to   = (string)($_GET['to'] ?? '');
    if (!valid_date($from) || !valid_date($to) || $to < $from) respond(422, ['ok' => false, 'code' => 'VALIDATION']);
    if ((strtotime($to) - strtotime($from)) / 86400 > 31) respond(422, ['ok' => false, 'code' => 'VALIDATION']);

    if ($MOCK) respond(200, mock_slots($from, $to));

    $res = call_script($SCRIPT, 'GET', ['action' => 'slots', 'from' => $from, 'to' => $to, 'secret' => $SECRET]);
    if (isset($res['__error'])) { log_error($LOG_FILE, 'slots: ' . $res['__error']); respond(502, ['ok' => false, 'code' => 'UPSTREAM']); }
    if (empty($res['ok'])) { log_error($LOG_FILE, 'slots code: ' . ($res['code'] ?? '?')); respond(502, ['ok' => false, 'code' => 'UPSTREAM']); }
    respond(200, ['timezone' => $res['timezone'] ?? 'America/Sao_Paulo', 'days' => $res['days'] ?? []]);
}

if ($action === 'book' && $method === 'POST') {
    check_origin($ORIGINS, true);
    if (!rate_limit('book', 5, 3600)) respond(429, ['ok' => false, 'code' => 'RATE_LIMIT']);

    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) respond(422, ['ok' => false, 'code' => 'VALIDATION']);

    // Anti-robô: honeypot preenchido ou envio rápido demais → finge sucesso, não agenda.
    $startedAt = (int)($in['startedAt'] ?? 0);
    if (!empty($in['website']) || ($startedAt > 0 && (int)(microtime(true) * 1000) - $startedAt < 4000)) {
        respond(200, ['ok' => true, 'eventId' => '', 'meetLink' => '']);
    }

    $data = [
        'date'     => clean($in['date'] ?? '', 10),
        'time'     => clean($in['time'] ?? '', 5),
        'nome'     => clean($in['nome'] ?? '', 120),
        'empresa'  => clean($in['empresa'] ?? '', 120),
        'whatsapp' => clean($in['whatsapp'] ?? '', 20),
        'email'    => mb_strtolower(clean($in['email'] ?? '', 160)),
        'erp'      => clean($in['erp'] ?? '', 40),
        'canal'    => clean($in['canal'] ?? '', 40),
        'problema' => clean($in['problema'] ?? '', 1500),
        'origem'   => clean($in['origem'] ?? '', 40),
        'assunto'  => clean($in['assunto'] ?? '', 40),
        'momento'  => clean($in['momento'] ?? '', 4),
    ];

    $errors = [];
    if (!valid_date($data['date'])) $errors['date'] = 'Data inválida.';
    if (!in_array($data['time'], SLOT_TIMES, true)) $errors['time'] = 'Horário inválido.';
    if (mb_strlen($data['nome']) < 3) $errors['nome'] = 'Informe seu nome completo.';
    if (mb_strlen($data['empresa']) < 2) $errors['empresa'] = 'Informe o nome da empresa.';
    $digits = preg_replace('/\D/', '', $data['whatsapp']) ?? '';
    if (strlen($digits) < 10 || strlen($digits) > 11) $errors['whatsapp'] = 'Informe o WhatsApp com DDD.';
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Informe um e-mail válido.';
    if (!in_array($data['erp'], ERP_OPTIONS, true)) $errors['erp'] = 'Selecione uma opção.';
    if (!in_array($data['canal'], CANAL_OPTIONS, true)) $errors['canal'] = 'Selecione uma opção.';
    if (empty($in['consent'])) $errors['consent'] = 'Consentimento obrigatório.';
    if ($errors) respond(422, ['ok' => false, 'code' => 'VALIDATION', 'fields' => $errors]);

    if ($MOCK) respond(200, ['ok' => true, 'eventId' => 'mock-' . time(), 'meetLink' => 'https://meet.google.com/abc-defg-hij', 'mock' => true]);

    $res = call_script($SCRIPT, 'POST', ['action' => 'book', 'secret' => $SECRET] + $data);
    if (isset($res['__error'])) { log_error($LOG_FILE, 'book: ' . $res['__error']); respond(502, ['ok' => false, 'code' => 'UPSTREAM']); }

    if (!empty($res['ok'])) {
        // TODO fase 2: gravar também no MySQL da HostGator (tabela leads) a partir de $data + $res['eventId'].
        respond(200, ['ok' => true, 'eventId' => $res['eventId'] ?? '', 'start' => $res['start'] ?? '', 'end' => $res['end'] ?? '', 'meetLink' => $res['meetLink'] ?? '']);
    }
    $code = (string)($res['code'] ?? 'UPSTREAM');
    if ($code === 'SLOT_TAKEN') respond(409, ['ok' => false, 'code' => 'SLOT_TAKEN']);
    if ($code === 'VALIDATION') respond(422, ['ok' => false, 'code' => 'VALIDATION', 'fields' => $res['fields'] ?? []]);
    log_error($LOG_FILE, 'book code: ' . $code);
    respond(502, ['ok' => false, 'code' => 'UPSTREAM']);
}

if ($action === 'health') {
    respond(200, ['ok' => true, 'mode' => $MOCK ? 'mock' : 'live', 'config' => is_file($cfgPath)]);
}

respond(400, ['ok' => false, 'code' => 'BAD_REQUEST']);
