// Author: yunnuo <ymz@ebox.vip>
// Description: Notes workspace. Transitional adapter; rebuilt onto the new primitives next.
import { NotesPage as LegacyNotes } from '../notes-page';
import type { PageProps } from '../router';

export function NotesPage(props: PageProps) {
  return <LegacyNotes client={props.client} metadata={props.metadata} />;
}
