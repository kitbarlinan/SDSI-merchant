import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { IS_LIVE } from '@/lib/mode';
import { RemoteProviders } from '@/lib/remote';
import { AppDataProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name}: ${BRAND.tagline}.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {IS_LIVE ? (
          <RemoteProviders>
            <AppShell>{children}</AppShell>
          </RemoteProviders>
        ) : (
          <AppDataProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </AppDataProvider>
        )}
      </body>
    </html>
  );
}
