-- Author: yunnuo <ymz@ebox.vip>
-- Description: Versioned navigation and explicit independent role grants; legacy menus retained for recovery.
-- Compatibility: tables pin the instance-wide engine and collation explicitly, matching the platform@1 baseline
--  (utf8mb4_0900_ai_ci); following the database default broke cross-table comparisons on CI (Error 1267).
CREATE TABLE IF NOT EXISTS unicore_navigation_state (id INTEGER PRIMARY KEY, version BIGINT NOT NULL, initialized INTEGER NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO unicore_navigation_state(id,version,initialized) SELECT 1,0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_navigation_state WHERE id=1);
CREATE TABLE IF NOT EXISTS unicore_navigation_sections (id VARCHAR(64) PRIMARY KEY, surface VARCHAR(32) NOT NULL, payload TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_navigation_nodes (id VARCHAR(64) NOT NULL, section_id VARCHAR(64) NOT NULL, node_type VARCHAR(16) NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(section_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_role_authorizations (role_id VARCHAR(64) PRIMARY KEY, initialized INTEGER NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO unicore_role_authorizations(role_id,initialized) SELECT id,0 FROM unicore_roles WHERE NOT EXISTS (SELECT 1 FROM unicore_role_authorizations a WHERE a.role_id=unicore_roles.id);
CREATE TABLE IF NOT EXISTS unicore_role_menus (role_id VARCHAR(64) NOT NULL, menu_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,menu_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_role_actions (role_id VARCHAR(64) NOT NULL, action_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,action_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_role_operations (role_id VARCHAR(64) NOT NULL, operation_id VARCHAR(128) NOT NULL, PRIMARY KEY(role_id,operation_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
