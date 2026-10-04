import { Orbitron, JetBrains_Mono, Rajdhani } from "next/font/google";
import "./globals.css";
import { ACCENT_VARS_CACHE_KEY } from "@/lib/accentTheme";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0B10",
};

export const metadata = {
  title: "J.A.R.V.I.S // Mark II Autonomous System",
  description:
    "Next-Gen Cybernetic Desktop Assistant with Quantum Arc Reactor Core & Gemini Live Voice Engine",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JARVIS Mark II",
  },
};

// Applies the cached HUD accent theme before first paint (hooks/useAccentTheme.js keeps it current)
const ACCENT_BOOT_SCRIPT = `try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(ACCENT_VARS_CACHE_KEY)})||"null");if(v)for(var k in v)document.documentElement.style.setProperty(k,v[k])}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${orbitron.variable} ${jetbrainsMono.variable} ${rajdhani.variable} h-full antialiased dark`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--void-black)] text-[var(--text-primary)] select-none">
        {children}
      </body>
    </html>
  );
}

