import { defineConfig } from "oxlint";

import { baseOxLintConfig } from "./base";

export const reactOxLintConfig = defineConfig({
  extends: [baseOxLintConfig],
  plugins: ["react", "react-perf", "jsx-a11y"],
});
