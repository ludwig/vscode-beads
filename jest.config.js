/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  // Run tests as native ESM (the `test` script already passes
  // --experimental-vm-modules). This lets pure-ESM deps like d3-force (v3 is
  // ESM-only, "type": "module", with no CommonJS build) load via `import`
  // instead of failing under a CommonJS `require`. esbuild already builds the
  // webview from the same ESM source, so test and build agree.
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        diagnostics: false,
        tsconfig: { module: "esnext", moduleResolution: "bundler" },
      },
    ],
  },
};
