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
        },
        /**
         * Se sobreescriben solo los tonos claros (bordes y fondos de
         * tarjetas/tablas en toda la app), con tinte azulado en vez del gris
         * neutro por defecto de Tailwind; los tonos 400-900 (usados para
         * texto) se dejan sin tocar para no afectar el contraste/legibilidad.
         */
        slate: {
          50: "#eef4fa",
          100: "#e2edf7",
          200: "#cfe0ee",
          300: "#a9c9e0"
        }
      }
    }
  },
  plugins: []
};

export default config;
