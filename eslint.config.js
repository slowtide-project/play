import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dev-dist",
      "coverage",
      "node_modules",
      "eslint.config.js",
      "**/*.timestamp-*.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  // The engine core must stay pure: no DOM or timer globals allowed here.
  {
    files: ["src/engine/**/*.ts"],
    ignores: ["src/engine/**/*.test.ts"],
    languageOptions: {
      globals: {},
    },
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "engine must be pure: no DOM access" },
        { name: "document", message: "engine must be pure: no DOM access" },
        { name: "localStorage", message: "engine must be pure: use injected storage" },
        { name: "setTimeout", message: "engine must be pure: no timers" },
        { name: "setInterval", message: "engine must be pure: no timers" },
        { name: "Date", message: "engine must be pure: take time as a parameter" },
      ],
    },
  },
  prettier,
);
