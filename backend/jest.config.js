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
    "!src/evals/**",
    "!src/seeds/**",
    "!src/**/index.ts",
    "!src/**/interfaces/**",
    "!src/**/dtos/**",
  ],
};
