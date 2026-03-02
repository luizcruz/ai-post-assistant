/**
 * Unit tests for src/components/SelectionModal.jsx
 *
 * Key design notes:
 *
 *  - SelectionModal AUTO-GENERATES on mount (useEffect → handleGenerate).
 *    There is no manual "Gerar" button.  Every test that needs a settled UI
 *    must `await act(async () => { render() })` so React flushes the initial
 *    async effect before assertions run.
 *
 *  - @wordpress/jest-console treats any unexpected console.error() as a test
 *    failure.  Using act() correctly prevents the "not wrapped in act()" React
 *    warning that would otherwise fail every test.
 *
 * Covered scenarios:
 *  ✓ Spinner is visible immediately on mount (loading state).
 *  ✓ Title modal renders with the correct dialog label.
 *  ✓ Excerpt modal renders with the correct dialog label.
 *  ✓ fetchAIResponse called with the correct type and extracted text.
 *  ✓ Suggestions are sanitized (XSS stripped) before render.
 *  ✓ 3 returned suggestions are all rendered.
 *  ✓ Error alert shown when fetchAIResponse rejects.
 *  ✓ Error alert shown when there is no paragraph text (empty blocks).
 *  ✓ "Tentar novamente" button triggers a new generation cycle.
 *  ✓ Clicking a suggestion dispatches editPost({ title }) with sanitized text.
 *  ✓ Clicking a suggestion dispatches editPost({ excerpt }) for excerpt type.
 *  ✓ HTML tags stripped from suggestion before it reaches editPost.
 *  ✓ onClose called after a suggestion is selected.
 *  ✓ onClose called when the modal close button is clicked.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import SelectionModal from '../../src/components/SelectionModal';

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

const mockEditPost  = jest.fn();
const mockGetBlocks = jest.fn();

const MOCK_BLOCKS = [
	{
		name:       'core/paragraph',
		attributes: {
			content: 'This is a test paragraph with plenty of words for the AI context.',
		},
	},
];

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock( '@wordpress/data', () => ( {
	useDispatch: jest.fn( () => ( { editPost: mockEditPost } ) ),
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

// Partial mock: keep real sanitizeAIText + extractTextFromBlocks so XSS
// and content-extraction assertions are meaningful; control fetchAIResponse.
jest.mock( '../../src/utils/aiHelper', () => {
	const actual = jest.requireActual( '../../src/utils/aiHelper' );
	return { ...actual, fetchAIResponse: jest.fn() };
} );

jest.mock( '@wordpress/components', () => ( {
	Modal: ( { title, children, onRequestClose } ) => (
		<div role="dialog" aria-label={ title }>
			{ children }
			<button onClick={ onRequestClose }>Fechar</button>
		</div>
	),
	Button:  ( { children, onClick, disabled } ) => (
		<button onClick={ onClick } disabled={ disabled }>{ children }</button>
	),
	Spinner: () => <span aria-label="loading">...</span>,
} ), { virtual: true } );

jest.mock( '@wordpress/element', () => ( {
	...jest.requireActual( 'react' ),
} ), { virtual: true } );

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
} ), { virtual: true } );

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { fetchAIResponse } from '../../src/utils/aiHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders SelectionModal and awaits the initial auto-generation effect so
 * all async state updates are flushed before assertions run.
 */
async function renderModal( type = 'title', onClose = jest.fn() ) {
	let result;
	await act( async () => {
		result = render( <SelectionModal type={ type } onClose={ onClose } /> );
	} );
	return { onClose, ...result };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach( () => {
	jest.clearAllMocks();
	mockGetBlocks.mockReturnValue( MOCK_BLOCKS );
} );

// ===========================================================================
// Loading state (synchronous — no act needed)
// ===========================================================================

describe( 'SelectionModal – loading state', () => {
	it( 'shows the spinner immediately on mount before generation settles', () => {
		// Never-resolving promise: component stays in loading state forever.
		fetchAIResponse.mockReturnValue( new Promise( () => {} ) );

		render( <SelectionModal type="title" onClose={ jest.fn() } /> );

		expect( screen.getByText( /Gerando sugestões/i ) ).toBeInTheDocument();
		expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
	} );
} );

// ===========================================================================
// Render (modal title labels)
// ===========================================================================

describe( 'SelectionModal – render', () => {
	it( 'renders the title modal with the correct dialog label', async () => {
		fetchAIResponse.mockResolvedValueOnce( [] );
		await renderModal( 'title' );

		expect(
			screen.getByRole( 'dialog', { name: 'Sugestões de Título (SEO)' } )
		).toBeInTheDocument();
	} );

	it( 'renders the excerpt modal with the correct dialog label', async () => {
		fetchAIResponse.mockResolvedValueOnce( [] );
		await renderModal( 'excerpt' );

		expect(
			screen.getByRole( 'dialog', { name: 'Sugestões de Resumo' } )
		).toBeInTheDocument();
	} );

	it( 'shows no suggestions list after successful fetch of zero items', async () => {
		fetchAIResponse.mockResolvedValueOnce( [] );
		await renderModal();

		expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument();
	} );
} );

// ===========================================================================
// Generation flow
// ===========================================================================

describe( 'SelectionModal – generation flow', () => {
	it( 'calls fetchAIResponse with the correct type and extracted context text', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'A', 'B', 'C' ] );
		await renderModal( 'title' );

		expect( fetchAIResponse ).toHaveBeenCalledTimes( 1 );
		expect( fetchAIResponse ).toHaveBeenCalledWith(
			'title',
			expect.stringContaining( 'test paragraph' ),
			expect.any( Function ) // onProgress callback
		);
	} );

	it( 'renders exactly the 3 returned suggestions after generation', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'Sugestão Um', 'Sugestão Dois', 'Sugestão Três' ] );
		await renderModal();

		expect( screen.getByText( 'Sugestão Um' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Sugestão Dois' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Sugestão Três' ) ).toBeInTheDocument();
	} );

	it( 'strips XSS payloads from AI suggestions before rendering', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'<script>alert("xss")</script>Clean Title',
			'<img src=x onerror=alert(1)>Safe',
			'Normal suggestion without HTML',
		] );

		const { container } = await renderModal( 'title' );

		// Sanitized text is visible; raw payload is absent from the DOM.
		expect( screen.getByText( 'Clean Title' ) ).toBeInTheDocument();
		expect( container.innerHTML ).not.toContain( '<script>' );
		expect( container.innerHTML ).not.toContain( 'onerror' );
		expect( container.innerHTML ).not.toContain( 'alert' );
	} );

	it( 'shows an error alert when fetchAIResponse rejects', async () => {
		fetchAIResponse.mockRejectedValueOnce( new Error( 'API falhou' ) );
		await renderModal();

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'API falhou' );
	} );

	it( 'shows a "no content" error when all blocks are empty', async () => {
		mockGetBlocks.mockReturnValue( [] );
		// fetchAIResponse should never be called when there is no context text.
		await renderModal();

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent(
			'Nenhum parágrafo com texto suficiente foi encontrado.'
		);
		expect( fetchAIResponse ).not.toHaveBeenCalled();
	} );

	it( '"Tentar novamente" triggers a second generation cycle', async () => {
		// First call fails, second succeeds.
		fetchAIResponse
			.mockRejectedValueOnce( new Error( 'Falha temporária.' ) )
			.mockResolvedValueOnce( [ 'Retry suggestion' ] );

		await renderModal();
		expect( screen.getByRole( 'alert' ) ).toBeInTheDocument();

		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: 'Tentar novamente' } ) );
		} );

		expect( fetchAIResponse ).toHaveBeenCalledTimes( 2 );
		expect( screen.getByText( 'Retry suggestion' ) ).toBeInTheDocument();
		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
	} );
} );

// ===========================================================================
// Selection and dispatch
// ===========================================================================

describe( 'SelectionModal – selection and dispatch', () => {
	it( 'dispatches editPost({ title }) with the sanitized text on title selection', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'Título Selecionado',
			'Outra opção',
			'Terceira opção',
		] );
		await renderModal( 'title' );

		fireEvent.click( screen.getByRole( 'button', { name: 'Título Selecionado' } ) );

		expect( mockEditPost ).toHaveBeenCalledTimes( 1 );
		expect( mockEditPost ).toHaveBeenCalledWith( { title: 'Título Selecionado' } );
	} );

	it( 'dispatches editPost({ excerpt }) for the excerpt modal type', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'Resumo Selecionado', 'Opção B' ] );
		await renderModal( 'excerpt' );

		fireEvent.click( screen.getByRole( 'button', { name: 'Resumo Selecionado' } ) );

		expect( mockEditPost ).toHaveBeenCalledWith( { excerpt: 'Resumo Selecionado' } );
	} );

	it( 'strips HTML from a suggestion before passing it to editPost', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'<b>Atacante</b> marca dois gols e garante vitória do time',
		] );
		await renderModal( 'title' );

		const expectedText = 'Atacante marca dois gols e garante vitória do time';
		fireEvent.click( screen.getByText( expectedText ) );

		expect( mockEditPost ).toHaveBeenCalledWith( { title: expectedText } );
		expect( mockEditPost.mock.calls[ 0 ][ 0 ].title ).not.toContain( '<b>' );
	} );

	it( 'calls onClose after a suggestion is selected', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'Opção A', 'Opção B', 'Opção C' ] );
		const { onClose } = await renderModal( 'title' );

		fireEvent.click( screen.getByRole( 'button', { name: 'Opção A' } ) );

		expect( onClose ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'calls onClose when the modal close button is clicked without selection', async () => {
		fetchAIResponse.mockResolvedValueOnce( [] );
		const { onClose } = await renderModal( 'title' );

		fireEvent.click( screen.getByRole( 'button', { name: 'Fechar' } ) );

		expect( onClose ).toHaveBeenCalledTimes( 1 );
		expect( mockEditPost ).not.toHaveBeenCalled();
	} );
} );
