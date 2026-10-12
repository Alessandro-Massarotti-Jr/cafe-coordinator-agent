/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/evals/rag"],
  testMatch: ["**/*.rag-test.ts"],
  testTimeout: 600000,
};
