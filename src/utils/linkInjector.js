/**
 * linkInjector.js
 *
 * Pure DOM-manipulation utilities that inject <a> links into Gutenberg
 * paragraph block content for a given keyword→URL map.
 *
 * Design decisions:
 *  - Works entirely with the browser DOM (no regex on raw HTML strings) so
 *    existing markup is never accidentally corrupted.
 *  - Text already inside an <a> element is never re-linked (no nested anchors).
 *  - A per-URL usage counter is seeded by scanning the existing links already
 *    present in the blocks, so clicking the button a second time does NOT add
 *    duplicate links beyond the cap.
 *  - Keywords are tested most-specific-first (caller's responsibility via
 *    LINK_MAP ordering) to avoid the shorter variant consuming quota when the
 *    longer one matches.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Processes all paragraph blocks and inserts anchor tags for every keyword
 * defined in linkMap, capped at maxPerKeyword links per URL across the post.
 *
 * Existing <a> elements pointing to the same URL are counted toward the cap
 * so repeated clicks remain idempotent once the cap is reached.
 *
 * @param { Object[] } blocks        Gutenberg block objects (from getBlocks()).
 * @param { Array<{url:string, keywords:string[]}> } linkMap
 * @param { number }   maxPerKeyword Maximum links per URL (default 2).
 * @returns {{ updatedBlocks: Object[], totalLinksAdded: number }}
 */
export function injectLinksIntoBlocks( blocks, linkMap, maxPerKeyword = 2 ) {
	// Seed the counter with links already present in the editor so that
	// re-clicking the button never exceeds the cap.
	const usageCount = countExistingLinks( blocks, linkMap );

	let totalLinksAdded = 0;

	const updatedBlocks = blocks.map( ( block ) => {
		if ( block.name !== 'core/paragraph' ) {
			return block;
		}

		let content = block.attributes?.content ?? '';
		let blockLinksAdded = 0;

		for ( const { url, keywords } of linkMap ) {
			const used = usageCount.get( url ) ?? 0;

			if ( used >= maxPerKeyword ) {
				continue;
			}

			let remaining = maxPerKeyword - used;
			let addedForUrl = 0;

			for ( const keyword of keywords ) {
				if ( remaining <= 0 ) {
					break;
				}

				const result = injectKeywordInHtml( content, keyword, url, remaining );
				content = result.html;
				addedForUrl += result.count;
				remaining  -= result.count;
				blockLinksAdded += result.count;
			}

			if ( addedForUrl > 0 ) {
				usageCount.set( url, used + addedForUrl );
			}
		}

		totalLinksAdded += blockLinksAdded;

		// Return the original object reference when nothing changed to keep
		// React's reconciliation fast.
		if ( blockLinksAdded === 0 ) {
			return block;
		}

		return {
			...block,
			attributes: { ...block.attributes, content },
		};
	} );

	return { updatedBlocks, totalLinksAdded };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Walks every paragraph block and counts how many times each URL from linkMap
 * already appears as an <a href> in the content.
 *
 * @param { Object[] } blocks
 * @param { Array<{url:string}> } linkMap
 * @returns { Map<string, number> }
 */
function countExistingLinks( blocks, linkMap ) {
	const urlSet = new Set( linkMap.map( ( entry ) => entry.url ) );
	const counts = new Map();

	const container = document.createElement( 'div' );

	for ( const block of blocks ) {
		if ( block.name !== 'core/paragraph' ) {
			continue;
		}

		container.innerHTML = block.attributes?.content ?? '';

		for ( const anchor of container.querySelectorAll( 'a[href]' ) ) {
			const href = anchor.getAttribute( 'href' );
			if ( urlSet.has( href ) ) {
				counts.set( href, ( counts.get( href ) ?? 0 ) + 1 );
			}
		}
	}

	return counts;
}

/**
 * Injects up to `maxReplacements` <a> tags for `keyword` into the HTML string.
 * Existing <a> descendants are never modified (collectTextNodes skips them).
 *
 * @param { string } html
 * @param { string } keyword
 * @param { string } url
 * @param { number } maxReplacements
 * @returns {{ html: string, count: number }}
 */
function injectKeywordInHtml( html, keyword, url, maxReplacements ) {
	const div = document.createElement( 'div' );
	div.innerHTML = html;

	const regex = buildKeywordRegex( keyword );
	let count = 0;

	// Collect text nodes once per keyword pass. After DOM mutations the
	// original nodes are detached; the guard inside replaceInTextNode
	// handles any that were already consumed by an earlier sibling pass.
	const textNodes = collectTextNodes( div );

	for ( const node of textNodes ) {
		if ( count >= maxReplacements ) {
			break;
		}

		// Guard: node may have been detached if a previous iteration
		// replaced a sibling that contained this node (shouldn't happen
		// with our DOM structure, but is cheap to check).
		if ( ! node.parentNode ) {
			continue;
		}

		count += replaceInTextNode( node, regex, url, maxReplacements - count );
	}

	return { html: div.innerHTML, count };
}

/**
 * Collects all Text nodes that are NOT descendants of an <a> element.
 * This prevents creating nested anchors.
 *
 * @param { Node } root
 * @returns { Text[] }
 */
function collectTextNodes( root ) {
	const result = [];

	const walk = ( node ) => {
		if ( node.nodeType === Node.TEXT_NODE ) {
			result.push( node );
			return;
		}
		// Do not descend into existing links.
		if ( node.nodeType === Node.ELEMENT_NODE && node.nodeName.toUpperCase() === 'A' ) {
			return;
		}
		for ( const child of node.childNodes ) {
			walk( child );
		}
	};

	walk( root );
	return result;
}

/**
 * Replaces up to `maxCount` occurrences of `regex` in `textNode` with <a>
 * elements pointing to `url`. Returns the number of replacements made.
 *
 * Approach: find all matches, build an array of Text/Element fragments,
 * insert them before the original node, then remove the original node.
 *
 * @param { Text }   textNode
 * @param { RegExp } regex       Must have the `g` flag.
 * @param { string } url
 * @param { number } maxCount
 * @returns { number }
 */
function replaceInTextNode( textNode, regex, url, maxCount ) {
	const text = textNode.textContent;

	regex.lastIndex = 0;

	let match;
	let lastIndex = 0;
	let count     = 0;
	const fragments = [];

	while ( ( match = regex.exec( text ) ) !== null && count < maxCount ) {
		// Text before the match.
		if ( match.index > lastIndex ) {
			fragments.push( document.createTextNode( text.slice( lastIndex, match.index ) ) );
		}

		// The anchor – use match[0] to preserve the original casing from the
		// article text rather than the keyword definition.
		const anchor = document.createElement( 'a' );
		anchor.href        = url;
		anchor.textContent = match[ 0 ];
		fragments.push( anchor );

		count++;
		lastIndex = regex.lastIndex;
	}

	if ( count === 0 ) {
		return 0;
	}

	// Remaining text after the last match.
	if ( lastIndex < text.length ) {
		fragments.push( document.createTextNode( text.slice( lastIndex ) ) );
	}

	// Splice the fragments into the DOM in place of the original text node.
	const parent = textNode.parentNode;
	for ( const fragment of fragments ) {
		parent.insertBefore( fragment, textNode );
	}
	parent.removeChild( textNode );

	return count;
}

/**
 * Builds a case-insensitive, global RegExp for `keyword` with whole-word
 * boundaries that correctly handle accented Latin characters (Portuguese).
 *
 * The lookbehind / lookahead assertions reject matches that are immediately
 * surrounded by a letter, digit, or accented character, preventing partial
 * matches like "Santos" inside a hypothetical "SantosFC" compound.
 *
 * Requires Chrome ≥ 62 for lookbehind support (the plugin already requires
 * Chrome ≥ 127 for the on-device AI APIs).
 *
 * @param { string } keyword
 * @returns { RegExp }
 */
function buildKeywordRegex( keyword ) {
	const escaped = keyword.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );

	// Character class that covers ASCII word chars + accented Latin range
	// used in Portuguese (à-ö ø-ÿ covers the vast majority).
	const wordChar = '[a-zA-ZÀ-ÖØ-öø-ÿ\\d]';

	return new RegExp( `(?<!${ wordChar })${ escaped }(?!${ wordChar })`, 'gi' );
}
