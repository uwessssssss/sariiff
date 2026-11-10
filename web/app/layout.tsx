import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "../styles/globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { Toaster } from "sonner";
import { AuthProvider } from "@/providers/AuthProvider";
import { A11yManager } from "@/components/A11yManager";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F172A",
};

export const metadata: Metadata = {
  title: "Sarif",
  description:
    "Forex bureau management: cash, bank, mobile money and client accounts in one ledger.",
  keywords: [
    "fintech",
    "money exchange",
    "accounting",
    "client management",
    "double-entry accounting",
  ],
  authors: [{ name: "Sarif" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className={GeistSans.className}>
        <AuthProvider>
          <ThemeProvider>
            <div className="min-h-screen relative">
              {/* keyboard + screen-reader behaviour for every pop-up and field */}
              <A11yManager />
              {/* Toast Notifications */}
              <Toaster
                position="top-right"
                richColors
                expand={true}
                toastOptions={{
                  style: { borderRadius: "8px" },
                }}
              />

              {/* Main Content */}
              {children}
            </div>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
