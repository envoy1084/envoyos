import { defineConfig } from "oxlint";

import { reactOxLintConfig } from "./react";

export const nextOxLintConfig = defineConfig({
  extends: [reactOxLintConfig],
  plugins: ["nextjs"],
});
