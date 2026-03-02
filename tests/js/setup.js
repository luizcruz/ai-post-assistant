/**
 * Global Jest setup — runs after the test framework is installed.
 * Extends Jest's expect with @testing-library/jest-dom matchers so every
 * test file can use toBeInTheDocument(), toHaveTextContent(), etc. without
 * a per-file import.
 */
import '@testing-library/jest-dom';
