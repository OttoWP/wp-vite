<?php

/**
 * Manages the integration of ViteJS with WordPress during development, including the injection
 * of Vite scripts, buffering of output, and modification of project URLs for the dev server.
 *
 * @package WPVite
 */

namespace WPVite;

/**
 * Class DevServer
 */
class DevServer implements DevServerInterface
{
    /**
     * The URL to inject into the WordPress head for Vite.js.
     *
     * @var string|null
     */
    protected ?string $vite_injection_url = null;

    /**
     * Vite's outDir folder.
     *
     * @var string
     */
    protected string $vite_out_dir = 'build';

    /**
     * Vite's server port.
     *
     * @var string
     */
    protected string $vite_server_port = '3000';

    /**
     * The Vite client hook priority level.
     *
     * @var int
     */
    protected int $vite_client_hook_priority_level = 5;

    /**
     * Vite manifest path relative to the project folder.
     *
     * @var string
     */
    protected string $vite_manifest_path = 'build/.vite/manifest.json';

    /**
     * The Vite manifest.
     *
     * @var array<string, array<string, mixed>>|null
     */
    protected ?array $vite_manifest = null;

    /**
     * Folder name of project within wp-content dir.
     *
     * @var string|null
     */
    protected ?string $project_folder = null;

    /**
     * Type of project ('plugin' or 'theme').
     *
     * @var string
     */
    protected string $project_type = 'plugin';

    /**
     * Project domain URL. (e.g., https://www.mysite.com or get_site_url())
     *
     * @var string|null
     */
    protected ?string $project_domain = null;

    /**
     * @inheritdoc
     */
    public function register(): self
    {
        if (!isset($this->project_folder) || !isset($this->project_domain)) {
            throw new \RuntimeException('You forgot to set a project folder and/or domain.');
        }

        $this->create_vite_injection_url();

        if ($this->is_client_active()) {
            add_action('init', [$this, 'modify_wp_import_map_hook']);
            add_action('wp_head', [$this, 'inject_vite_into_head'], $this->vite_client_hook_priority_level);
            add_filter('body_class', [$this, 'filter_body_class'], 999);
            add_filter('script_loader_tag', [$this, 'modify_script_loader_tags'], 999, 3);
            add_filter('script_module_loader_src', [$this, 'modify_script_loader_src'], 999, 2);
            add_filter('script_loader_src', [$this, 'modify_script_loader_src'], 999, 2);
        }

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function config(array $config): self
    {
        foreach ($config as $key => $argument) {
            $method = "set_{$key}";

            if (method_exists($this, $method)) {
                call_user_func([$this, $method], $argument);
            } else {
                throw new \RuntimeException(sprintf('The config "%s" does not exist.', $key));
            }
        }

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_type(string $type): self
    {
        if ($type !== 'theme' && $type !== 'plugin') {
            throw new \RuntimeException('Type can only be set to "plugin" or "theme".');
        }

        $this->project_type = $type;

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_folder(string $folder): self
    {
        $this->project_folder = $folder;

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_domain(string $domain): self
    {
        $this->project_domain = $domain;

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_manifest(string $manifest_path): self
    {
        $this->vite_manifest_path = $manifest_path;
        $this->vite_manifest      = null; // Reset manifest

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_out_dir(string $out_dir): self
    {
        $this->vite_out_dir = $out_dir;

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_server_port(int $server_port): self
    {
        $this->vite_server_port = strval($server_port);

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function set_client_hook(int $level): self
    {
        $this->vite_client_hook_priority_level = $level;

        return $this;
    }

    /**
     * @inheritdoc
     */
    public function is_client_active(): bool
    {
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL            => ($this->vite_injection_url),
            CURLOPT_RETURNTRANSFER => true,
        ]);
        curl_exec($curl);
        $errors   = curl_error($curl);
        $response = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        return !($errors || $response !== 200);
    }

    /**
     * @inheritdoc
     */
    public function get_manifest(): array
    {
        if (!isset($this->vite_manifest)) {
            $manifest_path = $this->get_project_dir_path($this->vite_manifest_path);
            $manifest_ext  = pathinfo($manifest_path, PATHINFO_EXTENSION);

            if (!file_exists($manifest_path)) {
                throw new \RuntimeException('Manifest file path does not exist.');
            }

            // JSON version.
            if ($manifest_ext === 'json') {
                $this->vite_manifest = json_decode(file_get_contents($manifest_path), true);

                if (json_last_error()) {
                    throw new \RuntimeException('Error decoding manifest JSON: ' . json_last_error_msg());
                }
                // PHP version.
            } elseif ($manifest_ext === 'php') {
                $this->vite_manifest = require $manifest_path;
            } else {
                throw new \RuntimeException('Unknown manifest file type.');
            }
        }

        return $this->vite_manifest;
    }

    /**
     * Create the vite injection URL.
     *
     * @return void
     */
    protected function create_vite_injection_url()
    {
        $this->vite_injection_url = "{$this->project_domain}:{$this->vite_server_port}/@vite/client";
    }

    /**
     * Injects the Vite.js script into the WordPress head section.
     *
     * @return void
     */
    public function inject_vite_into_head()
    {
        ?>
        <script type="module" src="<?php echo $this->vite_injection_url ?>"></script>
        <script type="module">window.process = {env: {NODE_ENV: 'development'}};</script>
        <?php
    }

    /**
     * Adds the 'dev-server-is-active' class to the body tag.
     *
     * @param string[] $classes The existing body classes.
     *
     * @return string[] The modified body classes.
     */
    public function filter_body_class(array $classes): array
    {
        $classes[] = 'dev-server-is-active';

        return $classes;
    }

    /**
     * Ensures that the WP import map is loaded before the Vite client script. It wasn't possible to load Vite client
     * between import map and registered modules using priority levels. You can adjust the priority levels of this
     * hook + vite client using {@see self::set_client_hook()}
     *
     * @return void
     */
    public function modify_wp_import_map_hook()
    {
        global $wp_script_modules;

        /**
         * @see \WP_Script_Modules::add_hooks()
         */
        if (isset($wp_script_modules)) {
            $position = wp_is_block_theme() ? 'wp_head' : 'wp_footer';
            remove_action($position, [$wp_script_modules, 'print_import_map']);
            add_action($position, [$wp_script_modules, 'print_import_map'], $this->vite_client_hook_priority_level - 1);
        }
    }

    /**
     * Ensures we use the import syntax when loading our un-compiled scripts.
     * (This shouldn't touch block esModules which already has the correct syntax)
     *
     * @param string $tag
     * @param string $handle
     * @param string $src
     *
     * @return string
     */
    public function modify_script_loader_tags(string $tag, string $handle, string $src): string
    {
        /** At this point the src already got modified by {@see self::modify_script_loader_src()} */
        if ($this->contains_server_path($src)) {
            return '<script type="module" src="' . esc_url($src) . '"></script>';
        }

        return $tag;
    }

    /**
     * Modify the script loader src and replace it with the src path in manifest and localhost URL.
     *
     * @param string $src
     * @param string $id
     *
     * @return string
     */
    public function modify_script_loader_src(string $src, string $id): string
    {
        if ($this->contains_out_dir_path($src)) {
            $out_dir_path = preg_replace('/\?.*$/', '', $src); // Remove ? params
            $out_dir_path = explode("{$this->project_folder}/{$this->vite_out_dir}/", $out_dir_path); // remove whole path until outDir.

            if (!isset($out_dir_path[1])) {
                return $src; // Couldn't find matching build file.
            }

            $manifest = array_filter($this->get_manifest(), function ($manifest) use ($out_dir_path) {
                return $manifest['file'] === $out_dir_path[1];
            });

            if (empty($manifest)) {
                return $src; // Couldn't find matching manifest file.
            }

            $manifest = reset($manifest);

            return "{$this->project_domain}:{$this->vite_server_port}/{$manifest['src']}";
        }

        return $src;
    }

    /**
     * Checks if URL contains path to project's out dir.
     *
     * @param string $url
     *
     * @return bool
     */
    protected function contains_out_dir_path(string $url): bool
    {
        $needle = "{$this->project_folder}/{$this->vite_out_dir}/";

        if ($needle !== '' && strpos($url, $needle) !== false) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Checks if URL contains path to server.
     *
     * @param string $url
     *
     * @return bool
     */
    protected function contains_server_path(string $url): bool
    {
        $needle = "{$this->project_domain}:{$this->vite_server_port}/";

        if ($needle !== '' && strpos($url, $needle) !== false) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Get the project dir path.
     *
     * @param string|null $relative_path
     *
     * @return string
     */
    protected function get_project_dir_path(?string $relative_path = null): string
    {
        $path = $this->project_type === 'plugin'
            ? \WP_PLUGIN_DIR . '/' . $this->project_folder . '/'
            : get_stylesheet_directory();

        return isset($relative_path) ? $path . $relative_path : $path;
    }
}
