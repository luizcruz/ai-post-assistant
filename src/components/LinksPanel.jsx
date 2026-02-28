import { useState }            from '@wordpress/element';
import { Button }              from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { __ }                  from '@wordpress/i18n';
import { injectLinksIntoBlocks } from '../utils/linkInjector';
import { LINK_MAP }            from '../utils/linkKeywords';

/**
 * Rendered inside the "✨ IA Links" PluginDocumentSettingPanel.
 *
 * On click:
 *  1. Reads all blocks from the block-editor store.
 *  2. Calls injectLinksIntoBlocks() to find keyword matches and build
 *     updated block objects (DOM-based, never modifies raw HTML with regex).
 *  3. Dispatches updateBlockAttributes() for every block whose content changed.
 *  4. Shows the count of links inserted (or a "not found" notice).
 *
 * Idempotency: the injector seeds its per-URL counter from links already
 * present in the editor, so clicking the button a second time will only add
 * links that weren't there yet and will never exceed the 2-per-URL cap.
 */
export default function LinksPanel() {
	const [ status, setStatus ]     = useState( '' ); // '' | 'done' | 'none'
	const [ linksAdded, setLinksAdded ] = useState( 0 );

	const { updateBlockAttributes } = useDispatch( 'core/block-editor' );

	// Snapshot blocks at render time; re-read on every button click via the
	// selector so the panel is always working with current editor state.
	const blocks = useSelect(
		( select ) => select( 'core/block-editor' ).getBlocks(),
		[]
	);

	function handleInjectLinks() {
		setStatus( '' );

		const { updatedBlocks, totalLinksAdded } = injectLinksIntoBlocks( blocks, LINK_MAP );

		// Only dispatch for blocks whose content actually changed.
		for ( const block of updatedBlocks ) {
			const original = blocks.find( ( b ) => b.clientId === block.clientId );
			if ( original?.attributes?.content !== block.attributes?.content ) {
				updateBlockAttributes( block.clientId, { content: block.attributes.content } );
			}
		}

		setLinksAdded( totalLinksAdded );
		setStatus( totalLinksAdded > 0 ? 'done' : 'none' );
	}

	return (
		<>
			<Button
				variant="primary"
				onClick={ handleInjectLinks }
				className="ai-post-assistant__trigger-btn"
			>
				{ __( '✨ IA Links', 'ai-post-assistant' ) }
			</Button>

			{ status === 'done' && (
				<p className="ai-post-assistant__status ai-post-assistant__status--ok">
					{ linksAdded === 1
						? __( '1 link inserido.', 'ai-post-assistant' )
						: `${ linksAdded } ${ __( 'links inseridos.', 'ai-post-assistant' ) }`
					}
				</p>
			) }

			{ status === 'none' && (
				<p className="ai-post-assistant__status ai-post-assistant__status--empty">
					{ __( 'Nenhuma palavra-chave encontrada no texto.', 'ai-post-assistant' ) }
				</p>
			) }
		</>
	);
}
