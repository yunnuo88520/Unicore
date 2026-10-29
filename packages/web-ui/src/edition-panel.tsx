/** Author: yunnuo <ymz@ebox.vip>
 * Description: Real shared update module, with independently optional license integration.
 */
import { t, useLocale } from './i18n';
import type {AppClient,Bootstrap} from '@unicore/sdk';
import {KeyRound} from 'lucide-react';
import {UpdatePanel} from './update-panel';
export function EditionPanel({client,metadata}:{client:AppClient;metadata:Bootstrap}){
  useLocale();
 return <div className="update-page">{__FEATURE_UPDATER__&&metadata.capabilities.updater&&<UpdatePanel client={client} metadata={metadata}/>}{__FEATURE_LICENSE__&&metadata.capabilities.license&&<section className="panel update-status"><div className="panel-heading"><h2><KeyRound size={18}/>{t("授权检测")}</h2><span className="subtle-badge">{t("待对接")}</span></div><p className="help-text">{t("尚未接入授权服务。后续可连接你的独立授权服务器。")}</p><button className="secondary-button" disabled>{t("检测授权")}</button></section>}</div>;
}
