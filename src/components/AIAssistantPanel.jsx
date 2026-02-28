import { useState }              from '@wordpress/element';
import { Button }                from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { __ }                    from '@wordpress/i18n';
import SelectionModal            from './SelectionModal';
import { injectLinksIntoBlocks } from '../utils/linkInjector';
import { getActiveLinkMap }      from '../utils/linkKeywords';

/**
 * Consolidated AI assistant panel rendered in the Gutenberg sidebar.
 *
 * Renders three stacked action buttons:
 *  - ✨ IA Títulos  → opens SelectionModal (auto-generates SEO titles)
 *  - ✨ IA Resumo   → opens SelectionModal (auto-generates excerpt)
 *  - ✨ IA Links    → directly injects keyword links into paragraph blocks
 *
 * Each action executes as soon as the button is clicked, with no
 * secondary "Gerar" button required.
 */
export default function AIAssistantPanel() {
	// null = no modal open; 'title' | 'excerpt' = modal type open
	const [ openModal, setOpenModal ] = useState( null );

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

		const settings      = window.aiPostAssistantData?.settings ?? {};
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

	return (
		<>
			{ /* ── Action buttons ── */ }
			<div className="ai-post-assistant__actions">
				<Button
					variant="primary"
					onClick={ () => {
						setLinksStatus( '' );
						setOpenModal( 'title' );
					} }
					className="ai-post-assistant__trigger-btn"
				>
					{ __( '✨ IA Títulos', 'ai-post-assistant' ) }
				</Button>

				<Button
					variant="primary"
					onClick={ () => {
						setLinksStatus( '' );
						setOpenModal( 'excerpt' );
					} }
					className="ai-post-assistant__trigger-btn"
				>
					{ __( '✨ IA Resumo', 'ai-post-assistant' ) }
				</Button>

				<Button
					variant="primary"
					onClick={ handleInjectLinks }
					className="ai-post-assistant__trigger-btn"
				>
					{ __( '✨ IA Links', 'ai-post-assistant' ) }
				</Button>
			</div>

			{ /* ── IA Links feedback ── */ }
			{ linksStatus === 'done' && (
				<p className="ai-post-assistant__status ai-post-assistant__status--ok">
					{ linksAdded === 1
						? __( '1 link inserido.', 'ai-post-assistant' )
						: `${ linksAdded } ${ __( 'links inseridos.', 'ai-post-assistant' ) }`
					}
				</p>
			) }
			{ linksStatus === 'none' && (
				<p className="ai-post-assistant__status ai-post-assistant__status--empty">
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
