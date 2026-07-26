import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#27312f",
        clay: "#b96f5d",
        moss: "#637d63",
        mist: "#edf2ee",
        linen: "#faf7f1"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(39, 49, 47, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
