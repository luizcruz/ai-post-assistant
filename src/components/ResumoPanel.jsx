import { useState } from '@wordpress/element';
import { Button }   from '@wordpress/components';
import { __ }       from '@wordpress/i18n';
import SelectionModal from './SelectionModal';

/**
 * Rendered inside the "✨ IA Resumo" PluginDocumentSettingPanel,
 * which appears in the same sidebar area as the native Excerpt panel.
 * A single button opens the modal that generates and applies excerpt suggestions.
 */
export default function ResumoPanel() {
	const [ isModalOpen, setIsModalOpen ] = useState( false );

	return (
		<>
			<Button
				variant="primary"
				onClick={ () => setIsModalOpen( true ) }
				className="ai-post-assistant__trigger-btn"
			>
				{ __( '✨ IA Resumo', 'ai-post-assistant' ) }
			</Button>

			{ isModalOpen && (
				<SelectionModal
					type="excerpt"
					onClose={ () => setIsModalOpen( false ) }
				/>
			) }
		</>
	);
}
