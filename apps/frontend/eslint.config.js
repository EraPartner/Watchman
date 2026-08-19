import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";

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
      ...typescriptEslint.configs.recommended.rules,
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
    files: ["**/*.{js,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
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
