<?php

declare(strict_types=1);

namespace PDFix;

use setasign\Fpdi\Tcpdf\Fpdi;

class Merger
{
    /** @var string[] */
    private array $files = [];

    /**
     * @param string[] $filePaths Absolute paths to PDF files to merge
     */
    public function __construct(array $filePaths = [])
    {
        foreach ($filePaths as $path) {
            $this->addFile($path);
        }
    }

    public function addFile(string $path): self
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new \InvalidArgumentException("File non leggibile: {$path}");
        }
        $this->files[] = $path;
        return $this;
    }

    /**
     * @return string[] The current list of file paths
     */
    public function getFiles(): array
    {
        return $this->files;
    }

    /**
     * Merge all added PDFs into a single document.
     *
     * @param bool $pdfA Whether to produce PDF/A output
     * @return string The merged PDF content as a binary string
     */
    public function merge(bool $pdfA = false): string
    {
        if (count($this->files) < 2) {
            throw new \LogicException('Sono necessari almeno 2 file per il merge.');
        }

        $pdf = $this->createFpdiInstance($pdfA);

        foreach ($this->files as $filePath) {
            $pageCount = $pdf->setSourceFile($filePath);
            for ($i = 1; $i <= $pageCount; $i++) {
                $templateId = $pdf->importPage($i);
                $size = $pdf->getTemplateSize($templateId);
                $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
                $pdf->useTemplate($templateId, 0, 0, $size['width'], $size['height']);
            }
        }

        return $pdf->Output('merged.pdf', 'S');
    }

    private function createFpdiInstance(bool $pdfA): Fpdi
    {
        $pdf = new Fpdi('P', 'mm', 'A4', true, 'UTF-8', false, $pdfA ? 1 : false);

        $pdf->SetCreator('PDFix');
        $pdf->SetAuthor('PDFix');
        $pdf->SetTitle('Documento Unito');
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->SetAutoPageBreak(false, 0);

        return $pdf;
    }
}
