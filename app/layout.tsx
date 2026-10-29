import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { BRAND } from '@/lib/brand';
import { MerchantProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name}: ${BRAND.tagline}.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MerchantProvider>
          <AppShell>{children}</AppShell>
        </MerchantProvider>
      </body>
    </html>
  );
}
