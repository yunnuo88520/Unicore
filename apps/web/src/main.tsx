/** Author: yunnuo <ymz@ebox.vip> */
import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from '@unicore/web-ui';
import { HttpTransport } from '@unicore/sdk';
import '@unicore/theme/styles.css';

const client = new HttpTransport();
const ApiDocsApp = lazy(() => import('@unicore/web-ui/api-docs').then(module => ({ default: module.ApiDocsApp })));
const developerDocs = window.location.pathname === '/api-docs';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{developerDocs ? <Suspense><ApiDocsApp client={client} /></Suspense> : <Workspace client={client} />}</React.StrictMode>);
