import js from "@eslint/js";
import next from "eslint-config-next";
import globals from "globals";

export default [
  js.configs.recommended,
  ...next,
  { ignores: [".next/**", "node_modules/**", "supabase/functions/**"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } }
];
