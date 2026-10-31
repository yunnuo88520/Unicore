/** Author: yunnuo <ymz@ebox.vip>
 * Description: Products extend the dashboard through widget registration.
 */
import type { ReactNode } from 'react';
import type { Bootstrap } from '@unicore/sdk';

export interface DashboardWidget { id: string; render: (metadata: Bootstrap) => ReactNode }
export class DashboardWidgetRegistry {
  private widgets = new Map<string, DashboardWidget>();
  register(widget: DashboardWidget) {
    if (this.widgets.has(widget.id)) throw new Error(`Duplicate dashboard widget: ${widget.id}`);
    this.widgets.set(widget.id, widget);
    return this;
  }
  entries() { return [...this.widgets.values()]; }
}
