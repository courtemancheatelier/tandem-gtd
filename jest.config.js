/** @type {import('jest').Config} */
const config = {
  projects: [
    // Node tests (API, services, cascade, schema, validations)
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/tests"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "tsconfig.json",
          },
        ],
      },
      testMatch: [
        "<rootDir>/tests/lib/**/*.test.ts",
        "<rootDir>/tests/api/**/*.test.ts",
      ],
    },
    // Component tests (React components with jsdom)
    {
      displayName: "components",
      preset: "ts-jest",
      testEnvironment: "jsdom",
      roots: ["<rootDir>/tests"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "tsconfig.jest.json",
          },
        ],
      },
      testMatch: ["<rootDir>/tests/components/**/*.test.tsx"],
    },
    // Inline src tests (wiki round-trip, parsers, etc.)
    {
      displayName: "src",
      testEnvironment: "node",
      roots: ["<rootDir>/src"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
        "\\.css$": "<rootDir>/src/__mocks__/styleMock.js",
      },
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
      },
      transformIgnorePatterns: [
        "node_modules/(?!(tiptap-markdown)/)",
      ],
    },
  ],
};

module.exports = config;
