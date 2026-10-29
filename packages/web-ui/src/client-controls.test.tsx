// Author: yunnuo <ymz@ebox.vip>
// Description: Language keyboard controls preserve business drafts and permission boundaries.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workspace } from './App';
import type { AppClient, Bootstrap } from '@unicore/sdk';

const metadata: Bootstrap = { profile: 'web-platform', version: '', commit: '', build_time: '', stage: '', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '', identity_realm: 'user', current_user: { id:'user', status:'active', created_at:0, last_login_at:0, username:'demo', email:'demo@example.test', roles:['user'], permissions:[] }, capabilities: { execute:true, authentication:true, database:false, installation:false, settings:true, license:false, updater:false } };
beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
it('switches by keyboard without replacing drafts or requesting administrator resources', async () => {
  const api = { transport:'http', bootstrap:vi.fn().mockResolvedValue(metadata), execute:vi.fn(), settings:vi.fn(), patchSettings:vi.fn(), updates:{overview:vi.fn()} } as unknown as AppClient;
  render(<Workspace client={api} />);
  const input = await screen.findByLabelText('输入文本');
  await userEvent.clear(input); await userEvent.type(input,'用户自己写的草稿');
  const language = screen.getByRole('button',{name:'切换语言'});
  language.focus(); await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(await screen.findByLabelText('Input text')).toHaveValue('用户自己写的草稿');
  await waitFor(() => expect(document.title).toBe('Unicore · Workspace'));
  expect(screen.getByRole('button',{name:'Change language'})).toHaveFocus();
  expect(api.updates!.overview).not.toHaveBeenCalled();
  expect(api.settings).not.toHaveBeenCalled();
  expect(api.patchSettings).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:/Current version/})).not.toBeInTheDocument();
});
it.each([
  { name:'available', overview: { available:true, checked_at:'2026-10-29T00:00:00Z' } },
  { name:'latest', overview: { available:false, checked_at:'2026-10-29T00:00:00Z' } },
  { name:'offline', overview: { available:false, last_error:'offline' } },
])('shows the $name version status without an automatic network check', async ({name,overview}) => {
  const check = vi.fn();
  const api = {
    transport:'http', bootstrap:vi.fn().mockResolvedValue({...metadata,profile:'web-standalone',version:'0.1.1',current_user:undefined,capabilities:{...metadata.capabilities,authentication:false,updater:true}}),
    execute:vi.fn(), updates:{overview:vi.fn().mockResolvedValue(overview),check},
  } as unknown as AppClient;
  const {container} = render(<Workspace client={api}/>);
  await waitFor(()=>expect(container.querySelector(`.version-badge.status-${name}`)).toBeInTheDocument());
  expect(container.querySelector('.version-badge')).toHaveTextContent('v0.1.1');
  expect(check).not.toHaveBeenCalled();
});
