/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#0c0d12",
        panel: "#13151c",
        panelBorder: "#232634"
      }
    }
  },
  plugins: []
}
