import { useState, useEffect, useCallback } from '@wordpress/element';
import { Modal, Button, Spinner }           from '@wordpress/components';
import { useDispatch, useSelect }           from '@wordpress/data';
import { __ }                               from '@wordpress/i18n';
import {
	fetchAIResponse,
	sanitizeAIText,
	extractTextFromBlocks,
	writeToElement,
} from '../utils/aiHelper';

/** Maximum character lengths enforced before writing to the data store. */
const MAX_LENGTHS = { title: 65, excerpt: 500 };

/** Human-readable modal title per type. */
const MODAL_LABELS = {
	title:   'Sugestões de Título (SEO)',
	excerpt: 'Sugestões de Subtítulo',
};

/**
 * Floating modal that:
 *  1. Auto-starts generation as soon as it mounts (no manual "Gerar" button).
 *  2. Reads the current post's block content.
 *  3. Calls fetchAIResponse() and sanitizes every suggestion.
 *  4. Writes the selected suggestion to the post title or excerpt via wp.data.
 *
 * XSS note: All suggestion strings are rendered as React text nodes ({text}).
 * dangerouslySetInnerHTML is intentionally absent from this file.
 *
 * @param {{ type: 'title'|'excerpt', onClose: () => void }} props
 */
export default function SelectionModal( { type, onClose } ) {
	const [ suggestions, setSuggestions ]         = useState( [] );
	const [ isLoading, setIsLoading ]             = useState( true );  // start loading immediately
	const [ error, setError ]                     = useState( '' );
	const [ progressMessage, setProgressMessage ] = useState( '' );

	const { editPost } = useDispatch( 'core/editor' );
	const blocks       = useSelect(
		( select ) => select( 'core/block-editor' ).getBlocks(),
		[]
	);

	const maxLen = MAX_LENGTHS[ type ] ?? 500;

	// ------------------------------------------------------------------
	// Generation – called once on mount
	// ------------------------------------------------------------------

	const handleGenerate = useCallback( async () => {
		setIsLoading( true );
		setError( '' );
		setSuggestions( [] );
		setProgressMessage( '' );

		try {
			// Source is always the Gutenberg blocks. The CSS selector setting
			// controls where the result is written, not where it is read from.
			const contextText = extractTextFromBlocks( blocks );

			if ( ! contextText ) {
				throw new Error(
					__(
						'Nenhum parágrafo com texto suficiente foi encontrado.',
						'ai-post-assistant'
					)
				);
			}

			const raw = await fetchAIResponse( type, contextText, setProgressMessage );

			setSuggestions( raw.map( ( text ) => sanitizeAIText( text, maxLen ) ) );
		} catch ( err ) {
			setError(
				typeof err?.message === 'string' ? err.message : String( err )
			);
		} finally {
			setIsLoading( false );
			setProgressMessage( '' );
		}
	// blocks and maxLen come from the outer scope at mount time; the
	// empty-deps array is intentional – we want a single auto-run.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Auto-trigger generation the moment the modal opens.
	useEffect( () => {
		handleGenerate();
	}, [ handleGenerate ] );

	// ------------------------------------------------------------------
	// Selection
	// ------------------------------------------------------------------

	function handleSelect( text ) {
		const sanitized   = sanitizeAIText( text, maxLen );
		const settingKey  = type === 'title' ? 'selectorTitles' : 'selectorResumo';
		const rawSelector = ( window.aiPostAssistantData?.settings?.[ settingKey ] ?? '' ).trim();

		if ( rawSelector ) {
			// Write to the configured target element (e.g. an ACF field).
			writeToElement( rawSelector, sanitized );
		} else {
			// Default: write to the native WordPress title or excerpt field.
			const key = type === 'title' ? 'title' : 'excerpt';
			editPost( { [ key ]: sanitized } );
		}
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
			{ /* ── Loading state ── */ }
			{ isLoading && (
				<div className="ai-post-assistant__loading">
					<Spinner />
					<span>{ progressMessage || __( ' Gerando sugestões…', 'ai-post-assistant' ) }</span>
				</div>
			) }

			{ /* ── Error state ── */ }
			{ ! isLoading && error && (
				<>
					<p
						className="ai-post-assistant__error"
						role="alert"
					>
						{ error }
					</p>
					<Button
						variant="secondary"
						onClick={ handleGenerate }
						className="ai-post-assistant__retry-btn"
					>
						{ __( 'Tentar novamente', 'ai-post-assistant' ) }
					</Button>
				</>
			) }

			{ /* ── Suggestion list ── */ }
			{ ! isLoading && suggestions.length > 0 && (
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
