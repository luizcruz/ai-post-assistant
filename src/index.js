/**
 * Plugin entry point.
 *
 * Registers three PluginDocumentSettingPanel slots in the Gutenberg sidebar:
 *   1. "✨ IA Títulos" – generates and applies SEO title suggestions.
 *   2. "✨ IA Resumo"  – generates and applies excerpt suggestions.
 *   3. "✨ IA Links"   – scans the post body and inserts keyword links.
 */
import { registerPlugin } from '@wordpress/plugins';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import TitlesPanel from './components/TitlesPanel';
import ResumoPanel from './components/ResumoPanel';
import LinksPanel  from './components/LinksPanel';

registerPlugin( 'ai-post-assistant-titles', {
	render() {
		return (
			<PluginDocumentSettingPanel
				name="ai-titles-panel"
				title="✨ IA Títulos"
				className="ai-post-assistant__titles-panel"
			>
				<TitlesPanel />
			</PluginDocumentSettingPanel>
		);
	},
} );

registerPlugin( 'ai-post-assistant-resumo', {
	render() {
		return (
			<PluginDocumentSettingPanel
				name="ai-resumo-panel"
				title="✨ IA Resumo"
				className="ai-post-assistant__resumo-panel"
			>
				<ResumoPanel />
			</PluginDocumentSettingPanel>
		);
	},
} );

registerPlugin( 'ai-post-assistant-links', {
	render() {
		return (
			<PluginDocumentSettingPanel
				name="ai-links-panel"
				title="✨ IA Links"
				className="ai-post-assistant__links-panel"
			>
				<LinksPanel />
			</PluginDocumentSettingPanel>
		);
	},
} );
