// Code generated from packages/contracts/openapi.json; DO NOT EDIT.
// Author: yunnuo <ymz@ebox.vip>
import type * as Models from './schema.gen';

export const operations = {
  "bootstrap": {
    "method": "GET",
    "path": "/api/v1/bootstrap",
    "requestSchema": null,
    "responseSchema": "BootstrapResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "execute": {
    "method": "POST",
    "path": "/api/v1/core/execute",
    "requestSchema": "ExecuteInput",
    "responseSchema": "ExecuteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true
  },
  "liveness": {
    "method": "GET",
    "path": "/api/v1/health/live",
    "requestSchema": null,
    "responseSchema": "HealthResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "readiness": {
    "method": "GET",
    "path": "/api/v1/health/ready",
    "requestSchema": null,
    "responseSchema": "HealthResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "installStatus": {
    "method": "GET",
    "path": "/api/v1/install/status",
    "requestSchema": null,
    "responseSchema": "InstallStatusResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "verifyDatabase": {
    "method": "POST",
    "path": "/api/v1/install/verify-db",
    "requestSchema": "DatabaseInput",
    "responseSchema": "DatabaseCheckResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "install-token",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "completeInstall": {
    "method": "POST",
    "path": "/api/v1/install/complete",
    "requestSchema": "InstallInput",
    "responseSchema": "InstallResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "install-token",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "captcha": {
    "method": "GET",
    "path": "/api/v1/auth/captcha",
    "requestSchema": null,
    "responseSchema": "CaptchaResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "login": {
    "method": "POST",
    "path": "/api/v1/auth/login",
    "requestSchema": "LoginInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "session": {
    "method": "GET",
    "path": "/api/v1/auth/session",
    "requestSchema": null,
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "logout": {
    "method": "POST",
    "path": "/api/v1/auth/logout",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "listUsers": {
    "method": "GET",
    "path": "/api/v1/admin/users",
    "requestSchema": null,
    "responseSchema": "UserListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "createUser": {
    "method": "POST",
    "path": "/api/v1/admin/users",
    "requestSchema": "UserCreate",
    "responseSchema": "UserResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:create"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "updateUser": {
    "method": "PATCH",
    "path": "/api/v1/admin/users/{id}",
    "requestSchema": "UserUpdate",
    "responseSchema": "UserResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:update"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "resetUserPassword": {
    "method": "POST",
    "path": "/api/v1/admin/users/{id}/password",
    "requestSchema": "AdminPasswordResetInput",
    "responseSchema": "AdminPasswordResetResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:update"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "adminSettings": {
    "method": "GET",
    "path": "/api/v1/admin/settings",
    "requestSchema": null,
    "responseSchema": "SettingsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "site"
  },
  "adminPatchSettings": {
    "method": "PATCH",
    "path": "/api/v1/admin/settings",
    "requestSchema": "SettingPatch",
    "responseSchema": "SettingsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "localSettings": {
    "method": "GET",
    "path": "/api/v1/settings",
    "requestSchema": null,
    "responseSchema": "SettingsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "localPatchSettings": {
    "method": "PATCH",
    "path": "/api/v1/settings",
    "requestSchema": "SettingPatch",
    "responseSchema": "SettingsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "authPolicy": {
    "method": "GET",
    "path": "/api/v1/auth/policy",
    "requestSchema": null,
    "responseSchema": "AuthPolicyResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "register": {
    "method": "POST",
    "path": "/api/v1/auth/register",
    "requestSchema": "RegisterInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "requestVerification": {
    "method": "POST",
    "path": "/api/v1/auth/verification/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "verifyEmail": {
    "method": "POST",
    "path": "/api/v1/auth/verification/complete",
    "requestSchema": "TokenInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "requestPasswordReset": {
    "method": "POST",
    "path": "/api/v1/auth/password/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "resetPassword": {
    "method": "POST",
    "path": "/api/v1/auth/password/reset",
    "requestSchema": "ResetInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "testMail": {
    "method": "POST",
    "path": "/api/v1/admin/settings/mail/test",
    "requestSchema": "MailTestInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "registerEmailCode": {
    "method": "POST",
    "path": "/api/v1/auth/email/register",
    "requestSchema": "RegisterInput",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "requestEmailVerify": {
    "method": "POST",
    "path": "/api/v1/auth/email/verify/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "completeEmailVerify": {
    "method": "POST",
    "path": "/api/v1/auth/email/verify/complete",
    "requestSchema": "EmailCodeInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "requestEmailReset": {
    "method": "POST",
    "path": "/api/v1/auth/email/reset/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "completeEmailReset": {
    "method": "POST",
    "path": "/api/v1/auth/email/reset/complete",
    "requestSchema": "EmailCodeInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "requestEmailLogin": {
    "method": "POST",
    "path": "/api/v1/auth/email/login/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "completeEmailLogin": {
    "method": "POST",
    "path": "/api/v1/auth/email/login/complete",
    "requestSchema": "EmailCodeInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "mailTemplates": {
    "method": "GET",
    "path": "/api/v1/admin/settings/mail/templates",
    "requestSchema": null,
    "responseSchema": "MailTemplateListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "mail-templates"
  },
  "saveMailTemplate": {
    "method": "PUT",
    "path": "/api/v1/admin/settings/mail/templates",
    "requestSchema": "MailTemplateInput",
    "responseSchema": "MailTemplateResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "listRoles": {
    "method": "GET",
    "path": "/api/v1/admin/roles",
    "requestSchema": null,
    "responseSchema": "RoleListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "roles:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "roles"
  },
  "createRole": {
    "method": "POST",
    "path": "/api/v1/admin/roles",
    "requestSchema": "RoleSaveInput",
    "responseSchema": "RoleResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "roles:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "roleOptions": {
    "method": "GET",
    "path": "/api/v1/admin/users/role-options",
    "requestSchema": null,
    "responseSchema": "RoleOptionsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:read",
      "users:create",
      "users:update"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "oidcInfo": {
    "method": "GET",
    "path": "/api/v1/auth/oidc",
    "requestSchema": null,
    "responseSchema": "OIDCInfoResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "oidcStart": {
    "method": "POST",
    "path": "/api/v1/auth/oidc/start",
    "requestSchema": null,
    "responseSchema": "OIDCStartResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "oidcAccount": {
    "method": "GET",
    "path": "/api/v1/account/oidc",
    "requestSchema": null,
    "responseSchema": "OIDCInfoResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "oidcLink": {
    "method": "POST",
    "path": "/api/v1/account/oidc/link",
    "requestSchema": "OIDCPasswordInput",
    "responseSchema": "OIDCStartResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "oidcUnlink": {
    "method": "POST",
    "path": "/api/v1/account/oidc/unlink",
    "requestSchema": "OIDCPasswordInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "oidcCheck": {
    "method": "POST",
    "path": "/api/v1/admin/settings/oidc/check",
    "requestSchema": null,
    "responseSchema": "OIDCCheckInfoResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "oidcCallback": {
    "method": "GET",
    "path": "/api/v1/auth/oidc/callback",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "adminBranding": {
    "method": "GET",
    "path": "/api/v1/admin/branding",
    "requestSchema": null,
    "responseSchema": "BrandingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminUpdateBranding": {
    "method": "PUT",
    "path": "/api/v1/admin/branding",
    "requestSchema": "BrandingInput",
    "responseSchema": "BrandingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "maxBodyBytes": 393216,
    "identityRealm": "administrator"
  },
  "listAdministrators": {
    "method": "GET",
    "path": "/api/v1/admin/administrators",
    "requestSchema": null,
    "responseSchema": "UserListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "administrators:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "createAdministrator": {
    "method": "POST",
    "path": "/api/v1/admin/administrators",
    "requestSchema": "UserCreate",
    "responseSchema": "UserResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "administrators:create"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "updateAdministrator": {
    "method": "PATCH",
    "path": "/api/v1/admin/administrators/{id}",
    "requestSchema": "UserUpdate",
    "responseSchema": "UserResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "administrators:update"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "systemLogs": {
    "method": "GET",
    "path": "/api/v1/admin/logs",
    "requestSchema": null,
    "responseSchema": "AuditLogResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "logs:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "logs"
  },
  "mailJobs": {
    "method": "GET",
    "path": "/api/v1/admin/mail/jobs",
    "requestSchema": null,
    "responseSchema": "MailJobListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "logs:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "mail"
  },
  "changePassword": {
    "method": "POST",
    "path": "/api/v1/account/password",
    "requestSchema": "ChangePasswordInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "storageLocations": {
    "method": "GET",
    "path": "/api/v1/admin/storage/locations",
    "requestSchema": null,
    "responseSchema": "StorageLocationListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "storage"
  },
  "createStorageLocation": {
    "method": "POST",
    "path": "/api/v1/admin/storage/locations",
    "requestSchema": "StorageLocationInput",
    "responseSchema": "StorageLocationResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "updateStorageLocation": {
    "method": "PUT",
    "path": "/api/v1/admin/storage/locations/{id}",
    "requestSchema": "StorageLocationInput",
    "responseSchema": "StorageLocationResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "deleteStorageLocation": {
    "method": "DELETE",
    "path": "/api/v1/admin/storage/locations/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "testStorageLocation": {
    "method": "POST",
    "path": "/api/v1/admin/storage/locations/{id}/test",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "activateStorageLocation": {
    "method": "POST",
    "path": "/api/v1/admin/storage/locations/{id}/activate",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "configureStorageBrowser": {
    "method": "POST",
    "path": "/api/v1/admin/storage/locations/{id}/browser",
    "requestSchema": "StorageMaintenanceInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "cleanupFiles": {
    "method": "POST",
    "path": "/api/v1/admin/storage/cleanup",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "listFiles": {
    "method": "GET",
    "path": "/api/v1/files",
    "requestSchema": null,
    "responseSchema": "FileListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "createFileUpload": {
    "method": "POST",
    "path": "/api/v1/files/uploads",
    "requestSchema": "FileUploadInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "uploadLocalFile": {
    "method": "PUT",
    "path": "/api/v1/files/uploads/{id}/content",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": true,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "streamingUpload": true,
    "identityRealm": "user"
  },
  "completeFileUpload": {
    "method": "POST",
    "path": "/api/v1/files/uploads/{id}/complete",
    "requestSchema": null,
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "fileAccess": {
    "method": "POST",
    "path": "/api/v1/files/{id}/access",
    "requestSchema": null,
    "responseSchema": "FileAccessResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:access",
      "notes:access"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "deleteFile": {
    "method": "DELETE",
    "path": "/api/v1/files/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:delete"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "migrateFile": {
    "method": "POST",
    "path": "/api/v1/admin/files/{id}/migrate",
    "requestSchema": "StorageTargetInput",
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "downloadLocalFile": {
    "method": "GET",
    "path": "/api/v1/files/{id}/content",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": true,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "signedDownload": true,
    "identityRealm": "user"
  },
  "administratorOIDCCallback": {
    "method": "GET",
    "path": "/api/v1/admin/auth/oidc/callback",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminBootstrap": {
    "method": "GET",
    "path": "/api/v1/admin/bootstrap",
    "requestSchema": null,
    "responseSchema": "BootstrapResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminExecute": {
    "method": "POST",
    "path": "/api/v1/admin/core/execute",
    "requestSchema": "ExecuteInput",
    "responseSchema": "ExecuteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "lab"
  },
  "adminCaptcha": {
    "method": "GET",
    "path": "/api/v1/admin/auth/captcha",
    "requestSchema": null,
    "responseSchema": "CaptchaResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminLogin": {
    "method": "POST",
    "path": "/api/v1/admin/auth/login",
    "requestSchema": "LoginInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminSession": {
    "method": "GET",
    "path": "/api/v1/admin/auth/session",
    "requestSchema": null,
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminLogout": {
    "method": "POST",
    "path": "/api/v1/admin/auth/logout",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminAuthPolicy": {
    "method": "GET",
    "path": "/api/v1/admin/auth/policy",
    "requestSchema": null,
    "responseSchema": "AuthPolicyResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminRequestPasswordReset": {
    "method": "POST",
    "path": "/api/v1/admin/auth/password/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminResetPassword": {
    "method": "POST",
    "path": "/api/v1/admin/auth/password/reset",
    "requestSchema": "ResetInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminRequestEmailReset": {
    "method": "POST",
    "path": "/api/v1/admin/auth/email/reset/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminCompleteEmailReset": {
    "method": "POST",
    "path": "/api/v1/admin/auth/email/reset/complete",
    "requestSchema": "EmailCodeInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminRequestEmailLogin": {
    "method": "POST",
    "path": "/api/v1/admin/auth/email/login/request",
    "requestSchema": "EmailRequest",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminCompleteEmailLogin": {
    "method": "POST",
    "path": "/api/v1/admin/auth/email/login/complete",
    "requestSchema": "EmailCodeInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminOidcInfo": {
    "method": "GET",
    "path": "/api/v1/admin/auth/oidc",
    "requestSchema": null,
    "responseSchema": "OIDCInfoResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminOidcStart": {
    "method": "POST",
    "path": "/api/v1/admin/auth/oidc/start",
    "requestSchema": null,
    "responseSchema": "OIDCStartResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminOidcAccount": {
    "method": "GET",
    "path": "/api/v1/admin/account/oidc",
    "requestSchema": null,
    "responseSchema": "OIDCInfoResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminOidcLink": {
    "method": "POST",
    "path": "/api/v1/admin/account/oidc/link",
    "requestSchema": "OIDCPasswordInput",
    "responseSchema": "OIDCStartResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminOidcUnlink": {
    "method": "POST",
    "path": "/api/v1/admin/account/oidc/unlink",
    "requestSchema": "OIDCPasswordInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminChangePassword": {
    "method": "POST",
    "path": "/api/v1/admin/account/password",
    "requestSchema": "ChangePasswordInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminListFiles": {
    "method": "GET",
    "path": "/api/v1/admin/files",
    "requestSchema": null,
    "responseSchema": "FileListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminCreateFileUpload": {
    "method": "POST",
    "path": "/api/v1/admin/files/uploads",
    "requestSchema": "FileUploadInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminUploadLocalFile": {
    "method": "PUT",
    "path": "/api/v1/admin/files/uploads/{id}/content",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": true,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "streamingUpload": true,
    "identityRealm": "administrator"
  },
  "adminCompleteFileUpload": {
    "method": "POST",
    "path": "/api/v1/admin/files/uploads/{id}/complete",
    "requestSchema": null,
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminFileAccess": {
    "method": "POST",
    "path": "/api/v1/admin/files/{id}/access",
    "requestSchema": null,
    "responseSchema": "FileAccessResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:access",
      "notes:access"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminDeleteFile": {
    "method": "DELETE",
    "path": "/api/v1/admin/files/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "listNotes": {
    "method": "GET",
    "path": "/api/v1/notes",
    "requestSchema": null,
    "responseSchema": "NoteListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "createNote": {
    "method": "POST",
    "path": "/api/v1/notes",
    "requestSchema": "NoteInput",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:create"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "updateNote": {
    "method": "PUT",
    "path": "/api/v1/notes/{id}",
    "requestSchema": "NoteUpdate",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:update"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "deleteNote": {
    "method": "DELETE",
    "path": "/api/v1/notes/{id}",
    "requestSchema": "NoteVersion",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:delete"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "adminListNotes": {
    "method": "GET",
    "path": "/api/v1/admin/notes",
    "requestSchema": null,
    "responseSchema": "NoteListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access",
      "notes:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "notes"
  },
  "adminCreateNote": {
    "method": "POST",
    "path": "/api/v1/admin/notes",
    "requestSchema": "NoteInput",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access",
      "notes:create"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "notes"
  },
  "adminUpdateNote": {
    "method": "PUT",
    "path": "/api/v1/admin/notes/{id}",
    "requestSchema": "NoteUpdate",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access",
      "notes:update"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "notes"
  },
  "adminDeleteNote": {
    "method": "DELETE",
    "path": "/api/v1/admin/notes/{id}",
    "requestSchema": "NoteVersion",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access",
      "notes:delete"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "notes"
  },
  "updateOverview": {
    "method": "GET",
    "path": "/api/v1/updates",
    "requestSchema": null,
    "responseSchema": "UpdateOverviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "adminUpdateOverview": {
    "method": "GET",
    "path": "/api/v1/admin/updates",
    "requestSchema": null,
    "responseSchema": "UpdateOverviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "updates:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "edition"
  },
  "checkUpdate": {
    "method": "POST",
    "path": "/api/v1/updates/check",
    "requestSchema": null,
    "responseSchema": "UpdateOverviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "adminCheckUpdate": {
    "method": "POST",
    "path": "/api/v1/admin/updates/check",
    "requestSchema": null,
    "responseSchema": "UpdateOverviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "updates:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "edition"
  },
  "applyUpdate": {
    "method": "POST",
    "path": "/api/v1/updates/apply",
    "requestSchema": "UpdateApplyInput",
    "responseSchema": "UpdateJobResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "adminApplyUpdate": {
    "method": "POST",
    "path": "/api/v1/admin/updates/apply",
    "requestSchema": "UpdateApplyInput",
    "responseSchema": "UpdateJobResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "updates:apply"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "exportSystemLogs": {
    "method": "GET",
    "path": "/api/v1/admin/logs/export",
    "requestSchema": null,
    "responseSchema": "AuditLogExportResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "logs:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "logs"
  },
  "previewMailTemplate": {
    "method": "POST",
    "path": "/api/v1/admin/settings/mail/templates/preview",
    "requestSchema": "MailTemplateInput",
    "responseSchema": "MailTemplateResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "testMailTemplate": {
    "method": "POST",
    "path": "/api/v1/admin/settings/mail/templates/test",
    "requestSchema": "MailTemplateTestInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "resetMailTemplate": {
    "method": "POST",
    "path": "/api/v1/admin/settings/mail/templates/reset",
    "requestSchema": "MailTemplateReset",
    "responseSchema": "MailTemplateResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminAnnouncements": {
    "method": "GET",
    "path": "/api/v1/admin/announcements",
    "requestSchema": null,
    "responseSchema": "AnnouncementListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "createAnnouncement": {
    "method": "POST",
    "path": "/api/v1/admin/announcements",
    "requestSchema": "AnnouncementInput",
    "responseSchema": "AnnouncementEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "updateAnnouncement": {
    "method": "PUT",
    "path": "/api/v1/admin/announcements/{id}",
    "requestSchema": "AnnouncementUpdate",
    "responseSchema": "AnnouncementEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "deleteAnnouncements": {
    "method": "POST",
    "path": "/api/v1/admin/announcements/delete",
    "requestSchema": "AnnouncementDelete",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "announcementSettings": {
    "method": "GET",
    "path": "/api/v1/admin/announcements/settings",
    "requestSchema": null,
    "responseSchema": "AnnouncementSettingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "saveAnnouncementSettings": {
    "method": "PUT",
    "path": "/api/v1/admin/announcements/settings",
    "requestSchema": "AnnouncementSetting",
    "responseSchema": "AnnouncementSettingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "previewAnnouncement": {
    "method": "POST",
    "path": "/api/v1/admin/announcements/preview",
    "requestSchema": "AnnouncementInput",
    "responseSchema": "AnnouncementPreviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "announcements": {
    "method": "GET",
    "path": "/api/v1/announcements",
    "requestSchema": null,
    "responseSchema": "AnnouncementFeedResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "announcement": {
    "method": "GET",
    "path": "/api/v1/announcements/{id}",
    "requestSchema": null,
    "responseSchema": "AnnouncementPublicResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "fileUploadPolicy": {
    "method": "GET",
    "path": "/api/v1/files/policy",
    "requestSchema": null,
    "responseSchema": "UploadPolicyResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "adminFileUploadPolicy": {
    "method": "GET",
    "path": "/api/v1/admin/files/policy",
    "requestSchema": null,
    "responseSchema": "UploadPolicyResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "createMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/files/multipart",
    "requestSchema": "MultipartUploadInput",
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminCreateMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/admin/files/multipart",
    "requestSchema": "MultipartUploadInput",
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "multipartUpload": {
    "method": "GET",
    "path": "/api/v1/files/multipart/{id}",
    "requestSchema": null,
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "adminMultipartUpload": {
    "method": "GET",
    "path": "/api/v1/admin/files/multipart/{id}",
    "requestSchema": null,
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "signUploadPart": {
    "method": "POST",
    "path": "/api/v1/files/multipart/{id}/parts",
    "requestSchema": "UploadPartInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminSignUploadPart": {
    "method": "POST",
    "path": "/api/v1/admin/files/multipart/{id}/parts",
    "requestSchema": "UploadPartInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "uploadLocalPart": {
    "method": "PUT",
    "path": "/api/v1/files/multipart/{id}/parts/{part}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": true,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "streamingUpload": true
  },
  "adminUploadLocalPart": {
    "method": "PUT",
    "path": "/api/v1/admin/files/multipart/{id}/parts/{part}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": true,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator",
    "streamingUpload": true
  },
  "completeMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/files/multipart/{id}/complete",
    "requestSchema": null,
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "files:upload"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminCompleteMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/admin/files/multipart/{id}/complete",
    "requestSchema": null,
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "accountProfile": {
    "method": "GET",
    "path": "/api/v1/account/profile",
    "requestSchema": null,
    "responseSchema": "AccountProfileResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "saveAccountProfile": {
    "method": "PATCH",
    "path": "/api/v1/account/profile",
    "requestSchema": "ProfileInput",
    "responseSchema": "AccountProfileResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "beginTOTP": {
    "method": "POST",
    "path": "/api/v1/account/totp/setup",
    "requestSchema": "TOTPSetupInput",
    "responseSchema": "TOTPSetupResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "pendingTOTP": {
    "method": "GET",
    "path": "/api/v1/account/totp/setup",
    "requestSchema": null,
    "responseSchema": "TOTPSetupResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "cancelTOTP": {
    "method": "POST",
    "path": "/api/v1/account/totp/cancel",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "enableTOTP": {
    "method": "POST",
    "path": "/api/v1/account/totp/enable",
    "requestSchema": "SecurityCodeInput",
    "responseSchema": "RecoveryCodesResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "disableTOTP": {
    "method": "POST",
    "path": "/api/v1/account/totp/disable",
    "requestSchema": "SecurityCodeInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "verifyMFA": {
    "method": "POST",
    "path": "/api/v1/auth/mfa",
    "requestSchema": "SecurityCodeInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "cancelMFA": {
    "method": "POST",
    "path": "/api/v1/auth/mfa/cancel",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "accountSessions": {
    "method": "GET",
    "path": "/api/v1/account/sessions",
    "requestSchema": null,
    "responseSchema": "LoginDevicesResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "revokeAccountSession": {
    "method": "POST",
    "path": "/api/v1/account/sessions/revoke",
    "requestSchema": "RevokeDeviceInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "revokeOtherSessions": {
    "method": "POST",
    "path": "/api/v1/account/sessions/revoke-others",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "requestCurrentEmail": {
    "method": "POST",
    "path": "/api/v1/account/email/current",
    "requestSchema": null,
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "verifyCurrentEmail": {
    "method": "POST",
    "path": "/api/v1/account/email/verify-current",
    "requestSchema": "EmailChangeVerifyInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "requestNewEmail": {
    "method": "POST",
    "path": "/api/v1/account/email/new",
    "requestSchema": "EmailChangeInput",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "confirmNewEmail": {
    "method": "POST",
    "path": "/api/v1/account/email/confirm",
    "requestSchema": "EmailChangeVerifyInput",
    "responseSchema": "AccountProfileResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminAccountProfile": {
    "method": "GET",
    "path": "/api/v1/admin/account/profile",
    "requestSchema": null,
    "responseSchema": "AccountProfileResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminSaveAccountProfile": {
    "method": "PATCH",
    "path": "/api/v1/admin/account/profile",
    "requestSchema": "ProfileInput",
    "responseSchema": "AccountProfileResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminBeginTOTP": {
    "method": "POST",
    "path": "/api/v1/admin/account/totp/setup",
    "requestSchema": "TOTPSetupInput",
    "responseSchema": "TOTPSetupResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminPendingTOTP": {
    "method": "GET",
    "path": "/api/v1/admin/account/totp/setup",
    "requestSchema": null,
    "responseSchema": "TOTPSetupResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminCancelTOTP": {
    "method": "POST",
    "path": "/api/v1/admin/account/totp/cancel",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminEnableTOTP": {
    "method": "POST",
    "path": "/api/v1/admin/account/totp/enable",
    "requestSchema": "SecurityCodeInput",
    "responseSchema": "RecoveryCodesResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminDisableTOTP": {
    "method": "POST",
    "path": "/api/v1/admin/account/totp/disable",
    "requestSchema": "SecurityCodeInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminVerifyMFA": {
    "method": "POST",
    "path": "/api/v1/admin/auth/mfa",
    "requestSchema": "SecurityCodeInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminCancelMFA": {
    "method": "POST",
    "path": "/api/v1/admin/auth/mfa/cancel",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminAccountSessions": {
    "method": "GET",
    "path": "/api/v1/admin/account/sessions",
    "requestSchema": null,
    "responseSchema": "LoginDevicesResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminRevokeAccountSession": {
    "method": "POST",
    "path": "/api/v1/admin/account/sessions/revoke",
    "requestSchema": "RevokeDeviceInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminRevokeOtherSessions": {
    "method": "POST",
    "path": "/api/v1/admin/account/sessions/revoke-others",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminRequestCurrentEmail": {
    "method": "POST",
    "path": "/api/v1/admin/account/email/current",
    "requestSchema": null,
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminVerifyCurrentEmail": {
    "method": "POST",
    "path": "/api/v1/admin/account/email/verify-current",
    "requestSchema": "EmailChangeVerifyInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminRequestNewEmail": {
    "method": "POST",
    "path": "/api/v1/admin/account/email/new",
    "requestSchema": "EmailChangeInput",
    "responseSchema": "EmailChallengeResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminConfirmNewEmail": {
    "method": "POST",
    "path": "/api/v1/admin/account/email/confirm",
    "requestSchema": "EmailChangeVerifyInput",
    "responseSchema": "AccountProfileResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "markAnnouncementRead": {
    "method": "POST",
    "path": "/api/v1/announcements/{id}/read",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "markAllAnnouncementsRead": {
    "method": "POST",
    "path": "/api/v1/announcements/read-all",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "announcementReadStatus": {
    "method": "GET",
    "path": "/api/v1/admin/announcements/{id}/read-status",
    "requestSchema": null,
    "responseSchema": "AnnouncementReadStatusResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "announcements"
  },
  "notificationSettings": {
    "method": "GET",
    "path": "/api/v1/admin/settings/notifications",
    "requestSchema": null,
    "responseSchema": "NotifyConfigurationResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "site"
  },
  "saveNotificationSettings": {
    "method": "PUT",
    "path": "/api/v1/admin/settings/notifications",
    "requestSchema": "NotifyConfiguration",
    "responseSchema": "NotifyConfigurationResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "previewNotification": {
    "method": "POST",
    "path": "/api/v1/admin/settings/notifications/preview",
    "requestSchema": "NotifyTemplate",
    "responseSchema": "NotifyPreviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "testNotification": {
    "method": "POST",
    "path": "/api/v1/admin/settings/notifications/test",
    "requestSchema": "NotifyTest",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "oidcTOTP": {
    "method": "POST",
    "path": "/api/v1/account/oidc/totp",
    "requestSchema": null,
    "responseSchema": "OIDCStartResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminOidcTOTP": {
    "method": "POST",
    "path": "/api/v1/admin/account/oidc/totp",
    "requestSchema": null,
    "responseSchema": "OIDCStartResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "oidcBindLogin": {
    "method": "POST",
    "path": "/api/v1/auth/oidc/bind-login",
    "requestSchema": "OIDCBindLoginInput",
    "responseSchema": "SessionResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "updateRole": {
    "method": "PUT",
    "path": "/api/v1/admin/roles/{id}",
    "requestSchema": "RoleSaveInput",
    "responseSchema": "RoleResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "roles:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "deleteRole": {
    "method": "DELETE",
    "path": "/api/v1/admin/roles/{id}",
    "requestSchema": null,
    "responseSchema": "RoleResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "roles:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "listMenus": {
    "method": "GET",
    "path": "/api/v1/admin/menus",
    "requestSchema": null,
    "responseSchema": "MenuListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "menus:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "menus"
  },
  "saveMenus": {
    "method": "PUT",
    "path": "/api/v1/admin/menus",
    "requestSchema": "MenuSaveInput",
    "responseSchema": "MenuListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "menus:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "menus"
  },
  "listDictionaries": {
    "method": "GET",
    "path": "/api/v1/admin/dictionaries",
    "requestSchema": null,
    "responseSchema": "DictionaryListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "dictionaries:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "dictionaries"
  },
  "createDictionary": {
    "method": "POST",
    "path": "/api/v1/admin/dictionaries",
    "requestSchema": "DictionaryCreateInput",
    "responseSchema": "DictionarySummaryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "dictionaries:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "dictionaries"
  },
  "getDictionary": {
    "method": "GET",
    "path": "/api/v1/admin/dictionaries/{id}",
    "requestSchema": null,
    "responseSchema": "DictionaryDetailResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "dictionaries:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "dictionaries"
  },
  "updateDictionary": {
    "method": "PUT",
    "path": "/api/v1/admin/dictionaries/{id}",
    "requestSchema": "DictionaryUpdateInput",
    "responseSchema": "DictionaryDetailResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "dictionaries:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "dictionaries"
  },
  "deleteDictionary": {
    "method": "DELETE",
    "path": "/api/v1/admin/dictionaries/{id}",
    "requestSchema": null,
    "responseSchema": "DictionaryDetailResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "dictionaries:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "dictionaries"
  },
  "listDepartments": {
    "method": "GET",
    "path": "/api/v1/admin/departments",
    "requestSchema": null,
    "responseSchema": "DepartmentListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "departments:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "departments"
  },
  "createDepartment": {
    "method": "POST",
    "path": "/api/v1/admin/departments",
    "requestSchema": "DepartmentSaveInput",
    "responseSchema": "DepartmentResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "departments:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "departments"
  },
  "updateDepartment": {
    "method": "PUT",
    "path": "/api/v1/admin/departments/{id}",
    "requestSchema": "DepartmentSaveInput",
    "responseSchema": "DepartmentResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "departments:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "departments"
  },
  "deleteDepartment": {
    "method": "DELETE",
    "path": "/api/v1/admin/departments/{id}",
    "requestSchema": null,
    "responseSchema": "DepartmentResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "departments:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "departments"
  },
  "replaceDictionaryItems": {
    "method": "PUT",
    "path": "/api/v1/admin/dictionaries/{id}/items",
    "requestSchema": "DictionaryItemsInput",
    "responseSchema": "DictionaryDetailResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "dictionaries:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "dictionaries"
  },
  "dictionary": {
    "method": "GET",
    "path": "/api/v1/dictionaries/{code}",
    "requestSchema": null,
    "responseSchema": "DictionaryDetailResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "listTasks": {
    "method": "GET",
    "path": "/api/v1/admin/tasks",
    "requestSchema": null,
    "responseSchema": "TaskListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "createTask": {
    "method": "POST",
    "path": "/api/v1/admin/tasks",
    "requestSchema": "TaskCreateInput",
    "responseSchema": "TaskEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "updateTask": {
    "method": "PUT",
    "path": "/api/v1/admin/tasks/{name}",
    "requestSchema": "TaskUpdateInput",
    "responseSchema": "TaskEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "editTask": {
    "method": "PATCH",
    "path": "/api/v1/admin/tasks/{name}",
    "requestSchema": "TaskEditInput",
    "responseSchema": "TaskEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "deleteTask": {
    "method": "DELETE",
    "path": "/api/v1/admin/tasks/{name}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "triggerTask": {
    "method": "POST",
    "path": "/api/v1/admin/tasks/{name}/run",
    "requestSchema": null,
    "responseSchema": "TaskTriggerResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "listTaskRuns": {
    "method": "GET",
    "path": "/api/v1/admin/tasks/{name}/runs",
    "requestSchema": null,
    "responseSchema": "TaskRunListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tasks:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "tasks"
  },
  "inbox": {
    "method": "GET",
    "path": "/api/v1/inbox",
    "requestSchema": null,
    "responseSchema": "InboxListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "readAllInbox": {
    "method": "POST",
    "path": "/api/v1/inbox/read-all",
    "requestSchema": null,
    "responseSchema": "InboxListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "readInbox": {
    "method": "POST",
    "path": "/api/v1/inbox/{id}/read",
    "requestSchema": null,
    "responseSchema": "InboxListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "events": {
    "method": "GET",
    "path": "/api/v1/events",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "logStream": {
    "method": "GET",
    "path": "/api/v1/admin/logs/stream",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "logs:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "exportUsers": {
    "method": "GET",
    "path": "/api/v1/admin/users/export.xlsx",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": true,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "userImportTemplate": {
    "method": "GET",
    "path": "/api/v1/admin/users/import-template.xlsx",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": true,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:create"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "importUsers": {
    "method": "POST",
    "path": "/api/v1/admin/users/import.xlsx",
    "requestSchema": null,
    "responseSchema": "UserImportResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": true,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:create"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "users"
  },
  "exportFiles": {
    "method": "GET",
    "path": "/api/v1/admin/files/export.xlsx",
    "requestSchema": null,
    "responseSchema": null,
    "binaryRequest": false,
    "binaryResponse": true,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminDashboard": {
    "method": "GET",
    "path": "/api/v1/admin/dashboard",
    "requestSchema": null,
    "responseSchema": "DashboardResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "overview"
  },
  "adminRoleOptions": {
    "method": "GET",
    "path": "/api/v1/admin/roles/admin-options",
    "requestSchema": null,
    "responseSchema": "RoleOptionsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "roles:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "listAPIOperations": {
    "method": "GET",
    "path": "/api/v1/admin/api-operations",
    "requestSchema": null,
    "responseSchema": "APIOperationListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "roles:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "roles"
  },
  "listPosts": {
    "method": "GET",
    "path": "/api/v1/admin/posts",
    "requestSchema": null,
    "responseSchema": "PostListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "posts:read"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "administrator",
    "uiPage": "posts"
  },
  "createPost": {
    "method": "POST",
    "path": "/api/v1/admin/posts",
    "requestSchema": "PostSaveInput",
    "responseSchema": "PostResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "posts:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "posts"
  },
  "updatePost": {
    "method": "PUT",
    "path": "/api/v1/admin/posts/{id}",
    "requestSchema": "PostSaveInput",
    "responseSchema": "PostResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "posts:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "posts"
  },
  "deletePost": {
    "method": "DELETE",
    "path": "/api/v1/admin/posts/{id}",
    "requestSchema": null,
    "responseSchema": "PostResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "posts:write"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "administrator",
    "uiPage": "posts"
  },
  "logTail": {
    "method": "GET",
    "path": "/api/v1/admin/logs/tail",
    "requestSchema": null,
    "responseSchema": "LogTailResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "logs:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminMonitorSnapshot": {
    "method": "GET",
    "path": "/api/v1/admin/monitor",
    "requestSchema": null,
    "responseSchema": "MonitorSnapshotResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "monitor:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "monitorSnapshot": {
    "method": "GET",
    "path": "/api/v1/monitor",
    "requestSchema": null,
    "responseSchema": "MonitorSnapshotResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "monitorEvents": {
    "method": "GET",
    "path": "/api/v1/monitor/events",
    "requestSchema": null,
    "responseSchema": "MonitorEventListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false
  },
  "adminMonitorEvents": {
    "method": "GET",
    "path": "/api/v1/admin/monitor/events",
    "requestSchema": null,
    "responseSchema": "MonitorEventListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "monitor:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminMonitorStorageProbe": {
    "method": "GET",
    "path": "/api/v1/admin/monitor/storage-probe",
    "requestSchema": null,
    "responseSchema": "MonitorStorageLocationResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "monitor:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminMonitorAlertRules": {
    "method": "GET",
    "path": "/api/v1/admin/monitor/alert-rules",
    "requestSchema": null,
    "responseSchema": "MonitorAlertRulesResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "monitor:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminUpdateMonitorAlertRules": {
    "method": "PUT",
    "path": "/api/v1/admin/monitor/alert-rules",
    "requestSchema": "MonitorAlertRules",
    "responseSchema": "MonitorAlertRulesResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "monitor:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "assignMenuRoles": {
    "method": "PUT",
    "path": "/api/v1/admin/menus/{id}/roles",
    "requestSchema": "MenuRoleAssignmentInput",
    "responseSchema": "RoleListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "menus:write",
      "roles:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "clientTokenLogin": {
    "method": "POST",
    "path": "/api/v1/auth/token",
    "requestSchema": "LoginInput",
    "responseSchema": "ClientTokenLoginResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "clientTokenMFA": {
    "method": "POST",
    "path": "/api/v1/auth/token/mfa",
    "requestSchema": "ClientTokenMFAInput",
    "responseSchema": "ClientTokenPairResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "refreshClientToken": {
    "method": "POST",
    "path": "/api/v1/auth/token/refresh",
    "requestSchema": "RefreshTokenInput",
    "responseSchema": "ClientTokenPairResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "revokeClientToken": {
    "method": "POST",
    "path": "/api/v1/auth/token/revoke",
    "requestSchema": "RefreshTokenInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "public",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "personalTokens": {
    "method": "GET",
    "path": "/api/v1/account/tokens",
    "requestSchema": null,
    "responseSchema": "PersonalTokenListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "createPersonalToken": {
    "method": "POST",
    "path": "/api/v1/account/tokens",
    "requestSchema": "PersonalTokenInput",
    "responseSchema": "PersonalTokenCreatedResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "revokePersonalToken": {
    "method": "DELETE",
    "path": "/api/v1/account/tokens/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "rotateTokenSigningKey": {
    "method": "POST",
    "path": "/api/v1/admin/auth/token-keys/rotate",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "notesListFiles": {
    "method": "GET",
    "path": "/api/v1/notes/files",
    "requestSchema": null,
    "responseSchema": "FileListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesFileAccess": {
    "method": "POST",
    "path": "/api/v1/notes/files/{id}/access",
    "requestSchema": null,
    "responseSchema": "FileAccessResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesDeleteFile": {
    "method": "DELETE",
    "path": "/api/v1/notes/files/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:create",
      "notes:update"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesFileUploadPolicy": {
    "method": "GET",
    "path": "/api/v1/notes/files/policy",
    "requestSchema": null,
    "responseSchema": "UploadPolicyResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesCreateMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/notes/files/multipart",
    "requestSchema": "MultipartUploadInput",
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:create",
      "notes:update"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesMultipartUpload": {
    "method": "GET",
    "path": "/api/v1/notes/files/multipart/{id}",
    "requestSchema": null,
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:access"
    ],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesSignUploadPart": {
    "method": "POST",
    "path": "/api/v1/notes/files/multipart/{id}/parts",
    "requestSchema": "UploadPartInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:create",
      "notes:update"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "notesUploadLocalPart": {
    "method": "PUT",
    "path": "/api/v1/notes/files/multipart/{id}/parts/{part}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": true,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:create",
      "notes:update"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "streamingUpload": true,
    "uiPage": "notes"
  },
  "notesCompleteMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/notes/files/multipart/{id}/complete",
    "requestSchema": null,
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [
      "notes:create",
      "notes:update"
    ],
    "permissionMode": "any",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "uiPage": "notes"
  },
  "avatarListFiles": {
    "method": "GET",
    "path": "/api/v1/account/avatar/files",
    "requestSchema": null,
    "responseSchema": "FileListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "avatarFileAccess": {
    "method": "POST",
    "path": "/api/v1/account/avatar/files/{id}/access",
    "requestSchema": null,
    "responseSchema": "FileAccessResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "avatarDeleteFile": {
    "method": "DELETE",
    "path": "/api/v1/account/avatar/files/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "avatarFileUploadPolicy": {
    "method": "GET",
    "path": "/api/v1/account/avatar/files/policy",
    "requestSchema": null,
    "responseSchema": "UploadPolicyResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "avatarCreateMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/account/avatar/files/multipart",
    "requestSchema": "MultipartUploadInput",
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "avatarMultipartUpload": {
    "method": "GET",
    "path": "/api/v1/account/avatar/files/multipart/{id}",
    "requestSchema": null,
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "avatarSignUploadPart": {
    "method": "POST",
    "path": "/api/v1/account/avatar/files/multipart/{id}/parts",
    "requestSchema": "UploadPartInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "avatarUploadLocalPart": {
    "method": "PUT",
    "path": "/api/v1/account/avatar/files/multipart/{id}/parts/{part}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": true,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user",
    "streamingUpload": true
  },
  "avatarCompleteMultipartUpload": {
    "method": "POST",
    "path": "/api/v1/account/avatar/files/multipart/{id}/complete",
    "requestSchema": null,
    "responseSchema": "FileEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "personalTokenRoles": {
    "method": "GET",
    "path": "/api/v1/account/token-roles",
    "requestSchema": null,
    "responseSchema": "RoleOptionsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "renewPersonalToken": {
    "method": "POST",
    "path": "/api/v1/account/tokens/{id}/renew",
    "requestSchema": "PersonalTokenRenewInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminPersonalTokens": {
    "method": "GET",
    "path": "/api/v1/admin/access-tokens",
    "requestSchema": null,
    "responseSchema": "PersonalTokenListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tokens:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminCreatePersonalToken": {
    "method": "POST",
    "path": "/api/v1/admin/access-tokens",
    "requestSchema": "AdminPersonalTokenInput",
    "responseSchema": "PersonalTokenCreatedResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tokens:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminRevokePersonalToken": {
    "method": "DELETE",
    "path": "/api/v1/admin/access-tokens/{id}",
    "requestSchema": null,
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tokens:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminRenewPersonalToken": {
    "method": "POST",
    "path": "/api/v1/admin/access-tokens/{id}/renew",
    "requestSchema": "PersonalTokenRenewInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tokens:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "personalTokenUsers": {
    "method": "GET",
    "path": "/api/v1/admin/access-tokens/users",
    "requestSchema": null,
    "responseSchema": "UserListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tokens:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminPersonalTokenRoles": {
    "method": "GET",
    "path": "/api/v1/admin/access-tokens/users/{id}/roles",
    "requestSchema": null,
    "responseSchema": "RoleOptionsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "multipartRequest": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "tokens:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  }
} as const;
export type OperationId = keyof typeof operations;
export interface OperationInputs {
  bootstrap: undefined;
  execute: Models.ExecuteInput;
  liveness: undefined;
  readiness: undefined;
  installStatus: undefined;
  verifyDatabase: Models.DatabaseInput;
  completeInstall: Models.InstallInput;
  captcha: undefined;
  login: Models.LoginInput;
  session: undefined;
  logout: undefined;
  listUsers: undefined;
  createUser: Models.UserCreate;
  updateUser: Models.UserUpdate;
  resetUserPassword: Models.AdminPasswordResetInput;
  adminSettings: undefined;
  adminPatchSettings: Models.SettingPatch;
  localSettings: undefined;
  localPatchSettings: Models.SettingPatch;
  authPolicy: undefined;
  register: Models.RegisterInput;
  requestVerification: Models.EmailRequest;
  verifyEmail: Models.TokenInput;
  requestPasswordReset: Models.EmailRequest;
  resetPassword: Models.ResetInput;
  testMail: Models.MailTestInput;
  registerEmailCode: Models.RegisterInput;
  requestEmailVerify: Models.EmailRequest;
  completeEmailVerify: Models.EmailCodeInput;
  requestEmailReset: Models.EmailRequest;
  completeEmailReset: Models.EmailCodeInput;
  requestEmailLogin: Models.EmailRequest;
  completeEmailLogin: Models.EmailCodeInput;
  mailTemplates: undefined;
  saveMailTemplate: Models.MailTemplateInput;
  listRoles: undefined;
  createRole: Models.RoleSaveInput;
  roleOptions: undefined;
  oidcInfo: undefined;
  oidcStart: undefined;
  oidcAccount: undefined;
  oidcLink: Models.OIDCPasswordInput;
  oidcUnlink: Models.OIDCPasswordInput;
  oidcCheck: undefined;
  oidcCallback: undefined;
  adminBranding: undefined;
  adminUpdateBranding: Models.BrandingInput;
  listAdministrators: undefined;
  createAdministrator: Models.UserCreate;
  updateAdministrator: Models.UserUpdate;
  systemLogs: undefined;
  mailJobs: undefined;
  changePassword: Models.ChangePasswordInput;
  storageLocations: undefined;
  createStorageLocation: Models.StorageLocationInput;
  updateStorageLocation: Models.StorageLocationInput;
  deleteStorageLocation: undefined;
  testStorageLocation: undefined;
  activateStorageLocation: undefined;
  configureStorageBrowser: Models.StorageMaintenanceInput;
  cleanupFiles: undefined;
  listFiles: undefined;
  createFileUpload: Models.FileUploadInput;
  uploadLocalFile: undefined;
  completeFileUpload: undefined;
  fileAccess: undefined;
  deleteFile: undefined;
  migrateFile: Models.StorageTargetInput;
  downloadLocalFile: undefined;
  administratorOIDCCallback: undefined;
  adminBootstrap: undefined;
  adminExecute: Models.ExecuteInput;
  adminCaptcha: undefined;
  adminLogin: Models.LoginInput;
  adminSession: undefined;
  adminLogout: undefined;
  adminAuthPolicy: undefined;
  adminRequestPasswordReset: Models.EmailRequest;
  adminResetPassword: Models.ResetInput;
  adminRequestEmailReset: Models.EmailRequest;
  adminCompleteEmailReset: Models.EmailCodeInput;
  adminRequestEmailLogin: Models.EmailRequest;
  adminCompleteEmailLogin: Models.EmailCodeInput;
  adminOidcInfo: undefined;
  adminOidcStart: undefined;
  adminOidcAccount: undefined;
  adminOidcLink: Models.OIDCPasswordInput;
  adminOidcUnlink: Models.OIDCPasswordInput;
  adminChangePassword: Models.ChangePasswordInput;
  adminListFiles: undefined;
  adminCreateFileUpload: Models.FileUploadInput;
  adminUploadLocalFile: undefined;
  adminCompleteFileUpload: undefined;
  adminFileAccess: undefined;
  adminDeleteFile: undefined;
  listNotes: undefined;
  createNote: Models.NoteInput;
  updateNote: Models.NoteUpdate;
  deleteNote: Models.NoteVersion;
  adminListNotes: undefined;
  adminCreateNote: Models.NoteInput;
  adminUpdateNote: Models.NoteUpdate;
  adminDeleteNote: Models.NoteVersion;
  updateOverview: undefined;
  adminUpdateOverview: undefined;
  checkUpdate: undefined;
  adminCheckUpdate: undefined;
  applyUpdate: Models.UpdateApplyInput;
  adminApplyUpdate: Models.UpdateApplyInput;
  exportSystemLogs: undefined;
  previewMailTemplate: Models.MailTemplateInput;
  testMailTemplate: Models.MailTemplateTestInput;
  resetMailTemplate: Models.MailTemplateReset;
  adminAnnouncements: undefined;
  createAnnouncement: Models.AnnouncementInput;
  updateAnnouncement: Models.AnnouncementUpdate;
  deleteAnnouncements: Models.AnnouncementDelete;
  announcementSettings: undefined;
  saveAnnouncementSettings: Models.AnnouncementSetting;
  previewAnnouncement: Models.AnnouncementInput;
  announcements: undefined;
  announcement: undefined;
  fileUploadPolicy: undefined;
  adminFileUploadPolicy: undefined;
  createMultipartUpload: Models.MultipartUploadInput;
  adminCreateMultipartUpload: Models.MultipartUploadInput;
  multipartUpload: undefined;
  adminMultipartUpload: undefined;
  signUploadPart: Models.UploadPartInput;
  adminSignUploadPart: Models.UploadPartInput;
  uploadLocalPart: undefined;
  adminUploadLocalPart: undefined;
  completeMultipartUpload: undefined;
  adminCompleteMultipartUpload: undefined;
  accountProfile: undefined;
  saveAccountProfile: Models.ProfileInput;
  beginTOTP: Models.TOTPSetupInput;
  pendingTOTP: undefined;
  cancelTOTP: undefined;
  enableTOTP: Models.SecurityCodeInput;
  disableTOTP: Models.SecurityCodeInput;
  verifyMFA: Models.SecurityCodeInput;
  cancelMFA: undefined;
  accountSessions: undefined;
  revokeAccountSession: Models.RevokeDeviceInput;
  revokeOtherSessions: undefined;
  requestCurrentEmail: undefined;
  verifyCurrentEmail: Models.EmailChangeVerifyInput;
  requestNewEmail: Models.EmailChangeInput;
  confirmNewEmail: Models.EmailChangeVerifyInput;
  adminAccountProfile: undefined;
  adminSaveAccountProfile: Models.ProfileInput;
  adminBeginTOTP: Models.TOTPSetupInput;
  adminPendingTOTP: undefined;
  adminCancelTOTP: undefined;
  adminEnableTOTP: Models.SecurityCodeInput;
  adminDisableTOTP: Models.SecurityCodeInput;
  adminVerifyMFA: Models.SecurityCodeInput;
  adminCancelMFA: undefined;
  adminAccountSessions: undefined;
  adminRevokeAccountSession: Models.RevokeDeviceInput;
  adminRevokeOtherSessions: undefined;
  adminRequestCurrentEmail: undefined;
  adminVerifyCurrentEmail: Models.EmailChangeVerifyInput;
  adminRequestNewEmail: Models.EmailChangeInput;
  adminConfirmNewEmail: Models.EmailChangeVerifyInput;
  markAnnouncementRead: undefined;
  markAllAnnouncementsRead: undefined;
  announcementReadStatus: undefined;
  notificationSettings: undefined;
  saveNotificationSettings: Models.NotifyConfiguration;
  previewNotification: Models.NotifyTemplate;
  testNotification: Models.NotifyTest;
  oidcTOTP: undefined;
  adminOidcTOTP: undefined;
  oidcBindLogin: Models.OIDCBindLoginInput;
  updateRole: Models.RoleSaveInput;
  deleteRole: undefined;
  listMenus: undefined;
  saveMenus: Models.MenuSaveInput;
  listDictionaries: undefined;
  createDictionary: Models.DictionaryCreateInput;
  getDictionary: undefined;
  updateDictionary: Models.DictionaryUpdateInput;
  deleteDictionary: undefined;
  listDepartments: undefined;
  createDepartment: Models.DepartmentSaveInput;
  updateDepartment: Models.DepartmentSaveInput;
  deleteDepartment: undefined;
  replaceDictionaryItems: Models.DictionaryItemsInput;
  dictionary: undefined;
  listTasks: undefined;
  createTask: Models.TaskCreateInput;
  updateTask: Models.TaskUpdateInput;
  editTask: Models.TaskEditInput;
  deleteTask: undefined;
  triggerTask: undefined;
  listTaskRuns: undefined;
  inbox: undefined;
  readAllInbox: undefined;
  readInbox: undefined;
  events: undefined;
  logStream: undefined;
  exportUsers: undefined;
  userImportTemplate: undefined;
  importUsers: undefined;
  exportFiles: undefined;
  adminDashboard: undefined;
  adminRoleOptions: undefined;
  listAPIOperations: undefined;
  listPosts: undefined;
  createPost: Models.PostSaveInput;
  updatePost: Models.PostSaveInput;
  deletePost: undefined;
  logTail: undefined;
  adminMonitorSnapshot: undefined;
  monitorSnapshot: undefined;
  monitorEvents: undefined;
  adminMonitorEvents: undefined;
  adminMonitorStorageProbe: undefined;
  adminMonitorAlertRules: undefined;
  adminUpdateMonitorAlertRules: Models.MonitorAlertRules;
  assignMenuRoles: Models.MenuRoleAssignmentInput;
  clientTokenLogin: Models.LoginInput;
  clientTokenMFA: Models.ClientTokenMFAInput;
  refreshClientToken: Models.RefreshTokenInput;
  revokeClientToken: Models.RefreshTokenInput;
  personalTokens: undefined;
  createPersonalToken: Models.PersonalTokenInput;
  revokePersonalToken: undefined;
  rotateTokenSigningKey: undefined;
  notesListFiles: undefined;
  notesFileAccess: undefined;
  notesDeleteFile: undefined;
  notesFileUploadPolicy: undefined;
  notesCreateMultipartUpload: Models.MultipartUploadInput;
  notesMultipartUpload: undefined;
  notesSignUploadPart: Models.UploadPartInput;
  notesUploadLocalPart: undefined;
  notesCompleteMultipartUpload: undefined;
  avatarListFiles: undefined;
  avatarFileAccess: undefined;
  avatarDeleteFile: undefined;
  avatarFileUploadPolicy: undefined;
  avatarCreateMultipartUpload: Models.MultipartUploadInput;
  avatarMultipartUpload: undefined;
  avatarSignUploadPart: Models.UploadPartInput;
  avatarUploadLocalPart: undefined;
  avatarCompleteMultipartUpload: undefined;
  personalTokenRoles: undefined;
  renewPersonalToken: Models.PersonalTokenRenewInput;
  adminPersonalTokens: undefined;
  adminCreatePersonalToken: Models.AdminPersonalTokenInput;
  adminRevokePersonalToken: undefined;
  adminRenewPersonalToken: Models.PersonalTokenRenewInput;
  personalTokenUsers: undefined;
  adminPersonalTokenRoles: undefined;
}
export interface OperationData {
  bootstrap: Models.BootstrapResponse['data'];
  execute: Models.ExecuteResponse['data'];
  liveness: Models.HealthResponse['data'];
  readiness: Models.HealthResponse['data'];
  installStatus: Models.InstallStatusResponse['data'];
  verifyDatabase: Models.DatabaseCheckResponse['data'];
  completeInstall: Models.InstallResultResponse['data'];
  captcha: Models.CaptchaResponse['data'];
  login: Models.SessionResponse['data'];
  session: Models.SessionResponse['data'];
  logout: Models.ActionResultResponse['data'];
  listUsers: Models.UserListResponse['data'];
  createUser: Models.UserResponse['data'];
  updateUser: Models.UserResponse['data'];
  resetUserPassword: Models.AdminPasswordResetResponse['data'];
  adminSettings: Models.SettingsResponse['data'];
  adminPatchSettings: Models.SettingsResponse['data'];
  localSettings: Models.SettingsResponse['data'];
  localPatchSettings: Models.SettingsResponse['data'];
  authPolicy: Models.AuthPolicyResponse['data'];
  register: Models.ActionResultResponse['data'];
  requestVerification: Models.ActionResultResponse['data'];
  verifyEmail: Models.ActionResultResponse['data'];
  requestPasswordReset: Models.ActionResultResponse['data'];
  resetPassword: Models.ActionResultResponse['data'];
  testMail: Models.ActionResultResponse['data'];
  registerEmailCode: Models.EmailChallengeResponse['data'];
  requestEmailVerify: Models.EmailChallengeResponse['data'];
  completeEmailVerify: Models.ActionResultResponse['data'];
  requestEmailReset: Models.EmailChallengeResponse['data'];
  completeEmailReset: Models.ActionResultResponse['data'];
  requestEmailLogin: Models.EmailChallengeResponse['data'];
  completeEmailLogin: Models.SessionResponse['data'];
  mailTemplates: Models.MailTemplateListResponse['data'];
  saveMailTemplate: Models.MailTemplateResponse['data'];
  listRoles: Models.RoleListResponse['data'];
  createRole: Models.RoleResponse['data'];
  roleOptions: Models.RoleOptionsResponse['data'];
  oidcInfo: Models.OIDCInfoResponse['data'];
  oidcStart: Models.OIDCStartResponse['data'];
  oidcAccount: Models.OIDCInfoResponse['data'];
  oidcLink: Models.OIDCStartResponse['data'];
  oidcUnlink: Models.SessionResponse['data'];
  oidcCheck: Models.OIDCCheckInfoResponse['data'];
  oidcCallback: void;
  adminBranding: Models.BrandingResponse['data'];
  adminUpdateBranding: Models.BrandingResponse['data'];
  listAdministrators: Models.UserListResponse['data'];
  createAdministrator: Models.UserResponse['data'];
  updateAdministrator: Models.UserResponse['data'];
  systemLogs: Models.AuditLogResponse['data'];
  mailJobs: Models.MailJobListResponse['data'];
  changePassword: Models.ActionResultResponse['data'];
  storageLocations: Models.StorageLocationListResponse['data'];
  createStorageLocation: Models.StorageLocationResponse['data'];
  updateStorageLocation: Models.StorageLocationResponse['data'];
  deleteStorageLocation: Models.ActionResultResponse['data'];
  testStorageLocation: Models.ActionResultResponse['data'];
  activateStorageLocation: Models.ActionResultResponse['data'];
  configureStorageBrowser: Models.ActionResultResponse['data'];
  cleanupFiles: Models.ActionResultResponse['data'];
  listFiles: Models.FileListResponse['data'];
  createFileUpload: Models.FileUploadGrantResponse['data'];
  uploadLocalFile: Models.ActionResultResponse['data'];
  completeFileUpload: Models.FileEntryResponse['data'];
  fileAccess: Models.FileAccessResponse['data'];
  deleteFile: Models.ActionResultResponse['data'];
  migrateFile: Models.FileEntryResponse['data'];
  downloadLocalFile: void;
  administratorOIDCCallback: void;
  adminBootstrap: Models.BootstrapResponse['data'];
  adminExecute: Models.ExecuteResponse['data'];
  adminCaptcha: Models.CaptchaResponse['data'];
  adminLogin: Models.SessionResponse['data'];
  adminSession: Models.SessionResponse['data'];
  adminLogout: Models.ActionResultResponse['data'];
  adminAuthPolicy: Models.AuthPolicyResponse['data'];
  adminRequestPasswordReset: Models.ActionResultResponse['data'];
  adminResetPassword: Models.ActionResultResponse['data'];
  adminRequestEmailReset: Models.EmailChallengeResponse['data'];
  adminCompleteEmailReset: Models.ActionResultResponse['data'];
  adminRequestEmailLogin: Models.EmailChallengeResponse['data'];
  adminCompleteEmailLogin: Models.SessionResponse['data'];
  adminOidcInfo: Models.OIDCInfoResponse['data'];
  adminOidcStart: Models.OIDCStartResponse['data'];
  adminOidcAccount: Models.OIDCInfoResponse['data'];
  adminOidcLink: Models.OIDCStartResponse['data'];
  adminOidcUnlink: Models.SessionResponse['data'];
  adminChangePassword: Models.ActionResultResponse['data'];
  adminListFiles: Models.FileListResponse['data'];
  adminCreateFileUpload: Models.FileUploadGrantResponse['data'];
  adminUploadLocalFile: Models.ActionResultResponse['data'];
  adminCompleteFileUpload: Models.FileEntryResponse['data'];
  adminFileAccess: Models.FileAccessResponse['data'];
  adminDeleteFile: Models.ActionResultResponse['data'];
  listNotes: Models.NoteListResponse['data'];
  createNote: Models.NoteResponse['data'];
  updateNote: Models.NoteResponse['data'];
  deleteNote: Models.ActionResultResponse['data'];
  adminListNotes: Models.NoteListResponse['data'];
  adminCreateNote: Models.NoteResponse['data'];
  adminUpdateNote: Models.NoteResponse['data'];
  adminDeleteNote: Models.ActionResultResponse['data'];
  updateOverview: Models.UpdateOverviewResponse['data'];
  adminUpdateOverview: Models.UpdateOverviewResponse['data'];
  checkUpdate: Models.UpdateOverviewResponse['data'];
  adminCheckUpdate: Models.UpdateOverviewResponse['data'];
  applyUpdate: Models.UpdateJobResponse['data'];
  adminApplyUpdate: Models.UpdateJobResponse['data'];
  exportSystemLogs: Models.AuditLogExportResponse['data'];
  previewMailTemplate: Models.MailTemplateResponse['data'];
  testMailTemplate: Models.ActionResultResponse['data'];
  resetMailTemplate: Models.MailTemplateResponse['data'];
  adminAnnouncements: Models.AnnouncementListResponse['data'];
  createAnnouncement: Models.AnnouncementEntryResponse['data'];
  updateAnnouncement: Models.AnnouncementEntryResponse['data'];
  deleteAnnouncements: Models.ActionResultResponse['data'];
  announcementSettings: Models.AnnouncementSettingResponse['data'];
  saveAnnouncementSettings: Models.AnnouncementSettingResponse['data'];
  previewAnnouncement: Models.AnnouncementPreviewResponse['data'];
  announcements: Models.AnnouncementFeedResponse['data'];
  announcement: Models.AnnouncementPublicResponse['data'];
  fileUploadPolicy: Models.UploadPolicyResponse['data'];
  adminFileUploadPolicy: Models.UploadPolicyResponse['data'];
  createMultipartUpload: Models.MultipartUploadResponse['data'];
  adminCreateMultipartUpload: Models.MultipartUploadResponse['data'];
  multipartUpload: Models.MultipartUploadResponse['data'];
  adminMultipartUpload: Models.MultipartUploadResponse['data'];
  signUploadPart: Models.FileUploadGrantResponse['data'];
  adminSignUploadPart: Models.FileUploadGrantResponse['data'];
  uploadLocalPart: Models.ActionResultResponse['data'];
  adminUploadLocalPart: Models.ActionResultResponse['data'];
  completeMultipartUpload: Models.FileEntryResponse['data'];
  adminCompleteMultipartUpload: Models.FileEntryResponse['data'];
  accountProfile: Models.AccountProfileResponse['data'];
  saveAccountProfile: Models.AccountProfileResponse['data'];
  beginTOTP: Models.TOTPSetupResponse['data'];
  pendingTOTP: Models.TOTPSetupResponse['data'];
  cancelTOTP: Models.ActionResultResponse['data'];
  enableTOTP: Models.RecoveryCodesResponse['data'];
  disableTOTP: Models.ActionResultResponse['data'];
  verifyMFA: Models.SessionResponse['data'];
  cancelMFA: Models.ActionResultResponse['data'];
  accountSessions: Models.LoginDevicesResponse['data'];
  revokeAccountSession: Models.ActionResultResponse['data'];
  revokeOtherSessions: Models.ActionResultResponse['data'];
  requestCurrentEmail: Models.EmailChallengeResponse['data'];
  verifyCurrentEmail: Models.ActionResultResponse['data'];
  requestNewEmail: Models.EmailChallengeResponse['data'];
  confirmNewEmail: Models.AccountProfileResponse['data'];
  adminAccountProfile: Models.AccountProfileResponse['data'];
  adminSaveAccountProfile: Models.AccountProfileResponse['data'];
  adminBeginTOTP: Models.TOTPSetupResponse['data'];
  adminPendingTOTP: Models.TOTPSetupResponse['data'];
  adminCancelTOTP: Models.ActionResultResponse['data'];
  adminEnableTOTP: Models.RecoveryCodesResponse['data'];
  adminDisableTOTP: Models.ActionResultResponse['data'];
  adminVerifyMFA: Models.SessionResponse['data'];
  adminCancelMFA: Models.ActionResultResponse['data'];
  adminAccountSessions: Models.LoginDevicesResponse['data'];
  adminRevokeAccountSession: Models.ActionResultResponse['data'];
  adminRevokeOtherSessions: Models.ActionResultResponse['data'];
  adminRequestCurrentEmail: Models.EmailChallengeResponse['data'];
  adminVerifyCurrentEmail: Models.ActionResultResponse['data'];
  adminRequestNewEmail: Models.EmailChallengeResponse['data'];
  adminConfirmNewEmail: Models.AccountProfileResponse['data'];
  markAnnouncementRead: Models.ActionResultResponse['data'];
  markAllAnnouncementsRead: Models.ActionResultResponse['data'];
  announcementReadStatus: Models.AnnouncementReadStatusResponse['data'];
  notificationSettings: Models.NotifyConfigurationResponse['data'];
  saveNotificationSettings: Models.NotifyConfigurationResponse['data'];
  previewNotification: Models.NotifyPreviewResponse['data'];
  testNotification: Models.ActionResultResponse['data'];
  oidcTOTP: Models.OIDCStartResponse['data'];
  adminOidcTOTP: Models.OIDCStartResponse['data'];
  oidcBindLogin: Models.SessionResponse['data'];
  updateRole: Models.RoleResponse['data'];
  deleteRole: Models.RoleResponse['data'];
  listMenus: Models.MenuListResponse['data'];
  saveMenus: Models.MenuListResponse['data'];
  listDictionaries: Models.DictionaryListResponse['data'];
  createDictionary: Models.DictionarySummaryResponse['data'];
  getDictionary: Models.DictionaryDetailResponse['data'];
  updateDictionary: Models.DictionaryDetailResponse['data'];
  deleteDictionary: Models.DictionaryDetailResponse['data'];
  listDepartments: Models.DepartmentListResponse['data'];
  createDepartment: Models.DepartmentResponse['data'];
  updateDepartment: Models.DepartmentResponse['data'];
  deleteDepartment: Models.DepartmentResponse['data'];
  replaceDictionaryItems: Models.DictionaryDetailResponse['data'];
  dictionary: Models.DictionaryDetailResponse['data'];
  listTasks: Models.TaskListResponse['data'];
  createTask: Models.TaskEntryResponse['data'];
  updateTask: Models.TaskEntryResponse['data'];
  editTask: Models.TaskEntryResponse['data'];
  deleteTask: Models.ActionResultResponse['data'];
  triggerTask: Models.TaskTriggerResponse['data'];
  listTaskRuns: Models.TaskRunListResponse['data'];
  inbox: Models.InboxListResponse['data'];
  readAllInbox: Models.InboxListResponse['data'];
  readInbox: Models.InboxListResponse['data'];
  events: void;
  logStream: void;
  exportUsers: void;
  userImportTemplate: void;
  importUsers: Models.UserImportResultResponse['data'];
  exportFiles: void;
  adminDashboard: Models.DashboardResponse['data'];
  adminRoleOptions: Models.RoleOptionsResponse['data'];
  listAPIOperations: Models.APIOperationListResponse['data'];
  listPosts: Models.PostListResponse['data'];
  createPost: Models.PostResponse['data'];
  updatePost: Models.PostResponse['data'];
  deletePost: Models.PostResponse['data'];
  logTail: Models.LogTailResponse['data'];
  adminMonitorSnapshot: Models.MonitorSnapshotResponse['data'];
  monitorSnapshot: Models.MonitorSnapshotResponse['data'];
  monitorEvents: Models.MonitorEventListResponse['data'];
  adminMonitorEvents: Models.MonitorEventListResponse['data'];
  adminMonitorStorageProbe: Models.MonitorStorageLocationResponse['data'];
  adminMonitorAlertRules: Models.MonitorAlertRulesResponse['data'];
  adminUpdateMonitorAlertRules: Models.MonitorAlertRulesResponse['data'];
  assignMenuRoles: Models.RoleListResponse['data'];
  clientTokenLogin: Models.ClientTokenLoginResponse['data'];
  clientTokenMFA: Models.ClientTokenPairResponse['data'];
  refreshClientToken: Models.ClientTokenPairResponse['data'];
  revokeClientToken: Models.ActionResultResponse['data'];
  personalTokens: Models.PersonalTokenListResponse['data'];
  createPersonalToken: Models.PersonalTokenCreatedResponse['data'];
  revokePersonalToken: Models.ActionResultResponse['data'];
  rotateTokenSigningKey: Models.ActionResultResponse['data'];
  notesListFiles: Models.FileListResponse['data'];
  notesFileAccess: Models.FileAccessResponse['data'];
  notesDeleteFile: Models.ActionResultResponse['data'];
  notesFileUploadPolicy: Models.UploadPolicyResponse['data'];
  notesCreateMultipartUpload: Models.MultipartUploadResponse['data'];
  notesMultipartUpload: Models.MultipartUploadResponse['data'];
  notesSignUploadPart: Models.FileUploadGrantResponse['data'];
  notesUploadLocalPart: Models.ActionResultResponse['data'];
  notesCompleteMultipartUpload: Models.FileEntryResponse['data'];
  avatarListFiles: Models.FileListResponse['data'];
  avatarFileAccess: Models.FileAccessResponse['data'];
  avatarDeleteFile: Models.ActionResultResponse['data'];
  avatarFileUploadPolicy: Models.UploadPolicyResponse['data'];
  avatarCreateMultipartUpload: Models.MultipartUploadResponse['data'];
  avatarMultipartUpload: Models.MultipartUploadResponse['data'];
  avatarSignUploadPart: Models.FileUploadGrantResponse['data'];
  avatarUploadLocalPart: Models.ActionResultResponse['data'];
  avatarCompleteMultipartUpload: Models.FileEntryResponse['data'];
  personalTokenRoles: Models.RoleOptionsResponse['data'];
  renewPersonalToken: Models.ActionResultResponse['data'];
  adminPersonalTokens: Models.PersonalTokenListResponse['data'];
  adminCreatePersonalToken: Models.PersonalTokenCreatedResponse['data'];
  adminRevokePersonalToken: Models.ActionResultResponse['data'];
  adminRenewPersonalToken: Models.ActionResultResponse['data'];
  personalTokenUsers: Models.UserListResponse['data'];
  adminPersonalTokenRoles: Models.RoleOptionsResponse['data'];
}
