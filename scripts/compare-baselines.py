# Author: yunnuo <ymz@ebox.vip>
# Description: Compare observed R1.0b database catalogs to preserved R1.0a evidence; no database connections.
import argparse, hashlib, json, pathlib, re

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
options = parser.parse_args()
output = pathlib.Path(options.output).resolve()
historical = root / 'docs/04-ai/evidence-r10a'


def ordered(value):
    return sorted(value, key=lambda v: json.dumps(v, sort_keys=True))


def columns(table, dialect):
    values = []
    for c in table['columns']:
        if dialect == 'sqlite':
            v = dict(name=c['name'], type=c['type'], not_null=bool(c['notnull']), default=c['dflt_value'], hidden=c['hidden'])
        elif dialect == 'postgres':
            v = {key: c[key] for key in ['name', 'type', 'not_null', 'default_expression', 'identity', 'generated', 'collation']}
        else:
            v = {key: c[key] for key in ['name', 'type', 'nullable', 'default_expression', 'extra', 'charset', 'collation']}
        values.append(v)
    return values


def indexes(table, dialect):
    if dialect == 'sqlite':
        return ordered([dict(unique=i['unique'], partial=i['partial'], columns=[{k: c[k] for k in ['name', 'desc', 'coll']} for c in i['columns'] if c['key']]) for i in table['indexes']])
    if dialect == 'postgres':
        return ordered([re.sub(r'^CREATE (UNIQUE )?INDEX \S+ ON ', lambda m: 'UNIQUE ' if m[1] else 'INDEX ', i['definition']) for i in table['indexes']])
    groups = {}
    for i in table['indexes']:
        groups.setdefault(i['name'], []).append(i)
    return ordered([dict(unique=not rows[0]['non_unique'], type=rows[0]['type'], columns=[{k: c[k] for k in ['column_name', 'ordering', 'prefix_length', 'expression']} for c in sorted(rows, key=lambda v: v['ordinal'])]) for rows in groups.values()])


def constraints(table, dialect):
    if dialect == 'sqlite':
        return dict(primary_key=[c['name'] for c in sorted(table['columns'], key=lambda c: c['pk']) if c['pk']], foreign_keys=ordered(table['foreign_keys']))
    if dialect == 'postgres':
        return ordered([{k: c[k] for k in ['type', 'definition', 'update_action', 'delete_action', 'deferrable', 'initially_deferred']} for c in table['constraints']])
    return dict(constraint_types=ordered([c['type'] for c in table['constraints']]), foreign_keys=ordered([{k: c[k] for k in ['column_name', 'referenced_table', 'referenced_column', 'update_rule', 'delete_rule']} for c in table['foreign_keys']]))


reports = []
metadata = json.loads((root / 'migrations/metadata.gen.json').read_text())
sql_inventory = []
for ns in metadata['namespaces']:
    for migration in ns['migrations']:
        for dialect, file in migration['files'].items():
            raw = (root / 'migrations' / file['path']).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == file['checksum']
            sql_inventory.append(dict(namespace=ns['id'], version=migration['version'], dialect=dialect, **file))

for combo in ['sqlite-web-platform', 'sqlite-web-standalone', 'sqlite-desktop', 'postgres-web-platform', 'postgres-web-standalone', 'mysql-web-platform', 'mysql-web-standalone']:
    dialect = combo.split('-')[0]
    old = json.loads((historical / (combo + '.json')).read_text())
    new = json.loads((output / (combo + '.json')).read_text())
    assert new['passed']
    before = old['schema']['tables']; after = new['schema']['tables']
    apps = set(before) - {'schema_migrations', 'business_migrations'}
    assert set(after) == apps | {'schema_migrations'}, combo
    intentional = [dict(kind='ledger_replacement', old='schema_migrations(version,checksum) + business_migrations', new='schema_migrations(namespace,version,checksum,applied_at)')]
    differences = []
    for name in sorted(apps):
        old_columns, new_columns = columns(before[name], dialect), columns(after[name], dialect)
        if dialect == 'sqlite':
            for column in old_columns:
                raw = next(c for c in before[name]['columns'] if c['name'] == column['name'])
                if raw['pk'] and not raw['notnull'] and raw['type'].upper() != 'INTEGER':
                    column['not_null'] = True
                    intentional.append(dict(kind='sqlite_text_pk_not_null', table=name, column=column['name']))
        for kind, a, b in [('columns', old_columns, new_columns), ('index_semantics', indexes(before[name], dialect), indexes(after[name], dialect)), ('constraints', constraints(before[name], dialect), constraints(after[name], dialect))]:
            if a != b:
                differences.append(dict(table=name, kind=kind, historical=a, baseline=b))
        if dialect == 'mysql' and before[name]['table_options'] != after[name]['table_options']:
            differences.append(dict(table=name, kind='engine_charset_options', historical=before[name]['table_options'], baseline=after[name]['table_options']))
    sql_data = new['sql_only_data']
    for name in apps:
        assert sql_data['row_counts'][name] == (2 if name == 'storage_locations' else 0), (combo, 'unexpected SQL data', name)
    seeded = new['post_seed_data']; historical_seed = old['post_seed_data']
    for name in apps:
        assert seeded['row_counts'][name] == historical_seed['row_counts'][name], (combo, 'Seed count mismatch', name)
    if combo.endswith('web-platform'):
        for name in ['roles', 'permissions', 'role_permissions', 'storage_locations']:
            assert seeded[name] == historical_seed[name], (combo, 'Seed data mismatch', name)
        assert sql_data['storage_locations'] == old['migration_only_data']['storage_locations']
        intentional.append(dict(kind='roles_permissions_go_seed_only', old_sql_roles=2, old_sql_permissions=1, new_sql_roles=0, new_sql_permissions=0, installed_state_equal=True))
    old_settings = old['go_seed'].get('setting_keys')
    if old_settings is None:
        old_settings = [r['setting_key'] for r in old['go_seed']['settings']]
    assert new['go_seed']['settings'] == old_settings, (combo, 'settings keys mismatch')
    ledger = seeded['ledger']
    assert [r['namespace'] for r in ledger] == sorted(metadata['profiles'][combo[len(dialect)+1:]]['namespaces'])
    for r in ledger:
        file = next(n for n in metadata['namespaces'] if n['id'] == r['namespace'])['migrations'][0]['files'][dialect]
        assert r['version'] == 1 and r['checksum'] == file['checksum'] and r['applied_at'] > 0
    assert all(not result['accepted'] for result in new['all_text_and_composite_pk_null_checks'].values())
    behavior = new['behavior_probes']
    assert behavior['varchar_64_accepts_65_chars']['accepted'] == (dialect == 'sqlite')
    assert behavior['notes_default_deleted_at'] == 0
    if combo.endswith('web-platform'):
        assert behavior['case_variant_usernames']['accepted'] == (dialect != 'mysql')
        assert behavior['case_variant_emails']['accepted'] == (dialect != 'mysql')
        assert not behavior['dangling_session_fk']['accepted']
    report = dict(combination=combo, passed=not differences, app_tables=len(apps), total_tables=len(after), columns=sum(len(t['columns']) for t in after.values()), intentional_differences=intentional, unexpected_differences=differences, comparison_dimensions=['table set', 'column order/name/type/null/default', 'PK/unique/FK/actions', 'index key/uniqueness/order/prefix/expression', 'engine/charset/collation', 'SQL static rows', 'Seed role/permission/grant/location/settings/counts'], null_key_probe_count=len(new['all_text_and_composite_pk_null_checks']))
    reports.append(report)
    print(('PASS' if report['passed'] else 'FAIL'), combo, 'schema/Seed equivalence;', len(intentional), 'intentional differences;', len(differences), 'unexpected')

result = dict(author='yunnuo <ymz@ebox.vip>', generated_evidence=True, comparison_source='R1.0a observed catalogs; no new engine or product-release claim', combinations=reports, all_passed=all(r['passed'] for r in reports))
(output / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(output / 'sql-inventory.json').write_text(json.dumps(dict(author='yunnuo <ymz@ebox.vip>', generated_evidence=True, files=sql_inventory), ensure_ascii=False, indent=2) + '\n')
assert result['all_passed'], 'unexpected schema differences; see comparison.json'
