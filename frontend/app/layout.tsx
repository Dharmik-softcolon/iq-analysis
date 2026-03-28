import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
    title: "WhaleHQ v6.0 — Institutional Trading System",
    description: "NIFTY Weekly Options Algo Trading",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={`${inter.variable} ${jbMono.variable} font-sans bg-gray-950 text-gray-200 antialiased selection:bg-blue-500/30`}>
                {children}
            </body>
        </html>
    );
}