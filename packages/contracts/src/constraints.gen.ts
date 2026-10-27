// Code generated from packages/contracts/openapi.json; DO NOT EDIT.
// Author: yunnuo <ymz@ebox.vip>
export const constraints = {
  "Profile": {
    "type": "string",
    "enum": [
      "web-platform",
      "web-standalone",
      "desktop",
      "cli"
    ]
  },
  "ExecuteInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "text"
    ],
    "properties": {
      "text": {
        "type": "string",
        "minLength": 1,
        "maxLength": 65536,
        "x-max-utf8-bytes": 65536
      }
    }
  },
  "ExecuteOutput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "characters",
      "words",
      "lines",
      "bytes",
      "sha256"
    ],
    "properties": {
      "characters": {
        "type": "integer"
      },
      "words": {
        "type": "integer"
      },
      "lines": {
        "type": "integer"
      },
      "bytes": {
        "type": "integer"
      },
      "sha256": {
        "type": "string"
      }
    }
  },
  "Capabilities": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "execute",
      "database",
      "installation",
      "authentication",
      "license",
      "updater",
      "settings"
    ],
    "properties": {
      "execute": {
        "type": "boolean"
      },
      "database": {
        "type": "boolean"
      },
      "installation": {
        "type": "boolean"
      },
      "authentication": {
        "type": "boolean"
      },
      "license": {
        "type": "boolean"
      },
      "updater": {
        "type": "boolean"
      },
      "settings": {
        "type": "boolean"
      }
    }
  },
  "Bootstrap": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profile",
      "version",
      "commit",
      "build_time",
      "stage",
      "deployment_kind",
      "capabilities",
      "installed",
      "site_name",
      "admin_path"
    ],
    "properties": {
      "profile": {
        "$ref": "#/components/schemas/Profile"
      },
      "version": {
        "type": "string"
      },
      "commit": {
        "type": "string"
      },
      "build_time": {
        "type": "string"
      },
      "stage": {
        "type": "string"
      },
      "deployment_kind": {
        "type": "string"
      },
      "capabilities": {
        "$ref": "#/components/schemas/Capabilities"
      },
      "installed": {
        "type": "boolean"
      },
      "site_name": {
        "type": "string"
      },
      "admin_path": {
        "type": "string"
      },
      "current_user": {
        "$ref": "#/components/schemas/User"
      },
      "csrf_token": {
        "type": "string"
      },
      "site_description": {
        "type": "string"
      },
      "site_copyright": {
        "type": "string"
      },
      "site_icp_number": {
        "type": "string"
      },
      "site_icp_url": {
        "type": "string"
      },
      "theme": {
        "type": "string"
      },
      "branding": {
        "$ref": "#/components/schemas/Branding"
      },
      "identity_realm": {
        "type": "string",
        "enum": [
          "user",
          "administrator"
        ]
      }
    }
  },
  "BootstrapResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Bootstrap"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "ExecuteResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/ExecuteOutput"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "ErrorResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "request_id": {
        "type": "string"
      },
      "fields": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      }
    }
  },
  "Health": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "status"
    ],
    "properties": {
      "status": {
        "type": "string"
      }
    }
  },
  "HealthResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Health"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "DatabaseInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "driver",
      "dsn"
    ],
    "properties": {
      "driver": {
        "type": "string",
        "enum": [
          "sqlite",
          "postgres",
          "mysql"
        ]
      },
      "dsn": {
        "type": "string",
        "maxLength": 4096
      },
      "host": {
        "type": "string",
        "maxLength": 253
      },
      "port": {
        "type": "integer",
        "minimum": 1,
        "maximum": 65535
      },
      "name": {
        "type": "string",
        "maxLength": 63
      },
      "username": {
        "type": "string",
        "maxLength": 128
      },
      "password": {
        "type": "string",
        "maxLength": 1024
      },
      "tls": {
        "type": "string",
        "enum": [
          "auto",
          "require",
          "disable"
        ]
      }
    }
  },
  "EnvironmentCheck": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "name",
      "ok",
      "detail"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "ok": {
        "type": "boolean"
      },
      "detail": {
        "type": "string"
      }
    }
  },
  "InstallStatus": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "status",
      "profile",
      "database_options",
      "checks"
    ],
    "properties": {
      "status": {
        "type": "string"
      },
      "profile": {
        "$ref": "#/components/schemas/Profile"
      },
      "database_options": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "checks": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/EnvironmentCheck"
        }
      }
    }
  },
  "InstallInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profile",
      "database",
      "site_name",
      "base_url",
      "admin_username",
      "admin_email",
      "admin_password"
    ],
    "properties": {
      "profile": {
        "$ref": "#/components/schemas/Profile"
      },
      "database": {
        "$ref": "#/components/schemas/DatabaseInput"
      },
      "site_name": {
        "type": "string"
      },
      "base_url": {
        "type": "string"
      },
      "admin_username": {
        "type": "string"
      },
      "admin_email": {
        "type": "string"
      },
      "admin_password": {
        "type": "string"
      },
      "reset_database": {
        "type": "boolean"
      },
      "database_confirmation": {
        "type": "string",
        "maxLength": 63
      }
    }
  },
  "InstallResult": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profile",
      "site_url",
      "admin_url",
      "settings_url"
    ],
    "properties": {
      "profile": {
        "$ref": "#/components/schemas/Profile"
      },
      "site_url": {
        "type": "string"
      },
      "admin_url": {
        "type": "string"
      },
      "settings_url": {
        "type": "string"
      }
    }
  },
  "User": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "username",
      "email",
      "status",
      "roles",
      "permissions",
      "created_at",
      "last_login_at"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "username": {
        "type": "string"
      },
      "email": {
        "type": "string"
      },
      "status": {
        "type": "string"
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "super_admin",
            "user"
          ]
        }
      },
      "permissions": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "created_at": {
        "type": "integer"
      },
      "last_login_at": {
        "type": "integer"
      }
    }
  },
  "UserList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items",
      "total",
      "page",
      "page_size"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/User"
        }
      },
      "total": {
        "type": "integer"
      },
      "page": {
        "type": "integer"
      },
      "page_size": {
        "type": "integer"
      }
    }
  },
  "UserCreate": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "username",
      "email",
      "password",
      "role"
    ],
    "properties": {
      "username": {
        "type": "string",
        "minLength": 3,
        "maxLength": 64,
        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$"
      },
      "email": {
        "type": "string",
        "format": "email",
        "maxLength": 254
      },
      "password": {
        "type": "string",
        "minLength": 12,
        "maxLength": 128
      },
      "role": {
        "type": "string",
        "enum": [
          "super_admin",
          "user"
        ]
      }
    }
  },
  "UserUpdate": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "role",
      "status"
    ],
    "properties": {
      "role": {
        "type": "string",
        "enum": [
          "super_admin",
          "user"
        ]
      },
      "status": {
        "type": "string"
      }
    }
  },
  "LoginInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "username",
      "password",
      "captcha_id",
      "captcha_answer"
    ],
    "properties": {
      "username": {
        "type": "string",
        "minLength": 1,
        "maxLength": 254
      },
      "password": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128
      },
      "captcha_id": {
        "type": "string"
      },
      "captcha_answer": {
        "type": "string"
      }
    }
  },
  "Session": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "user",
      "csrf_token",
      "expires_at"
    ],
    "properties": {
      "user": {
        "$ref": "#/components/schemas/User"
      },
      "csrf_token": {
        "type": "string"
      },
      "expires_at": {
        "type": "integer"
      }
    }
  },
  "Captcha": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "image"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "image": {
        "type": "string"
      }
    }
  },
  "AuditEntry": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "actor_id",
      "action",
      "created_at"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "actor_id": {
        "type": "string"
      },
      "action": {
        "type": "string"
      },
      "created_at": {
        "type": "integer"
      }
    }
  },
  "Dashboard": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "total_users",
      "today_new_users",
      "active_users_7d",
      "audit"
    ],
    "properties": {
      "total_users": {
        "type": "integer"
      },
      "today_new_users": {
        "type": "integer"
      },
      "active_users_7d": {
        "type": "integer"
      },
      "audit": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/AuditEntry"
        }
      }
    }
  },
  "SettingEntry": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "key",
      "value",
      "value_type",
      "group",
      "label",
      "sensitive"
    ],
    "properties": {
      "key": {
        "type": "string"
      },
      "value": {
        "type": "string"
      },
      "value_type": {
        "type": "string"
      },
      "group": {
        "type": "string"
      },
      "label": {
        "type": "string"
      },
      "sensitive": {
        "type": "boolean"
      },
      "configured": {
        "type": "boolean"
      }
    }
  },
  "Settings": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/SettingEntry"
        }
      }
    }
  },
  "SettingChange": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "key",
      "value"
    ],
    "properties": {
      "key": {
        "type": "string"
      },
      "value": {
        "type": "string"
      },
      "clear": {
        "type": "boolean"
      }
    }
  },
  "SettingPatch": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "changes"
    ],
    "properties": {
      "changes": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/SettingChange"
        },
        "minItems": 1,
        "maxItems": 100
      }
    }
  },
  "ActionResult": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "success"
    ],
    "properties": {
      "success": {
        "type": "boolean"
      }
    }
  },
  "InstallStatusResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/InstallStatus"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "InstallResultResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/InstallResult"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "UserResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/User"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "UserListResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/UserList"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "SessionResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Session"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "CaptchaResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Captcha"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "DashboardResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Dashboard"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "SettingsResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Settings"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "ActionResultResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/ActionResult"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "AuthPolicy": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "registration_enabled",
      "reset_enabled",
      "login_captcha",
      "register_captcha",
      "mail_ready",
      "email_login_enabled"
    ],
    "properties": {
      "registration_enabled": {
        "type": "boolean"
      },
      "reset_enabled": {
        "type": "boolean"
      },
      "login_captcha": {
        "type": "boolean"
      },
      "register_captcha": {
        "type": "boolean"
      },
      "mail_ready": {
        "type": "boolean"
      },
      "email_login_enabled": {
        "type": "boolean"
      }
    }
  },
  "RegisterInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "username",
      "email",
      "password",
      "captcha_id",
      "captcha_answer"
    ],
    "properties": {
      "username": {
        "type": "string",
        "minLength": 3,
        "maxLength": 64,
        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$"
      },
      "email": {
        "type": "string",
        "format": "email",
        "maxLength": 254
      },
      "password": {
        "type": "string",
        "minLength": 12,
        "maxLength": 128
      },
      "captcha_id": {
        "type": "string"
      },
      "captcha_answer": {
        "type": "string"
      }
    }
  },
  "EmailRequest": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "email",
      "captcha_id",
      "captcha_answer"
    ],
    "properties": {
      "email": {
        "type": "string",
        "format": "email",
        "maxLength": 254,
        "minLength": 3
      },
      "captcha_id": {
        "type": "string"
      },
      "captcha_answer": {
        "type": "string"
      }
    }
  },
  "TokenInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "token"
    ],
    "properties": {
      "token": {
        "type": "string"
      }
    }
  },
  "ResetInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "token",
      "password"
    ],
    "properties": {
      "token": {
        "type": "string"
      },
      "password": {
        "type": "string"
      }
    }
  },
  "MailTestInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "recipient"
    ],
    "properties": {
      "recipient": {
        "type": "string",
        "format": "email",
        "maxLength": 254,
        "minLength": 3
      }
    }
  },
  "MailJob": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "state",
      "attempts",
      "created_at",
      "available_at",
      "last_error"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "state": {
        "type": "string"
      },
      "attempts": {
        "type": "integer"
      },
      "created_at": {
        "type": "integer"
      },
      "available_at": {
        "type": "integer"
      },
      "last_error": {
        "type": "string"
      }
    }
  },
  "MailJobList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/MailJob"
        }
      }
    }
  },
  "AuthPolicyResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/AuthPolicy"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "MailJobListResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/MailJobList"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "EmailChallenge": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "challenge_id",
      "expires_in",
      "retry_after"
    ],
    "properties": {
      "challenge_id": {
        "type": "string"
      },
      "expires_in": {
        "type": "integer"
      },
      "retry_after": {
        "type": "integer"
      }
    }
  },
  "EmailCodeInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "challenge_id",
      "code",
      "password"
    ],
    "properties": {
      "challenge_id": {
        "type": "string"
      },
      "code": {
        "type": "string",
        "pattern": "^[0-9]{6}$",
        "minLength": 6,
        "maxLength": 6
      },
      "password": {
        "type": "string"
      }
    }
  },
  "MailTemplate": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "purpose",
      "subject",
      "html",
      "text"
    ],
    "properties": {
      "purpose": {
        "type": "string"
      },
      "subject": {
        "type": "string"
      },
      "html": {
        "type": "string"
      },
      "text": {
        "type": "string"
      }
    }
  },
  "MailTemplateList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/MailTemplate"
        }
      }
    }
  },
  "EmailChallengeResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/EmailChallenge"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "MailTemplateListResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/MailTemplateList"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "PermissionDefinition": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "description",
      "group",
      "assignable"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "group": {
        "type": "string"
      },
      "assignable": {
        "type": "boolean"
      }
    }
  },
  "Role": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "builtin",
      "permissions",
      "user_count"
    ],
    "properties": {
      "id": {
        "type": "string",
        "enum": [
          "super_admin",
          "user"
        ]
      },
      "name": {
        "type": "string"
      },
      "builtin": {
        "type": "boolean"
      },
      "permissions": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "user_count": {
        "type": "integer"
      }
    }
  },
  "RoleList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items",
      "permissions"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/Role"
        }
      },
      "permissions": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/PermissionDefinition"
        }
      }
    }
  },
  "RoleOption": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "assignable"
    ],
    "properties": {
      "id": {
        "type": "string",
        "enum": [
          "super_admin",
          "user"
        ]
      },
      "name": {
        "type": "string"
      },
      "assignable": {
        "type": "boolean"
      }
    }
  },
  "RoleOptions": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/RoleOption"
        }
      }
    }
  },
  "RoleResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Role"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "RoleListResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/RoleList"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "RoleOptionsResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/RoleOptions"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "OIDCInfo": {
    "type": "object",
    "required": [
      "enabled",
      "provider_name",
      "callback_url",
      "linked",
      "issuer",
      "has_local_password"
    ],
    "properties": {
      "enabled": {
        "type": "boolean"
      },
      "provider_name": {
        "type": "string"
      },
      "callback_url": {
        "type": "string"
      },
      "linked": {
        "type": "boolean"
      },
      "issuer": {
        "type": "string"
      },
      "has_local_password": {
        "type": "boolean"
      }
    }
  },
  "OIDCPasswordInput": {
    "type": "object",
    "required": [
      "password"
    ],
    "properties": {
      "password": {
        "type": "string",
        "maxLength": 128
      }
    }
  },
  "OIDCStart": {
    "type": "object",
    "required": [
      "authorization_url"
    ],
    "properties": {
      "authorization_url": {
        "type": "string"
      }
    }
  },
  "OIDCInfoResponse": {
    "type": "object",
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/OIDCInfo"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "OIDCStartResponse": {
    "type": "object",
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/OIDCStart"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "Branding": {
    "type": "object",
    "required": [
      "logo",
      "logo_dark",
      "favicon"
    ],
    "additionalProperties": false,
    "properties": {
      "logo": {
        "type": "string",
        "maxLength": 400000
      },
      "logo_dark": {
        "type": "string",
        "maxLength": 400000
      },
      "favicon": {
        "type": "string",
        "maxLength": 400000
      }
    }
  },
  "BrandingInput": {
    "type": "object",
    "required": [
      "slot",
      "content"
    ],
    "additionalProperties": false,
    "properties": {
      "slot": {
        "type": "string",
        "enum": [
          "logo",
          "logo_dark",
          "favicon"
        ]
      },
      "content": {
        "type": "string",
        "maxLength": 349528
      }
    }
  },
  "BrandingResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/Branding"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "DatabaseCheck": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "success",
      "database_name",
      "table_count",
      "initialized"
    ],
    "properties": {
      "success": {
        "type": "boolean"
      },
      "database_name": {
        "type": "string"
      },
      "table_count": {
        "type": "integer"
      },
      "initialized": {
        "type": "boolean"
      }
    }
  },
  "InstallToken": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "token"
    ],
    "properties": {
      "token": {
        "type": "string",
        "minLength": 32,
        "maxLength": 256
      }
    }
  },
  "DatabaseCheckResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/DatabaseCheck"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "InstallTokenResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/InstallToken"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "InstallTokenRotate": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "ChangePasswordInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "current_password",
      "password"
    ],
    "properties": {
      "current_password": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128
      },
      "password": {
        "type": "string",
        "minLength": 12,
        "maxLength": 128,
        "x-max-utf8-bytes": 128
      }
    }
  },
  "AuditLogList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items",
      "total",
      "page",
      "page_size"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/AuditEntry"
        }
      },
      "total": {
        "type": "integer"
      },
      "page": {
        "type": "integer"
      },
      "page_size": {
        "type": "integer"
      }
    }
  },
  "AuditLogResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "message",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "data": {
        "$ref": "#/components/schemas/AuditLogList"
      },
      "request_id": {
        "type": "string"
      }
    }
  },
  "StorageLocation": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "provider",
      "endpoint",
      "bucket",
      "region",
      "prefix",
      "path_style",
      "configured",
      "tested",
      "active",
      "file_count",
      "created_at"
    ],
    "properties": {
      "id": {
        "type": "string",
        "maxLength": 64
      },
      "name": {
        "type": "string",
        "maxLength": 100,
        "minLength": 1
      },
      "provider": {
        "type": "string",
        "enum": [
          "local",
          "minio",
          "s3",
          "oss",
          "cos"
        ]
      },
      "endpoint": {
        "type": "string",
        "maxLength": 2048
      },
      "bucket": {
        "type": "string",
        "maxLength": 255
      },
      "region": {
        "type": "string",
        "maxLength": 64
      },
      "prefix": {
        "type": "string",
        "maxLength": 255
      },
      "path_style": {
        "type": "boolean"
      },
      "configured": {
        "type": "boolean"
      },
      "tested": {
        "type": "boolean"
      },
      "active": {
        "type": "boolean"
      },
      "file_count": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "created_at": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    }
  },
  "StorageLocationInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "name",
      "provider",
      "endpoint",
      "bucket",
      "region",
      "prefix",
      "path_style",
      "access_key",
      "secret_key"
    ],
    "properties": {
      "name": {
        "type": "string",
        "maxLength": 100,
        "minLength": 1
      },
      "provider": {
        "type": "string",
        "enum": [
          "local",
          "minio",
          "s3",
          "oss",
          "cos"
        ]
      },
      "endpoint": {
        "type": "string",
        "maxLength": 2048
      },
      "bucket": {
        "type": "string",
        "maxLength": 255
      },
      "region": {
        "type": "string",
        "maxLength": 64
      },
      "prefix": {
        "type": "string",
        "maxLength": 255
      },
      "path_style": {
        "type": "boolean"
      },
      "access_key": {
        "type": "string",
        "maxLength": 1024
      },
      "secret_key": {
        "type": "string",
        "maxLength": 4096
      }
    }
  },
  "StorageLocationList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items",
      "active_id"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/StorageLocation"
        }
      },
      "active_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  },
  "StorageTargetInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "location_id"
    ],
    "properties": {
      "location_id": {
        "type": "string",
        "maxLength": 64,
        "minLength": 1
      }
    }
  },
  "StorageMaintenanceInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "origin"
    ],
    "properties": {
      "origin": {
        "type": "string",
        "maxLength": 2048,
        "format": "uri"
      }
    }
  },
  "FileEntry": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file_id",
      "original_name",
      "storage_type",
      "location_id",
      "mime_type",
      "size",
      "creator_id",
      "creator_realm",
      "created_at",
      "expires_at",
      "state"
    ],
    "properties": {
      "file_id": {
        "type": "string",
        "maxLength": 80
      },
      "original_name": {
        "type": "string",
        "maxLength": 255
      },
      "storage_type": {
        "type": "string",
        "enum": [
          "local",
          "minio",
          "s3",
          "oss",
          "cos"
        ]
      },
      "location_id": {
        "type": "string",
        "maxLength": 64
      },
      "mime_type": {
        "type": "string",
        "maxLength": 255
      },
      "size": {
        "type": "integer",
        "minimum": 0,
        "maximum": 1073741824
      },
      "creator_id": {
        "type": "string",
        "maxLength": 64
      },
      "creator_realm": {
        "type": "string",
        "maxLength": 16
      },
      "created_at": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "expires_at": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "state": {
        "type": "string",
        "enum": [
          "pending",
          "copying",
          "ready",
          "deleted"
        ]
      }
    }
  },
  "FileList": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "items",
      "total",
      "page",
      "page_size"
    ],
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/FileEntry"
        }
      },
      "total": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "page": {
        "type": "integer",
        "minimum": 1,
        "maximum": 9007199254740991
      },
      "page_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 50
      }
    }
  },
  "FileUploadInput": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "original_name",
      "mime_type",
      "size"
    ],
    "properties": {
      "original_name": {
        "type": "string",
        "maxLength": 255,
        "minLength": 1
      },
      "mime_type": {
        "type": "string",
        "maxLength": 255,
        "minLength": 1
      },
      "size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1073741824
      }
    }
  },
  "FileUploadGrant": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file_id",
      "url",
      "method",
      "headers",
      "fields",
      "direct",
      "expires_at"
    ],
    "properties": {
      "file_id": {
        "type": "string",
        "maxLength": 80
      },
      "url": {
        "type": "string",
        "maxLength": 8192
      },
      "method": {
        "type": "string",
        "enum": [
          "PUT",
          "POST"
        ]
      },
      "headers": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "fields": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "direct": {
        "type": "boolean"
      },
      "expires_at": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    }
  },
  "FileAccess": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "url",
      "expires_at"
    ],
    "properties": {
      "url": {
        "type": "string",
        "maxLength": 8192
      },
      "expires_at": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    }
  },
  "StorageLocationListResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string",
        "maxLength": 64
      },
      "data": {
        "$ref": "#/components/schemas/StorageLocationList"
      },
      "request_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  },
  "StorageLocationResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string",
        "maxLength": 64
      },
      "data": {
        "$ref": "#/components/schemas/StorageLocation"
      },
      "request_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  },
  "FileListResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string",
        "maxLength": 64
      },
      "data": {
        "$ref": "#/components/schemas/FileList"
      },
      "request_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  },
  "FileUploadGrantResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string",
        "maxLength": 64
      },
      "data": {
        "$ref": "#/components/schemas/FileUploadGrant"
      },
      "request_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  },
  "FileEntryResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string",
        "maxLength": 64
      },
      "data": {
        "$ref": "#/components/schemas/FileEntry"
      },
      "request_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  },
  "FileAccessResponse": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "code",
      "data",
      "request_id"
    ],
    "properties": {
      "code": {
        "type": "string",
        "maxLength": 64
      },
      "data": {
        "$ref": "#/components/schemas/FileAccess"
      },
      "request_id": {
        "type": "string",
        "maxLength": 64
      }
    }
  }
};
