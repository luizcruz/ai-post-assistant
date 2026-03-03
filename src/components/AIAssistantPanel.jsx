import { useState }              from '@wordpress/element';
import { Button, Spinner }       from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { __ }                    from '@wordpress/i18n';
import SelectionModal            from './SelectionModal';
import { injectLinksIntoBlocks } from '../utils/linkInjector';
import { getActiveLinkMap }      from '../utils/linkKeywords';
import {
	fetchAIResponse,
	extractTextFromBlocks,
	extractTextFromSelectors,
} from '../utils/aiHelper';

/**
 * Consolidated AI assistant panel rendered in the Gutenberg sidebar.
 *
 * Reads `window.aiPostAssistantData.settings` to determine which buttons
 * are active (enableTitles / enableResumo / enableLinks / enableTags).
 * Disabled features are not rendered.
 *
 * Each visible button executes immediately on click:
 *  - IA Títulos / IA Resumo → opens SelectionModal (auto-generates on mount)
 *  - IA Links               → injects keyword links directly into editor blocks
 *  - IA Tags                → runs AI, inserts comma-separated tags into the
 *                             Gutenberg Tags sidebar field and focuses it
 */
export default function AIAssistantPanel() {
	const settings = window.aiPostAssistantData?.settings ?? {};

	// Feature flags – default to true when not yet saved (first install).
	const enableTitles = settings.enableTitles !== false;
	const enableResumo = settings.enableResumo !== false;
	const enableLinks  = settings.enableLinks  !== false;
	const enableTags   = settings.enableTags   !== false;

	// null = no modal open; 'title' | 'excerpt' = modal type open
	const [ openModal, setOpenModal ] = useState( null );

	// IA Links feedback state
	const [ linksStatus, setLinksStatus ] = useState( '' ); // '' | 'done' | 'none'
	const [ linksAdded, setLinksAdded ]   = useState( 0 );

	// IA Tags inline state
	const [ tagsLoading, setTagsLoading ] = useState( false );
	const [ tagsError, setTagsError ]     = useState( '' );

	const { updateBlockAttributes } = useDispatch( 'core/block-editor' );
	const blocks = useSelect(
		( select ) => select( 'core/block-editor' ).getBlocks(),
		[]
	);

	// ------------------------------------------------------------------
	// IA Links handler
	// ------------------------------------------------------------------

	function handleInjectLinks() {
		setLinksStatus( '' );

		const maxPerKeyword = Math.max( 1, Number( settings.linkMaxPerKeyword ) || 2 );
		const linkMap       = getActiveLinkMap();

		const { updatedBlocks, totalLinksAdded } = injectLinksIntoBlocks(
			blocks,
			linkMap,
			maxPerKeyword
		);

		for ( const block of updatedBlocks ) {
			const original = blocks.find( ( b ) => b.clientId === block.clientId );
			if ( original?.attributes?.content !== block.attributes?.content ) {
				updateBlockAttributes( block.clientId, { content: block.attributes.content } );
			}
		}

		setLinksAdded( totalLinksAdded );
		setLinksStatus( totalLinksAdded > 0 ? 'done' : 'none' );
	}

	// ------------------------------------------------------------------
	// IA Tags handler – runs AI then inserts tokens into the sidebar field
	// ------------------------------------------------------------------

	async function handleTagsClick() {
		setLinksStatus( '' );
		setTagsError( '' );
		setTagsLoading( true );

		try {
			const rawSelectors = ( settings.contentSelectors ?? '' ).trim();
			const selectors    = rawSelectors
				? rawSelectors.split( '\n' ).map( ( s ) => s.trim() ).filter( Boolean )
				: [];
			const contextText  = selectors.length > 0
				? extractTextFromSelectors( selectors )
				: extractTextFromBlocks( blocks );

			if ( ! contextText ) {
				throw new Error(
					__( 'Nenhum parágrafo com texto suficiente foi encontrado.', 'ai-post-assistant' )
				);
			}

			const tags = await fetchAIResponse( 'tags', contextText );

			if ( ! tags.length ) {
				throw new Error( __( 'O modelo não retornou tags.', 'ai-post-assistant' ) );
			}

			await insertTagsIntoSidebarField( tags );
		} catch ( err ) {
			setTagsError( typeof err?.message === 'string' ? err.message : String( err ) );
		} finally {
			setTagsLoading( false );
		}
	}

	// ------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------

	const noneActive = ! enableTitles && ! enableResumo && ! enableLinks && ! enableTags;

	const btnStyle = { width: '100%', justifyContent: 'center' };

	return (
		<>
			{ noneActive ? (
				<p style={ { color: '#757575', fontSize: '12px', margin: '4px 0 0' } }>
					{ __( 'Todos os recursos estão desativados. Ative-os em Configurações → AI Post Assistant.', 'ai-post-assistant' ) }
				</p>
			) : (
				<div style={ { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' } }>
					{ enableTitles && (
						<Button
							variant="primary"
							onClick={ () => {
								setLinksStatus( '' );
								setTagsError( '' );
								setOpenModal( 'title' );
							} }
							style={ btnStyle }
						>
							{ __( '✨ IA Títulos', 'ai-post-assistant' ) }
						</Button>
					) }

					{ enableResumo && (
						<Button
							variant="primary"
							onClick={ () => {
								setLinksStatus( '' );
								setTagsError( '' );
								setOpenModal( 'excerpt' );
							} }
							style={ btnStyle }
						>
							{ __( '✨ IA Resumo', 'ai-post-assistant' ) }
						</Button>
					) }

					{ enableLinks && (
						<Button
							variant="primary"
							onClick={ handleInjectLinks }
							style={ btnStyle }
						>
							{ __( '✨ IA Links', 'ai-post-assistant' ) }
						</Button>
					) }

					{ enableTags && (
						<Button
							variant="primary"
							onClick={ handleTagsClick }
							disabled={ tagsLoading }
							style={ btnStyle }
						>
							{ tagsLoading ? (
								<>
									<Spinner />
									{ __( ' Gerando tags…', 'ai-post-assistant' ) }
								</>
							) : (
								__( '✨ IA Tags', 'ai-post-assistant' )
							) }
						</Button>
					) }
				</div>
			) }

			{ /* ── IA Links feedback ── */ }
			{ linksStatus === 'done' && (
				<p style={ { margin: '4px 0 0', fontSize: '12px', color: '#2271b1' } }>
					{ linksAdded === 1
						? __( '1 link inserido.', 'ai-post-assistant' )
						: `${ linksAdded } ${ __( 'links inseridos.', 'ai-post-assistant' ) }`
					}
				</p>
			) }
			{ linksStatus === 'none' && (
				<p style={ { margin: '4px 0 0', fontSize: '12px', color: '#757575' } }>
					{ __( 'Nenhuma palavra-chave encontrada.', 'ai-post-assistant' ) }
				</p>
			) }

			{ /* ── IA Tags error feedback ── */ }
			{ tagsError && (
				<p style={ { margin: '4px 0 0', fontSize: '12px', color: '#d63638' } } role="alert">
					{ tagsError }
				</p>
			) }

			{ /* ── Modal (title or excerpt) – auto-generates on open ── */ }
			{ openModal && (
				<SelectionModal
					type={ openModal }
					onClose={ () => setOpenModal( null ) }
				/>
			) }
		</>
	);
}

// =============================================================================
// Helpers – Gutenberg sidebar tags field injection
// =============================================================================

/**
 * Opens the document sidebar, locates the "Tags" FormTokenField panel,
 * expands it if collapsed, then inserts each tag as an individual token
 * by simulating the native input + Enter-keydown sequence that Gutenberg
 * uses internally. Finally, focuses the input so the user can review.
 *
 * @param { string[] } tags  Array of tag name strings returned by the AI.
 */
async function insertTagsIntoSidebarField( tags ) {
	// Open the document sidebar (no-op if already open).
	window.wp?.data?.dispatch( 'core/edit-post' )?.openGeneralSidebar( 'edit-post/document' );

	// Wait for sidebar animation / React render.
	await rafDelay();
	await rafDelay();

	let input = findTagsInput();

	if ( ! input ) {
		// Panel may still be animating open – give it a bit more time.
		await new Promise( ( r ) => setTimeout( r, 250 ) );
		input = findTagsInput();
	}

	if ( ! input ) {
		throw new Error(
			'Campo de tags não encontrado. Verifique se o painel "Tags" está visível na barra lateral do editor.'
		);
	}

	// Native value setter – lets us change a React-controlled input's DOM
	// value so the next synthetic 'input' event reports the new value.
	const nativeSet = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		'value'
	).set;

	for ( const tag of tags ) {
		const name = tag.trim();
		if ( ! name ) continue;

		// 1. Write value to DOM (bypasses React's controlled-input guard).
		nativeSet.call( input, name );

		// 2. Dispatch 'input' → React reads event.target.value → updates state.
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );

		// 3. Give React two animation frames to flush the state update.
		await rafDelay();
		await rafDelay();

		// 4. Simulate Enter → FormTokenField's onKeyDown handler creates a token.
		input.dispatchEvent( new KeyboardEvent( 'keydown', {
			key:        'Enter',
			code:       'Enter',
			keyCode:    13,
			which:      13,
			bubbles:    true,
			cancelable: true,
		} ) );

		// 5. Give React time to process the token creation before the next tag.
		await rafDelay();
		await rafDelay();
	}

	// Position focus on the tags field so the user can review / edit.
	input.focus();
}

/**
 * Walks all sidebar panel bodies looking for the one whose toggle button
 * is labelled "Tags" (case-insensitive, ignoring count suffixes like "(3)").
 * Expands the panel if it is collapsed, then returns the FormTokenField
 * input inside it, or null if not found.
 *
 * @returns { HTMLInputElement | null }
 */
function findTagsInput() {
	for ( const panel of document.querySelectorAll( '.components-panel__body' ) ) {
		const toggleBtn = panel.querySelector( '.components-panel__body-toggle' );
		if ( ! toggleBtn ) continue;

		// Strip count suffixes (" (3)", " (0)") before comparing.
		const title = toggleBtn.textContent.replace( /\s*\(\d+\)\s*/g, '' ).trim();
		if ( title.toLowerCase() !== 'tags' ) continue;

		// Expand the panel if it is currently collapsed.
		if ( ! panel.classList.contains( 'is-opened' ) ) {
			toggleBtn.click();
		}

		return panel.querySelector( 'input.components-form-token-field__input' ) ?? null;
	}

	return null;
}

/** Resolves on the next animation frame. */
function rafDelay() {
	return new Promise( ( r ) => requestAnimationFrame( r ) );
}
