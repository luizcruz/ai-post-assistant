/**
 * Unit tests for src/components/AIAssistantPanel.jsx
 *
 * Covered scenarios:
 *
 *  Feature flags
 *    ✓ All four buttons visible when every feature is enabled.
 *    ✓ Each button hidden individually when its flag is false.
 *    ✓ "All disabled" message shown when every flag is false.
 *
 *  IA Títulos / IA Resumo
 *    ✓ Click opens SelectionModal with the correct type prop.
 *    ✓ Modal closes when onClose is called.
 *
 *  IA Links
 *    ✓ Calls injectLinksIntoBlocks + getActiveLinkMap with correct args.
 *    ✓ Shows "N links inseridos" feedback after injection.
 *    ✓ Shows "Nenhuma palavra-chave encontrada" when zero links added.
 *    ✓ Calls updateBlockAttributes only for blocks whose content changed.
 *    ✓ Does not call updateBlockAttributes when content is unchanged.
 *    ✓ Shows spinner and disables button while loading.
 *
 *  IA Tags
 *    ✓ Shows spinner + disables button while AI request is in flight.
 *    ✓ Shows error message when fetchAIResponse rejects.
 *    ✓ Shows "no content" error when extractTextFromBlocks returns empty string.
 *    ✓ Shows error when no existing tags with min count are found.
 *    ✓ On success: opens document sidebar and inserts each tag token.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AIAssistantPanel from '../../src/components/AIAssistantPanel';

// ---------------------------------------------------------------------------
// Shared stubs – reset in beforeEach
// ---------------------------------------------------------------------------

const mockUpdateBlockAttributes = jest.fn();
const mockGetBlocks             = jest.fn();
const mockOpenGeneralSidebar    = jest.fn();

const MOCK_BLOCKS = [
	{
		clientId:   'block-1',
		name:       'core/paragraph',
		attributes: {
			content: 'Este é um parágrafo com palavras suficientes para o contexto da IA.',
		},
	},
];

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock( '@wordpress/data', () => ( {
	useDispatch: jest.fn( () => ( { updateBlockAttributes: mockUpdateBlockAttributes } ) ),
	useSelect:   jest.fn( ( selector ) => {
		const selectFn = ( storeName ) => {
			if ( storeName === 'core/block-editor' ) {
				return { getBlocks: mockGetBlocks };
			}
			return {};
		};
		return selector( selectFn );
	} ),
} ), { virtual: true } );

jest.mock( '@wordpress/components', () => ( {
	Button:  ( { children, onClick, disabled, style } ) => (
		<button onClick={ onClick } disabled={ disabled } style={ style }>{ children }</button>
	),
	Spinner: () => <span data-testid="spinner" />,
} ), { virtual: true } );

jest.mock( '@wordpress/element', () => ( {
	...jest.requireActual( 'react' ),
} ), { virtual: true } );

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
} ), { virtual: true } );

jest.mock( '@wordpress/api-fetch', () => ( {
	__esModule: true,
	default: jest.fn(),
} ), { virtual: true } );

// Stub SelectionModal – we assert on mount/unmount, not on its internals.
jest.mock( '../../src/components/SelectionModal', () => ( {
	__esModule: true,
	default: ( { type, onClose } ) => (
		<div data-testid="selection-modal" data-type={ type }>
			<button onClick={ onClose }>Fechar Modal</button>
		</div>
	),
} ) );

jest.mock( '../../src/utils/linkInjector', () => ( {
	injectLinksIntoBlocks: jest.fn(),
} ) );

jest.mock( '../../src/utils/linkKeywords', () => ( {
	getActiveLinkMap: jest.fn(),
} ) );

jest.mock( '../../src/utils/aiHelper', () => ( {
	fetchAIResponse:       jest.fn(),
	extractTextFromBlocks: jest.fn(),
	writeToElement:        jest.fn(),
} ) );

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import apiFetch                                   from '@wordpress/api-fetch';
import { injectLinksIntoBlocks }                  from '../../src/utils/linkInjector';
import { getActiveLinkMap }                       from '../../src/utils/linkKeywords';
import { fetchAIResponse, extractTextFromBlocks } from '../../src/utils/aiHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders the panel with the given feature flags. All default to true. */
function renderPanel( settings = {} ) {
	window.aiPostAssistantData = {
		settings: {
			enableTitles: true,
			enableResumo: true,
			enableLinks:  true,
			enableTags:   true,
			linkMaxPerKeyword: 2,
			...settings,
		},
	};
	return render( <AIAssistantPanel /> );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach( () => {
	jest.clearAllMocks();
	mockGetBlocks.mockReturnValue( MOCK_BLOCKS );
	extractTextFromBlocks.mockReturnValue( 'contexto de texto suficiente para a IA' );
	getActiveLinkMap.mockResolvedValue( [] );
	injectLinksIntoBlocks.mockReturnValue( { updatedBlocks: [], totalLinksAdded: 0 } );
	apiFetch.mockResolvedValue( [] );

	// Mock requestAnimationFrame so async tag-insertion resolves instantly.
	global.requestAnimationFrame = ( cb ) => { cb( 0 ); return 0; };

	// Minimal window.wp stub for insertTagsIntoSidebarField.
	window.wp = {
		data: {
			dispatch: jest.fn( () => ( {
				openGeneralSidebar: mockOpenGeneralSidebar,
			} ) ),
		},
	};
} );

afterEach( () => {
	delete window.aiPostAssistantData;
} );

// ===========================================================================
// Feature flags
// ===========================================================================

describe( 'AIAssistantPanel – feature flags', () => {
	it( 'shows all four buttons when every feature is enabled', () => {
		renderPanel();
		expect( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: '✨ IA Resumo' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: '✨ IA Links' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: '✨ IA Tags' } ) ).toBeInTheDocument();
	} );

	it( 'hides IA Títulos button when enableTitles is false', () => {
		renderPanel( { enableTitles: false } );
		expect( screen.queryByRole( 'button', { name: '✨ IA Títulos' } ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: '✨ IA Resumo' } ) ).toBeInTheDocument();
	} );

	it( 'hides IA Resumo button when enableResumo is false', () => {
		renderPanel( { enableResumo: false } );
		expect( screen.queryByRole( 'button', { name: '✨ IA Resumo' } ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) ).toBeInTheDocument();
	} );

	it( 'hides IA Links button when enableLinks is false', () => {
		renderPanel( { enableLinks: false } );
		expect( screen.queryByRole( 'button', { name: '✨ IA Links' } ) ).not.toBeInTheDocument();
	} );

	it( 'hides IA Tags button when enableTags is false', () => {
		renderPanel( { enableTags: false } );
		expect( screen.queryByRole( 'button', { name: '✨ IA Tags' } ) ).not.toBeInTheDocument();
	} );

	it( 'shows "all disabled" message when every feature is off', () => {
		renderPanel( {
			enableTitles: false,
			enableResumo: false,
			enableLinks:  false,
			enableTags:   false,
		} );
		expect(
			screen.getByText( /Todos os recursos estão desativados/i )
		).toBeInTheDocument();
		expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument();
	} );
} );

// ===========================================================================
// IA Títulos / IA Resumo – modal lifecycle
// ===========================================================================

describe( 'AIAssistantPanel – modal lifecycle', () => {
	it( 'opens SelectionModal with type="title" when IA Títulos is clicked', () => {
		renderPanel();
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) );

		const modal = screen.getByTestId( 'selection-modal' );
		expect( modal ).toBeInTheDocument();
		expect( modal ).toHaveAttribute( 'data-type', 'title' );
	} );

	it( 'opens SelectionModal with type="excerpt" when IA Resumo is clicked', () => {
		renderPanel();
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Resumo' } ) );

		const modal = screen.getByTestId( 'selection-modal' );
		expect( modal ).toBeInTheDocument();
		expect( modal ).toHaveAttribute( 'data-type', 'excerpt' );
	} );

	it( 'closes the modal when its onClose is called', () => {
		renderPanel();
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) );
		expect( screen.getByTestId( 'selection-modal' ) ).toBeInTheDocument();

		fireEvent.click( screen.getByRole( 'button', { name: 'Fechar Modal' } ) );
		expect( screen.queryByTestId( 'selection-modal' ) ).not.toBeInTheDocument();
	} );

	it( 'does not open two modals at once', () => {
		renderPanel();
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) );
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Resumo' } ) );

		// Second click replaces the first — only one modal, type changes to excerpt.
		const modals = screen.getAllByTestId( 'selection-modal' );
		expect( modals ).toHaveLength( 1 );
		expect( modals[ 0 ] ).toHaveAttribute( 'data-type', 'excerpt' );
	} );
} );

// ===========================================================================
// IA Links
// ===========================================================================

describe( 'AIAssistantPanel – IA Links', () => {
	it( 'calls getActiveLinkMap and injectLinksIntoBlocks with the current blocks', async () => {
		const fakeMap = [ { url: 'https://lance.com.br/flamengo', keywords: [ 'Flamengo' ] } ];
		getActiveLinkMap.mockResolvedValue( fakeMap );
		injectLinksIntoBlocks.mockReturnValue( { updatedBlocks: [], totalLinksAdded: 0 } );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( getActiveLinkMap ).toHaveBeenCalledTimes( 1 );
		expect( injectLinksIntoBlocks ).toHaveBeenCalledWith( MOCK_BLOCKS, fakeMap, 2 );
	} );

	it( 'shows "N links inseridos" when links were added', async () => {
		injectLinksIntoBlocks.mockReturnValue( { updatedBlocks: [], totalLinksAdded: 3 } );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( screen.getByText( /3.*links inseridos/i ) ).toBeInTheDocument();
	} );

	it( 'shows "1 link inserido" with singular form when exactly one link is added', async () => {
		injectLinksIntoBlocks.mockReturnValue( { updatedBlocks: [], totalLinksAdded: 1 } );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( screen.getByText( '1 link inserido.' ) ).toBeInTheDocument();
	} );

	it( 'shows "Nenhuma palavra-chave encontrada" when zero links were added', async () => {
		injectLinksIntoBlocks.mockReturnValue( { updatedBlocks: [], totalLinksAdded: 0 } );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( screen.getByText( 'Nenhuma palavra-chave encontrada.' ) ).toBeInTheDocument();
	} );

	it( 'calls updateBlockAttributes only for blocks whose content changed', async () => {
		const updatedBlock = {
			clientId:   'block-1',
			attributes: { content: 'Conteúdo <a href="#">alterado</a>.' },
		};
		injectLinksIntoBlocks.mockReturnValue( {
			updatedBlocks:   [ updatedBlock ],
			totalLinksAdded: 1,
		} );
		// Original block has different content → should trigger update.
		mockGetBlocks.mockReturnValue( [
			{ clientId: 'block-1', name: 'core/paragraph', attributes: { content: 'Conteúdo original.' } },
		] );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( mockUpdateBlockAttributes ).toHaveBeenCalledTimes( 1 );
		expect( mockUpdateBlockAttributes ).toHaveBeenCalledWith(
			'block-1',
			{ content: updatedBlock.attributes.content }
		);
	} );

	it( 'does not call updateBlockAttributes when block content is unchanged', async () => {
		const sameContent = 'Conteúdo idêntico.';
		const block = {
			clientId:   'block-1',
			name:       'core/paragraph',
			attributes: { content: sameContent },
		};
		injectLinksIntoBlocks.mockReturnValue( {
			updatedBlocks:   [ { ...block } ],  // same content
			totalLinksAdded: 0,
		} );
		mockGetBlocks.mockReturnValue( [ block ] );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( mockUpdateBlockAttributes ).not.toHaveBeenCalled();
	} );

	it( 'uses linkMaxPerKeyword setting from window.aiPostAssistantData', async () => {
		injectLinksIntoBlocks.mockReturnValue( { updatedBlocks: [], totalLinksAdded: 0 } );

		renderPanel( { linkMaxPerKeyword: 5 } );
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );
		} );

		expect( injectLinksIntoBlocks ).toHaveBeenCalledWith( expect.anything(), expect.anything(), 5 );
	} );

	it( 'shows spinner and disables button while loading', async () => {
		// getActiveLinkMap never resolves – keeps the loading state active.
		getActiveLinkMap.mockReturnValue( new Promise( () => {} ) );

		renderPanel();
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Links' } ) );

		await waitFor( () => {
			expect( screen.getByTestId( 'spinner' ) ).toBeInTheDocument();
			expect( screen.getByRole( 'button', { name: /Carregando links/i } ) ).toBeDisabled();
		} );
	} );
} );

// ===========================================================================
// IA Tags
// ===========================================================================

describe( 'AIAssistantPanel – IA Tags', () => {
	it( 'shows a spinner and disables the button while the AI request is in flight', async () => {
		// Promise that never resolves — keeps the loading state active.
		fetchAIResponse.mockReturnValue( new Promise( () => {} ) );

		renderPanel();
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );

		await waitFor( () => {
			expect( screen.getByTestId( 'spinner' ) ).toBeInTheDocument();
			expect( screen.getByRole( 'button', { name: /Gerando tags/i } ) ).toBeDisabled();
		} );
	} );

	it( 'shows an error message when extractTextFromBlocks returns empty string', async () => {
		extractTextFromBlocks.mockReturnValue( '' );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		} );

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent(
			'Nenhum parágrafo com texto suficiente foi encontrado.'
		);
		expect( fetchAIResponse ).not.toHaveBeenCalled();
	} );

	it( 'shows an error message when fetchAIResponse rejects', async () => {
		fetchAIResponse.mockRejectedValueOnce( new Error( 'Modelo indisponível.' ) );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		} );

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Modelo indisponível.' );
	} );

	it( 'calls fetchAIResponse with type "tags" and the extracted context text', async () => {
		const contextText = 'contexto de texto suficiente para a IA';
		extractTextFromBlocks.mockReturnValue( contextText );
		// apiFetch returns [] by default (from beforeEach) → no tags with count > 30
		// → error thrown, but fetchAIResponse was already called.
		fetchAIResponse.mockResolvedValueOnce( [ 'tag1', 'tag2' ] );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		} );

		expect( fetchAIResponse ).toHaveBeenCalledWith( 'tags', contextText );
	} );

	it( 'shows error when no existing tags with min count are found', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'tag1', 'tag2' ] );
		// Return tags below the 30-count threshold → all filtered out.
		apiFetch.mockResolvedValue( [ { name: 'tag1', count: 5 } ] );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		} );

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent(
			'Nenhuma tag existente com mais de 30 conteúdos foi encontrada para este artigo.'
		);
	} );

	it( 'opens the document sidebar when tags are successfully generated', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'Flamengo' ] );
		// Return a tag that passes the count > 30 filter.
		apiFetch.mockResolvedValue( [ { name: 'Flamengo', count: 50 } ] );

		renderPanel();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		} );

		expect( window.wp.data.dispatch ).toHaveBeenCalledWith( 'core/edit-post' );
		expect( mockOpenGeneralSidebar ).toHaveBeenCalledWith( 'edit-post/document' );
	} );

	it( 'clears a previous error on the next click', async () => {
		fetchAIResponse
			.mockRejectedValueOnce( new Error( 'Erro inicial.' ) )
			.mockReturnValueOnce( new Promise( () => {} ) );

		renderPanel();

		// First click – produces an error.
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		} );
		expect( screen.getByRole( 'alert' ) ).toBeInTheDocument();

		// Second click – error should vanish (loading state).
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Tags' } ) );
		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
	} );
} );
