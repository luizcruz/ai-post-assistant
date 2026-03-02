import apiFetch from '@wordpress/api-fetch';

/**
 * tagHelper.js
 *
 * Utilities to resolve a tag name to a WordPress term ID, creating the term
 * if it does not already exist.
 *
 * Uses @wordpress/api-fetch, which in the Gutenberg editor context already
 * has the WP nonce middleware applied by WordPress core — no manual auth
 * headers are needed.
 *
 * Note: creating terms in the `post_tag` taxonomy requires the
 * `manage_post_tags` capability (mapped to `manage_categories`), which is
 * available to Editors and Administrators. Authors/Contributors can only
 * add existing tags; if creation fails with a 403 the error is surfaced to
 * the UI and the remaining selected tags are still applied.
 */

/**
 * Given a tag name, returns the WordPress term ID for that tag.
 * Searches for an exact (case-insensitive) match first; creates a new term
 * if none is found.
 *
 * @param { string } name  Raw tag name (will be trimmed and length-capped).
 * @returns { Promise<number> }
 * @throws  { Error } if the REST request fails (network error or permissions).
 */
export async function resolveOrCreateTag( name ) {
	const safeName = name.trim().slice( 0, 200 ); // WP limits term names to 200 chars

	// 1. Search for an existing term with this name (REST ?search= is substring,
	//    so we fetch a small page and do exact matching client-side).
	const candidates = await apiFetch( {
		path: `/wp/v2/tags?search=${ encodeURIComponent( safeName ) }&per_page=10&_fields=id,name`,
	} );

	const exact = candidates.find(
		( term ) => term.name.toLowerCase() === safeName.toLowerCase()
	);

	if ( exact ) {
		return exact.id;
	}

	// 2. Not found — create a new term.
	const created = await apiFetch( {
		method: 'POST',
		path:   '/wp/v2/tags',
		data:   { name: safeName },
	} );

	return created.id;
}
