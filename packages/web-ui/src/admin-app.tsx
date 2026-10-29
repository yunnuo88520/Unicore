/** Author: yunnuo <ymz@ebox.vip>
 * Description: Administrator-only entry composition; shared shell and business components remain reusable.
 */
import { t, useLocale } from './i18n';
import { Workspace, type PageProps } from './App';
import type { AppClient } from '@unicore/sdk';
import { StorageSettings } from './storage-page';
import { UserManagement } from './web-flows';
import { PersistentSettings } from './settings-page';
import { SystemLogs } from './logs-page';
import { EditionPanel } from './edition-panel';
import { RoleManagement } from './roles-page';
function AdministrationPage({page,client,metadata,theme,setTheme,refresh}:PageProps){
  useLocale();
 if(!client.web)return null;
 switch(page){
 case 'site': case 'mail': return <PersistentSettings key={page} section={page==='mail'?'mail':'base'} client={client} metadata={metadata} theme={theme} onThemeSaved={setTheme} onSaved={refresh}/>;
 case 'storage': return client.storage && <StorageSettings client={client}/>;
 case 'users': case 'administrators': return <UserManagement key={page} web={client.web} metadata={metadata} administrators={page==='administrators'}/>;
 case 'roles': return <RoleManagement web={client.web}/>;
 case 'logs': return <SystemLogs web={client.web}/>;
 case 'edition': return <EditionPanel client={client} metadata={metadata}/>;
 default:return null;
 }
}
export function AdminWorkspace({client}:{client:AppClient}) {
  useLocale();return <Workspace client={client} administratorPage={AdministrationPage}/>;}
