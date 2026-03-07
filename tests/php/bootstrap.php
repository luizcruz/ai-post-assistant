<?php
/**
 * PHPUnit bootstrap for AI Post Assistant.
 *
 * Execution order:
 *  1. Load Composer autoloader (Brain\Monkey, PHPUnit, Mockery).
 *  2. Define ABSPATH so the plugin guard does not call exit().
 *  3. Stub WordPress functions that are called at file scope when the plugin
 *     is loaded (e.g. add_action). Brain\Monkey will mock all other functions
 *     inside the per-test setUp / tearDown cycle.
 *  4. Provide a minimal WP_Screen stub so instanceof checks pass.
 *  5. Require the plugin file.
 */

declare( strict_types=1 );

// 1. Composer autoloader.
require_once __DIR__ . '/../../vendor/autoload.php';

// 2. WordPress guard constant.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/tmp/wordpress/' );
}

// 3. Stub functions invoked at file scope during plugin load.
//    Brain\Monkey cannot intercept these because they run before any test's
//    setUp(), so we provide no-op PHP stubs instead.
if ( ! function_exists( 'add_action' ) ) {
	function add_action( string $hook, callable $callback, int $priority = 10, int $accepted_args = 1 ): bool {
		return true;
	}
}

// 4. Minimal WP_Screen stub.
//    The real class is only available inside a full WordPress environment.
//    Tests instantiate this stub and set public properties to simulate
//    different screen contexts.
if ( ! class_exists( 'WP_Screen' ) ) {
	class WP_Screen {
		public string $base        = 'post';
		public bool   $blockEditor = true;

		public function is_block_editor(): bool {
			return $this->blockEditor;
		}
	}
}

// 5a. WP_REST_Response stub.
//     The real class is only available inside a full WordPress environment.
//     rest_get_link_map() returns new WP_REST_Response(...), so we need this
//     before requiring the plugin file.
if ( ! class_exists( 'WP_REST_Response' ) ) {
	class WP_REST_Response {
		public mixed $data;
		public int   $status;

		public function __construct( mixed $data = null, int $status = 200 ) {
			$this->data   = $data;
			$this->status = $status;
		}
	}
}

// 5b. WP_REST_Server stub – provides the READABLE constant used in
//     register_rest_routes(). The actual REST server is not needed in tests.
if ( ! class_exists( 'WP_REST_Server' ) ) {
	class WP_REST_Server {
		const READABLE = 'GET';
	}
}

// 6. Load the plugin (class is now defined; init() calls our stubbed add_action).
require_once __DIR__ . '/../../ai-post-assistant.php';
