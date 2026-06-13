/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  transform: {
    // The project tsconfig uses `module: esnext` + `moduleResolution: bundler`
    // to match the esbuild pipeline, but Jest runs under CommonJS — pin ts-jest
    // to a CJS-compatible module/resolution so tests transpile to CJS.
    "^.+\\.ts$": [
      "ts-jest",
      { diagnostics: false, tsconfig: { module: "commonjs", moduleResolution: "node" } },
    ],
  },
};
