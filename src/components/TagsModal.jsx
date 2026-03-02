import { useState, useEffect, useCallback } from '@wordpress/element';
import { Modal, Button, Spinner }           from '@wordpress/components';
import { useDispatch, useSelect }           from '@wordpress/data';
import { __ }                               from '@wordpress/i18n';
import {
	fetchAIResponse,
	sanitizeAIText,
	extractTextFromBlocks,
} from '../utils/aiHelper';
import { resolveOrCreateTag } from '../utils/tagHelper';

/**
 * Modal for the "✨ IA Tags" feature.
 *
 * Lifecycle:
 *  1. Mounts → auto-starts text mining via LanguageModel (fetchTagSuggestions).
 *  2. Shows 3 suggested tags as toggle chips (all pre-selected by default).
 *  3. User toggles chips on/off, then clicks "Aplicar".
 *  4. Each selected tag is resolved (existing) or created (new) via the WP
 *     REST API, then merged with the post's current tags — no duplicates.
 *
 * XSS: tag names are rendered as text nodes (React); sanitizeAIText() strips
 * any HTML before the name is stored or passed to the REST API.
 *
 * @param {{ onClose: () => void }} props
 */
export default function TagsModal( { onClose } ) {
	const [ suggestions, setSuggestions ] = useState( [] );
	const [ selected, setSelected ]       = useState( new Set() );
	const [ isLoading, setIsLoading ]     = useState( true );
	const [ isApplying, setIsApplying ]   = useState( false );
	const [ error, setError ]             = useState( '' );

	const { editPost } = useDispatch( 'core/editor' );

	const blocks = useSelect(
		( select ) => select( 'core/block-editor' ).getBlocks(),
		[]
	);

	// IDs of tags already assigned to the post — we merge rather than replace.
	const currentTagIds = useSelect(
		( select ) => select( 'core/editor' ).getEditedPostAttribute( 'tags' ) ?? [],
		[]
	);

	// ------------------------------------------------------------------
	// Generation – auto-triggered on mount
	// ------------------------------------------------------------------

	const handleGenerate = useCallback( async () => {
		setIsLoading( true );
		setError( '' );
		setSuggestions( [] );
		setSelected( new Set() );

		try {
			const contextText = extractTextFromBlocks( blocks );

			if ( ! contextText ) {
				throw new Error(
					__( 'Nenhum parágrafo com texto suficiente foi encontrado.', 'ai-post-assistant' )
				);
			}

			const raw  = await fetchAIResponse( 'tags', contextText );
			const tags = raw
				.map( ( t ) => sanitizeAIText( t, 100 ) )
				.filter( Boolean );

			setSuggestions( tags );
			setSelected( new Set( tags ) ); // pre-select all
		} catch ( err ) {
			setError( typeof err?.message === 'string' ? err.message : String( err ) );
		} finally {
			setIsLoading( false );
		}
	// blocks captured at mount; intentional single-run via empty deps below.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	useEffect( () => {
		handleGenerate();
	}, [ handleGenerate ] );

	// ------------------------------------------------------------------
	// Tag toggle
	// ------------------------------------------------------------------

	function toggleTag( tag ) {
		setSelected( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( tag ) ) {
				next.delete( tag );
			} else {
				next.add( tag );
			}
			return next;
		} );
	}

	// ------------------------------------------------------------------
	// Apply – resolve/create each tag then merge with the post
	// ------------------------------------------------------------------

	async function handleApply() {
		setIsApplying( true );
		setError( '' );

		try {
			// Resolve/create all selected tags in parallel; collect results even
			// if individual tags fail (Promise.allSettled).
			const results = await Promise.allSettled(
				[ ...selected ].map( ( name ) => resolveOrCreateTag( name ) )
			);

			const newIds = results
				.filter( ( r ) => r.status === 'fulfilled' )
				.map( ( r ) => r.value );

			const failedNames = [ ...selected ].filter(
				( _, i ) => results[ i ].status === 'rejected'
			);

			// Merge new IDs with existing, deduplicating.
			const merged = [ ...new Set( [ ...currentTagIds, ...newIds ] ) ];
			editPost( { tags: merged } );

			if ( failedNames.length > 0 ) {
				// Partial success: stay open and show which tags couldn't be created.
				setError(
					__( 'Não foi possível criar: ', 'ai-post-assistant' ) +
					failedNames.join( ', ' ) +
					'. ' +
					__( 'As demais foram aplicadas.', 'ai-post-assistant' )
				);
				setIsApplying( false );
			} else {
				onClose();
			}
		} catch ( err ) {
			setError( typeof err?.message === 'string' ? err.message : String( err ) );
			setIsApplying( false );
		}
	}

	// ------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------

	const selectedCount = selected.size;

	return (
		<Modal
			title={ __( 'Sugestões de Tags', 'ai-post-assistant' ) }
			onRequestClose={ onClose }
			className="ai-post-assistant__modal"
		>
			{ /* ── Loading ── */ }
			{ isLoading && (
				<div className="ai-post-assistant__loading">
					<Spinner />
					<span>{ __( ' Minerando texto…', 'ai-post-assistant' ) }</span>
				</div>
			) }

			{ /* ── Error / retry ── */ }
			{ ! isLoading && error && (
				<>
					<p
						className="ai-post-assistant__error"
						role="alert"
						style={ { marginBottom: '12px' } }
					>
						{ error }
					</p>
					{ suggestions.length === 0 && (
						<Button variant="secondary" onClick={ handleGenerate }>
							{ __( 'Tentar novamente', 'ai-post-assistant' ) }
						</Button>
					) }
				</>
			) }

			{ /* ── Tag chips + apply ── */ }
			{ ! isLoading && suggestions.length > 0 && (
				<>
					<p style={ { marginBottom: '12px', color: '#757575', fontSize: '12px' } }>
						{ __( 'Selecione as tags para adicionar ao post:', 'ai-post-assistant' ) }
					</p>

					<div style={ { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' } }>
						{ suggestions.map( ( tag ) => {
							const active = selected.has( tag );
							return (
								<button
									key={ tag }
									type="button"
									onClick={ () => toggleTag( tag ) }
									style={ {
										padding:       '6px 16px',
										borderRadius:  '20px',
										border:        `2px solid ${ active ? '#2271b1' : '#c3c4c7' }`,
										background:    active ? '#2271b1' : '#f6f7f7',
										color:         active ? '#fff' : '#50575e',
										cursor:        'pointer',
										fontWeight:    600,
										fontSize:      '13px',
										lineHeight:    '1.4',
										transition:    'background .15s, border-color .15s, color .15s',
									} }
								>
									{ tag }
								</button>
							);
						} ) }
					</div>

					<Button
						variant="primary"
						onClick={ handleApply }
						disabled={ isApplying || selectedCount === 0 }
						style={ { width: '100%', justifyContent: 'center' } }
					>
						{ isApplying ? (
							<>
								<Spinner />
								{ __( ' Aplicando…', 'ai-post-assistant' ) }
							</>
						) : selectedCount === 0 ? (
							__( 'Selecione ao menos uma tag', 'ai-post-assistant' )
						) : selectedCount === 1 ? (
							__( 'Aplicar 1 tag', 'ai-post-assistant' )
						) : (
							/* translators: %d = number of tags selected */
							`${ __( 'Aplicar', 'ai-post-assistant' ) } ${ selectedCount } ${ __( 'tags', 'ai-post-assistant' ) }`
						) }
					</Button>
				</>
			) }
		</Modal>
	);
}
