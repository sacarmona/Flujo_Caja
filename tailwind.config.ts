import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        adentu: {
          ink: "#1f2933",
          blue: "#0f5f8f",
          teal: "#0f766e",
          gold: "#b7791f",
          mist: "#eef5f7",
          navy: "#0b2c4d",
          "navy-light": "#173f66"
        }
      }
    }
  },
  plugins: []
};

export default config;
