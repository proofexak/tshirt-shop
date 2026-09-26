import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "T-Shirt Shop",
  description: "T-shirt storefront",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <Header />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
