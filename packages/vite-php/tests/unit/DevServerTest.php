<?php

use PHPUnit\Framework\TestCase;
use Brain\Monkey;
use WPVite\DevServerInterface;

/**
 * Class DevServerTest
 */
class DevServerTest extends TestCase
{
    protected DevServerInterface $devServer;

    protected function setUp(): void
    {
        Monkey\setUp();
        Monkey\Functions\when( 'get_stylesheet_directory' )
            ->alias( function () {
                return __DIR__;
            } );
        Monkey\Functions\when('esc_url')
            ->alias(function ($value) {
                return $value;
            });

        $this->devServer = new MockDevServer();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
    }

    public function testSetType()
    {
        $this->expectException(\RuntimeException::class);
        $this->devServer->set_type('invalid');
    }

    public function testGetManifest()
    {
        $this->devServer->set_folder('example-plugin');
        $manifest = $this->devServer->get_manifest();
        $this->assertIsArray($manifest);
    }

    public function testGetPhpManifest()
    {
        $this->devServer->set_folder('example-plugin');
        $this->devServer->set_manifest('build/.vite/manifest.php');

        $manifest = $this->devServer->get_manifest();
        $this->assertIsArray($manifest);
    }

    public function testInjectViteIntoHead()
    {
        $this->devServer->set_domain('https://example.com');
        $this->devServer->set_folder('example-plugin');
        $this->devServer->set_server_port(2000);
        $this->devServer->set_vite_injection_url();

        ob_start();
        $this->devServer->inject_vite_into_head();
        $output = ob_get_clean();

        $this->assertStringContainsString('<script type="module"', $output);
        $this->assertStringContainsString('src="https://example.com:2000/@vite/client"', $output);
    }

    public function testFilterBodyClass()
    {
        $classes = ['existing-class'];
        $modifiedClasses = $this->devServer->filter_body_class($classes);
        $this->assertContains('dev-server-is-active', $modifiedClasses);
    }

    public function testModifyScriptLoaderTags()
    {
        $this->devServer->set_domain('https://example.com');

        $src = 'https://example.com:3000/assets/js/app.js';
        $tag = '<script src="' . $src . '"></script>';

        $modifiedTag = $this->devServer->modify_script_loader_tags($tag, 'handle', $src);
        $this->assertStringContainsString('type="module"', $modifiedTag);
    }

    public function testModifyScriptLoaderSrc()
    {
        $this->devServer->set_domain('https://example.com');
        $this->devServer->set_server_port(3000);
        $this->devServer->set_folder('example-plugin');

        $src = 'https://example.com/wp-content/plugins/example-plugin/build/blocks/example-block/view.js?v=3112';
        $modifiedSrc = $this->devServer->modify_script_loader_src($src, 'handle');

        $this->assertEquals('https://example.com:3000/blocks/example-block/view.js', $modifiedSrc);
    }
}