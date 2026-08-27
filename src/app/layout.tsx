import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppBridgeProvider } from "@/components/app-bridge-provider";
import { ReactQueryProvider } from "@/components/query-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://orders.universesraw.com"),
  title: {
    default: "MiBx-Dispatch",
    template: "%s | MiBx-Dispatch"
  },
  description: "Sync. • Dispatch. • Deliver. • Done.",
  applicationName: "MiBx-Dispatch",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png"
  },
  openGraph: {
    title: "MiBx-Dispatch",
    description: "Sync. • Dispatch. • Deliver. • Done.",
    siteName: "MiBx-Dispatch",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "MiBx-Dispatch"
      }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MiBx-Dispatch"
  }
};

import NextTopLoader from "nextjs-toploader";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        <ReactQueryProvider>
          <NextTopLoader color="#000000" height={3} showSpinner={false} />
          <Suspense fallback={null}>
            <AppBridgeProvider />
          </Suspense>
          {children}
        </ReactQueryProvider>
      </body>
    </html>
  );
}

