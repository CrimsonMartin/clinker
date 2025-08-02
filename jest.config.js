module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'https://example.com/test'
  },
  setupFilesAfterEnv: [
    '<rootDir>/src/test-setup.js',
    '<rootDir>/src/global-namespace-setup.js'
  ],
  testMatch: [
    '<rootDir>/__tests__/**/*.(js|ts)',
    '<rootDir>/**/*.(test|spec).(js|ts)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-chrome/',
    '/dist-firefox/',
    '/coverage/'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs'
      }
    }]
  },
  collectCoverageFrom: [
    '*.{js,ts}',
    'components/**/*.{js,ts}',
    'services/**/*.{js,ts}',
    '!jest.config.js',
    '!coverage/**',
    '!node_modules/**',
    '!dist/**',
    '!dist-chrome/**',
    '!dist-firefox/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  roots: ['<rootDir>/__tests__', '<rootDir>/components', '<rootDir>/services']
};
