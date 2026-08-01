import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Supabase responses are inherently dynamic — suppressing any is pragmatic here
      "@typescript-eslint/no-explicit-any": "off",
      // Hooks deps warnings are fine; making them errors blocks builds
      "react-hooks/exhaustive-deps": "warn",
      // Layout uses circular <img> for avatar icons intentionally
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
