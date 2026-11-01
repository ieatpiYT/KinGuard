/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        display: ['"Fredoka"', '"Plus Jakarta Sans"', 'sans-serif']
      },
      colors: {
        kg: {
          sage: '#6A8B5E',
          sageDark: '#4F6B45',
          sageLight: '#EFF5EC',
          sageBorder: '#C3D7BC',
          navy: '#18365A',
          navyDark: '#102540',
          navyLight: '#EDF2F8',
          navyBorder: '#C4D3E3',
          orange: '#FD7A2C',
          orangeDark: '#C24E0A',
          orangeLight: '#FFF3EB',
          orangeBorder: '#F9C8A7',
          cream: '#FBF9ED',
          creamBorder: '#E5E0C8'
        }
      }
    }
  },
  plugins: []
}
