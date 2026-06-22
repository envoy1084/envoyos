import { defineConfig } from "oxlint";

import { baseOxLintConfig } from "./base";

export const testOxLintConfig = defineConfig({
  extends: [baseOxLintConfig],
  plugins: ["vitest"],
});
