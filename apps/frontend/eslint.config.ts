import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import {
  rulesOf,
  strictTypeAwareRules,
} from "../../config/eslint-type-aware.ts";

const typescriptEslint = tseslint.plugin;
const typescriptParser = tseslint.parser;

export default [
  {
    ignores: [
      "dist",
      "dist/**",
      "**/dist/**",
      "backend/",
      "hardware/",
      "public/",
      "coverage*/**",
    ],
  },

  // include the recommended config first
  js.configs.recommended,

  // project-specific rules and settings
  {
    ignores: [
      "dist",
      "dist/**",
      "**/dist/**",
      "backend/",
      "hardware/",
      "public/",
      "coverage*/**",
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      react: react,
    },
    rules: {
      // typescript-eslint's recommended rules (flat config form; the plugin's
      // legacy `configs.recommended` is untyped).
      ...rulesOf(tseslint.configs.recommended),
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "react/react-in-jsx-scope": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // file-specific configuration (replaces the previous `overrides` usage)
  {
    // Type-aware linting with the same rule set as EraPartner/Vision
    // (strict-type-checked as errors, see config/eslint-type-aware.ts).
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...strictTypeAwareRules(tseslint),
      "no-undef": "off",
    },
  },
  {
    // These modules intentionally co-locate component primitives with their
    // variants, Radix aliases, or companion hook.
    files: [
      "src/components/primitives/**/*.{ts,tsx}",
      "src/providers/WebSocketProvider.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
