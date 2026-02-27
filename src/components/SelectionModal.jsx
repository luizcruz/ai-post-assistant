import { useState }            from '@wordpress/element';
import { Modal, Button, Spinner } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { __ }                     from '@wordpress/i18n';
import {
	fetchAIResponse,
	sanitizeAIText,
	extractTextFromBlocks,
} from '../utils/aiHelper';

/** Maximum character lengths enforced before writing to the data store. */
const MAX_LENGTHS = { title: 65, excerpt: 500 };

/** Human-readable modal title per type. */
const MODAL_LABELS = {
	title:   'Sugestões de Título (SEO)',
	excerpt: 'Sugestões de Resumo',
};

/**
 * Floating modal that:
 *  1. Reads the current post's block content.
 *  2. Calls fetchAIResponse() (placeholder – user inserts native AI API here).
 *  3. Sanitizes every suggestion before rendering or saving.
 *  4. Writes the selected suggestion to the post title or excerpt via wp.data.
 *
 * XSS note: All suggestion strings are rendered as React text nodes ({text}).
 * React never calls innerHTML for these, so no script tags can be injected.
 * dangerouslySetInnerHTML is intentionally absent from this file.
 *
 * @param {{ type: 'title'|'excerpt', onClose: () => void }} props
 */
export default function SelectionModal( { type, onClose } ) {
	const [ suggestions, setSuggestions ]       = useState( [] );
	const [ isLoading, setIsLoading ]           = useState( false );
	const [ error, setError ]                   = useState( '' );
	const [ progressMessage, setProgressMessage ] = useState( '' );

	const { editPost } = useDispatch( 'core/editor' );
	const blocks       = useSelect(
		( select ) => select( 'core/block-editor' ).getBlocks(),
		[]
	);

	const maxLen = MAX_LENGTHS[ type ] ?? 500;

	// ------------------------------------------------------------------
	// Handlers
	// ------------------------------------------------------------------

	async function handleGenerate() {
		setIsLoading( true );
		setError( '' );
		setSuggestions( [] );
		setProgressMessage( '' );

		try {
			const contextText = extractTextFromBlocks( blocks );

			if ( ! contextText ) {
				throw new Error(
					__(
						'Nenhum parágrafo com texto suficiente foi encontrado.',
						'ai-post-assistant'
					)
				);
			}

			// onProgress is forwarded to the Translator's downloadprogress event
			// (excerpt pipeline only). Titles ignore it.
			const raw = await fetchAIResponse( type, contextText, setProgressMessage );

			// Sanitize every string returned by the AI before storing in state.
			setSuggestions( raw.map( ( text ) => sanitizeAIText( text, maxLen ) ) );
		} catch ( err ) {
			// err.message is a plain string produced by our own code or the AI
			// API; treat it as untrusted and render as a text node only.
			setError(
				typeof err?.message === 'string' ? err.message : String( err )
			);
		} finally {
			setIsLoading( false );
			setProgressMessage( '' );
		}
	}

	function handleSelect( text ) {
		const key = type === 'title' ? 'title' : 'excerpt';

		// Defence-in-depth: re-sanitize on selection even though state was
		// already sanitized on generation, to guard against any future state
		// manipulation bugs.
		editPost( { [ key ]: sanitizeAIText( text, maxLen ) } );
		onClose();
	}

	// ------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------

	return (
		<Modal
			title={ __( MODAL_LABELS[ type ], 'ai-post-assistant' ) }
			onRequestClose={ onClose }
			className="ai-post-assistant__modal"
		>
			{ /* ── Generate button ── */ }
			<Button
				variant="primary"
				onClick={ handleGenerate }
				disabled={ isLoading }
				className="ai-post-assistant__generate-btn"
			>
				{ isLoading ? (
					<>
						<Spinner />
						{ progressMessage || __( ' Gerando…', 'ai-post-assistant' ) }
					</>
				) : (
					__( 'Gerar Sugestões', 'ai-post-assistant' )
				) }
			</Button>

			{ /* ── Error message – plain text node, never raw HTML ── */ }
			{ error && (
				<p
					className="ai-post-assistant__error"
					role="alert"
				>
					{ error }
				</p>
			) }

			{ /* ── Suggestion list ──
			     React renders {text} as a text node; no innerHTML path exists.
			     If the AI hallucinated <script>…</script>, it is displayed as
			     literal characters, not executed.
			── */ }
			{ suggestions.length > 0 && (
				<ul className="ai-post-assistant__suggestions">
					{ suggestions.map( ( text, index ) => (
						<li key={ index }>
							<Button
								variant="secondary"
								onClick={ () => handleSelect( text ) }
								className="ai-post-assistant__suggestion-btn"
							>
								{ text }
							</Button>
						</li>
					) ) }
				</ul>
			) }
		</Modal>
	);
}
