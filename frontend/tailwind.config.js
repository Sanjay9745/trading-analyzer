/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tv: {
          bg: "#131722",
          panel: "#1c2030",
          border: "#2a2e39",
          text: "#d1d4dc",
          muted: "#787b86",
          green: "#26a69a",
          red: "#ef5350",
          "green-hover": "#2bbbad",
          "red-hover": "#f66865"
        }
      }
    },
  },
  plugins: [],
}
