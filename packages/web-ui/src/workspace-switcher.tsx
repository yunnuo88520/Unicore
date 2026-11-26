// Author: yunnuo <ymz@ebox.vip>
import { useRouter } from '@tanstack/react-router';
import { Building2, ChevronsUpDown, Home, LayoutDashboard } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { t } from './i18n';
import type { WorkspaceDestination } from './console-registry';

export function WorkspaceSwitcher({ workspaces, 'aria-label': ariaLabel, className }: {
  workspaces: readonly WorkspaceDestination[];
  'aria-label'?: string;
  className?: string;
}) {
  const router = useRouter();
  if (workspaces.length < 2) return null;
  const accessibleLabel = ariaLabel || t('切换工作台');
  const active = workspaces.find(workspace => workspace.active);
  const Icon = active?.kind === 'user' ? Home : active?.kind === 'administrator' ? Building2 : LayoutDashboard;

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" className={cn('max-w-full justify-between', className)} aria-label={accessibleLabel}>
        <span className="flex min-w-0 items-center gap-2">
          <Icon size={16} aria-hidden="true" />
          <span className="truncate">{active?.title ?? accessibleLabel}</span>
        </span>
        <ChevronsUpDown size={15} aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" aria-label={accessibleLabel} className="min-w-52">
      {workspaces.map(workspace => {
        const ItemIcon = workspace.kind === 'user' ? Home : workspace.kind === 'administrator' ? Building2 : LayoutDashboard;
        const contents = <><ItemIcon size={16} aria-hidden="true" /><span className="truncate">{workspace.title}</span></>;
        if (workspace.active) return <DropdownMenuItem key={workspace.id} disabled aria-current="page">{contents}</DropdownMenuItem>;
        if (workspace.kind === 'console') {
          return <DropdownMenuItem key={workspace.id} onSelect={() => { void router.navigate({ to: workspace.href }); }}>{contents}</DropdownMenuItem>;
        }
        return <DropdownMenuItem key={workspace.id} asChild><a href={workspace.href}>{contents}</a></DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
