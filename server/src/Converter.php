<?php

declare(strict_types=1);

namespace PDFix;

use setasign\Fpdi\Tcpdf\Fpdi;

class Converter
{
    /**
     * Convert a single PDF file to PDF/A-1b format.
     *
     * TCPDF, when instantiated with $pdfa=1, automatically embeds its bundled
     * sRGB ICC profile as OutputIntent and emits the XMP metadata required by
     * PDF/A-1b. No manual ICC embedding is needed.
     *
     * @param string $filePath Absolute path to the source PDF
     * @return string The PDF/A content as a binary string
     */
    public static function convertToPdfA(string $filePath): string
    {
        if (!is_file($filePath) || !is_readable($filePath)) {
            throw new \InvalidArgumentException("File non leggibile: {$filePath}");
        }

        $pdf = new Fpdi('P', 'mm', 'A4', true, 'UTF-8', false, 1);

        $pdf->SetCreator('PDFix');
        $pdf->SetAuthor('PDFix');
        $pdf->SetTitle('Documento PDF/A');
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->SetAutoPageBreak(false, 0);

        $pageCount = $pdf->setSourceFile($filePath);
        for ($i = 1; $i <= $pageCount; $i++) {
            $templateId = $pdf->importPage($i);
            $size = $pdf->getTemplateSize($templateId);
            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($templateId, 0, 0, $size['width'], $size['height']);
        }

        return $pdf->Output('converted_pdfa.pdf', 'S');
    }
}
