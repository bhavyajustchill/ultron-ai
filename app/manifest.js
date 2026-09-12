export default function manifest() {
  return {
    name: 'J.A.R.V.I.S // Mark I Autonomous System',
    short_name: 'JARVIS Mark I',
    description:
      'Next-Gen Cybernetic Desktop Assistant with Quantum Arc Reactor Core & Gemini Live Voice Engine',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0A0B10',
    theme_color: '#0A0B10',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}

