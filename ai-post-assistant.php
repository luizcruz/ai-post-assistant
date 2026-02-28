<?php
/**
 * Plugin Name:       AI Post Assistant
 * Plugin URI:        https://luizcruz.eng.br/ai-post-assistant
 * Description:       Adds AI-powered title and excerpt suggestion buttons to the Gutenberg editor.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      8.1
 * Author:            Luiz Cruz
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

	// Option keys stored in wp_options.
	private const OPT_SUMMARIZER_TYPE   = 'ai_pa_summarizer_type';
	private const OPT_SUMMARIZER_FORMAT = 'ai_pa_summarizer_format';
	private const OPT_SUMMARIZER_LENGTH = 'ai_pa_summarizer_length';
	private const OPT_SEO_PROMPT        = 'ai_pa_seo_prompt';

	/**
	 * Default SEO prompt sent to Chrome's LanguageModel API.
	 * Use {{context}} as the placeholder for the article text.
	 */
	private const DEFAULT_SEO_PROMPT =
		"Crie 3 títulos de até 65 caracteres usando verbos de ação e urgência para capturar o impacto do fato esportivo.\n" .
		"Varie entre um ângulo de análise tática, um de repercussão emocional e um de \"direto ao ponto\".\n" .
		"Retorne apenas os títulos, um por linha, sem numeração, aspas ou texto extra.\n\n" .
		"Contexto do texto:\n{{context}}";

	public static function init(): void {
		add_action( 'enqueue_block_editor_assets', [ self::class, 'enqueue_editor_assets' ] );
		add_action( 'admin_menu', [ self::class, 'add_settings_page' ] );
		add_action( 'admin_init', [ self::class, 'register_settings' ] );
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

		wp_localize_script(
			self::HANDLE,
			'aiPostAssistantData',
			[
				'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
				'ajaxUrl' => esc_url( admin_url( 'admin-ajax.php' ) ),
				'settings' => self::get_settings(),
			]
		);
	}

	/**
	 * Returns the current plugin settings as an associative array,
	 * using defaults when an option has never been saved.
	 *
	 * @return array<string, string>
	 */
	public static function get_settings(): array {
		return [
			'summarizerType'   => (string) get_option( self::OPT_SUMMARIZER_TYPE, 'tldr' ),
			'summarizerFormat' => (string) get_option( self::OPT_SUMMARIZER_FORMAT, 'plain-text' ),
			'summarizerLength' => (string) get_option( self::OPT_SUMMARIZER_LENGTH, 'short' ),
			'seoPrompt'        => (string) get_option( self::OPT_SEO_PROMPT, self::DEFAULT_SEO_PROMPT ),
		];
	}

	// -------------------------------------------------------------------------
	// Settings page
	// -------------------------------------------------------------------------

	/**
	 * Registers the plugin options page under "Configurações" in the admin menu.
	 */
	public static function add_settings_page(): void {
		add_options_page(
			__( 'AI Post Assistant – Configurações', 'ai-post-assistant' ),
			__( 'AI Post Assistant', 'ai-post-assistant' ),
			'manage_options',
			'ai-post-assistant',
			[ self::class, 'render_settings_page' ]
		);
	}

	/**
	 * Registers settings, sections and fields via the Settings API.
	 */
	public static function register_settings(): void {
		// ── Summarizer section ────────────────────────────────────────────────
		add_settings_section(
			'ai_pa_summarizer_section',
			__( 'Configurações do Resumo (Summarizer API)', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Define como a API Summarizer do Chrome gera o resumo base em inglês antes da tradução para português.',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting(
			'ai_post_assistant',
			self::OPT_SUMMARIZER_TYPE,
			[
				'type'              => 'string',
				'sanitize_callback' => [ self::class, 'sanitize_summarizer_type' ],
				'default'           => 'tldr',
			]
		);

		add_settings_field(
			self::OPT_SUMMARIZER_TYPE,
			__( 'Tipo de resumo', 'ai-post-assistant' ),
			[ self::class, 'render_summarizer_type_field' ],
			'ai-post-assistant',
			'ai_pa_summarizer_section'
		);

		register_setting(
			'ai_post_assistant',
			self::OPT_SUMMARIZER_FORMAT,
			[
				'type'              => 'string',
				'sanitize_callback' => [ self::class, 'sanitize_summarizer_format' ],
				'default'           => 'plain-text',
			]
		);

		add_settings_field(
			self::OPT_SUMMARIZER_FORMAT,
			__( 'Formato de saída', 'ai-post-assistant' ),
			[ self::class, 'render_summarizer_format_field' ],
			'ai-post-assistant',
			'ai_pa_summarizer_section'
		);

		register_setting(
			'ai_post_assistant',
			self::OPT_SUMMARIZER_LENGTH,
			[
				'type'              => 'string',
				'sanitize_callback' => [ self::class, 'sanitize_summarizer_length' ],
				'default'           => 'short',
			]
		);

		add_settings_field(
			self::OPT_SUMMARIZER_LENGTH,
			__( 'Comprimento do resumo', 'ai-post-assistant' ),
			[ self::class, 'render_summarizer_length_field' ],
			'ai-post-assistant',
			'ai_pa_summarizer_section'
		);

		// ── Títulos section ───────────────────────────────────────────────────
		add_settings_section(
			'ai_pa_titles_section',
			__( 'Configurações do Prompt de Títulos (LanguageModel API)', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Edite o prompt enviado ao modelo de linguagem para gerar sugestões de título. Use {{context}} como marcador do texto do artigo.',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting(
			'ai_post_assistant',
			self::OPT_SEO_PROMPT,
			[
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
				'default'           => self::DEFAULT_SEO_PROMPT,
			]
		);

		add_settings_field(
			self::OPT_SEO_PROMPT,
			__( 'Prompt SEO', 'ai-post-assistant' ),
			[ self::class, 'render_seo_prompt_field' ],
			'ai-post-assistant',
			'ai_pa_titles_section'
		);
	}

	// ── Field renderers ───────────────────────────────────────────────────────

	public static function render_summarizer_type_field(): void {
		$value   = (string) get_option( self::OPT_SUMMARIZER_TYPE, 'tldr' );
		$options = [
			'tldr'       => __( 'TL;DR – Resumo geral conciso', 'ai-post-assistant' ),
			'key-points' => __( 'Key-points – Lista de pontos principais', 'ai-post-assistant' ),
			'headline'   => __( 'Headline – Manchete de uma frase', 'ai-post-assistant' ),
		];
		self::render_select( self::OPT_SUMMARIZER_TYPE, $options, $value );
	}

	public static function render_summarizer_format_field(): void {
		$value   = (string) get_option( self::OPT_SUMMARIZER_FORMAT, 'plain-text' );
		$options = [
			'plain-text' => __( 'Texto simples', 'ai-post-assistant' ),
			'markdown'   => __( 'Markdown', 'ai-post-assistant' ),
		];
		self::render_select( self::OPT_SUMMARIZER_FORMAT, $options, $value );
	}

	public static function render_summarizer_length_field(): void {
		$value   = (string) get_option( self::OPT_SUMMARIZER_LENGTH, 'short' );
		$options = [
			'short'  => __( 'Curto', 'ai-post-assistant' ),
			'medium' => __( 'Médio', 'ai-post-assistant' ),
			'long'   => __( 'Longo', 'ai-post-assistant' ),
		];
		self::render_select( self::OPT_SUMMARIZER_LENGTH, $options, $value );
	}

	public static function render_seo_prompt_field(): void {
		$value = (string) get_option( self::OPT_SEO_PROMPT, self::DEFAULT_SEO_PROMPT );
		printf(
			'<textarea name="%s" id="%s" rows="8" cols="80" class="large-text code">%s</textarea>
			 <p class="description">%s</p>',
			esc_attr( self::OPT_SEO_PROMPT ),
			esc_attr( self::OPT_SEO_PROMPT ),
			esc_textarea( $value ),
			esc_html__(
				'Use {{context}} onde o texto do artigo deve ser inserido. O modelo receberá no máximo 4 000 caracteres.',
				'ai-post-assistant'
			)
		);
	}

	// ── Sanitizers ────────────────────────────────────────────────────────────

	public static function sanitize_summarizer_type( mixed $value ): string {
		$allowed = [ 'tldr', 'key-points', 'headline' ];
		return in_array( $value, $allowed, true ) ? (string) $value : 'tldr';
	}

	public static function sanitize_summarizer_format( mixed $value ): string {
		$allowed = [ 'plain-text', 'markdown' ];
		return in_array( $value, $allowed, true ) ? (string) $value : 'plain-text';
	}

	public static function sanitize_summarizer_length( mixed $value ): string {
		$allowed = [ 'short', 'medium', 'long' ];
		return in_array( $value, $allowed, true ) ? (string) $value : 'short';
	}

	// ── Page renderer ─────────────────────────────────────────────────────────

	public static function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form method="post" action="options.php">
				<?php
				settings_fields( 'ai_post_assistant' );
				do_settings_sections( 'ai-post-assistant' );
				submit_button( __( 'Salvar configurações', 'ai-post-assistant' ) );
				?>
			</form>
		</div>
		<?php
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	/**
	 * Renders an HTML <select> element for a settings field.
	 *
	 * @param string              $name    The option/field name (also used as id).
	 * @param array<string,string> $options Map of value => label.
	 * @param string              $current Currently saved value.
	 */
	private static function render_select( string $name, array $options, string $current ): void {
		printf( '<select name="%s" id="%s">', esc_attr( $name ), esc_attr( $name ) );
		foreach ( $options as $value => $label ) {
			printf(
				'<option value="%s"%s>%s</option>',
				esc_attr( $value ),
				selected( $current, $value, false ),
				esc_html( $label )
			);
		}
		echo '</select>';
	}

	// ── Screen guard ─────────────────────────────────────────────────────────

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
