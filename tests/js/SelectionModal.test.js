/**
 * Unit tests for src/components/SelectionModal.jsx
 *
 * Key assertions:
 *  - fetchAIResponse is called with the correct type and context text.
 *  - AI suggestions are sanitized before being displayed.
 *  - Clicking a suggestion calls editPost() with the correct key and
 *    a sanitized value.
 *  - No dangerouslySetInnerHTML path is exercised: XSS payloads in AI
 *    output appear as literal text, not as injected HTML.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SelectionModal from '../../src/components/SelectionModal';

// ---------------------------------------------------------------------------
// Shared mock state (reset between tests via beforeEach)
// ---------------------------------------------------------------------------

const mockEditPost   = jest.fn();
const mockGetBlocks  = jest.fn();

const MOCK_BLOCKS = [
	{
		name: 'core/paragraph',
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
	useSelect: jest.fn( ( selector ) => {
		const selectFn = ( storeName ) => {
			if ( storeName === 'core/block-editor' ) {
				return { getBlocks: mockGetBlocks };
			}
			return {};
		};
		return selector( selectFn );
	} ),
} ), { virtual: true } );

// Partial mock: real sanitizeAIText & extractTextFromBlocks logic so XSS
// assertions are meaningful, but fetchAIResponse is controllable per-test.
jest.mock( '../../src/utils/aiHelper', () => {
	const actual = jest.requireActual( '../../src/utils/aiHelper' );
	return {
		...actual,
		fetchAIResponse: jest.fn(),
	};
} );

jest.mock( '@wordpress/components', () => ( {
	Modal: ( { title, children, onRequestClose } ) => (
		<div role="dialog" aria-label={ title }>
			{ children }
			<button onClick={ onRequestClose }>{ 'Fechar' }</button>
		</div>
	),
	Button: ( { children, onClick, disabled } ) => (
		<button onClick={ onClick } disabled={ disabled }>
			{ children }
		</button>
	),
	Spinner: () => <span aria-label="loading">...</span>,
} ), { virtual: true } );

jest.mock( '@wordpress/element', () => ( {
	...jest.requireActual( 'react' ),
} ) );

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
} ) );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { fetchAIResponse } from '../../src/utils/aiHelper';

function renderModal( type = 'title', onClose = jest.fn() ) {
	return { onClose, ...render( <SelectionModal type={ type } onClose={ onClose } /> ) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach( () => {
	jest.clearAllMocks();
	mockGetBlocks.mockReturnValue( MOCK_BLOCKS );
} );

describe( 'SelectionModal – render', () => {
	it( 'renders the title modal with correct label', () => {
		renderModal( 'title' );
		expect( screen.getByRole( 'dialog', { name: 'Sugestões de Título (SEO)' } ) ).toBeInTheDocument();
	} );

	it( 'renders the excerpt modal with correct label', () => {
		renderModal( 'excerpt' );
		expect( screen.getByRole( 'dialog', { name: 'Sugestões de Resumo' } ) ).toBeInTheDocument();
	} );

	it( 'shows the "Gerar Sugestões" button initially', () => {
		renderModal();
		expect( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) ).toBeInTheDocument();
	} );

	it( 'shows no suggestions before generate is clicked', () => {
		renderModal();
		expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument();
	} );
} );

describe( 'SelectionModal – generation flow', () => {
	it( 'calls fetchAIResponse with the correct type and extracted text', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'A', 'B', 'C' ] );

		renderModal( 'title' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );

		await waitFor( () => screen.getByText( 'A' ) );

		expect( fetchAIResponse ).toHaveBeenCalledTimes( 1 );
		expect( fetchAIResponse ).toHaveBeenCalledWith(
			'title',
			expect.stringContaining( 'test paragraph' )
		);
	} );

	it( 'renders exactly the 3 returned suggestions', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'Sugestão Um',
			'Sugestão Dois',
			'Sugestão Três',
		] );

		renderModal();
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );

		await waitFor( () => screen.getByText( 'Sugestão Um' ) );

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

		const { container } = renderModal( 'title' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );

		await waitFor( () => screen.getByText( 'Clean Title' ) );

		// The raw XSS payload should not appear anywhere in the DOM.
		expect( container.innerHTML ).not.toContain( '<script>' );
		expect( container.innerHTML ).not.toContain( 'onerror' );
		expect( container.innerHTML ).not.toContain( 'alert' );

		// The safe text part is still visible.
		expect( screen.getByText( 'Clean Title' ) ).toBeInTheDocument();
	} );

	it( 'shows an error message when fetchAIResponse rejects', async () => {
		fetchAIResponse.mockRejectedValueOnce( new Error( 'API falhou' ) );

		renderModal();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );
		} );

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'API falhou' );
	} );

	it( 'shows a "no content" error when all blocks are empty', async () => {
		mockGetBlocks.mockReturnValue( [] ); // no blocks → no context text

		renderModal();
		await act( async () => {
			fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );
		} );

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent(
			'Nenhum parágrafo com texto suficiente foi encontrado.'
		);
		expect( fetchAIResponse ).not.toHaveBeenCalled();
	} );
} );

describe( 'SelectionModal – selection and dispatch', () => {
	it( 'calls editPost({ title }) with the sanitized text on title selection', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'Título Selecionado',
			'Outra opção',
			'Terceira opção',
		] );

		renderModal( 'title' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );
		await waitFor( () => screen.getByText( 'Título Selecionado' ) );

		fireEvent.click( screen.getByRole( 'button', { name: 'Título Selecionado' } ) );

		expect( mockEditPost ).toHaveBeenCalledTimes( 1 );
		expect( mockEditPost ).toHaveBeenCalledWith( { title: 'Título Selecionado' } );
	} );

	it( 'calls editPost({ excerpt }) with the sanitized text on excerpt selection', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'Resumo Selecionado',
			'Outra opção',
			'Terceira opção',
		] );

		renderModal( 'excerpt' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );
		await waitFor( () => screen.getByText( 'Resumo Selecionado' ) );

		fireEvent.click( screen.getByRole( 'button', { name: 'Resumo Selecionado' } ) );

		expect( mockEditPost ).toHaveBeenCalledWith( { excerpt: 'Resumo Selecionado' } );
	} );

	it( 'strips HTML from a suggestion before passing it to editPost', async () => {
		fetchAIResponse.mockResolvedValueOnce( [
			'<b>Atacante</b> marca dois gols e garante vitória do time',
			'B',
			'C',
		] );

		renderModal( 'title' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );
		// sanitizeAIText strips the <b> tag during generation
		await waitFor( () =>
			screen.getByText( 'Atacante marca dois gols e garante vitória do time' )
		);

		fireEvent.click(
			screen.getByText( 'Atacante marca dois gols e garante vitória do time' )
		);

		expect( mockEditPost ).toHaveBeenCalledWith( {
			title: 'Atacante marca dois gols e garante vitória do time',
		} );
		// The raw HTML tag must never reach the data store.
		expect( mockEditPost.mock.calls[ 0 ][ 0 ].title ).not.toContain( '<b>' );
	} );

	it( 'calls onClose after a suggestion is selected', async () => {
		fetchAIResponse.mockResolvedValueOnce( [ 'Opção A', 'Opção B', 'Opção C' ] );

		const { onClose } = renderModal( 'title' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Gerar Sugestões' } ) );
		await waitFor( () => screen.getByText( 'Opção A' ) );
		fireEvent.click( screen.getByRole( 'button', { name: 'Opção A' } ) );

		expect( onClose ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'calls onClose when the modal X button is clicked without selection', () => {
		const { onClose } = renderModal( 'title' );
		fireEvent.click( screen.getByRole( 'button', { name: 'Fechar' } ) );
		expect( onClose ).toHaveBeenCalledTimes( 1 );
		expect( mockEditPost ).not.toHaveBeenCalled();
	} );
} );
