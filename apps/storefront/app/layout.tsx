import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { AuthLinks } from "@/components/AuthLinks";
import { CartIcon } from "@/components/CartIcon";
import { CartDrawer } from "@/components/CartDrawer";
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
        <Providers>
          <Header
            rightSlot={
              <>
                <AuthLinks />
                <CartIcon />
              </>
            }
          />
          <CartDrawer />
          {children}
        </Providers>
      </body>
    </html>
  );
}
