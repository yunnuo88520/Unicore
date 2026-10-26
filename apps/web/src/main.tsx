/** Author: yunnuo <ymz@ebox.vip> */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from '@unicore/web-ui';
import { HttpTransport } from '@unicore/sdk';
import '@unicore/web-ui/styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace client={new HttpTransport()} /></React.StrictMode>);
