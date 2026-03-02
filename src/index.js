/**
 * Plugin entry point.
 *
 * Registers a single PluginDocumentSettingPanel ("✨ AI Post Assistant")
 * that hosts all four AI actions in one consolidated sidebar panel:
 *   - IA Títulos  – generates SEO title suggestions
 *   - IA Resumo   – generates excerpt suggestions
 *   - IA Links    – inserts keyword links directly into the editor body
 *   - IA Tags     – extracts tags and inserts them into the Tags sidebar field
 *
 * Each action button is shown only when its feature toggle is enabled in
 * Configurações → AI Post Assistant.
 */
import { registerPlugin }             from '@wordpress/plugins';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import AIAssistantPanel               from './components/AIAssistantPanel';

registerPlugin( 'ai-post-assistant', {
	render() {
		return (
			<PluginDocumentSettingPanel
				name="ai-assistant-panel"
				title="✨ AI Post Assistant"
				className="ai-post-assistant__panel"
			>
				<AIAssistantPanel />
			</PluginDocumentSettingPanel>
		);
	},
} );
