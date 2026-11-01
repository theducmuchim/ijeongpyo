import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppearanceSync, RippleLayer, SnackbarHost } from "@/components/ui";

export const metadata: Metadata = {
  title: "이정표",
  description: "익숙한 길에서도 길을 잃는 사람을 위한 랜드마크 길안내",
  manifest: "/manifest.webmanifest",
  applicationName: "이정표",
  appleWebApp: { capable: true, title: "이정표", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // 아이폰 노치 아래까지 바탕색을 채운다 (내용은 안전 영역 안쪽에)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fef7ff" },
    { media: "(prefers-color-scheme: dark)", color: "#141218" },
  ],
};

// 화면이 그려지기 전에 저장된 글씨 크기·밝기 설정을 먼저 적용한다 (하얗게 번쩍이는 것 방지)
const BOOT = `try{var s=JSON.parse(localStorage.getItem("ijeongpyo.settings")||"{}");var r=document.documentElement;r.dataset.large=String(s.largeText!==false);if(s.theme==="light"||s.theme==="dark")r.dataset.theme=s.theme;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-large="true" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <AppearanceSync />
        <RippleLayer />
        {children}
        <SnackbarHost />
      </body>
    </html>
  );
}
