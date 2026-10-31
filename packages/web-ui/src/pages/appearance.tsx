// Author: yunnuo <ymz@ebox.vip>
// Description: Client appearance settings (user realm) and the administrator mail settings section.
import { ClientAppearance } from '../appearance';
import { PersistentSettings } from '../settings-page';
import type { PageProps } from '../router';

export function AppearancePage({ theme, setTheme }: PageProps) {
  return <ClientAppearance theme={theme} onSaved={setTheme} />;
}

export function AdminMailSettingsPage({ client, metadata, theme, setTheme, refresh }: PageProps) {
  return <PersistentSettings section="mail" client={client} metadata={metadata} theme={theme} onThemeSaved={setTheme} onSaved={refresh} />;
}
