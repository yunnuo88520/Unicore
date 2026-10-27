/** Author: yunnuo <ymz@ebox.vip>
 * Description: Compile-time optional integration placeholders; no simulated checks or update actions.
 */
import type { Bootstrap } from '@unicore/sdk';
import { KeyRound, RefreshCw } from 'lucide-react';

export function EditionPanel({ metadata }: { metadata: Bootstrap }) {
  const license = __FEATURE_LICENSE__ && metadata.capabilities.license;
  const updater = __FEATURE_UPDATER__ && metadata.capabilities.updater;
  if (!license && !updater) return null;
  return <section className="panel edition-panel" aria-label="授权与升级">
    <div className="panel-heading"><div><h2>授权与升级</h2><p>当前版本 v{metadata.version}</p></div><span className="subtle-badge">待对接</span></div>
    <div className="edition-grid">
      {__FEATURE_LICENSE__ && license && <article className="settings-group"><h3><KeyRound size={18} />授权检测</h3><p className="help-text">尚未接入授权服务。后续可连接你的独立授权服务器，显示授权状态与有效期。</p><button className="secondary-button" disabled>检测授权</button></article>}
      {__FEATURE_UPDATER__ && updater && <article className="settings-group"><h3><RefreshCw size={18} />在线升级</h3><p className="help-text">尚未接入版本服务，接入后可检查新版本并查看更新日志。</p><button className="secondary-button" disabled>检查新版本</button><h4>更新日志</h4><p className="help-text">暂无版本服务返回的更新日志。</p></article>}
    </div>
  </section>;
}
