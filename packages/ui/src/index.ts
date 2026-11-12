// Author: yunnuo <ymz@ebox.vip>
// Description: Barrel for the shared UI primitive layer.
export { Button, buttonVariants, type ButtonProps } from './button';
export { Input, Textarea, NativeSelect, Label, controlSurface, controlVariants } from './input';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { StatCard, type StatCardProps } from './stat-card';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { PageHeader, type PageHeaderProps } from './page-header';
export { Alert, type AlertProps } from './alert';
export { Drawer, DrawerTrigger, DrawerClose, DrawerContent } from './drawer';
export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent } from './popover';
export { RadioGroup, RadioGroupItem } from './radio-group';
export { Breadcrumb, BreadcrumbItem, BreadcrumbSeparator } from './breadcrumb';
export { Kbd } from './kbd';
export { Separator, Skeleton, Avatar, Progress } from './misc';
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from './table';
export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Modal, AlertDialog, AlertDialogTrigger, ConfirmDialog } from './dialog';
export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem, SimpleSelect, selectTriggerVariants } from './select';
export { Switch, SwitchPrimitive } from './switch';
export { Checkbox } from './checkbox';
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './dropdown-menu';
export { Tabs, TabsPrimitive } from './tabs';
export { Tooltip } from './tooltip';
export { MessageProvider, useMessage, type MessageAPI, type MessageOptions, type MessageType } from './message';
// RichTextEditor (Tiptap) and the Recharts layer stay out of this barrel: import from './editor' and './charts'
// directly so heavy dependencies load only in the routes that use them.
