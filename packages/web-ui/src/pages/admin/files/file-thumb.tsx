// Author: yunnuo <ymz@ebox.vip>
// Description: Signed inline thumbnails and category icons in a uniform bordered square container.
import { useQuery } from '@tanstack/react-query';
import { FileArchive, FileQuestion, FileText, Image as ImageIcon } from 'lucide-react';
import type { FileCatalogClient, FileCatalogEntry } from '@unicore/sdk';
import { cn } from '@unicore/ui/cn';
import { mimeCategory } from './shared';

export function FileThumb({ entry, catalog, className, iconSize = 18 }: { entry: FileCatalogEntry; catalog: FileCatalogClient; className?: string; iconSize?: number }) {
  const category = mimeCategory(entry.file.mime_type, entry.file.original_name);
  const thumbnail = useQuery({
    queryKey: ['file-thumb', entry.file.file_id, entry.etag],
    queryFn: () => catalog.access(entry.file.file_id, 'inline'),
    enabled: category === 'image' && !!entry.file.capabilities.download,
    staleTime: 4 * 60 * 1000,
    retry: false,
  });
  const Icon = category === 'image' ? ImageIcon : category === 'archive' ? FileArchive : category === 'document' ? FileText : FileQuestion;
  return <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-alt text-muted', className)} aria-hidden="true">
    {category === 'image' && thumbnail.data?.url
      ? <img src={thumbnail.data.url} alt="" loading="lazy" className="size-full object-cover" />
      : <Icon size={iconSize} />}
  </span>;
}
