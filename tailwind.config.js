/** @type {import('tailwindcss').Config} */
export default {
  // Il tema scuro si attiva aggiungendo la classe `dark` alla radice: la
  // scelta dell'utente vive nelle preferenze, non nel sistema operativo.
  darkMode: 'class',
  content: ['./client/index.html', './client/src/**/*.{vue,js}'],
  theme: { extend: {} },
  plugins: [],
}
