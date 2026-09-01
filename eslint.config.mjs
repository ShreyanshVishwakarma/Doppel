import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ai-elements are vendored from the AI Elements library; upstream patterns
  // intentionally use render-phase ref sync and setState-in-effect for
  // highlight/canvas flows. Downgrade those to warnings so `npm run lint`
  // remains useful without blocking builds.
  {
    files: ["components/ai-elements/**", "components/ui/carousel.tsx"],
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "off",
    },
  },
  {
    files: ["convex/_generated/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
