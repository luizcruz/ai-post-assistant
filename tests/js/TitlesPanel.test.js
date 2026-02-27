/**
 * Unit tests for src/components/TitlesPanel.jsx
 */
import { render, screen, fireEvent } from '@testing-library/react';
import TitlesPanel from '../../src/components/TitlesPanel';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stub SelectionModal – we only care that TitlesPanel mounts and wires it up.
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
} ), { virtual: true } );

jest.mock( '@wordpress/element', () => ( {
	...jest.requireActual( 'react' ),
} ), { virtual: true } );

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
} ), { virtual: true } );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe( 'TitlesPanel', () => {
	it( 'renders the "✨ IA Títulos" trigger button', () => {
		render( <TitlesPanel /> );
		expect(
			screen.getByRole( 'button', { name: '✨ IA Títulos' } )
		).toBeInTheDocument();
	} );

	it( 'does not render SelectionModal on first paint', () => {
		render( <TitlesPanel /> );
		expect( screen.queryByTestId( 'selection-modal' ) ).not.toBeInTheDocument();
	} );

	it( 'opens SelectionModal with type="title" when the button is clicked', () => {
		render( <TitlesPanel /> );
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) );

		const modal = screen.getByTestId( 'selection-modal' );
		expect( modal ).toBeInTheDocument();
		expect( modal ).toHaveAttribute( 'data-type', 'title' );
	} );

	it( 'closes SelectionModal when onClose callback is invoked', () => {
		render( <TitlesPanel /> );
		fireEvent.click( screen.getByRole( 'button', { name: '✨ IA Títulos' } ) );
		expect( screen.getByTestId( 'selection-modal' ) ).toBeInTheDocument();

		fireEvent.click( screen.getByRole( 'button', { name: 'Fechar Modal' } ) );
		expect( screen.queryByTestId( 'selection-modal' ) ).not.toBeInTheDocument();
	} );
} );
