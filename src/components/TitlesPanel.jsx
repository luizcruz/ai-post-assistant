import { useState } from '@wordpress/element';
import { Button }   from '@wordpress/components';
import { __ }       from '@wordpress/i18n';
import SelectionModal from './SelectionModal';

/**
 * Rendered inside the "✨ IA Títulos" PluginDocumentSettingPanel.
 * A single button opens the modal that generates and applies title suggestions.
 */
export default function TitlesPanel() {
	const [ isModalOpen, setIsModalOpen ] = useState( false );

	return (
		<>
			<Button
				variant="primary"
				onClick={ () => setIsModalOpen( true ) }
				className="ai-post-assistant__trigger-btn"
			>
				{ __( '✨ IA Títulos', 'ai-post-assistant' ) }
			</Button>

			{ isModalOpen && (
				<SelectionModal
					type="title"
					onClose={ () => setIsModalOpen( false ) }
				/>
			) }
		</>
	);
}
