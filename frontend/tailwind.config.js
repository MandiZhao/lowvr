/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'wandb': {
          50: '#fef7ec',
          100: '#fcecc9',
          200: '#f9d88f',
          300: '#f5bc4e',
          400: '#f2a526',
          500: '#eb8a0c',
          600: '#cf6507',
          700: '#ac470a',
          800: '#8c380f',
          900: '#732f0f',
        },
      },
    },
  },
  plugins: [],
}
