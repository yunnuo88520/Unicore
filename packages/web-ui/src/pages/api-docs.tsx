// Author: yunnuo <ymz@ebox.vip>
// Description: Instance API reference rendered by the locally bundled Swagger UI, loaded through AppClient with retry and feature-unavailable states.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../i18n';
import { Button, Card, CardContent, PageHeader } from '@unicore/ui';
import type { PageProps } from '../router';
import 'swagger-ui-dist/swagger-ui.css';

let swaggerBundle: Promise<typeof import('swagger-ui-dist/swagger-ui-bundle.js')> | undefined;
const getSwaggerBundle = () => (swaggerBundle ??= import('swagger-ui-dist/swagger-ui-bundle.js'));

function SwaggerReference({ spec }: { spec: Record<string, unknown> }) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    setReady(false);
    // Swagger UI is a plain DOM app without a documented destroy; clearing the host node is the cleanup.
    void getSwaggerBundle().then(({ default: SwaggerUIBundle }) => {
      if (disposed || !hostRef.current) return;
      hostRef.current.replaceChildren();
      SwaggerUIBundle({
        domNode: hostRef.current,
        spec,
        // Read-only reference: requests execute nowhere, the external validator is off and nothing is persisted.
        supportedSubmitMethods: [],
        tryItOutEnabled: false,
        persistAuthorization: false,
        validatorUrl: null,
        withCredentials: false,
        deepLinking: true,
      });
      setReady(true);
    });
    return () => { disposed = true; host.replaceChildren(); };
  }, [spec]);
  return <div className="relative">
    <div ref={hostRef} />
    {!ready ? <p role="status" className="py-10 text-center text-sm text-muted">{t('正在加载 API 文档…')}</p> : null}
  </div>;
}

export function ApiDocsPage({ client }: PageProps) {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['api-document'], queryFn: () => client.apiDocument!(), enabled: !!client.apiDocument, retry: false });
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('API 文档')} description={t('数据来自实例发布的 OpenAPI 契约。')} />
    <Card className="overflow-hidden"><CardContent className="flex flex-col gap-4 p-0">
    {!client.apiDocument ? <p className="p-4 text-sm text-muted">{t('当前运行形态不提供 API 文档')}</p>
      : query.isPending ? <p role="status" className="py-10 text-center text-sm text-muted">{t('正在加载 API 文档…')}</p>
      : query.isError ? <div role="alert" className="flex flex-col items-start gap-3 p-4"><p className="text-sm text-danger">{t('API 文档不可用，请确认实例已启用 API 文档。')}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button></div>
      // Swagger UI 5.x ships light styling only; the fixed light panel keeps the document readable when the shell turns dark.
      : <div className="api-reference min-h-[480px] bg-white">
        <SwaggerReference spec={query.data} />
      </div>}
    </CardContent></Card>
  </div>;
}
