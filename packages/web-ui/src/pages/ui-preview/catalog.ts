// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit family inventory; variants and supporting primitives never inflate coverage.
export const baseIds = ['accordion','announcement','avatar','breadcrumb','button','button-group','carousel','checkbox','chip','close-button','color-picker','combobox','command-palette','context-menu','counter','date-calendar','date-picker','divider','drawer','dropdown','file-upload','icon-button','input','input-otp','link-button','meter','modal','notification','number-field','pagination','popover','progress','radio','search-field','segmented-control','select','skeleton','slider','social-button','spinner','switch','table','tabs','tag-group','textarea','time-field','toast','tooltip','tree-view'] as const;
export const chartIds = ['area','line','combo','earnings','orders-comparison','revenue-comparison','bar-list','stage-bars','horizontal-funnel','most-active-dates','steps','segmented-score','activity-rings','radial','radar','contributions-calendar','heatmap','scatter','sankey'] as const;
export const compositeIds = ['composer-panel','calendar','composer','agent-creator','agent-limits-card','agent-progress','agent-thinking','auth-card','composer-attachments','composer-loader','data-grid','data-table','notification-center','questionnaire','settings-modal','sidebar','stat-cards','task-list','web-search'] as const;
export type BaseId = typeof baseIds[number];
export type ChartId = typeof chartIds[number];
export type CompositeId = typeof compositeIds[number];
export type CatalogItem = { id: string; family: 'foundation' | 'base' | 'chart' | 'composite'; category: 'foundations' | 'base' | 'chart' | 'composite' | 'data-grid'; implementation: string };
export const catalogItems: readonly CatalogItem[] = [
  { id: 'color', family: 'foundation', category: 'foundations', implementation: 'semantic tokens' },
  { id: 'typography', family: 'foundation', category: 'foundations', implementation: 'type roles' },
  ...baseIds.map(id => ({ id, family: 'base' as const, category: 'base' as const, implementation: id === 'chip' ? 'Badge' : id === 'toast' ? 'useMessage' : id })),
  ...chartIds.map(id => ({ id, family: 'chart' as const, category: 'chart' as const, implementation: id })),
  ...compositeIds.map(id => ({ id, family: 'composite' as const, category: id === 'data-grid' ? 'data-grid' as const : 'composite' as const, implementation: id })),
];
