// Author: yunnuo <ymz@ebox.vip>
// Description: Public read-only developer reference, independent of workspaces and login.
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppClient } from '@unicore/sdk';
import { ClientControls } from './client-controls';
import { ApiDocsPage } from './pages/api-docs';
import { useLocale } from './i18n';
import { useTheme } from '@unicore/theme';

export function ApiDocsApp({ client }: { client: AppClient }) {
  useLocale();
  useTheme();
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queries}>
    <main className="min-h-dvh bg-background p-4 sm:p-6">
      <div className="mb-4 flex justify-end"><ClientControls showAppearanceSettings={false} /></div>
      <ApiDocsPage client={client} />
    </main>
  </QueryClientProvider>;
}
