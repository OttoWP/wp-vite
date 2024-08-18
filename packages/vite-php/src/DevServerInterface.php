<?php

/**
 * Interface for the dev server.
 *
 * @package WPVite
 */

namespace WPVite;

/**
 * Interface DevServerInterface
 */
interface DevServerInterface
{
    /**
     * Registers the necessary actions and filters for the dev server integration.
     *
     * @return $this
     */
    public function register(): self;

    /**
     * Sets the type of project ('plugin' or 'theme'). Default is set to "plugin".
     *
     * @param string $type
     *
     * @return $this
     */
    public function set_type(string $type): self;

    /**
     * Sets the project folder name within the wp-content directory.
     *
     * @param string $folder
     *
     * @return $this
     */
    public function set_folder(string $folder): self;

    /**
     * Set the project domain.
     *
     * @param string $domain
     *
     * @return $this
     */
    public function set_domain(string $domain): self;

    /**
     * Set the manifest path relative to the project folder. This can be a PHP or JSON file.
     * Default is set to "'build/.vite/manifest.json'".
     *
     * @param string $manifest_path
     *
     * @return $this
     */
    public function set_manifest(string $manifest_path): self;

    /**
     * Sets the project outDir that's configured in vite. Default is set to "build".
     *
     * @param string $out_dir
     *
     * @return $this
     */
    public function set_out_dir(string $out_dir): self;

    /**
     * Sets the project outDir that's configured in vite. Default is set to "build".
     *
     * @param int $server_port
     *
     * @return $this
     */
    public function set_server_port(int $server_port): self;

    /**
     * Set priority level for injecting vite client hook. This will also determine where
     * the import map is being re-hooked. Default set to 5.
     *
     * @param int $level
     *
     * @return $this
     */
    public function set_client_hook_priority_level(int $level): self;


    /**
     * Checks if the Vite.js development server is active.
     *
     * @return bool True if the Vite.js server is active, false otherwise.
     */
    public function is_client_active(): bool;


    /**
     * Get the manifest configured by {@see self::set_manifest()}.
     * Result gets cached for second call.
     *
     * @return array
     */
    public function get_manifest(): array;
}
