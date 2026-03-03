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
	private const OPT_ENABLE_TAGS            = 'ai_pa_enable_tags';
	// Summarizer (IA Resumo)
	private const OPT_SUMMARIZER_TYPE        = 'ai_pa_summarizer_type';
	private const OPT_SUMMARIZER_FORMAT      = 'ai_pa_summarizer_format';
	private const OPT_SUMMARIZER_LENGTH      = 'ai_pa_summarizer_length';
	// LanguageModel prompt (IA Títulos)
	private const OPT_SEO_PROMPT             = 'ai_pa_seo_prompt';
	// LanguageModel prompt (IA Tags)
	private const OPT_TAGS_PROMPT            = 'ai_pa_tags_prompt';
	// Link injector (IA Links)
	private const OPT_LINK_MAX_PER_KEYWORD   = 'ai_pa_link_max_per_keyword';
	private const OPT_LINK_MAP               = 'ai_pa_link_map';
	// OpenAI fallback
	private const OPT_ENABLE_OPENAI_FALLBACK = 'ai_pa_enable_openai_fallback';
	private const OPT_OPENAI_API_KEY         = 'ai_pa_openai_api_key';
	private const OPT_OPENAI_MODEL           = 'ai_pa_openai_model';
	private const AJAX_ACTION                = 'ai_pa_openai';

	/**
	 * Default SEO prompt sent to Chrome's LanguageModel API.
	 * Use {{context}} as the placeholder for the article text.
	 */
	private const DEFAULT_SEO_PROMPT =
		"Crie 3 títulos de até 65 caracteres usando verbos de ação e urgência para capturar o impacto do fato esportivo.\n" .
		"Varie entre um ângulo de análise tática, um de repercussão emocional e um de \"direto ao ponto\".\n" .
		"Retorne apenas os títulos, um por linha, sem numeração, aspas ou texto extra.\n\n" .
		"Contexto do texto:\n{{context}}";

	/**
	 * Default tags prompt sent to Chrome's LanguageModel API.
	 * Use {{context}} as the placeholder for the article text.
	 */
	private const DEFAULT_TAGS_PROMPT =
		"Act as a semantic extractor. Identify the document's main vector theme, then find 5 phrases from within the text that have the highest similarity to that theme. Format: tag1, tag2, tag3....\n\n" .
		"Text:\n{{context}}";

	public static function init(): void {
		add_action( 'enqueue_block_editor_assets', [ self::class, 'enqueue_editor_assets' ] );
		add_action( 'admin_menu', [ self::class, 'add_settings_page' ] );
		add_action( 'admin_init', [ self::class, 'register_settings' ] );
		add_action( 'wp_ajax_' . self::AJAX_ACTION, [ self::class, 'handle_openai_request' ] );
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
			'enableLinks'       => '1' === get_option( self::OPT_ENABLE_LINKS,  '1' ),
			'enableTags'        => '1' === get_option( self::OPT_ENABLE_TAGS,   '1' ),
			// Summarizer (IA Resumo)
			'summarizerType'    => (string) get_option( self::OPT_SUMMARIZER_TYPE, 'tldr' ),
			'summarizerFormat'  => (string) get_option( self::OPT_SUMMARIZER_FORMAT, 'plain-text' ),
			'summarizerLength'  => (string) get_option( self::OPT_SUMMARIZER_LENGTH, 'short' ),
			// LanguageModel prompt (IA Títulos)
			'seoPrompt'         => (string) get_option( self::OPT_SEO_PROMPT, self::DEFAULT_SEO_PROMPT ),
			// LanguageModel prompt (IA Tags)
			'tagsPrompt'        => (string) get_option( self::OPT_TAGS_PROMPT, self::DEFAULT_TAGS_PROMPT ),
			// Link injector (IA Links)
			'linkMaxPerKeyword'    => max( 1, (int) get_option( self::OPT_LINK_MAX_PER_KEYWORD, 2 ) ),
			'linkMap'              => (string) get_option( self::OPT_LINK_MAP, '' ),
			// OpenAI fallback – API key is intentionally NOT exposed to the browser
			'enableOpenAIFallback' => '1' === get_option( self::OPT_ENABLE_OPENAI_FALLBACK, '0' ),
			'openAIModel'          => (string) get_option( self::OPT_OPENAI_MODEL, 'gpt-4o-mini' ),
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
			self::OPT_ENABLE_TAGS   => '✨ IA Tags',
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
				echo '<span class="ai-pa-ctrl" data-by="' . esc_attr( self::OPT_ENABLE_RESUMO ) . '"></span>';
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
				echo '<span class="ai-pa-ctrl" data-by="' . esc_attr( self::OPT_ENABLE_TITLES ) . '"></span>';
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

		// ── IA Tags – LanguageModel prompt ────────────────────────────────────
		add_settings_section(
			'ai_pa_tags_section',
			__( 'IA Tags – Prompt (LanguageModel API)', 'ai-post-assistant' ),
			static function (): void {
				echo '<span class="ai-pa-ctrl" data-by="' . esc_attr( self::OPT_ENABLE_TAGS ) . '"></span>';
				echo '<p>' . esc_html__(
					'Edite o prompt enviado ao modelo de linguagem para geração de tags. Use {{context}} como marcador do texto do artigo (máx. 3 000 caracteres).',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting( 'ai_post_assistant', self::OPT_TAGS_PROMPT, [
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_textarea_field',
			'default'           => self::DEFAULT_TAGS_PROMPT,
		] );
		add_settings_field( self::OPT_TAGS_PROMPT, __( 'Prompt Tags', 'ai-post-assistant' ),
			[ self::class, 'render_tags_prompt_field' ], 'ai-post-assistant', 'ai_pa_tags_section' );

		// ── IA Links ──────────────────────────────────────────────────────────
		add_settings_section(
			'ai_pa_links_section',
			__( 'IA Links – Inserção automática de links', 'ai-post-assistant' ),
			static function (): void {
				echo '<span class="ai-pa-ctrl" data-by="' . esc_attr( self::OPT_ENABLE_LINKS ) . '"></span>';
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

		// ── OpenAI fallback ────────────────────────────────────────────────────
		add_settings_section(
			'ai_pa_openai_section',
			__( 'Fallback OpenAI – quando os modelos do Chrome não estiverem disponíveis', 'ai-post-assistant' ),
			static function (): void {
				echo '<p>' . esc_html__(
					'Quando ativado, o plugin tenta usar a API da OpenAI caso as APIs on-device do Chrome (LanguageModel / Summarizer / Translator) não estejam disponíveis ou falhem. A chave de API é armazenada no servidor e nunca é enviada ao navegador.',
					'ai-post-assistant'
				) . '</p>';
			},
			'ai-post-assistant'
		);

		register_setting( 'ai_post_assistant', self::OPT_ENABLE_OPENAI_FALLBACK, [
			'type'              => 'string',
			'sanitize_callback' => static fn( $v ) => '1' === (string) $v ? '1' : '0',
			'default'           => '0',
		] );
		add_settings_field(
			self::OPT_ENABLE_OPENAI_FALLBACK,
			__( '✨ Fallback OpenAI', 'ai-post-assistant' ),
			static function (): void {
				AI_Post_Assistant::render_toggle_field( self::OPT_ENABLE_OPENAI_FALLBACK, 'Fallback OpenAI' );
			},
			'ai-post-assistant',
			'ai_pa_openai_section'
		);

		register_setting( 'ai_post_assistant', self::OPT_OPENAI_API_KEY, [
			'type'              => 'string',
			'sanitize_callback' => [ self::class, 'sanitize_openai_api_key' ],
			'default'           => '',
		] );
		add_settings_field( self::OPT_OPENAI_API_KEY,
			__( 'Chave de API (OpenAI)', 'ai-post-assistant' ),
			[ self::class, 'render_openai_api_key_field' ], 'ai-post-assistant', 'ai_pa_openai_section' );

		register_setting( 'ai_post_assistant', self::OPT_OPENAI_MODEL, [
			'type'              => 'string',
			'sanitize_callback' => [ self::class, 'sanitize_openai_model' ],
			'default'           => 'gpt-4o-mini',
		] );
		add_settings_field( self::OPT_OPENAI_MODEL,
			__( 'Modelo OpenAI', 'ai-post-assistant' ),
			[ self::class, 'render_openai_model_field' ], 'ai-post-assistant', 'ai_pa_openai_section' );
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

	public static function render_tags_prompt_field(): void {
		$value = (string) get_option( self::OPT_TAGS_PROMPT, self::DEFAULT_TAGS_PROMPT );
		printf(
			'<textarea name="%1$s" id="%1$s" rows="6" cols="80" class="large-text code">%2$s</textarea>
			 <p class="description">%3$s</p>',
			esc_attr( self::OPT_TAGS_PROMPT ),
			esc_textarea( $value ),
			esc_html__( 'Use {{context}} onde o texto do artigo será inserido. O modelo deve retornar as tags separadas por vírgula.', 'ai-post-assistant' )
		);
	}

	public static function render_link_max_field(): void {
		$value = max( 1, absint( get_option( self::OPT_LINK_MAX_PER_KEYWORD, 2 ) ) );
		printf(
			'<input type="number" name="%1$s" id="%1$s" value="%2$d" min="1" max="10" class="small-text" />
			 <p class="description">%3$s</p>',
			esc_attr( self::OPT_LINK_MAX_PER_KEYWORD ),
			absint( $value ),
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

	public static function render_openai_api_key_field(): void {
		$has_key = '' !== (string) get_option( self::OPT_OPENAI_API_KEY, '' );
		$placeholder = $has_key
			? __( '(chave salva – deixe em branco para manter)', 'ai-post-assistant' )
			: 'sk-...';
		printf(
			'<input type="password" name="%1$s" id="%1$s" value="" autocomplete="new-password" class="regular-text" placeholder="%2$s" />
			 <p class="description">%3$s</p>',
			esc_attr( self::OPT_OPENAI_API_KEY ),
			esc_attr( $placeholder ),
			esc_html__( 'Chave de API da OpenAI (começa com sk-). Armazenada no servidor, nunca enviada ao navegador.', 'ai-post-assistant' )
		);
	}

	public static function render_openai_model_field(): void {
		$value   = (string) get_option( self::OPT_OPENAI_MODEL, 'gpt-4o-mini' );
		$options = [
			'gpt-4o-mini' => 'GPT-4o Mini – rápido e econômico (recomendado)',
			'gpt-4o'      => 'GPT-4o – melhor qualidade',
			'gpt-3.5-turbo' => 'GPT-3.5 Turbo – legado',
		];
		self::render_select( self::OPT_OPENAI_MODEL, $options, $value );
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

	/**
	 * Preserves the existing key when the submitted field is empty (password
	 * field left blank on save). Validates that a new key starts with "sk-".
	 */
	public static function sanitize_openai_api_key( mixed $value ): string {
		$trimmed = trim( (string) $value );

		if ( '' === $trimmed ) {
			return (string) get_option( self::OPT_OPENAI_API_KEY, '' );
		}

		if ( ! str_starts_with( $trimmed, 'sk-' ) ) {
			add_settings_error(
				self::OPT_OPENAI_API_KEY,
				'invalid_key',
				__( 'Chave da OpenAI inválida. Deve começar com "sk-".', 'ai-post-assistant' )
			);
			return (string) get_option( self::OPT_OPENAI_API_KEY, '' );
		}

		return $trimmed;
	}

	public static function sanitize_openai_model( mixed $value ): string {
		$allowed = [ 'gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo' ];
		return in_array( $value, $allowed, true ) ? (string) $value : 'gpt-4o-mini';
	}

	// ── OpenAI AJAX handler ────────────────────────────────────────────────────

	/**
	 * WordPress AJAX handler: proxies a prompt to the OpenAI Chat Completions
	 * API server-side so the API key is never exposed to the browser.
	 *
	 * Requires: logged-in user with edit_posts capability + valid nonce.
	 */
	public static function handle_openai_request(): void {
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( __( 'Permissão negada.', 'ai-post-assistant' ), 403 );
		}

		if ( '1' !== get_option( self::OPT_ENABLE_OPENAI_FALLBACK, '0' ) ) {
			wp_send_json_error( __( 'Fallback OpenAI não está ativado.', 'ai-post-assistant' ), 400 );
		}

		$api_key = (string) get_option( self::OPT_OPENAI_API_KEY, '' );
		if ( '' === $api_key ) {
			wp_send_json_error( __( 'Chave de API da OpenAI não configurada nas opções do plugin.', 'ai-post-assistant' ), 400 );
		}

		$prompt = isset( $_POST['prompt'] )
			? sanitize_textarea_field( wp_unslash( $_POST['prompt'] ) )
			: '';
		if ( '' === $prompt ) {
			wp_send_json_error( __( 'Prompt vazio.', 'ai-post-assistant' ), 400 );
		}

		$model = self::sanitize_openai_model( get_option( self::OPT_OPENAI_MODEL, 'gpt-4o-mini' ) );

		$api_response = wp_remote_post(
			'https://api.openai.com/v1/chat/completions',
			[
				'headers' => [
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
				],
				'body'    => wp_json_encode( [
					'model'    => $model,
					'messages' => [
						[ 'role' => 'user', 'content' => $prompt ],
					],
				] ),
				'timeout' => 30,
			]
		);

		if ( is_wp_error( $api_response ) ) {
			wp_send_json_error( $api_response->get_error_message(), 502 );
		}

		$status = (int) wp_remote_retrieve_response_code( $api_response );
		$body   = json_decode( wp_remote_retrieve_body( $api_response ), true );

		if ( 200 !== $status ) {
			$message = is_array( $body ) && isset( $body['error']['message'] )
				? (string) $body['error']['message']
				/* translators: %d = HTTP status code from OpenAI */
				: sprintf( __( 'Erro da API OpenAI (HTTP %d).', 'ai-post-assistant' ), $status );
			wp_send_json_error( $message, $status );
		}

		$text = (string) ( $body['choices'][0]['message']['content'] ?? '' );
		wp_send_json_success( [ 'text' => $text ] );
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
		<script>
		( function () {
			// ── Toggle label update (Ativado / Desativado) ────────────────────
			document.querySelectorAll( '.ai-pa-toggle input[type="checkbox"]' ).forEach( function ( cb ) {
				var label = cb.closest( '.ai-pa-toggle' ).querySelector( '.ai-pa-toggle__label' );
				cb.addEventListener( 'change', function () {
					if ( label ) {
						label.textContent = cb.checked
							? '<?php echo esc_js( __( 'Ativado', 'ai-post-assistant' ) ); ?>'
							: '<?php echo esc_js( __( 'Desativado', 'ai-post-assistant' ) ); ?>';
					}
				} );
			} );

			// ── Section visibility: hide dependent sections when feature is off ──
			//
			// Each dependent section outputs a <span class="ai-pa-ctrl" data-by="OPTION_KEY">
			// as the first element of its section callback.  WordPress renders sections as
			// flat siblings (H2 → callback output → table), so we traverse siblings to collect
			// the full section group and toggle display together.
			document.querySelectorAll( '.ai-pa-ctrl' ).forEach( function ( marker ) {
				var optKey  = marker.getAttribute( 'data-by' );
				var toggle  = document.getElementById( optKey );
				if ( ! toggle ) return;

				var els = [];

				// Find the H2 that WordPress rendered just before the section callback.
				var prev = marker.previousElementSibling;
				while ( prev ) {
					if ( prev.tagName === 'H2' ) { els.push( prev ); break; }
					prev = prev.previousElementSibling;
				}

				// Collect the marker itself and every following sibling until the
				// next H2 or the form's submit row — those belong to the next section.
				var next = marker;
				while ( next ) {
					if ( next !== marker && ( next.tagName === 'H2' || next.classList.contains( 'submit' ) ) ) break;
					els.push( next );
					next = next.nextElementSibling;
				}

				function setVisible( show ) {
					els.forEach( function ( el ) { el.style.display = show ? '' : 'none'; } );
				}

				setVisible( toggle.checked );
				toggle.addEventListener( 'change', function () { setVisible( toggle.checked ); } );
			} );

			// ── OpenAI fallback: hide API-key + model rows when toggle is off ──
			var openaiToggle = document.getElementById( '<?php echo esc_js( self::OPT_ENABLE_OPENAI_FALLBACK ); ?>' );
			if ( openaiToggle ) {
				var keyInput   = document.getElementById( '<?php echo esc_js( self::OPT_OPENAI_API_KEY ); ?>' );
				var modelInput = document.getElementById( '<?php echo esc_js( self::OPT_OPENAI_MODEL ); ?>' );
				var openaiRows = [ keyInput, modelInput ]
					.filter( Boolean )
					.map( function ( el ) { return el.closest( 'tr' ); } )
					.filter( Boolean );

				function setOpenaiVisible( show ) {
					openaiRows.forEach( function ( row ) { row.style.display = show ? '' : 'none'; } );
				}

				setOpenaiVisible( openaiToggle.checked );
				openaiToggle.addEventListener( 'change', function () { setOpenaiVisible( openaiToggle.checked ); } );
			}
		}() );
		</script>
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
