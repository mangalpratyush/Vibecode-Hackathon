import type { Metadata, Viewport } from "next";
import PreloaderProvider from "@/components/landing/PreloaderProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PARAM — Pre Assessment Registry and Audit Mitra",
  description:
    "PARAM runs the court Registry's own checkslip over your filing bundle before you file it, so defects come back in one shot instead of in instalments.",
};

export const viewport: Viewport = {
  themeColor: "#132a47",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Hosted at the root so the login preloader survives the route change. */}
        <PreloaderProvider>{children}</PreloaderProvider>
      </body>
    </html>
  );
}
