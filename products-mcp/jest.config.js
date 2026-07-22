/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.spec.ts"],
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",

    "!src/index.ts",
    "!src/server.ts",
    "!src/**/index.ts",
    "!src/errors/**",

    "!src/domain/**",
    "!src/**/*DTO.ts",
  ],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
  },
};
