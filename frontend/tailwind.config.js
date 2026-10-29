/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#14532D',
          dark: '#0F3E22',
          light: '#166534',
          hover: '#1B5E3A',
        },
        sage: {
          light: '#C6DCCB',
          DEFAULT: '#9DBFA9',
          dark: '#5E9C78',
        },
        mint: '#C6DCCB',
        canvas: '#EBECEC',
        activePill: '#E8EFEA',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '28px',
      },
    },
  },
  plugins: [],
}
