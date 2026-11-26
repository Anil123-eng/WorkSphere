
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: [
    "**/server/tests/**/*.test.ts",
    "**/src/**/*.test.ts",
    "**/src/**/*.test.tsx",
  ],
  clearMocks: true,
};
