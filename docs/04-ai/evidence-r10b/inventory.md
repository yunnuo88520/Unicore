<!-- Author: yunnuo <ymz@ebox.vip> -->
# R1.0b observed schemas and raw SQL hashes

Generated from actual verification results; these exports are evidence, not migration definitions.

| Combination | Tables | Columns | NULL-key probes | Complete schema and data | Native/catalog DDL |
| --- | ---: | ---: | ---: | --- | --- |
| sqlite-web-platform | 29 | 164 | 33 | [JSON](sqlite-web-platform.json) | [SQL](sqlite-web-platform.schema.sql) |
| sqlite-web-standalone | 5 | 24 | 6 | [JSON](sqlite-web-standalone.json) | [SQL](sqlite-web-standalone.schema.sql) |
| sqlite-desktop | 5 | 24 | 6 | [JSON](sqlite-desktop.json) | [SQL](sqlite-desktop.schema.sql) |
| postgres-web-platform | 29 | 164 | 33 | [JSON](postgres-web-platform.json) | [SQL](postgres-web-platform.schema.sql) |
| postgres-web-standalone | 5 | 24 | 6 | [JSON](postgres-web-standalone.json) | [SQL](postgres-web-standalone.schema.sql) |
| mysql-web-platform | 29 | 164 | 33 | [JSON](mysql-web-platform.json) | [SQL](mysql-web-platform.schema.sql) |
| mysql-web-standalone | 5 | 24 | 6 | [JSON](mysql-web-standalone.json) | [SQL](mysql-web-standalone.schema.sql) |

# Nine initial SQL files

Hashes are generated from complete raw SQL bytes, including comments and line endings.

| Namespace | Dialect | SQL | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| core@1 | mysql | [core/mysql/0001_initial.sql](../../../migrations/core/mysql/0001_initial.sql) | 1119 | `51e4df83a6d6d02dbfb74d594abccb6ac19522f82bf41d483cc2f78a8ce5afa2` |
| core@1 | postgres | [core/postgres/0001_initial.sql](../../../migrations/core/postgres/0001_initial.sql) | 1101 | `5df9a3031d055057d3ee0be23439afd07cf237cd5489e5c53ae0c94843203cf9` |
| core@1 | sqlite | [core/sqlite/0001_initial.sql](../../../migrations/core/sqlite/0001_initial.sql) | 928 | `d72770af3c5b8b8b8a6a7f75017f0e9e0603528e9bddb39f70b98ea1f5d9f149` |
| module.notes@1 | mysql | [modules/notes/mysql/0001_initial.sql](../../../migrations/modules/notes/mysql/0001_initial.sql) | 1018 | `fb35e39bae2523afbffe1a6ed05d3cfe2581d7f9264dd3d24a20f546eb30f268` |
| module.notes@1 | postgres | [modules/notes/postgres/0001_initial.sql](../../../migrations/modules/notes/postgres/0001_initial.sql) | 1110 | `50a441fbd38e19ac04a963e6efa1c3b8763e8f8c989ec47e0ce1fdee3bc59deb` |
| module.notes@1 | sqlite | [modules/notes/sqlite/0001_initial.sql](../../../migrations/modules/notes/sqlite/0001_initial.sql) | 1048 | `199a2c422701338f802c75a555efad4b91b03c17a318ddbf5110b7924efb76a0` |
| platform@1 | mysql | [platform/mysql/0001_initial.sql](../../../migrations/platform/mysql/0001_initial.sql) | 11281 | `76f4cffb4d9d88a4064e31423ea3635be089c8faf4d0b937aa16ad416970ab3b` |
| platform@1 | postgres | [platform/postgres/0001_initial.sql](../../../migrations/platform/postgres/0001_initial.sql) | 11798 | `170709b2868ad7085f2a93ccff72f0d44a967761702bcbf9b98f0a74721323ad` |
| platform@1 | sqlite | [platform/sqlite/0001_initial.sql](../../../migrations/platform/sqlite/0001_initial.sql) | 7562 | `15c8697b4fdd4d2894374c9f8374d5bee1b0dd8d8a070eb9b6b4299a30fb9151` |
