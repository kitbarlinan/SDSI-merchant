import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { AppDataProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name}: ${BRAND.tagline}.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppDataProvider>
            <AppShell>{children}</AppShell>
          </AppDataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
