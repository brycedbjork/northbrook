import type { Metadata } from "next";
import { Header } from "./components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "broker-cli — Algorithmic Trading from Your Terminal",
  description:
    "Open-source CLI for algorithmic trading. Connect to E*Trade and Interactive Brokers. Portfolio management, option chains, exposure analysis, and more.",
  metadataBase: new URL("https://brokercli.com"),
  openGraph: {
    title: "broker-cli",
    description: "Algorithmic trading from your terminal",
    url: "https://brokercli.com",
    siteName: "broker-cli",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        {children}
      </body>
    </html>
  );
}
