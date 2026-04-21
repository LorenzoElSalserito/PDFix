<?php

declare(strict_types=1);

namespace PDFix\Tests\Unit;

use PDFix\Converter;
use PHPUnit\Framework\TestCase;

class ConverterTest extends TestCase
{
    /** @var string */
    private $fixture;

    protected function setUp(): void
    {
        $this->fixture = __DIR__ . '/../fixtures/sample1.pdf';
    }

    public function testConvertToPdfAProducesValidPdf(): void
    {
        $output = Converter::convertToPdfA($this->fixture);

        $this->assertNotEmpty($output);
        $this->assertStringStartsWith('%PDF-', $output);
    }

    public function testConvertToPdfAContainsPdfAMetadata(): void
    {
        $output = Converter::convertToPdfA($this->fixture);

        // PDF/A documents contain pdfaid namespace in XMP metadata
        $lower = strtolower($output);
        $this->assertStringContainsString('pdfaid', $lower);
    }

    public function testConvertToPdfARejectsInvalidFile(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Converter::convertToPdfA('/nonexistent/file.pdf');
    }

    public function testConvertToPdfAOutputIsLargerThanInput(): void
    {
        $inputSize = filesize($this->fixture);
        $output = Converter::convertToPdfA($this->fixture);

        // PDF/A embeds ICC profile + XMP metadata, so output should generally be larger
        $this->assertGreaterThan($inputSize, strlen($output));
    }
}
