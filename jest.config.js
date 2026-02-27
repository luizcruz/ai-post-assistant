/**
 * Extends the @wordpress/scripts default Jest preset so tests can live
 * under tests/js/ instead of alongside source files.
 */
const defaultConfig = require( '@wordpress/scripts/config/jest-unit.config.js' );

module.exports = {
	...defaultConfig,
	testMatch: [
		'<rootDir>/tests/js/**/*.test.js',
		'<rootDir>/tests/js/**/*.test.jsx',
	],
};
