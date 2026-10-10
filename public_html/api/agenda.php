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

// Erros/avisos do PHP nunca podem vazar para o JSON de resposta.
ini_set('display_errors', '0');
date_default_timezone_set('America/Sao_Paulo');

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

/**
 * Rate limit simples por IP, em arquivo temporário.
 * O flock cobre leitura + escrita: sem ele, requisições simultâneas leem o mesmo estado
 * e furam o limite. Se o arquivo não puder ser aberto, deixa passar (o Apps Script ainda valida).
 */
function rate_limit(string $bucket, int $max, int $windowSec): bool {
    $file = sys_get_temp_dir() . '/helpnow_rl_' . $bucket . '_' . md5(client_ip()) . '.json';
    $fh = @fopen($file, 'c+');
    if ($fh === false) return true;
    if (!flock($fh, LOCK_EX)) { fclose($fh); return true; }
    $now  = time();
    $hits = json_decode((string)stream_get_contents($fh), true);
    $hits = is_array($hits) ? array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - $windowSec)) : [];
    $allowed = count($hits) < $max;
    if ($allowed) {
        $hits[] = $now;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($hits));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $allowed;
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

/** Texto de uma linha: sem tags, sem controle, espaços colapsados. Mesma regra do sanitize_ do Code.gs. */
function clean(mixed $v, int $max, bool $multiline = false): string {
    if (!is_scalar($v)) return '';
    $s = strip_tags((string)$v);
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = str_replace(['<', '>'], '', $s);
    $s = $multiline ? preg_replace('/[ \t]+/u', ' ', str_replace("\r", '', $s)) : preg_replace('/\s+/u', ' ', $s);
    return mb_substr(trim((string)$s), 0, $max);
}

/**
 * Simulação de respostas (?simulate=409|422|429|502) para testar o front sem o Google.
 * SÓ funciona em localhost: exige Host local E cliente em loopback. Em produção é ignorado.
 */
function simulate_response(): void {
    $sim = (string)($_GET['simulate'] ?? '');
    if ($sim === '') return;
    $host  = (string)($_SERVER['HTTP_HOST'] ?? '');
    $local = preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/', $host) === 1
          && in_array(client_ip(), ['127.0.0.1', '::1'], true);
    if (!$local) return;
    switch ($sim) {
        case '409': respond(409, ['ok' => false, 'code' => 'SLOT_TAKEN']);
        case '422': respond(422, ['ok' => false, 'code' => 'VALIDATION', 'fields' => ['email' => 'Informe um e-mail válido.', 'whatsapp' => 'Informe o WhatsApp com DDD.']]);
        case '429': respond(429, ['ok' => false, 'code' => 'RATE_LIMIT']);
        case '502': respond(502, ['ok' => false, 'code' => 'UPSTREAM']);
    }
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
    simulate_response();
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
    simulate_response();
    check_origin($ORIGINS, true);
    if (!rate_limit('book', 5, 3600)) respond(429, ['ok' => false, 'code' => 'RATE_LIMIT']);

    $in = json_decode((string)file_get_contents('php://input', false, null, 0, 20000), true);
    if (!is_array($in)) respond(422, ['ok' => false, 'code' => 'VALIDATION']);

    // Anti-robô: honeypot preenchido ou envio rápido demais → finge sucesso, não agenda.
    $startedAt = (int)($in['startedAt'] ?? 0);
    // (diferença negativa = relógio do cliente adiantado: não é sinal de robô)
    $elapsed = (int)(microtime(true) * 1000) - $startedAt;
    if (!empty($in['website']) || ($startedAt > 0 && $elapsed >= 0 && $elapsed < 4000)) {
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
        'problema' => clean($in['problema'] ?? '', 1500, true),
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
    if (($in['consent'] ?? false) !== true) $errors['consent'] = 'Consentimento obrigatório.';
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
