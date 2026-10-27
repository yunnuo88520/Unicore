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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": true
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
    "csrf": false
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
    "csrf": true
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
    "csrf": true
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
    "csrf": false
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
    "csrf": true
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": true
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": false
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": false
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
    "csrf": false
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
    "maxBodyBytes": 393216
  },
  "localBranding": {
    "method": "GET",
    "path": "/api/v1/branding",
    "requestSchema": null,
    "responseSchema": "BrandingResponse",
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
  "localUpdateBranding": {
    "method": "PUT",
    "path": "/api/v1/branding",
    "requestSchema": "BrandingInput",
    "responseSchema": "BrandingResponse",
    "binaryRequest": false,
    "binaryResponse": false,
    "profiles": [
      "web-standalone"
    ],
    "access": "local",
    "permissions": [],
    "permissionMode": "all",
    "superAdmin": false,
    "csrf": false,
    "maxBodyBytes": 393216
  },
  "rotateInstallToken": {
    "method": "POST",
    "path": "/api/v1/install/token/rotate",
    "requestSchema": "InstallTokenRotate",
    "responseSchema": "InstallTokenResponse",
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
    "csrf": false
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
    "csrf": true
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
    "csrf": true
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
    "csrf": false
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
    "csrf": false
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
    "csrf": true
  },
  "administratorOIDCCallback": {
    "method": "GET",
    "path": "/api/v1/auth/oidc/administrator-callback",
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
    "csrf": false
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
    "csrf": false
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": false
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
    "csrf": true
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
    "streamingUpload": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "csrf": true
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
    "signedDownload": true
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
  localBranding: undefined;
  localUpdateBranding: Models.BrandingInput;
  rotateInstallToken: Models.InstallTokenRotate;
  listAdministrators: undefined;
  createAdministrator: Models.UserCreate;
  updateAdministrator: Models.UserUpdate;
  systemLogs: undefined;
  mailJobs: undefined;
  changePassword: Models.ChangePasswordInput;
  administratorOIDCCallback: undefined;
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
  localBranding: Models.BrandingResponse['data'];
  localUpdateBranding: Models.BrandingResponse['data'];
  rotateInstallToken: Models.InstallTokenResponse['data'];
  listAdministrators: Models.UserListResponse['data'];
  createAdministrator: Models.UserResponse['data'];
  updateAdministrator: Models.UserResponse['data'];
  systemLogs: Models.AuditLogResponse['data'];
  mailJobs: Models.MailJobListResponse['data'];
  changePassword: Models.ActionResultResponse['data'];
  administratorOIDCCallback: void;
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
}
