import { defineConfig } from "oxlint";

export const baseOxLintConfig = defineConfig({
  categories: {
    correctness: "error",
    perf: "error",
    suspicious: "error",
  },
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "jsdoc", "node", "promise"],
});
