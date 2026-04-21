<?php

declare(strict_types=1);

// Support both dev layout (server/public/) and deploy layout (dist/api/)
$autoloadCandidates = [
    __DIR__ . '/../vendor/autoload.php',   // dev: server/vendor/
    __DIR__ . '/../../../vendor/autoload.php', // deploy via docker
];
$loaded = false;
foreach ($autoloadCandidates as $autoload) {
    if (file_exists($autoload)) {
        require_once $autoload;
        $loaded = true;
        break;
    }
}
if (!$loaded) {
    http_response_code(500);
    echo json_encode(['error' => 'Autoload non trovato. Eseguire composer install.']);
    exit;
}

use PDFix\Merger;
use PDFix\Converter;

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

try {
    switch ($uri) {
        case '/api/merge':
            handleMerge();
            break;
        case '/api/convert':
            handleConvert();
            break;
        case '/api/health':
            handleHealth();
            break;
        default:
            sendError('Endpoint non trovato.', 404);
    }
} catch (\Throwable $e) {
    sendError($e->getMessage(), 500);
}

function handleMerge(): void
{
    requirePost();

    $files = getUploadedFiles();
    if (count($files) < 2) {
        sendError('Sono necessari almeno 2 file per il merge.', 422);
    }

    $pdfA = ($_POST['pdfa'] ?? '0') === '1';

    $merger = new Merger($files);
    $output = $merger->merge($pdfA);

    cleanUpFiles($files);
    sendPdf($output, $pdfA ? 'merged_pdfa.pdf' : 'merged.pdf');
}

function handleConvert(): void
{
    requirePost();

    $files = getUploadedFiles();
    if (count($files) !== 1) {
        sendError('La conversione PDF/A richiede esattamente 1 file.', 422);
    }

    $output = Converter::convertToPdfA($files[0]);

    cleanUpFiles($files);
    sendPdf($output, 'converted_pdfa.pdf');
}

function handleHealth(): void
{
    header('Content-Type: application/json');
    echo json_encode([
        'status' => 'ok',
        'php' => PHP_VERSION,
        'extensions' => [
            'mbstring' => extension_loaded('mbstring'),
            'gd' => extension_loaded('gd'),
        ],
    ]);
}

function requirePost(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('Metodo non consentito. Usa POST.', 405);
    }
}

/**
 * @return string[] Array of temporary file paths
 */
function getUploadedFiles(): array
{
    if (empty($_FILES['files'])) {
        sendError('Nessun file caricato.', 422);
    }

    $paths = [];
    $uploadedFiles = $_FILES['files'];

    // Handle both single and array uploads
    if (is_array($uploadedFiles['tmp_name'])) {
        foreach ($uploadedFiles['tmp_name'] as $i => $tmpName) {
            if ($uploadedFiles['error'][$i] !== UPLOAD_ERR_OK) {
                sendError("Errore nel caricamento del file #{$i}.", 422);
            }
            validatePdf($tmpName, $uploadedFiles['name'][$i]);
            $paths[] = $tmpName;
        }
    } else {
        if ($uploadedFiles['error'] !== UPLOAD_ERR_OK) {
            sendError('Errore nel caricamento del file.', 422);
        }
        validatePdf($uploadedFiles['tmp_name'], $uploadedFiles['name']);
        $paths[] = $uploadedFiles['tmp_name'];
    }

    return $paths;
}

function validatePdf(string $tmpPath, string $originalName): void
{
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($ext !== 'pdf') {
        sendError("Il file '{$originalName}' non è un PDF.", 422);
    }

    // Check PDF magic bytes
    $header = file_get_contents($tmpPath, false, null, 0, 5);
    if ($header !== '%PDF-') {
        sendError("Il file '{$originalName}' non è un PDF valido.", 422);
    }
}

function sendPdf(string $content, string $filename): void
{
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($content));
    echo $content;
    exit;
}

/**
 * @return never
 */
function sendError(string $message, int $code = 400): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

/**
 * @param string[] $files
 */
function cleanUpFiles(array $files): void
{
    foreach ($files as $file) {
        if (is_file($file)) {
            @unlink($file);
        }
    }
}
