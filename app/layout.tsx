import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import PreloadImages from "../components/PreloadImages";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-press-start-2p",
});

export const metadata: Metadata = {
  title: "Torch Boy",
  description: "Torch Boy – Daily Dungeon Challenge",
  icons: {
    icon: [
      { url: "/images/favicon.ico", type: "image/x-icon" },
    ],
    apple: "/images/hero/hero-front-static.png",
  },
  openGraph: {
    title: "Torch Boy",
    description: "Light your way through the dungeon.",
    images: [
      { url: "/images/hero/hero-front-static.png" },
    ],
  },
  twitter: {
    card: "summary",
    title: "Torch Boy",
    description: "Light your way through the dungeon.",
    images: [
      "/images/hero/hero-front-static.png",
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Explicit favicon link to the uploaded icon */}
        <link rel="icon" type="image/x-icon" href="/images/favicon.ico" />
        {/* Google tag (gtag.js) */}
        <Script
          id="ga4-src"
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-CJ2HBBQXXC"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-CJ2HBBQXXC');
          `}
        </Script>
        {/* Critical floor textures */}
        <link rel="preload" as="image" href="/images/floor/floor-try-1.png" />
        <link rel="preload" as="image" href="/images/floor/floor-1000.png" />
        {/* Critical wall variants commonly used at top-of-screen overlays */}
        <link rel="preload" as="image" href="/images/wall/wall-0010.png" />
        <link rel="preload" as="image" href="/images/wall/wall-0110.png" />
        <link rel="preload" as="image" href="/images/wall/wall-0011.png" />
        <link rel="preload" as="image" href="/images/wall/wall-0111.png" />
        {/* Exit and lock assets */}
        <link rel="preload" as="image" href="/images/door/exit-dark.png" />
        <link rel="preload" as="image" href="/images/door/exit-transparent.png" />
        <link rel="preload" as="image" href="/images/door/gold-chain-lock.png" />
        {/* Torch sprite frames */}
        <link rel="preload" as="image" href="/images/items/wall-torch-1.png" />
        <link rel="preload" as="image" href="/images/items/wall-torch-2.png" />
        <link rel="preload" as="image" href="/images/items/wall-torch-3.png" />
        {/* Hero front static used on intro */}
        <link rel="preload" as="image" href="/images/hero/hero-front-static.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} ${pressStart2P.className} antialiased`}
      >
        <PreloadImages />
        {children}
      </body>
    </html>
  );
}
