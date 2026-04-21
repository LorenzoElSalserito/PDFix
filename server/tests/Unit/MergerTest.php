<?php

declare(strict_types=1);

namespace PDFix\Tests\Unit;

use PDFix\Merger;
use PHPUnit\Framework\TestCase;

class MergerTest extends TestCase
{
    /** @var string */
    private $fixture1;
    /** @var string */
    private $fixture2;

    protected function setUp(): void
    {
        $this->fixture1 = __DIR__ . '/../fixtures/sample1.pdf';
        $this->fixture2 = __DIR__ . '/../fixtures/sample2.pdf';
    }

    public function testAddFileAcceptsValidPdf(): void
    {
        $merger = new Merger();
        $merger->addFile($this->fixture1);
        $this->assertCount(1, $merger->getFiles());
    }

    public function testAddFileRejectsInvalidPath(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        new Merger(['/nonexistent/file.pdf']);
    }

    public function testConstructorAcceptsMultipleFiles(): void
    {
        $merger = new Merger([$this->fixture1, $this->fixture2]);
        $this->assertCount(2, $merger->getFiles());
    }

    public function testMergeRequiresAtLeastTwoFiles(): void
    {
        $merger = new Merger([$this->fixture1]);
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('almeno 2 file');
        $merger->merge();
    }

    public function testMergeProducesValidPdf(): void
    {
        $merger = new Merger([$this->fixture1, $this->fixture2]);
        $output = $merger->merge();

        $this->assertNotEmpty($output);
        $this->assertStringStartsWith('%PDF-', $output);
    }

    public function testMergeWithPdfAProducesOutput(): void
    {
        $merger = new Merger([$this->fixture1, $this->fixture2]);
        $output = $merger->merge(true);

        $this->assertNotEmpty($output);
        $this->assertStringStartsWith('%PDF-', $output);
        // PDF/A documents should contain XMP metadata
        $this->assertStringContainsString('pdfaid', strtolower($output));
    }

    public function testFluentInterface(): void
    {
        $merger = new Merger();
        $result = $merger->addFile($this->fixture1);
        $this->assertSame($merger, $result);
    }
}
