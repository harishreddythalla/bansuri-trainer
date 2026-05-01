import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bansuri Studio",
  description: "Interactive bansuri learning with live swara feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
