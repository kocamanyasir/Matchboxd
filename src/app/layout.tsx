import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Matchboxd - Compare Letterboxd Profiles",
  description: "Compare your Letterboxd movie ratings and cinephile taste with your friends!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-[#14181C] text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
