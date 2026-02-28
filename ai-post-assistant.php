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

	// ── Option keys ───────────────────────────────────────────────────────────
	// Feature toggles (stored as '1' / '0')
	private const OPT_ENABLE_TITLES          = 'ai_pa_enable_titles';
	private const OPT_ENABLE_RESUMO          = 'ai_pa_enable_resumo';
	private const OPT_ENABLE_LINKS           = 'ai_pa_enable_links';
	// Summarizer (IA Resumo)
	private const OPT_SUMMARIZER_TYPE        = 'ai_pa_summarizer_type';
	private const OPT_SUMMARIZER_FORMAT      = 'ai_pa_summarizer_format';
	private const OPT_SUMMARIZER_LENGTH      = 'ai_pa_summarizer_length';
	// LanguageModel prompt (IA Títulos)
	private const OPT_SEO_PROMPT             = 'ai_pa_seo_prompt';
	// Link injector (IA Links)
	private const OPT_LINK_MAX_PER_KEYWORD   = 'ai_pa_link_max_per_keyword';
	private const OPT_LINK_MAP               = 'ai_pa_link_map';

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
	 * Enqueues the compiled JS bundle for the block editor and passes the
	 * current plugin settings to the script via wp_localize_script.
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
				'nonce'    => wp_create_nonce( self::NONCE_ACTION ),
				'ajaxUrl'  => esc_url( admin_url( 'admin-ajax.php' ) ),
				'settings' => self::get_settings(),
			]
		);
	}

	/**
	 * Returns all plugin settings as an associative array ready for
	 * wp_localize_script. Empty strings signal "use JS-side defaults".
	 *
	 * @return array<string, mixed>
	 */
	public static function get_settings(): array {
		return [
			// Feature toggles – true = active, false = hidden in the editor
			'enableTitles'      => '1' === get_option( self::OPT_ENABLE_TITLES, '1' ),
			'enableResumo'      => '1' === get_option( self::OPT_ENABLE_RESUMO, '1' ),
			'enableLinks'       => '1' === get_option( self::OPT_ENABLE_LINKS, '1' ),
			// Summarizer (IA Resumo)
			'summarizerType'    => (string) get_option( self::OPT_SUMMARIZER_TYPE, 'tldr' ),
			'summarizerFormat'  => (string) get_option( self::OPT_SUMMARIZER_FORMAT, 'plain-text' ),
			'summarizerLength'  => (string) get_option( self::OPT_SUMMARIZER_LENGTH, 'short' ),
			// LanguageModel prompt (IA Títulos)
			'seoPrompt'         => (string) get_option( self::OPT_SEO_PROMPT, self::DEFAULT_SEO_PROMPT ),
			// Link injector (IA Links)
			'linkMaxPerKeyword' => max( 1, (int) get_option( self::OPT_LINK_MAX_PER_KEYWORD, 2 ) ),
			'linkMap'           => (string) get_option( self::OPT_LINK_MAP, '' ),
		];
	}

	// ── Settings page ─────────────────────────────────────────────────────────

	public static function add_settings_page(): void {
		add_options_page(
			__( 'AI Post Assistant – Configurações', 'ai-post-assistant' ),
			__( 'AI Post Assistant', 'ai-post-assistant' ),
			'manage_options',
			'ai-post-assistant',
			[ self::class, 'render_settings_page' ]
		);
	}

	public static function register_settings(): void {

		// ── Recursos ativos ───────────────────────────────────────────────────
		add_settings_section(
			'ai_pa_features_section',
			__( 'Recursos ativos', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Ative ou desative cada recurso. Botões desativados não aparecem na barra lateral do editor.',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		foreach ( [
			self::OPT_ENABLE_TITLES => '✨ IA Títulos',
			self::OPT_ENABLE_RESUMO => '✨ IA Resumo',
			self::OPT_ENABLE_LINKS  => '✨ IA Links',
		] as $option => $label ) {
			register_setting( 'ai_post_assistant', $option, [
				'type'              => 'string',
				'sanitize_callback' => static fn( $v ) => '1' === (string) $v ? '1' : '0',
				'default'           => '1',
			] );
			add_settings_field(
				$option,
				esc_html( $label ),
				static function () use ( $option, $label ): void {
					AI_Post_Assistant::render_toggle_field( $option, $label );
				},
				'ai-post-assistant',
				'ai_pa_features_section'
			);
		}

		// ── IA Resumo – Summarizer ─────────────────────────────────────────────
		add_settings_section(
			'ai_pa_summarizer_section',
			__( 'IA Resumo – Summarizer API', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Define como a API Summarizer do Chrome gera o resumo base em inglês antes da tradução para português.',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting( 'ai_post_assistant', self::OPT_SUMMARIZER_TYPE, [
			'type'              => 'string',
			'sanitize_callback' => [ self::class, 'sanitize_summarizer_type' ],
			'default'           => 'tldr',
		] );
		add_settings_field( self::OPT_SUMMARIZER_TYPE, __( 'Tipo de resumo', 'ai-post-assistant' ),
			[ self::class, 'render_summarizer_type_field' ], 'ai-post-assistant', 'ai_pa_summarizer_section' );

		register_setting( 'ai_post_assistant', self::OPT_SUMMARIZER_FORMAT, [
			'type'              => 'string',
			'sanitize_callback' => [ self::class, 'sanitize_summarizer_format' ],
			'default'           => 'plain-text',
		] );
		add_settings_field( self::OPT_SUMMARIZER_FORMAT, __( 'Formato de saída', 'ai-post-assistant' ),
			[ self::class, 'render_summarizer_format_field' ], 'ai-post-assistant', 'ai_pa_summarizer_section' );

		register_setting( 'ai_post_assistant', self::OPT_SUMMARIZER_LENGTH, [
			'type'              => 'string',
			'sanitize_callback' => [ self::class, 'sanitize_summarizer_length' ],
			'default'           => 'short',
		] );
		add_settings_field( self::OPT_SUMMARIZER_LENGTH, __( 'Comprimento do resumo', 'ai-post-assistant' ),
			[ self::class, 'render_summarizer_length_field' ], 'ai-post-assistant', 'ai_pa_summarizer_section' );

		// ── IA Títulos – LanguageModel prompt ─────────────────────────────────
		add_settings_section(
			'ai_pa_titles_section',
			__( 'IA Títulos – Prompt (LanguageModel API)', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Edite o prompt enviado ao modelo de linguagem. Use {{context}} como marcador do texto do artigo (máx. 4 000 caracteres).',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting( 'ai_post_assistant', self::OPT_SEO_PROMPT, [
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_textarea_field',
			'default'           => self::DEFAULT_SEO_PROMPT,
		] );
		add_settings_field( self::OPT_SEO_PROMPT, __( 'Prompt SEO', 'ai-post-assistant' ),
			[ self::class, 'render_seo_prompt_field' ], 'ai-post-assistant', 'ai_pa_titles_section' );

		// ── IA Links ──────────────────────────────────────────────────────────
		add_settings_section(
			'ai_pa_links_section',
			__( 'IA Links – Inserção automática de links', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Configura o comportamento do botão IA Links no editor. A lista de palavras-chave é editável como JSON; deixe o campo vazio para usar a lista padrão do plugin.',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting( 'ai_post_assistant', self::OPT_LINK_MAX_PER_KEYWORD, [
			'type'              => 'integer',
			'sanitize_callback' => [ self::class, 'sanitize_link_max' ],
			'default'           => 2,
		] );
		add_settings_field( self::OPT_LINK_MAX_PER_KEYWORD,
			__( 'Máximo de links por palavra-chave', 'ai-post-assistant' ),
			[ self::class, 'render_link_max_field' ], 'ai-post-assistant', 'ai_pa_links_section' );

		register_setting( 'ai_post_assistant', self::OPT_LINK_MAP, [
			'type'              => 'string',
			'sanitize_callback' => [ self::class, 'sanitize_link_map' ],
			'default'           => '',
		] );
		add_settings_field( self::OPT_LINK_MAP,
			__( 'Lista de links (JSON)', 'ai-post-assistant' ),
			[ self::class, 'render_link_map_field' ], 'ai-post-assistant', 'ai_pa_links_section' );
	}

	// ── Field renderers ───────────────────────────────────────────────────────

	/**
	 * Renders a toggle switch (checkbox + hidden field) for a feature toggle.
	 * The hidden input ensures "0" is submitted when the checkbox is unchecked.
	 */
	public static function render_toggle_field( string $option, string $label ): void {
		$enabled = '1' === get_option( $option, '1' );
		printf(
			'<label class="ai-pa-toggle">
				<input type="hidden"   name="%1$s" value="0" />
				<input type="checkbox" name="%1$s" id="%1$s" value="1"%2$s />
				<span class="ai-pa-toggle__track"></span>
				<span class="ai-pa-toggle__label">%3$s</span>
			</label>',
			esc_attr( $option ),
			checked( $enabled, true, false ),
			esc_html( $enabled
				? __( 'Ativado', 'ai-post-assistant' )
				: __( 'Desativado', 'ai-post-assistant' )
			)
		);
	}

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
			'<textarea name="%1$s" id="%1$s" rows="8" cols="80" class="large-text code">%2$s</textarea>
			 <p class="description">%3$s</p>',
			esc_attr( self::OPT_SEO_PROMPT ),
			esc_textarea( $value ),
			esc_html__( 'Use {{context}} onde o texto do artigo será inserido.', 'ai-post-assistant' )
		);
	}

	public static function render_link_max_field(): void {
		$value = max( 1, (int) get_option( self::OPT_LINK_MAX_PER_KEYWORD, 2 ) );
		printf(
			'<input type="number" name="%1$s" id="%1$s" value="%2$d" min="1" max="10" class="small-text" />
			 <p class="description">%3$s</p>',
			esc_attr( self::OPT_LINK_MAX_PER_KEYWORD ),
			$value,
			esc_html__( 'Número máximo de vezes que a mesma palavra-chave pode ser linkada em um artigo (padrão: 2).', 'ai-post-assistant' )
		);
	}

	public static function render_link_map_field(): void {
		$value = (string) get_option( self::OPT_LINK_MAP, '' );
		$placeholder = '[ { "url": "https://lance.com.br/flamengo", "keywords": ["Flamengo"] }, ... ]';
		printf(
			'<textarea name="%1$s" id="%1$s" rows="16" cols="80" class="large-text code" placeholder="%2$s">%3$s</textarea>
			 <p class="description">%4$s<br>%5$s</p>',
			esc_attr( self::OPT_LINK_MAP ),
			esc_attr( $placeholder ),
			esc_textarea( $value ),
			esc_html__( 'Array JSON com objetos { "url": "...", "keywords": ["...", "..."] }. Cada keyword é um texto a buscar no artigo (case-insensitive).', 'ai-post-assistant' ),
			esc_html__( 'Deixe vazio para usar a lista padrão do plugin.', 'ai-post-assistant' )
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

	public static function sanitize_link_max( mixed $value ): int {
		$int = (int) $value;
		return ( $int >= 1 && $int <= 10 ) ? $int : 2;
	}

	/**
	 * Validates that the submitted value is either empty or a valid JSON array
	 * of objects with "url" (string) and "keywords" (array of strings).
	 * Returns empty string on any validation failure to preserve the last
	 * known-good value shown to the user via settings_errors().
	 */
	public static function sanitize_link_map( mixed $value ): string {
		$raw = sanitize_textarea_field( (string) $value );

		if ( '' === trim( $raw ) ) {
			return '';
		}

		$decoded = json_decode( $raw, true );

		if ( ! is_array( $decoded ) || empty( $decoded ) ) {
			add_settings_error(
				self::OPT_LINK_MAP,
				'invalid_json',
				__( 'Lista de links: JSON inválido. Verifique a sintaxe e tente novamente.', 'ai-post-assistant' )
			);
			return get_option( self::OPT_LINK_MAP, '' );
		}

		foreach ( $decoded as $entry ) {
			if (
				! is_array( $entry ) ||
				empty( $entry['url'] ) || ! is_string( $entry['url'] ) ||
				empty( $entry['keywords'] ) || ! is_array( $entry['keywords'] )
			) {
				add_settings_error(
					self::OPT_LINK_MAP,
					'invalid_structure',
					__( 'Lista de links: cada entrada deve ter "url" (string) e "keywords" (array).', 'ai-post-assistant' )
				);
				return get_option( self::OPT_LINK_MAP, '' );
			}
		}

		// Re-encode to normalise whitespace stored in the DB.
		return (string) wp_json_encode( $decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	}

	// ── Page renderer ─────────────────────────────────────────────────────────

	public static function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<style>
			.ai-pa-toggle { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
			.ai-pa-toggle input[type="checkbox"] { display: none; }
			.ai-pa-toggle__track {
				position: relative; width: 44px; height: 24px;
				background: #c3c4c7; border-radius: 12px; transition: background .2s;
			}
			.ai-pa-toggle__track::after {
				content: ''; position: absolute; top: 3px; left: 3px;
				width: 18px; height: 18px; border-radius: 50%;
				background: #fff; transition: transform .2s;
			}
			.ai-pa-toggle input:checked ~ .ai-pa-toggle__track { background: #2271b1; }
			.ai-pa-toggle input:checked ~ .ai-pa-toggle__track::after { transform: translateX(20px); }
			.ai-pa-toggle__label { font-weight: 600; color: #50575e; }
			.ai-pa-toggle input:checked ~ .ai-pa-toggle__track + .ai-pa-toggle__label { color: #2271b1; }
		</style>
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

	// ── Screen guard ──────────────────────────────────────────────────────────

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
