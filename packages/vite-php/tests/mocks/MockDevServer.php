<?php

/**
 * Class MockDevServer
 */
class MockDevServer extends \WPVite\DevServer implements \WPVite\DevServerInterface
{
    /**
     * @return void
     */
    public function set_vite_injection_url()
    {
        $this->create_vite_injection_url();
    }
}