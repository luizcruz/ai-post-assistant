<?php
/**
 * PHPUnit tests for AI_Post_Assistant (ai-post-assistant.php).
 *
 * Strategy:
 *  - Brain\Monkey\Functions\when()   → stub a function (always returns a value).
 *  - Brain\Monkey\Functions\expect() → stub + assert call count / args.
 *  - WP_Screen stub                  → defined in bootstrap.php; properties are
 *                                      set per-test to simulate different screens.
 *
 * Covered scenarios:
 *  is_valid_edit_screen()
 *    ✓ Returns false when current_user_can('edit_posts') === false.
 *    ✓ Returns false when get_current_screen() returns null.
 *    ✓ Returns false when screen is not a block editor.
 *    ✓ Returns false when screen base is not 'post'.
 *    ✓ Returns true for an authorised user on a post block-editor screen.
 *
 *  enqueue_editor_assets()
 *    ✓ Does NOT call wp_enqueue_script when the screen check fails.
 *    ✓ Does NOT call wp_enqueue_script when the asset file is missing.
 *    ✓ Calls wp_enqueue_script + wp_localize_script for valid screens.
 */

declare( strict_types=1 );

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

class AiPostAssistantTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/** Returns a WP_Screen stub configured as a valid post block-editor screen. */
	private function validScreen(): WP_Screen {
		$screen              = new WP_Screen();
		$screen->base        = 'post';
		$screen->blockEditor = true;
		return $screen;
	}

	// =========================================================================
	// is_valid_edit_screen()
	// =========================================================================

	public function test_returns_false_when_user_lacks_edit_posts_capability(): void {
		Functions\when( 'current_user_can' )->justReturn( false );

		$this->assertFalse( AI_Post_Assistant::is_valid_edit_screen() );
	}

	public function test_returns_false_when_get_current_screen_returns_null(): void {
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'get_current_screen' )->justReturn( null );

		$this->assertFalse( AI_Post_Assistant::is_valid_edit_screen() );
	}

	public function test_returns_false_when_screen_is_not_a_wp_screen_instance(): void {
		Functions\when( 'current_user_can' )->justReturn( true );
		// Return a plain stdClass – not a WP_Screen instance.
		Functions\when( 'get_current_screen' )->justReturn( new \stdClass() );

		$this->assertFalse( AI_Post_Assistant::is_valid_edit_screen() );
	}

	public function test_returns_false_when_screen_is_not_block_editor(): void {
		Functions\when( 'current_user_can' )->justReturn( true );

		$screen              = new WP_Screen();
		$screen->base        = 'post';
		$screen->blockEditor = false; // classic editor

		Functions\when( 'get_current_screen' )->justReturn( $screen );

		$this->assertFalse( AI_Post_Assistant::is_valid_edit_screen() );
	}

	public function test_returns_false_when_base_is_not_post(): void {
		Functions\when( 'current_user_can' )->justReturn( true );

		$screen              = new WP_Screen();
		$screen->base        = 'edit'; // posts list view, not the editor
		$screen->blockEditor = true;

		Functions\when( 'get_current_screen' )->justReturn( $screen );

		$this->assertFalse( AI_Post_Assistant::is_valid_edit_screen() );
	}

	public function test_returns_false_when_base_is_dashboard(): void {
		Functions\when( 'current_user_can' )->justReturn( true );

		$screen              = new WP_Screen();
		$screen->base        = 'dashboard';
		$screen->blockEditor = false;

		Functions\when( 'get_current_screen' )->justReturn( $screen );

		$this->assertFalse( AI_Post_Assistant::is_valid_edit_screen() );
	}

	public function test_returns_true_for_authorised_user_on_post_block_editor(): void {
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'get_current_screen' )->justReturn( $this->validScreen() );

		$this->assertTrue( AI_Post_Assistant::is_valid_edit_screen() );
	}

	// =========================================================================
	// enqueue_editor_assets() – access control
	// =========================================================================

	public function test_does_not_enqueue_when_user_lacks_permission(): void {
		// Verification is done by Mockery->never() in tearDown, not by assert*.
		$this->expectNotToPerformAssertions();

		Functions\when( 'current_user_can' )->justReturn( false );
		Functions\expect( 'wp_enqueue_script' )->never();
		Functions\expect( 'wp_localize_script' )->never();

		AI_Post_Assistant::enqueue_editor_assets();
	}

	public function test_does_not_enqueue_on_non_block_editor_screen(): void {
		$this->expectNotToPerformAssertions();

		Functions\when( 'current_user_can' )->justReturn( true );

		$screen              = new WP_Screen();
		$screen->base        = 'post';
		$screen->blockEditor = false;

		Functions\when( 'get_current_screen' )->justReturn( $screen );
		Functions\expect( 'wp_enqueue_script' )->never();

		AI_Post_Assistant::enqueue_editor_assets();
	}

	public function test_does_not_enqueue_when_screen_base_is_not_post(): void {
		$this->expectNotToPerformAssertions();

		Functions\when( 'current_user_can' )->justReturn( true );

		$screen              = new WP_Screen();
		$screen->base        = 'options-general';
		$screen->blockEditor = true;

		Functions\when( 'get_current_screen' )->justReturn( $screen );
		Functions\expect( 'wp_enqueue_script' )->never();

		AI_Post_Assistant::enqueue_editor_assets();
	}

	// =========================================================================
	// enqueue_editor_assets() – asset-file guard
	// =========================================================================

	public function test_does_not_enqueue_when_asset_file_does_not_exist(): void {
		$this->expectNotToPerformAssertions();

		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'get_current_screen' )->justReturn( $this->validScreen() );
		Functions\when( 'plugin_dir_path' )->justReturn( '/nonexistent/path/' );
		Functions\when( 'file_exists' )->justReturn( false );
		Functions\expect( 'wp_enqueue_script' )->never();

		AI_Post_Assistant::enqueue_editor_assets();
	}

	// =========================================================================
	// enqueue_editor_assets() – happy path
	// =========================================================================

	public function test_enqueues_script_and_localizes_nonce_for_valid_screen(): void {
		// Two Mockery ->once()->with() expectations below act as assertions;
		// tell PHPUnit so this test is not flagged as risky.
		$this->addToAssertionCount( 2 );

		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'get_current_screen' )->justReturn( $this->validScreen() );

		// Point plugin_dir_path to our fixture directory so the asset file exists.
		$fixture_dir = __DIR__ . '/fixtures/';
		Functions\when( 'plugin_dir_path' )->justReturn( $fixture_dir );
		Functions\when( 'plugin_dir_url' )->justReturn( 'https://example.com/wp-content/plugins/ai-post-assistant/' );

		Functions\when( 'file_exists' )->justReturn( true );
		Functions\when( 'wp_create_nonce' )->justReturn( 'test_nonce_abc123' );
		Functions\when( 'admin_url' )->justReturn( 'https://example.com/wp-admin/admin-ajax.php' );
		Functions\when( 'esc_url' )->returnArg();

		Functions\expect( 'wp_enqueue_script' )
			->once()
			->with(
				\Mockery::type( 'string' ),            // handle
				\Mockery::type( 'string' ),            // src URL
				\Mockery::type( 'array' ),             // dependencies
				\Mockery::any(),                       // version
				true                                   // in footer
			);

		Functions\expect( 'wp_localize_script' )
			->once()
			->with(
				\Mockery::type( 'string' ),  // handle
				'aiPostAssistantData',        // JS object name
				\Mockery::on( function ( $data ) {
					// Assert the localised object contains a nonce and ajaxUrl.
					return isset( $data['nonce'], $data['ajaxUrl'] )
					       && $data['nonce'] === 'test_nonce_abc123';
				} )
			);

		AI_Post_Assistant::enqueue_editor_assets();
	}
}
