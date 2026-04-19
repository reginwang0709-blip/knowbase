import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18212f",
        muted: "#667085",
        line: "#e4e7ec",
        panel: "#f8fafc",
        sage: "#557c6b",
        coral: "#df7a5e",
        gold: "#c28a2e",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(24, 33, 47, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
