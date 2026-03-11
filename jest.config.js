/**
 * Extends the @wordpress/scripts default Jest preset so tests can live
 * under tests/js/ instead of alongside source files.
 *
 * CI=true: disables Jest's animated status ticker (DefaultReporter / Status)
 * which crashes with "Invalid count value" when the terminal is narrower than
 * the progress bar it tries to render.  Safe to set unconditionally.
 */
process.env.CI = 'true';

const defaultConfig = require( '@wordpress/scripts/config/jest-unit.config.js' );

module.exports = {
	...defaultConfig,
	// @wordpress/jest-preset-default ships with enzyme-to-json as a snapshot
	// serializer. enzyme-to-json pulls in cheerio → parse5-parser-stream,
	// which uses `node:stream` — a syntax Jest 26 cannot resolve.
	// Our tests use @testing-library/react (not Enzyme), so remove it.
	snapshotSerializers: [],
	testMatch: [
		'<rootDir>/tests/js/**/*.test.js',
		'<rootDir>/tests/js/**/*.test.jsx',
	],
	// Imports @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
	setupFilesAfterEnv: [
		...( defaultConfig.setupFilesAfterEnv ?? [] ),
		'<rootDir>/tests/js/setup.js',
	],
};
