/**
 * Unit tests for src/utils/aiHelper.js
 *
 * These tests do NOT mock the browser DOM because jsdom (provided by
 * @wordpress/scripts / jest-environment-jsdom) supplies document.createElement.
 */
import { sanitizeAIText, extractTextFromBlocks } from '../../src/utils/aiHelper';

// =============================================================================
// sanitizeAIText
// =============================================================================

describe( 'sanitizeAIText', () => {
	it( 'returns an empty string for non-string inputs', () => {
		expect( sanitizeAIText( null ) ).toBe( '' );
		expect( sanitizeAIText( undefined ) ).toBe( '' );
		expect( sanitizeAIText( 42 ) ).toBe( '' );
		expect( sanitizeAIText( {} ) ).toBe( '' );
	} );

	it( 'strips HTML tags', () => {
		expect( sanitizeAIText( '<b>Bold</b> title' ) ).toBe( 'Bold title' );
		expect( sanitizeAIText( '<em>Italic</em>' ) ).toBe( 'Italic' );
	} );

	it( 'strips a <script> XSS payload', () => {
		const xss = '<script>alert("xss")</script>Legit title';
		const result = sanitizeAIText( xss );
		expect( result ).toBe( 'Legit title' );
		expect( result ).not.toContain( '<script>' );
		expect( result ).not.toContain( 'alert' );
	} );

	it( 'strips inline event-handler attributes', () => {
		// e.g. AI returns an <img> tag with onerror
		const evil = '<img src=x onerror=alert(1)>Clean text';
		expect( sanitizeAIText( evil ) ).toBe( 'Clean text' );
	} );

	it( 'replaces control characters with spaces', () => {
		const withNull = 'Hello\u0000World';
		expect( sanitizeAIText( withNull ) ).toBe( 'Hello World' );

		const withBell = 'Ring\u0007Bell';
		expect( sanitizeAIText( withBell ) ).toBe( 'Ring Bell' );
	} );

	it( 'collapses multiple whitespace into a single space', () => {
		expect( sanitizeAIText( 'Too   many    spaces' ) ).toBe(
			'Too many spaces'
		);
	} );

	it( 'trims leading and trailing whitespace', () => {
		expect( sanitizeAIText( '  padded  ' ) ).toBe( 'padded' );
	} );

	it( 'enforces the default maximum length of 500 characters', () => {
		const long = 'a'.repeat( 600 );
		expect( sanitizeAIText( long ).length ).toBe( 500 );
	} );

	it( 'enforces a custom maximum length', () => {
		expect( sanitizeAIText( 'Hello World', 5 ).length ).toBe( 5 );
	} );

	it( 'returns the original string when it is already clean', () => {
		expect( sanitizeAIText( 'Artigo limpo e sem marcação' ) ).toBe(
			'Artigo limpo e sem marcação'
		);
	} );
} );

// =============================================================================
// extractTextFromBlocks
// =============================================================================

describe( 'extractTextFromBlocks', () => {
	it( 'returns empty string for an empty block array', () => {
		expect( extractTextFromBlocks( [] ) ).toBe( '' );
	} );

	it( 'returns empty string for non-array input', () => {
		expect( extractTextFromBlocks( null ) ).toBe( '' );
		expect( extractTextFromBlocks( undefined ) ).toBe( '' );
	} );

	it( 'extracts text from core/paragraph blocks', () => {
		const blocks = [
			{
				name: 'core/paragraph',
				attributes: {
					content: 'This is a paragraph with enough words to pass the filter.',
				},
			},
		];
		expect( extractTextFromBlocks( blocks ) ).toContain(
			'This is a paragraph'
		);
	} );

	it( 'strips HTML tags from block content', () => {
		const blocks = [
			{
				name: 'core/paragraph',
				attributes: {
					content:
						'<strong>Formatted</strong> paragraph with enough words here.',
				},
			},
		];
		const result = extractTextFromBlocks( blocks );
		expect( result ).not.toContain( '<strong>' );
		expect( result ).toContain( 'Formatted paragraph' );
	} );

	it( 'ignores non-paragraph blocks', () => {
		const blocks = [
			{
				name: 'core/image',
				attributes: { url: 'https://example.com/image.jpg', alt: '' },
			},
			{
				name: 'core/paragraph',
				attributes: { content: 'Valid paragraph with sufficient words for inclusion.' },
			},
		];
		const result = extractTextFromBlocks( blocks );
		expect( result ).not.toContain( 'example.com' );
		expect( result ).toContain( 'Valid paragraph' );
	} );

	it( 'filters out short paragraphs (5 words or fewer)', () => {
		const blocks = [
			{
				name: 'core/paragraph',
				attributes: { content: 'Too short.' }, // 2 words
			},
			{
				name: 'core/paragraph',
				attributes: {
					content: 'This paragraph is definitely long enough to pass.',
				},
			},
		];
		const result = extractTextFromBlocks( blocks );
		expect( result ).not.toContain( 'Too short' );
		expect( result ).toContain( 'definitely long enough' );
	} );

	it( 'joins valid paragraphs with double newlines', () => {
		const blocks = [
			{
				name: 'core/paragraph',
				attributes: { content: 'First paragraph has enough words to be included here.' },
			},
			{
				name: 'core/paragraph',
				attributes: { content: 'Second paragraph also has enough words to be included.' },
			},
		];
		const result = extractTextFromBlocks( blocks );
		expect( result ).toContain( '\n\n' );
	} );

	it( 'handles blocks with missing content attribute', () => {
		const blocks = [
			{
				name: 'core/paragraph',
				attributes: {}, // no content
			},
		];
		// Should not throw; empty paragraphs are filtered out.
		expect( () => extractTextFromBlocks( blocks ) ).not.toThrow();
	} );
} );
