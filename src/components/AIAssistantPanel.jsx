import { useState }              from '@wordpress/element';
import { Button }                from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { __ }                    from '@wordpress/i18n';
import SelectionModal            from './SelectionModal';
import TagsModal                 from './TagsModal';
import { injectLinksIntoBlocks } from '../utils/linkInjector';
import { getActiveLinkMap }      from '../utils/linkKeywords';

/**
 * Consolidated AI assistant panel rendered in the Gutenberg sidebar.
 *
 * Reads `window.aiPostAssistantData.settings` to determine which buttons
 * are active (enableTitles / enableResumo / enableLinks). Disabled features
 * are not rendered. If all three are disabled the panel shows a notice.
 *
 * Each visible button executes immediately on click:
 *  - IA Títulos / IA Resumo → opens SelectionModal (auto-generates on mount)
 *  - IA Links               → injects keyword links directly into editor blocks
 */
export default function AIAssistantPanel() {
	const settings = window.aiPostAssistantData?.settings ?? {};

	// Feature flags – default to true when not yet saved (first install).
	const enableTitles = settings.enableTitles !== false;
	const enableResumo = settings.enableResumo !== false;
	const enableLinks  = settings.enableLinks  !== false;
	const enableTags   = settings.enableTags   !== false;

	// null = no modal open; 'title' | 'excerpt' = modal type open
	const [ openModal, setOpenModal ]   = useState( null );
	const [ tagsOpen, setTagsOpen ]     = useState( false );

	// IA Links feedback state
	const [ linksStatus, setLinksStatus ] = useState( '' ); // '' | 'done' | 'none'
	const [ linksAdded, setLinksAdded ]   = useState( 0 );

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
							onClick={ () => {
								setLinksStatus( '' );
								setTagsOpen( true );
							} }
							style={ btnStyle }
						>
							{ __( '✨ IA Tags', 'ai-post-assistant' ) }
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
