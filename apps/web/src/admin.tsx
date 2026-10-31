/** Author: yunnuo <ymz@ebox.vip> */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminWorkspace } from '@unicore/web-ui/admin';
import { HttpTransport } from '@unicore/sdk';
import '@unicore/web-ui/styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminWorkspace client={new HttpTransport('', globalThis.fetch.bind(globalThis), 'administrator')}/></React.StrictMode>);
