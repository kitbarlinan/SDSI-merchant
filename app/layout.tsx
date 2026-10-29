import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { MerchantProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: 'Merchant Manager',
  description: 'Sales entry, inventory tracking, and financial reports for merchants.',
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
