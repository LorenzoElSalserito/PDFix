<?php

declare(strict_types=1);

namespace PDFix\Tests\Integration;

use PHPUnit\Framework\TestCase;

/**
 * Integration tests for the API endpoints.
 * These tests require a running server instance.
 *
 * Run with: PHP_TEST_SERVER=http://localhost:8080 phpunit --testsuite Integration
 */
class ApiTest extends TestCase
{
    /** @var string */
    private $baseUrl;

    protected function setUp(): void
    {
        $this->baseUrl = getenv('PHP_TEST_SERVER') ?: 'http://localhost:8080';
    }

    public function testHealthEndpoint(): void
    {
        $response = $this->httpGet('/api/health');
        $this->assertEquals(200, $response['status']);

        $body = json_decode($response['body'], true);
        $this->assertEquals('ok', $body['status']);
        $this->assertArrayHasKey('php', $body);
    }

    public function testMergeRequiresPost(): void
    {
        $response = $this->httpGet('/api/merge');
        $this->assertEquals(405, $response['status']);
    }

    public function testMergeRequiresAtLeastTwoFiles(): void
    {
        $fixture = __DIR__ . '/../fixtures/sample1.pdf';
        $response = $this->httpPostFiles('/api/merge', [$fixture]);
        $this->assertEquals(422, $response['status']);
    }

    public function testMergeSuccess(): void
    {
        $fixture1 = __DIR__ . '/../fixtures/sample1.pdf';
        $fixture2 = __DIR__ . '/../fixtures/sample2.pdf';

        $response = $this->httpPostFiles('/api/merge', [$fixture1, $fixture2]);
        $this->assertEquals(200, $response['status']);
        $this->assertStringStartsWith('%PDF-', $response['body']);
    }

    public function testConvertSuccess(): void
    {
        $fixture = __DIR__ . '/../fixtures/sample1.pdf';
        $response = $this->httpPostFiles('/api/convert', [$fixture]);
        $this->assertEquals(200, $response['status']);
        $this->assertStringStartsWith('%PDF-', $response['body']);
    }

    public function testNotFoundEndpoint(): void
    {
        $response = $this->httpGet('/api/nonexistent');
        $this->assertEquals(404, $response['status']);
    }

    private function httpGet(string $path): array
    {
        $ch = curl_init($this->baseUrl . $path);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false) {
            $this->markTestSkipped('Server non raggiungibile: ' . $this->baseUrl);
        }

        return ['status' => $status, 'body' => $body];
    }

    /**
     * @param string[] $filePaths
     */
    private function httpPostFiles(string $path, array $filePaths, array $postFields = []): array
    {
        $ch = curl_init($this->baseUrl . $path);
        $post = $postFields;
        foreach ($filePaths as $i => $fp) {
            $post["files[$i]"] = new \CURLFile($fp, 'application/pdf', basename($fp));
        }
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false) {
            $this->markTestSkipped('Server non raggiungibile: ' . $this->baseUrl);
        }

        return ['status' => $status, 'body' => $body];
    }
}
