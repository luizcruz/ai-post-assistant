/* global LanguageModel, Summarizer, Translator */
// The three identifiers above are Chrome's experimental on-device AI APIs.
// @types declaration, so we declare them here to silence the
// TypeScript language server and ESLint's no-undef rule.

// =============================================================================
// Settings – read once from the PHP-localized global
// =============================================================================

/**
 * Plugin settings injected by wp_localize_script into window.aiPostAssistantData.
 * Falls back to safe defaults so the plugin works even without saved options.
 *
 * @type {{ summarizerType: string, summarizerFormat: string, summarizerLength: string, seoPrompt: string }}
 */
const SETTINGS = window.aiPostAssistantData?.settings ?? {};

const DEFAULT_SEO_PROMPT =
	'Crie 3 títulos de até 65 caracteres usando verbos de ação e urgência para capturar o impacto do fato esportivo.\n' +
	'Varie entre um ângulo de análise tática, um de repercussão emocional e um de "direto ao ponto".\n' +
	'Retorne apenas os títulos, um por linha, sem numeração, aspas ou texto extra.\n\n' +
	'Contexto do texto:\n{{context}}';

const DEFAULT_TAGS_PROMPT =
	"Act as a semantic extractor. Identify the document's main vector theme, then find 5 phrases from within the text that have the highest similarity to that theme. Format: tag1, tag2, tag3....\n\n" +
	'Text:\n{{context}}';

// Used only by the OpenAI fallback for the excerpt pipeline (Summarizer + Translator replaced).
const DEFAULT_EXCERPT_FALLBACK_PROMPT =
	'Escreva um resumo conciso em português deste artigo (máximo 150 palavras), adequado como descrição editorial.\n' +
	'Retorne apenas o texto do resumo, sem títulos, marcadores ou qualquer texto extra.\n\n' +
	'Artigo:\n{{context}}';

// =============================================================================
// callOpenAIFallback – WordPress AJAX proxy to OpenAI Chat Completions
// =============================================================================

/**
 * Sends a prompt to the WordPress AJAX endpoint (admin-ajax.php), which
 * forwards it to the OpenAI Chat Completions API server-side.
 * The OpenAI API key is stored in WordPress options and never reaches the browser.
 *
 * @param { string } prompt  Full prompt text (system + context already embedded).
 * @returns { Promise<string> }  Raw text content from the OpenAI response.
 */
async function callOpenAIFallback( prompt ) {
	const { ajaxUrl, nonce } = window.aiPostAssistantData ?? {};

	const body = new URLSearchParams( {
		action: 'ai_pa_openai',
		nonce:  nonce ?? '',
		prompt,
	} );

	const res = await fetch( ajaxUrl, {
		method:  'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	} );

	if ( ! res.ok ) {
		throw new Error( `Erro HTTP ${ res.status } ao chamar o fallback OpenAI.` );
	}

	const data = await res.json();

	if ( ! data.success ) {
		throw new Error( data.data ?? 'Erro no fallback OpenAI.' );
	}

	return String( data.data?.text ?? '' );
}

// =============================================================================
// fetchAIResponse – Chrome on-device AI (LanguageModel / Summarizer / Translator)
//                   with OpenAI fallback when Chrome APIs are unavailable
// =============================================================================

/**
 * Dispatches to the correct Chrome AI pipeline based on promptType.
 *
 * - 'title'   → Chrome LanguageModel API  (mirrors titulos.js)
 *               Returns an array of up to 3 SEO title strings.
 *
 * - 'excerpt' → Chrome Summarizer + Translator APIs  (mirrors resumo.js)
 *               Returns a 1-element array with the PT-BR summary.
 *               The Translator may need to download its language pack on first
 *               use; pass onProgress to surface that to the UI.
 *
 * Requires Chrome ≥ 127 with the on-device AI origin trial / flags enabled:
 *   chrome://flags/#optimization-guide-on-device-model
 *   chrome://flags/#prompt-api-for-gemini-nano
 *   chrome://flags/#summarization-api-for-gemini-nano
 *   chrome://flags/#translation-api-without-language-pack-limit
 *
 * @param { 'title' | 'excerpt' } promptType
 * @param { string }              contextText  Plain-text post content.
 * @param { ((msg: string) => void) | null } onProgress
 *        Called with human-readable progress messages (e.g. translation download %).
 *        Only fires for the 'excerpt' pipeline.
 * @returns { Promise<string[]> }
 */
export async function fetchAIResponse( promptType, contextText, onProgress = null ) {
	if ( promptType === 'title' ) {
		return fetchTitleSuggestions( contextText );
	}
	if ( promptType === 'excerpt' ) {
		return fetchExcerptSuggestion( contextText, onProgress );
	}
	if ( promptType === 'tags' ) {
		return fetchTagSuggestions( contextText );
	}
	throw new Error( `Tipo de prompt desconhecido: ${ promptType }` );
}

// -----------------------------------------------------------------------------
// Title pipeline – based on titulos.js
// -----------------------------------------------------------------------------

/**
 * Uses Chrome's LanguageModel API to generate 3 SEO titles in Portuguese.
 *
 * The prompt template is read from the plugin settings (saved via the
 * WordPress settings page). If no custom prompt is saved, the default is used.
 * The placeholder {{context}} in the template is replaced with the article text,
 * capped at 4 000 characters.
 *
 * Key decisions preserved from titulos.js:
 *  - LanguageModel.create() is called WITHOUT a languageCode option to avoid
 *    the NotAllowedError that occurs when forcing 'pt' on some Chrome builds.
 *  - The response is split on newlines and each line is cleaned with the same
 *    regex used in titulos.js: strip leading numbering/bullets and quotes.
 *
 * @param { string } contextText
 * @returns { Promise<string[]> }  Up to 3 title strings.
 */
async function fetchTitleSuggestions( contextText ) {
	const promptTemplate = SETTINGS.seoPrompt || DEFAULT_SEO_PROMPT;
	const seoPrompt = promptTemplate.replace( '{{context}}', contextText.substring( 0, 4000 ) );

	let responseText;

	// Try Chrome LanguageModel first; fall back to OpenAI if unavailable or failing.
	// Deliberately no { languageCode } option – see titulos.js line 26.
	if ( typeof LanguageModel !== 'undefined' ) {
		try {
			const session = await LanguageModel.create();
			const response = await session.prompt( [
				{ role: 'user', content: [ { type: 'text', value: seoPrompt } ] },
			] );
			responseText = typeof response === 'string' ? response : String( response );
		} catch ( chromeErr ) {
			if ( ! SETTINGS.enableOpenAIFallback ) throw chromeErr;
			responseText = await callOpenAIFallback( seoPrompt );
		}
	} else if ( SETTINGS.enableOpenAIFallback ) {
		responseText = await callOpenAIFallback( seoPrompt );
	} else {
		throw new Error( 'Chrome LanguageModel API não disponível. Ative o fallback OpenAI nas configurações do plugin.' );
	}

	return responseText
		.split( '\n' )
		.map( ( line ) =>
			line
				.replace( /^[\d.\-*]\s*/, '' )  // strip leading "1. " / "- " / "* "
				.replace( /["']/g, '' )          // strip quotes
				.trim()
		)
		.filter( ( line ) => line.length > 0 )
		.slice( 0, 3 );
}

// -----------------------------------------------------------------------------
// Excerpt pipeline – based on resumo.js
// -----------------------------------------------------------------------------

/**
 * Uses Chrome's Summarizer API (EN) + Translator API (EN→PT) to produce a
 * Portuguese summary of the post content.
 *
 * The Summarizer options (type, format, length) are read from the plugin
 * settings page. Defaults match the original resumo.js behaviour.
 *
 * Pipeline:
 *  1. Summarizer.create({ type, format, length, expectedOutputLanguage:'en' })
 *  2. summarizer.summarize(text, { context: '...' })
 *  3. Translator.create({ sourceLanguage:'en', targetLanguage:'pt', monitor })
 *     - monitor fires downloadprogress events forwarded to onProgress().
 *  4. translator.translate(summaryEn)
 *
 * Returns a 1-element array so SelectionModal renders a single "Apply" button.
 *
 * @param { string } contextText
 * @param { ((msg: string) => void) | null } onProgress
 * @returns { Promise<string[]> }
 */
async function fetchExcerptSuggestion( contextText, onProgress ) {
	// Try Chrome Summarizer + Translator first; fall back to OpenAI if unavailable.
	if ( typeof Summarizer !== 'undefined' ) {
		try {
			const summarizer = await Summarizer.create( {
				type:                   SETTINGS.summarizerType   || 'tldr',
				format:                 SETTINGS.summarizerFormat || 'plain-text',
				length:                 SETTINGS.summarizerLength || 'short',
				expectedOutputLanguage: 'en',
			} );

			const summaryEn = await summarizer.summarize( contextText, {
				context: 'This article is intended for a general audience.',
			} );

			const translator = await Translator.create( {
				sourceLanguage: 'en',
				targetLanguage: 'pt',
				monitor( m ) {
					m.addEventListener( 'downloadprogress', ( e ) => {
						const percent = ( ( e.loaded / e.total ) * 100 ).toFixed( 0 );
						onProgress?.( `Baixando pacote de tradução pela primeira vez (${ percent }%)…` );
					} );
				},
			} );

			const summaryPt = await translator.translate( summaryEn );
			return [ summaryPt ];
		} catch ( chromeErr ) {
			if ( ! SETTINGS.enableOpenAIFallback ) throw chromeErr;
			// Fall through to OpenAI fallback below.
		}
	} else if ( ! SETTINGS.enableOpenAIFallback ) {
		throw new Error( 'Chrome Summarizer API não disponível. Ative o fallback OpenAI nas configurações do plugin.' );
	}

	// OpenAI fallback: single prompt produces a Portuguese summary directly.
	const prompt = DEFAULT_EXCERPT_FALLBACK_PROMPT.replace( '{{context}}', contextText.substring( 0, 4000 ) );
	const text   = await callOpenAIFallback( prompt );
	return [ text ];
}

// -----------------------------------------------------------------------------
// Tags pipeline – text mining via LanguageModel
// -----------------------------------------------------------------------------

/**
 * Uses Chrome's LanguageModel API to extract 3 relevant tag suggestions
 * from the post content via text mining.
 *
 * The model is instructed to identify the most meaningful terms present
 * in the article (teams, competitions, athletes, sports concepts) and
 * return them as short tag names ready for WordPress taxonomy.
 *
 * @param { string } contextText
 * @returns { Promise<string[]> }  Up to 3 tag name strings.
 */
async function fetchTagSuggestions( contextText ) {
	const promptTemplate = SETTINGS.tagsPrompt || DEFAULT_TAGS_PROMPT;
	const prompt = promptTemplate.replace( '{{context}}', contextText.substring( 0, 3000 ) );

	let responseText;

	// Try Chrome LanguageModel first; fall back to OpenAI if unavailable or failing.
	if ( typeof LanguageModel !== 'undefined' ) {
		try {
			const session = await LanguageModel.create();
			const response = await session.prompt( [
				{ role: 'user', content: [ { type: 'text', value: prompt } ] },
			] );
			responseText = typeof response === 'string' ? response : String( response );
		} catch ( chromeErr ) {
			if ( ! SETTINGS.enableOpenAIFallback ) throw chromeErr;
			responseText = await callOpenAIFallback( prompt );
		}
	} else if ( SETTINGS.enableOpenAIFallback ) {
		responseText = await callOpenAIFallback( prompt );
	} else {
		throw new Error( 'Chrome LanguageModel API não disponível. Ative o fallback OpenAI nas configurações do plugin.' );
	}

	// The prompt requests comma-separated output; normalise newlines to commas
	// so the parser works even if the model adds line breaks between items.
	return responseText
		.replace( /\n/g, ',' )
		.split( ',' )
		.map( ( tag ) =>
			tag
				.replace( /^[\d.\-*]\s*/, '' )  // strip leading "1. " / "- " / "* "
				.replace( /["']/g, '' )          // strip quotes
				.trim()
		)
		.filter( ( tag ) => tag.length > 0 )
		.slice( 0, 5 );
}

// =============================================================================
// sanitizeAIText – defence-in-depth against malformed / adversarial AI output
// =============================================================================

/**
 * Strips HTML tags and control characters from AI output and enforces a
 * maximum length before the value is written to the WordPress data store.
 *
 * Why this is necessary:
 *  - The AI may hallucinate HTML/script tags if the source article contained
 *    them (prompt-injection through post content).
 *  - React already escapes text nodes automatically, but this function acts
 *    as an additional layer so the string stored in the post is also clean.
 *
 * @param { unknown } text       Raw value from the AI.
 * @param { number }  maxLength  Hard cap on output length (default 500).
 * @returns { string }
 */
export function sanitizeAIText( text, maxLength = 500 ) {
	if ( typeof text !== 'string' ) {
		return '';
	}

	return text
		.replace( /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '' )  // strip <script>…</script> blocks (content included)
		.replace( /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '' )     // strip <style>…</style> blocks (content included)
		.replace( /<[^>]*>/g, '' )                  // strip remaining HTML / XML tags
		.replace( /[\u0000-\u001F\u007F]/g, ' ' )   // replace control chars
		.replace( /\s+/g, ' ' )                      // collapse whitespace
		.trim()
		.slice( 0, maxLength );
}

// =============================================================================
// extractTextFromBlocks – reads block data from the Gutenberg store
// =============================================================================

/**
 * Converts Gutenberg block objects into a plain-text string suitable for
 * passing to the AI as context.
 *
 * Only `core/paragraph` blocks are used. Each block's `content` attribute is
 * an HTML string (e.g. "Hello <strong>world</strong>"), so we strip the tags
 * via a temporary DOM node before joining. Short paragraphs (≤ 5 words) are
 * excluded to avoid padding the prompt with navigation text or captions.
 *
 * @param { Object[] } blocks  Array from wp.data.select('core/block-editor').getBlocks()
 * @returns { string }
 */
export function extractTextFromBlocks( blocks ) {
	if ( ! Array.isArray( blocks ) ) {
		return '';
	}

	// Reuse a single container to avoid thrashing the GC.
	const container = document.createElement( 'div' );

	return blocks
		.filter( ( block ) => block.name === 'core/paragraph' )
		.map( ( block ) => {
			// block.attributes.content is trusted editor HTML, not AI output.
			container.innerHTML = block.attributes?.content ?? '';
			return ( container.textContent ?? '' ).trim();
		} )
		.filter( ( text ) => text.split( /\s+/ ).filter( Boolean ).length > 5 )
		.join( '\n\n' );
}
