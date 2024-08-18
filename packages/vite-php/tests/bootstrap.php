<?php

require dirname(__DIR__) . '/vendor/autoload.php';
require dirname(__DIR__) . '/tests/mocks/MockDevServer.php';

Brain\Monkey\setUp();

if (!defined('WP_PLUGIN_DIR')) {
    define('WP_PLUGIN_DIR', __DIR__ . '/data');
}
