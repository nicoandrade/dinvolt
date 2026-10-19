import core from "ultracite/eslint/core";
import next from "ultracite/eslint/next";
import react from "ultracite/eslint/react";

export default [
  ...core,
  ...react,
  ...next,
  {
    rules: {
      // Unicorn's return-style rule and arrow-body-style contradict each
      // other for multiline JSX. Keep Unicorn's explicit-return convention.
      "arrow-body-style": "off",
      // Match React's required arrow components instead of inline functions.
      "unicorn/default-export-style": ["error", { functions: "separate" }],
    },
  },
];
