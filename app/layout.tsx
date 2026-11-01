import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LargeTextSync } from "@/components/ui";

export const metadata: Metadata = {
  title: "이정표",
  description: "익숙한 길에서도 길을 잃는 사람을 위한 랜드마크 길안내",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fef7ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-large="true">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <LargeTextSync />
        {children}
      </body>
    </html>
  );
}
