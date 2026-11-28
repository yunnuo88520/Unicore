// Author: yunnuo <ymz@ebox.vip>
// Description: The developer entry needs no workspace session and disables online execution.
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { AppClient } from '@unicore/sdk';
import { ApiDocsApp } from './api-docs-app';

const swagger = vi.hoisted(() => vi.fn());
vi.mock('swagger-ui-dist/swagger-ui-bundle.js', () => ({ default: swagger }));

it('loads a public read-only contract without bootstrap, login or workspace navigation', async () => {
  const bootstrap = vi.fn();
  const apiDocument = vi.fn().mockResolvedValue({ openapi: '3.1.0', paths: {} });
  render(<ApiDocsApp client={{ apiDocument, bootstrap } as unknown as AppClient} />);
  await waitFor(() => expect(swagger).toHaveBeenCalled());
  expect(bootstrap).not.toHaveBeenCalled();
  expect(apiDocument).toHaveBeenCalledTimes(1);
  expect(swagger.mock.calls[0][0]).toMatchObject({ supportedSubmitMethods: [], tryItOutEnabled: false, persistAuthorization: false, validatorUrl: null, withCredentials: false });
  expect(screen.getByRole('heading', { name: 'API 文档' })).toBeTruthy();
  expect(document.querySelector('.sidebar')).toBeNull();
});

it('reports an unpublished contract without loading Swagger', async () => {
  const apiDocument = vi.fn().mockRejectedValue(new Error('404'));
  render(<ApiDocsApp client={{ apiDocument } as unknown as AppClient} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('API 文档不可用');
});
