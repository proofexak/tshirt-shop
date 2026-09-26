import type { Metadata } from "next";
import { Header, SignupLoginLinks } from "@/components/Header";
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
                <SignupLoginLinks />
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
