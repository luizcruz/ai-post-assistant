/**
 * Unit tests for src/components/ResumoPanel.jsx
 */
import { render, screen, fireEvent } from '@testing-library/react';
import ResumoPanel from '../../src/components/ResumoPanel';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock( '../../src/components/SelectionModal', () => ( {
	__esModule: true,
	default: ( { type, onClose } ) => (
		<div data-testid="selection-modal" data-type={ type }>
			<button onClick={ onClose }>Fechar Modal</button>
		</div>
	),
} ) );

jest.mock( '@wordpress/components', () => ( {
	Button: ( { children, onClick, disabled, className } ) => (
		<button
			onClick={ onClick }
			disabled={ disabled }
			className={ className }
		>
			{ children }
		</button>
	),
} ) );

jest.mock( '@wordpress/element', () => ( {
	...jest.requireActual( 'react' ),
} ) );

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
} ) );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe( 'ResumoPanel', () => {
	it( 'renders the "✨ IA Resumo" trigger button', () => {
		render( <ResumoPanel /> );
		expect(
			screen.getByRole( 'button', { name: '✨ IA Resumo' } )
		).toBeInTheDocument();
	} );

	it( 'does not render SelectionModal on first paint', () => {
		render( <ResumoPanel /> );
		expect( screen.queryByTestId( 'selection-modal' ) ).not.toBeInTheDocument();
	} );

	it( 'opens SelectionModal with type="excerpt" when the button is clicked', () => {
		render( <ResumoPanel /> );
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Resumo' } ) );

		const modal = screen.getByTestId( 'selection-modal' );
		expect( modal ).toBeInTheDocument();
		expect( modal ).toHaveAttribute( 'data-type', 'excerpt' );
	} );

	it( 'closes SelectionModal when onClose callback is invoked', () => {
		render( <ResumoPanel /> );
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Resumo' } ) );
		expect( screen.getByTestId( 'selection-modal' ) ).toBeInTheDocument();

		fireEvent.click( screen.getByRole( 'button', { name: 'Fechar Modal' } ) );
		expect( screen.queryByTestId( 'selection-modal' ) ).not.toBeInTheDocument();
	} );
} );
