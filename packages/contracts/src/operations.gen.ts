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
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "createUser": {
    "method": "POST",
    "path": "/api/v1/admin/users",
    "requestSchema": "UserCreate",
    "responseSchema": "UserResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:create"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "updateUser": {
    "method": "PATCH",
    "path": "/api/v1/admin/users/{id}",
    "requestSchema": "UserUpdate",
    "responseSchema": "UserResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "users:update"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminSettings": {
    "method": "GET",
    "path": "/api/v1/admin/settings",
    "requestSchema": null,
    "responseSchema": "SettingsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminPatchSettings": {
    "method": "PATCH",
    "path": "/api/v1/admin/settings",
    "requestSchema": "SettingPatch",
    "responseSchema": "SettingsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "saveMailTemplate": {
    "method": "PUT",
    "path": "/api/v1/admin/settings/mail/templates",
    "requestSchema": "MailTemplateInput",
    "responseSchema": "MailTemplateResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
  "roleOptions": {
    "method": "GET",
    "path": "/api/v1/admin/users/role-options",
    "requestSchema": null,
    "responseSchema": "RoleOptionsResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "oidcInfo": {
    "method": "GET",
    "path": "/api/v1/auth/oidc",
    "requestSchema": null,
    "responseSchema": "OIDCInfoResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "settings:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
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
  "mailJobs": {
    "method": "GET",
    "path": "/api/v1/admin/mail/jobs",
    "requestSchema": null,
    "responseSchema": "MailJobListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
  "changePassword": {
    "method": "POST",
    "path": "/api/v1/account/password",
    "requestSchema": "ChangePasswordInput",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "createStorageLocation": {
    "method": "POST",
    "path": "/api/v1/admin/storage/locations",
    "requestSchema": "StorageLocationInput",
    "responseSchema": "StorageLocationResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
  "createFileUpload": {
    "method": "POST",
    "path": "/api/v1/files/uploads",
    "requestSchema": "FileUploadInput",
    "responseSchema": "FileUploadGrantResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
    "permissionMode": "all",
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
    "profiles": [
      "web-platform"
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminCaptcha": {
    "method": "GET",
    "path": "/api/v1/admin/auth/captcha",
    "requestSchema": null,
    "responseSchema": "CaptchaResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
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
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "identityRealm": "user"
  },
  "createNote": {
    "method": "POST",
    "path": "/api/v1/notes",
    "requestSchema": "NoteInput",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "updateNote": {
    "method": "PUT",
    "path": "/api/v1/notes/{id}",
    "requestSchema": "NoteUpdate",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "deleteNote": {
    "method": "DELETE",
    "path": "/api/v1/notes/{id}",
    "requestSchema": "NoteVersion",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform",
      "web-standalone"
    ],
    "access": "platform-session",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": true,
    "identityRealm": "user"
  },
  "adminListNotes": {
    "method": "GET",
    "path": "/api/v1/admin/notes",
    "requestSchema": null,
    "responseSchema": "NoteListResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "adminCreateNote": {
    "method": "POST",
    "path": "/api/v1/admin/notes",
    "requestSchema": "NoteInput",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminUpdateNote": {
    "method": "PUT",
    "path": "/api/v1/admin/notes/{id}",
    "requestSchema": "NoteUpdate",
    "responseSchema": "NoteResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "adminDeleteNote": {
    "method": "DELETE",
    "path": "/api/v1/admin/notes/{id}",
    "requestSchema": "NoteVersion",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "admin:access"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "updateOverview": {
    "method": "GET",
    "path": "/api/v1/updates",
    "requestSchema": null,
    "responseSchema": "UpdateOverviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "updates:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "checkUpdate": {
    "method": "POST",
    "path": "/api/v1/updates/check",
    "requestSchema": null,
    "responseSchema": "UpdateOverviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "updates:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "applyUpdate": {
    "method": "POST",
    "path": "/api/v1/updates/apply",
    "requestSchema": "UpdateApplyInput",
    "responseSchema": "UpdateJobResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
  "previewMailTemplate": {
    "method": "POST",
    "path": "/api/v1/admin/settings/mail/templates/preview",
    "requestSchema": "MailTemplateInput",
    "responseSchema": "MailTemplateResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "createAnnouncement": {
    "method": "POST",
    "path": "/api/v1/admin/announcements",
    "requestSchema": "AnnouncementInput",
    "responseSchema": "AnnouncementEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "updateAnnouncement": {
    "method": "PUT",
    "path": "/api/v1/admin/announcements/{id}",
    "requestSchema": "AnnouncementUpdate",
    "responseSchema": "AnnouncementEntryResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "deleteAnnouncements": {
    "method": "POST",
    "path": "/api/v1/admin/announcements/delete",
    "requestSchema": "AnnouncementDelete",
    "responseSchema": "ActionResultResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "announcementSettings": {
    "method": "GET",
    "path": "/api/v1/admin/announcements/settings",
    "requestSchema": null,
    "responseSchema": "AnnouncementSettingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": false,
    "identityRealm": "administrator"
  },
  "saveAnnouncementSettings": {
    "method": "PUT",
    "path": "/api/v1/admin/announcements/settings",
    "requestSchema": "AnnouncementSetting",
    "responseSchema": "AnnouncementSettingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "previewAnnouncement": {
    "method": "POST",
    "path": "/api/v1/admin/announcements/preview",
    "requestSchema": "AnnouncementInput",
    "responseSchema": "AnnouncementPreviewResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "session",
    "permissions": [
      "announcements:write"
    ],
    "permissionMode": "all",
    "superAdmin": true,
    "csrf": true,
    "identityRealm": "administrator"
  },
  "announcements": {
    "method": "GET",
    "path": "/api/v1/announcements",
    "requestSchema": null,
    "responseSchema": "AnnouncementFeedResponse",
    "binaryRequest": false,
    "binaryResponse": false,
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
  "adminMultipartUpload": {
    "method": "GET",
    "path": "/api/v1/admin/files/multipart/{id}",
    "requestSchema": null,
    "responseSchema": "MultipartUploadResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [
      "storage:read"
    ],
    "permissionMode": "all",
    "superAdmin": true,
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
    "profiles": [
      "web-platform"
    ],
    "access": "authenticated",
    "permissions": [],
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
  roleOptions: Models.RoleOptionsResponse['data'];
  oidcInfo: Models.OIDCInfoResponse['data'];
  oidcStart: Models.OIDCStartResponse['data'];
  oidcAccount: Models.OIDCInfoResponse['data'];
  oidcLink: Models.OIDCStartResponse['data'];
  oidcUnlink: Models.SessionResponse['data'];
  oidcCheck: Models.ActionResultResponse['data'];
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
}
