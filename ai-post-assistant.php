<?php
/**
 * Plugin Name:       AI Post Assistant
 * Plugin URI:        https://example.com/ai-post-assistant
 * Description:       Adds AI-powered title and excerpt suggestion buttons to the Gutenberg editor.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      8.1
 * Author:            Your Name
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       ai-post-assistant
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class AI_Post_Assistant {

	private const HANDLE       = 'ai-post-assistant-editor';
	private const NONCE_ACTION = 'ai_post_assistant_nonce';

	public static function init(): void {
		add_action( 'enqueue_block_editor_assets', [ self::class, 'enqueue_editor_assets' ] );
	}

	/**
	 * Enqueues the compiled JS bundle for the block editor.
	 *
	 * Guards:
	 *  - Only on block-editor screens (base === 'post').
	 *  - Only for users who have the `edit_posts` capability.
	 *  - Only when the compiled asset file actually exists on disk.
	 */
	public static function enqueue_editor_assets(): void {
		if ( ! self::is_valid_edit_screen() ) {
			return;
		}

		$asset_file = plugin_dir_path( __FILE__ ) . 'build/index.asset.php';

		if ( ! file_exists( $asset_file ) ) {
			return;
		}

		$asset = require $asset_file; // phpcs:ignore WordPressVIPMinimum.Files.IncludingFile.UsingVariable

		wp_enqueue_script(
			self::HANDLE,
			plugin_dir_url( __FILE__ ) . 'build/index.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);

		/**
		 * Localize a nonce so future authenticated REST / AJAX requests
		 * can be verified server-side with check_ajax_referer() or
		 * verify_nonce(). Even though no AJAX calls exist yet, this
		 * establishes the secure baseline required by the spec.
		 */
		wp_localize_script(
			self::HANDLE,
			'aiPostAssistantData',
			[
				'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
				'ajaxUrl' => esc_url( admin_url( 'admin-ajax.php' ) ),
			]
		);
	}

	/**
	 * Returns true only when ALL conditions are satisfied:
	 *  1. The current user has the `edit_posts` capability.
	 *  2. get_current_screen() returns a WP_Screen instance.
	 *  3. The screen is the block editor (`is_block_editor() === true`).
	 *  4. The screen base is 'post' (not 'edit', 'options', etc.).
	 */
	public static function is_valid_edit_screen(): bool {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return false;
		}

		$screen = get_current_screen();

		if ( ! ( $screen instanceof WP_Screen ) ) {
			return false;
		}

		return $screen->is_block_editor() && $screen->base === 'post';
	}
}

AI_Post_Assistant::init();
