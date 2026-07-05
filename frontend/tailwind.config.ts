import { tailwindThemeTokens } from "./src/shared/design/tokens";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: tailwindThemeTokens.colors,
      borderRadius: tailwindThemeTokens.borderRadius,
      spacing: tailwindThemeTokens.spacing,
      boxShadow: tailwindThemeTokens.boxShadow,
    },
  },
  plugins: [require("tailwindcss-animate")],
};
