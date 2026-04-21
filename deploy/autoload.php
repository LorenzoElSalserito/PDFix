<?php
/**
 * Minimal PSR-4 autoloader for PDFix production deployment.
 * Generated to replace Composer when building without PHP.
 */
spl_autoload_register(function (string $class): void {
    $map = [
        'PDFix\\'            => __DIR__ . '/../src/',
        'setasign\\Fpdi\\'   => __DIR__ . '/setasign/fpdi/src/',
    ];

    foreach ($map as $prefix => $baseDir) {
        $len = strlen($prefix);
        if (strncmp($class, $prefix, $len) !== 0) {
            continue;
        }
        $relative = substr($class, $len);
        $file = $baseDir . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';
        if (file_exists($file)) {
            require $file;
            return;
        }
    }

    // TCPDF uses a flat class structure, not PSR-4
    $tcpdfDir = __DIR__ . '/tecnickcom/tcpdf/';
    $tcpdfMap = [
        'TCPDF'        => 'tcpdf.php',
        'TCPDF_FONTS'  => 'include/tcpdf_fonts.php',
        'TCPDF_COLORS' => 'include/tcpdf_colors.php',
        'TCPDF_IMAGES' => 'include/tcpdf_images.php',
        'TCPDF_STATIC' => 'include/tcpdf_static.php',
        'TCPDF_PARSER' => 'tcpdf_parser.php',
    ];
    if (isset($tcpdfMap[$class])) {
        $file = $tcpdfDir . $tcpdfMap[$class];
        if (file_exists($file)) {
            require $file;
            return;
        }
    }
});
