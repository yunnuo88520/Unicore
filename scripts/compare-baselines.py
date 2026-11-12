# Author: yunnuo <ymz@ebox.vip>
# Description: Validate observed single-track catalogs against catalog expectations; no database connections.
# Since the R1.0c cutover (ADR-0025) the final state intentionally exceeds the preserved
# R1.0a evidence (prefixed names, merged increments, no sqlite FKs), so the historical
# equivalence comparison is retired; this checks the catalog contract itself.
import argparse, hashlib, json, pathlib

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
options = parser.parse_args()
output = pathlib.Path(options.output).resolve()

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
    dialect, profile = combo.split('-', 1)
    new = json.loads((output / (combo + '.json')).read_text())
    assert new['passed']
    after = new['schema']['tables']
    expected_tables = 48 if profile == 'web-platform' else 9
    assert len(after) == expected_tables, (combo, 'table count', len(after))
    apps = set(after) - {'schema_migrations'}
    unprefixed = sorted(name for name in apps if not name.startswith('unicore_'))
    assert not unprefixed, (combo, 'framework tables without the fixed prefix', unprefixed)
    if profile == 'web-platform':
        for name in ['unicore_personal_accounts', 'unicore_session_details',
                     'unicore_announcement_reads', 'unicore_announcement_recipients',
                     'unicore_file_upload_sessions']:
            assert name in apps, (combo, 'merged terminal table missing', name)
        assert 'unicore_administrators' not in apps, (combo, 'obsolete split identity table')
        for table in ('unicore_users',):
            columns = {c['name'] for c in after[table]['columns']}
            assert 'phone' in columns, (combo, 'phone column missing', table)
        columns = {c['name'] for c in after['unicore_platform_announcements']['columns']}
        assert {'title', 'notify_mode', 'ends_at', 'audience'} <= columns, (combo, 'announcement columns missing')
    intentional = [dict(kind='ledger_shape', table='schema_migrations', columns=['namespace', 'version', 'checksum', 'applied_at'])]
    if dialect == 'sqlite':
        intentional.append(dict(kind='sqlite_no_foreign_keys', reason='runtime keeps foreign_keys off; cascades live in the usecase layer'))
    sql_data = new['sql_only_data']
    sql_seed_rows = {'unicore_storage_locations': 2 if profile == 'web-platform' else 1, 'unicore_navigation_state': 1}
    for name in apps:
        assert sql_data['row_counts'][name] == sql_seed_rows.get(name, 0), (combo, 'unexpected SQL data', name)
    seeded = new['post_seed_data']
    if profile == 'web-platform':
        counts = seeded['row_counts']
        assert counts['unicore_roles'] >= 2 and counts['unicore_permissions'] >= 2, (combo, 'Seed grants missing')
        assert counts['unicore_role_permissions'] >= 2, (combo, 'Seed grant bindings missing')
        assert counts['unicore_storage_locations'] == 2, (combo, 'seed locations missing')
    assert (new['go_seed'].get('setting_count', 0) > 0) == (profile == 'web-platform'), (combo, 'instance setting scope')
    ledger = seeded['ledger']
    namespace_rows = {}
    for r in ledger:
        namespace_rows.setdefault(r['namespace'], []).append(r)
    assert sorted(namespace_rows) == sorted(metadata['profiles'][profile]['namespaces']), (combo, 'ledger namespaces', sorted(namespace_rows))
    namespace_meta = {n['id']: n for n in metadata['namespaces']}
    for ns, rows in namespace_rows.items():
        assert [r['version'] for r in rows] == list(range(1, len(rows) + 1)), (combo, 'ledger versions', ns, [r['version'] for r in rows])
    for r in ledger:
        file = namespace_meta[r['namespace']]['migrations'][r['version'] - 1]['files'][dialect]
        assert r['checksum'] == file['checksum'] and r['applied_at'] > 0, (combo, 'ledger row', r)
    assert all(not result['accepted'] for result in new['all_text_and_composite_pk_null_checks'].values())
    behavior = new['behavior_probes']
    assert behavior['varchar_64_accepts_65_chars']['accepted'] == (dialect == 'sqlite')
    assert behavior['notes_default_deleted_at'] == 0
    if profile == 'web-platform':
        assert behavior['case_variant_usernames']['accepted'] == (dialect != 'mysql')
        assert behavior['case_variant_emails']['accepted'] == (dialect != 'mysql')
        # SQLite intentionally has no FK enforcement; PostgreSQL and MySQL reject a dangling session row.
        assert behavior['dangling_session_fk']['accepted'] == (dialect == 'sqlite'), (combo, 'session FK behavior')
    report = dict(combination=combo, passed=True, app_tables=len(apps), total_tables=len(after), columns=sum(len(t['columns']) for t in after.values()), intentional_differences=intentional, comparison_dimensions=['table count and prefix', 'merged terminal columns (phone, announcement)', 'SQL static rows', 'Seed grants/locations/settings', 'ledger namespaces/version/checksum', 'text/composite PK null probes', 'length and FK behavior probes'], null_key_probe_count=len(new['all_text_and_composite_pk_null_checks']))
    reports.append(report)
    print('PASS', combo, expected_tables, 'tables; catalog contract, Seed, ledger and probes')

result = dict(author='yunnuo <ymz@ebox.vip>', generated_evidence=True, comparison_source='catalog single-track expectations (ADR-0025 R1.0c); no new engine or product-release claim', combinations=reports, all_passed=all(r['passed'] for r in reports))
(output / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(output / 'sql-inventory.json').write_text(json.dumps(dict(author='yunnuo <ymz@ebox.vip>', generated_evidence=True, files=sql_inventory), ensure_ascii=False, indent=2) + '\n')
assert result['all_passed'], 'catalog contract violations; see comparison.json'
