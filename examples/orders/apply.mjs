// Author: yunnuo <ymz@ebox.vip>
// Description: Apply the orders acceptance example to a new, disposable derived project: module, contract, migrations, consoles and SDK wiring.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export function applyOrdersExample(directory) {
  const root = resolve(directory);
  if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name === 'unicore') throw Error('Create a disposable derived project first; do not modify the upstream reference application');
  // go.mod is the authoritative module path of the derived project; the
  // provenance file records the framework lineage, not the Go module.
  const goModule = readFileSync(join(root, 'go.mod'), 'utf8').match(/^module (.+)$/m)?.[1]?.trim();
  if (!goModule) throw Error('go.mod carries no module path');
  const edits = new Map();
  const read = file => edits.get(file) ?? readFileSync(join(root, file), 'utf8');
  const save = (file, text) => edits.set(file, text);
  const edit = (file, from, to) => {
    const source = read(file);
    if (!source.includes(from)) throw Error(`Derived project source differs: ${file}; apply the orders example to a fresh template export`);
    save(file, source.replace(from, to));
  };

  // 1. Copy the example sources with the project's Go module path. The tree
  // is named _files so the go tool ignores it inside the reference checkout:
  // these sources only compile inside a derived project after the rewrite.
  const sourceRoot = resolve(import.meta.dirname, '_files');
  for (const file of walk(sourceRoot)) {
    const target = join(root, relative(sourceRoot, file));
    mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    const text = readFileSync(file, 'utf8').replaceAll('github.com/yunnuo/unicore', goModule);
    writeFileSync(target, text);
  }

  // 2. Contract: schemas plus the five operations with their access policies.
  const contract = JSON.parse(read('packages/contracts/openapi.json'));
  for (const name of ['OrderEntry', 'OrderCreateInput', 'OrderStatusInput', 'OrderList']) {
    if (contract.components.schemas[name]) throw Error('Orders example is already present');
  }
  Object.assign(contract.components.schemas, {
    OrderEntry: {
      type: 'object', additionalProperties: false,
      required: ['id', 'owner_id', 'title', 'amount_cents', 'status', 'version', 'created_at', 'updated_at'],
      properties: {
        id: { type: 'string', maxLength: 64 },
        owner_id: { type: 'string', maxLength: 64, description: 'Customer account id resolved server-side.' },
        agent_id: { type: 'string', maxLength: 64, description: 'Assigned agent account id; empty until an operator assigns one.' },
        title: { type: 'string', maxLength: 80 },
        amount_cents: { type: 'integer', minimum: 0 },
        status: { type: 'string', enum: ['open', 'processing', 'done', 'cancelled'] },
        version: { type: 'integer', minimum: 1 },
        created_at: { type: 'integer' },
        updated_at: { type: 'integer' },
      },
    },
    OrderCreateInput: {
      type: 'object', additionalProperties: false,
      required: ['owner_id', 'title', 'amount_cents'],
      properties: {
        owner_id: { type: 'string', maxLength: 64, description: 'Customer account id; the server verifies the handle operator, never trusting client roles.' },
        title: { type: 'string', maxLength: 80 },
        amount_cents: { type: 'integer', minimum: 0 },
        agent_id: { type: 'string', maxLength: 64 },
      },
    },
    OrderStatusInput: {
      type: 'object', additionalProperties: false,
      required: ['status', 'version'],
      properties: {
        status: { type: 'string', enum: ['processing', 'done', 'cancelled'], description: 'open→processing→done with cancelled while active; the graph is enforced server-side.' },
        version: { type: 'integer', minimum: 1 },
      },
    },
    OrderList: {
      type: 'object', additionalProperties: false,
      required: ['items', 'total', 'page', 'page_size'],
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/OrderEntry' } },
        total: { type: 'integer' },
        page: { type: 'integer' },
        page_size: { type: 'integer' },
      },
    },
  });
  const responses = entry => ({
    200: { description: 'Success', content: { 'application/json': { schema: { $ref: entry } } } },
    default: { description: 'Stable error code', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  });
  const body = ref => ({ required: true, content: { 'application/json': { schema: { $ref: ref } } } });
  const idParameter = { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 64 } };
  const platformSecurity = [{}, { SessionCookie: [] }, { BearerToken: [] }];
  const handleSecurity = csrf => (csrf ? [{ SessionCookie: [], CSRFToken: [] }, { BearerToken: [] }] : [{ SessionCookie: [] }, { BearerToken: [] }]);
  const build = (method, operationId, xunicore, ref, security, extra = {}) => ({ [method]: {
    operationId, responses: responses(ref), security, ...extra,
    'x-unicore': xunicore,
  } });
  const platformSession = { profiles: ['web-platform', 'web-standalone'], access: 'platform-session', permissions: ['orders:access'], permissionMode: 'all', csrf: false, identityRealm: 'user', uiPage: 'orders' };
  const handle = csrf => ({ profiles: ['web-platform', 'web-standalone'], access: 'session', permissions: ['orders:handle'], permissionMode: 'all', csrf, identityRealm: 'user' });
  Object.assign(contract.paths, {
    '/api/v1/orders': build('get', 'listOrders', platformSession, '#/components/schemas/OrderList', platformSecurity),
    '/api/v1/orders/managed': {
      ...build('get', 'listManagedOrders', handle(false), '#/components/schemas/OrderList', handleSecurity(false)),
      ...build('post', 'createManagedOrder', handle(true), '#/components/schemas/OrderEntry', handleSecurity(true), { requestBody: body('#/components/schemas/OrderCreateInput') }),
    },
    '/api/v1/orders/{id}': build('get', 'readOrder', platformSession, '#/components/schemas/OrderEntry', platformSecurity, { parameters: [idParameter] }),
    '/api/v1/orders/{id}/status': build('put', 'updateOrderStatus', handle(true), '#/components/schemas/OrderEntry', handleSecurity(true), { parameters: [idParameter], requestBody: body('#/components/schemas/OrderStatusInput') }),
  });
  Object.assign(contract['x-error-codes'], {
    ORDER_INVALID: { status: 400, message: '订单信息无效' },
    ORDER_STATUS: { status: 409, message: '订单状态不允许该变更' },
  });
  save('packages/contracts/openapi.json', JSON.stringify(contract, null, 2) + '\n');

  // 3. Module manifest: orders is always assembled (no build feature).
  const manifest = JSON.parse(read('internal/module/manifest.json'));
  if (manifest.modules.some(item => item.slug === 'orders')) throw Error('orders module already declared');
  manifest.modules.push({ slug: 'orders', title: '我的订单' });
  save('internal/module/manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  // 4. Migrations: one append-only baseline per dialect in the module.orders namespace.
  const catalog = JSON.parse(read('migrations/catalog.json'));
  if (catalog.namespaces.some(namespace => namespace.id === 'module.orders')) throw Error('module.orders migrations already exist');
  const header = '-- Author: yunnuo <ymz@ebox.vip>\n-- Purpose: orders acceptance example baseline.\n-- Compatibility: module.orders@1 created fresh; no legacy data exists.\n-- Recovery: restore a matching pre-upgrade DB/data/key/binary snapshot; no down SQL.\n';
  const table = dialect => {
    const auto = dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    const index = name => dialect === 'mysql'
      ? `CREATE INDEX ${name} ON unicore_app_orders(${name === 'idx_app_orders_owner' ? 'owner_id' : 'agent_id'});`
      : `CREATE INDEX IF NOT EXISTS ${name} ON unicore_app_orders(${name === 'idx_app_orders_owner' ? 'owner_id' : 'agent_id'});`;
    return `${header}CREATE TABLE IF NOT EXISTS unicore_app_orders (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) NULL,
  title VARCHAR(80) NOT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  version INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
)${auto};
${index('idx_app_orders_owner')}
${index('idx_app_orders_agent')}
`;
  };
  const files = {};
  for (const dialect of catalog.dialects) {
    const file = `modules/orders/${dialect}/0001_init.sql`;
    mkdirSync(join(root, 'migrations', file.slice(0, file.lastIndexOf('/'))), { recursive: true });
    writeFileSync(join(root, 'migrations', file), table(dialect));
    files[dialect] = file;
  }
  catalog.namespaces.push({ id: 'module.orders', depends_on: ['core'], migrations: [{ version: 1, files }] });
  for (const profile of ['web-platform', 'web-standalone', 'desktop']) catalog.profiles[profile].namespaces.push('module.orders');
  save('migrations/catalog.json', JSON.stringify(catalog, null, 2) + '\n');

  // 5. Composition roots: the module registers like the notes reference
  // business; the derived project rewrote the Go module path, so anchor on
  // the registration line instead of the import path.
  for (const entry of ['cmd/server/main.go', 'cmd/desktop/main.go']) {
    if (!existsSync(join(root, entry))) continue;
    const source = read(entry);
    const register = source.match(/^(\s*)module\.Register\(notesmodule\.Module\)$/m);
    const importLine = source.match(/^(\s*)notesmodule "[^"]+"$/m);
    if (!register || !importLine) throw Error(`notes module wiring not found in ${entry}; apply the orders example to a fresh template export`);
    save(entry, source.replace(register[0], `${register[0]}\n${register[1]}module.Register(ordersmodule.Module)`)
      .replace(importLine[0], `${importLine[0]}\n${importLine[1]}ordersmodule "${goModule}/internal/modules/orders"`));
  }
  edit('internal/adapter/http/web.go', '\tmountNotes(api, config)', '\tmountNotes(api, config)\n\tmountOrders(api, config)');

  // 6. Frontend registries: the shared route facts and the app-owned consoles.
  edit('packages/web-ui/src/modules/index.ts', "import './notes'", "import './notes'\nimport './orders'");
  {
    const pkg = JSON.parse(read('packages/web-ui/package.json'));
    pkg.exports['./modules/orders/managed'] = './src/modules/orders/managed.tsx';
    save('packages/web-ui/package.json', JSON.stringify(pkg, null, 2) + '\n');
  }
  edit('apps/web/src/main.tsx', "import { Workspace } from '@unicore/web-ui';", "import { Workspace } from '@unicore/web-ui';\nimport { orderConsoles } from './order-consoles';");
  edit('apps/web/src/main.tsx', '<Workspace client={client} />', '<Workspace client={client} consoles={orderConsoles} />');

  // 7. SDK methods: explicit grants follow the ADR-0050 model.
  edit('packages/sdk/src/index.ts', 'RoleSaveInput, MenuList, MenuSaveInput,', 'RoleSaveInput, MenuList, MenuSaveInput, OrderEntry, OrderCreateInput, OrderStatusInput, OrderList,');
  edit('packages/sdk/src/index.ts', 'MenuList, RoleSaveInput, NavigationSection,', 'MenuList, RoleSaveInput, OrderEntry, OrderList, NavigationSection,');
  edit('packages/sdk/src/index.ts', " listNotes(query:NoteQuery, view?: 'mine'):Promise<NoteList>;",
    " listNotes(query:NoteQuery, view?: 'mine'):Promise<NoteList>;\n listOrders(page:number):Promise<OrderList>;\n readOrder(id:string):Promise<OrderEntry>;\n listManagedOrders(page:number):Promise<OrderList>;\n createManagedOrder(input:OrderCreateInput):Promise<OrderEntry>;\n updateOrderStatus(id:string, input:OrderStatusInput):Promise<OrderEntry>;");
  const listNotes = "  listNotes(query:NoteQuery, view?: 'mine') { return this.call('listNotes',undefined,{query:{...query,...(view && !this.administrator ? {view} : {})}}); }";
  edit('packages/sdk/src/index.ts', listNotes, listNotes + `
  listOrders(page:number) { return this.call('listOrders',undefined,{query:{page}}); }
  readOrder(id:string) { return this.call('readOrder',undefined,{params:{id}}); }
  listManagedOrders(page:number) { return this.call('listManagedOrders',undefined,{query:{page}}); }
  createManagedOrder(input:OrderCreateInput) { return this.call('createManagedOrder',input); }
  updateOrderStatus(id:string, input:OrderStatusInput) { return this.call('updateOrderStatus',input,{params:{id}}); }`);

  // 8. Bilingual catalog: the shared en catalog carries every new interface
  // literal; interface text ships zh+en together (zh keys are the literals).
  // Existing entries keep their established translation — e.g. the shared
  // status vocabulary stays consistent across features.
  const catalogPath = 'packages/web-ui/src/locales/en.json';
  const english = JSON.parse(read(catalogPath));
  const additions = {
    '我的订单': 'My orders',
    '查看本人订单与当前状态。': 'View your own orders and their current status.',
    '待处理': 'Open',
    '处理中': 'Processing',
    '已完成': 'Done',
    '已取消': 'Cancelled',
    '服务端只返回本人名下的订单，状态由代理或运营推进。': 'The server returns only orders under your own account; agents or operations move the status forward.',
    '还没有订单': 'No orders yet',
    '下单后订单会出现在这里。': 'Orders appear here once they are placed.',
    '金额': 'Amount',
    '仅显示第一页 {{count}} 条': 'Showing the first {{count}} entries',
    '开始处理': 'Start processing',
    '标记完成': 'Mark done',
    '取消订单': 'Cancel order',
    '正在加载订单…': 'Loading the order…',
    '返回列表': 'Back to the list',
    '订单不可见': 'Order not visible',
    '订单不存在或不在你的授权范围内。': 'The order does not exist or is outside your authorization.',
    '客户': 'Customer',
    '代理': 'Agent',
    '会话身份': 'Session identity',
    '订单处理': 'Order processing',
    '列表由服务端按代理归属与授权范围解析，篡改订单地址只会得到 404。': 'The list is resolved server-side by agent assignment and granted scope; a tampered order address only yields 404.',
    '暂无待处理订单': 'No pending orders',
    '被授权或分配给你的订单会出现在这里。': 'Orders granted or assigned to you appear here.',
    '代理工作台': 'Agent workbench',
    '运营工作台': 'Operations workbench',
    '代理工作台导航': 'Agent workbench navigation',
    '运营工作台导航': 'Operations workbench navigation',
    '订单信息无效': 'The order information is invalid.',
    '订单状态不允许该变更': 'The order does not allow this transition.',
  };
  for (const [key, value] of Object.entries(additions)) if (!Object.hasOwn(english, key)) english[key] = value;
  save(catalogPath, JSON.stringify(english, null, 2) + '\n');

  for (const [file, text] of edits) writeFileSync(join(root, file), text);
  return { project: root, steps: ['files', 'contract', 'migrations', 'composition-roots', 'frontend-registries', 'sdk', 'catalog'] };
}

function walk(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

// Same realpath-tolerant entry check as the framework generator: node realpaths
// ESM entry URLs, so a symlinked invocation path must not silently no-op.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  if (!process.argv[2]) throw Error('Use apply.mjs /absolute/path/to/disposable-derived-project');
  const result = applyOrdersExample(process.argv[2]);
  console.log(`Applied the orders example to ${result.project}\nNext: pnpm install && pnpm generate && pnpm generate:migrations && make build-web, then boot the server with a fresh data dir.`);
}
