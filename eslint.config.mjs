import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  prettier,
  {
    // Supabase is reachable only through src/server/ (repositories, services, clients).
    files: ["**/*.{js,mjs,ts,tsx}"],
    ignores: ["src/server/**", "scripts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*"],
              message:
                "Import Supabase interdit hors de src/server/ : passez par les repositories et services.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      "src/server/db/database.types.ts",
    ],
  },
];

export default eslintConfig;
