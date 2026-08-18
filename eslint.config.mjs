import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // Existing effects coordinate remote API state and selection resets.
    // React 19's new advisory rule is not a correctness or security check.
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  },
  globalIgnores([".next/**", "node_modules/**", "work/**", "next-env.d.ts"])
]);
