const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './'
});

// Git worktrees live under .claude/worktrees/ inside this repo, so each one is a
// full second checkout sitting under rootDir. Without these, jest collects every
// other branch's tests alongside our own and a stale failure over there reads as a
// failure here. The <rootDir> prefix is load-bearing: running jest from inside a
// worktree makes that worktree the rootDir, so its own tests still run normally.
const worktreeIgnorePattern = '<rootDir>/\\.claude/worktrees/';

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  // next/jest appends these to its own /node_modules/ and /.next/ defaults
  testPathIgnorePatterns: [worktreeIgnorePattern],
  // Also keep worktrees out of the module map — duplicate copies of every module
  // otherwise make mocking resolve unpredictably.
  modulePathIgnorePatterns: [worktreeIgnorePattern],
  moduleNameMapper: {
    // Handle module aliases (if you have any in tsconfig)
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1'
  }
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
