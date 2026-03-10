import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  collectCoverageFrom: [
    "lib/services/**/*.ts",
    "components/**/*.tsx",
    "hooks/**/*.ts",
    "app/api/**/*.ts",
    "!**/*.d.ts",
  ],
};

export default createJestConfig(config);
