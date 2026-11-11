// Author: yunnuo <ymz@ebox.vip>
// Description: Minimal ambient types for the locally bundled Swagger UI distribution, which ships no type declarations.
declare module 'swagger-ui-dist/swagger-ui-bundle.js' {
  export interface SwaggerUIBundleOptions {
    domNode: HTMLElement;
    spec: Record<string, unknown>;
    supportedSubmitMethods?: string[];
    tryItOutEnabled?: boolean;
    persistAuthorization?: boolean;
    validatorUrl?: string | null;
    withCredentials?: boolean;
    deepLinking?: boolean;
  }
  /** The system store exposes no documented destroy; callers replace the host content instead. */
  function SwaggerUIBundle(options: SwaggerUIBundleOptions): unknown;
  export default SwaggerUIBundle;
}
