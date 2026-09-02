import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Doppel — Your Professional Doppelgänger",
    template: "%s — Doppel",
  },
  description:
    "An autonomous AI that runs your professional life — emails, LinkedIn, Twitter, job applications, recruiter replies. You live, Doppel works.",
  openGraph: {
    type: "website",
    siteName: "Doppel",
    title: "Doppel — Your Professional Doppelgänger",
    description:
      "An autonomous AI that runs your professional life — emails, LinkedIn, Twitter, job applications, recruiter replies. You live, Doppel works.",
    url: appUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Doppel — Your Professional Doppelgänger",
    description:
      "An autonomous AI that runs your professional life — emails, LinkedIn, Twitter, job applications, recruiter replies. You live, Doppel works.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#fafafa] text-zinc-900">
        <ClerkProvider>
          <ConvexClientProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
