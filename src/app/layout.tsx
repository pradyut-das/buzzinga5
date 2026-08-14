import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SearchPalette } from "@/components/search/search-palette";
import "../styles/globals.css";

// One typeface for the whole product. Weight and letter-spacing carry the
// hierarchy that a second family used to.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Squirrl",
  description: "A simple Kanban board for task management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
        <SearchPalette />
      </body>
    </html>
  );
}
