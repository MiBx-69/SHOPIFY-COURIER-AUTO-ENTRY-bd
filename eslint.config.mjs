import js from "@eslint/js";
import next from "eslint-config-next";
import globals from "globals";

const config = [
  js.configs.recommended,
  ...next,
  { ignores: [".next/**", "node_modules/**", "supabase/functions/**"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } }, rules: { "no-undef": "off", "no-unused-vars": "off", "import/no-anonymous-default-export": "off", "react-hooks/exhaustive-deps": "off" } }
];
export default config;
