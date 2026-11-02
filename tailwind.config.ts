import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: { 50: '#FFFBE6', 100: '#FFF3B8', 200: '#FFE680', 300: '#FFD84D', 400: '#FFCB1F', 500: '#F5B800', 600: '#D99A00', 700: '#8A5F00', 800: '#6B4A00', 900: '#4A3300', 950: '#2E1F00' },
        teal: { 50: '#FFFBE6', 100: '#FFF3B8', 200: '#FFE680', 300: '#FFD84D', 400: '#FFC21A', 500: '#F0A800', 600: '#C98A00', 700: '#8A5F00', 800: '#6B4A00', 900: '#4A3300', 950: '#2E1F00' },
      },
    },
  },
  plugins: [],
};

export default config;
