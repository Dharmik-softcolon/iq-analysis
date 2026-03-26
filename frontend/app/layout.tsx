import type { Metadata } from "next";
import "./globals.css";

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
        <body className="bg-gray-950 text-white antialiased">
        {children}
        </body>
        </html>
    );
}