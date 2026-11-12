// Author: yunnuo <ymz@ebox.vip>
// Description: Apply the documented first-feature example to a new, disposable derived project.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function applyNotesTag(directory) {
  const root = resolve(directory), changes = new Map();
  const read = file => changes.get(file) ?? readFileSync(join(root,file),'utf8');
  const save = (file,text) => changes.set(file,text);
  const edit = (file,from,to) => {
    const source = read(file);
    if (!source.includes(from)) throw Error(`Example source differs: ${file}; apply manually using the tutorial`);
    save(file,source.replace(from,to));
  };
  if (JSON.parse(read('package.json')).name === 'unicore') throw Error('Create a disposable derived project first; do not modify the upstream reference application');
  const contract = JSON.parse(read('packages/contracts/openapi.json'));
  for (const name of ['NoteInput','NoteUpdate','NoteEntry']) {
    if (contract.components.schemas[name].properties.tag) throw Error('Notes tag example is already present');
    contract.components.schemas[name].properties.tag = {type:'string',maxLength:32,'x-go-value':true,description:'Optional single note tag; empty means no tag.'};
  }
  save('packages/contracts/openapi.json',JSON.stringify(contract,null,2)+'\n');
  const catalog = JSON.parse(read('migrations/catalog.json'));
  const notes = catalog.namespaces.find(n => n.id === 'module.notes');
  if (notes.migrations.length !== 1) throw Error('Use the version-1 sample baseline; do not overwrite your application migrations');
  const files = {};
  for (const dialect of catalog.dialects) {
    const file = `modules/notes/${dialect}/0002_tag.sql`;
    if (existsSync(join(root,'migrations',file))) throw Error('Migration already exists');
    files[dialect] = file;
    save('migrations/'+file, `-- Author: yunnuo <ymz@ebox.vip>\n-- Purpose: optional note tag; Web database profiles and SQLite desktop.\n-- Compatibility: append-only module.notes@2; existing notes receive an empty tag.\n-- Recovery: restore a matching pre-upgrade DB/data/key/binary snapshot; no down SQL.\nALTER TABLE unicore_example_notes ADD COLUMN tag VARCHAR(32) NOT NULL DEFAULT '';\n`);
  }
  notes.migrations.push({version:2,files});
  save('migrations/catalog.json',JSON.stringify(catalog,null,2)+'\n');
  const domain = 'internal/modules/notes/domain/note.go';
  edit(domain,'Title, Body, Status string','Title, Body, Status, Tag string');
  save(domain,read(domain)+`\nfunc ValidateTag(tag string) error {\n if utf8.RuneCountInString(tag) > 32 { return ErrNoteInvalid }; return nil\n}\n`);
  const usecase = 'internal/modules/notes/usecase/notes.go';
  edit(usecase,'// Attachment ids are optional on creation:', 'if err := domain.ValidateTag(input.Tag); err != nil { return err }\n // Attachment ids are optional on creation:');
  edit(usecase,'Status: input.Status, AttachmentIds:', 'Status: input.Status, Tag: input.Tag, AttachmentIds:');
  const repo = 'internal/modules/notes/storage/notessql/repository.go';
  edit(repo,'&entity.CreatedAt, &entity.UpdatedAt)', '&entity.CreatedAt, &entity.UpdatedAt, &entity.Tag)');
  edit(repo,'UpdatedAt: entity.UpdatedAt}', 'UpdatedAt: entity.UpdatedAt, Tag: entity.Tag}');
  edit(repo,'const columns = "id,title,body,status,attachment_ids,version,created_at,updated_at"', 'const columns = "id,title,body,status,attachment_ids,version,created_at,updated_at,tag"');
  edit(repo,'UpdatedAt: entity.UpdatedAt}', 'UpdatedAt: entity.UpdatedAt, Tag: in.Tag}');
  edit(repo,'VALUES(?,?,?,?,?,?,?,?,?)", scope, n.ID, n.Title, n.Body, n.Status, string(ids), n.Version, n.CreatedAt, n.UpdatedAt)', 'VALUES(?,?,?,?,?,?,?,?,?,?)", scope, n.ID, n.Title, n.Body, n.Status, string(ids), n.Version, n.CreatedAt, n.UpdatedAt, n.Tag)');
  edit(repo,'oldIDs, _ := json.Marshal(before.AttachmentIds)', 'if before.Tag != in.Tag { changed = append(changed, "tag") }\n oldIDs, _ := json.Marshal(before.AttachmentIds)');
  edit(repo,'SET title=?,body=?,status=?,attachment_ids=?,version=version+1', 'SET title=?,body=?,status=?,attachment_ids=?,tag=?,version=version+1');
  edit(repo,'in.Title, in.Body, in.Status, string(ids), time.Now().Unix()', 'in.Title, in.Body, in.Status, string(ids), in.Tag, time.Now().Unix()');
  const page = 'packages/web-ui/src/modules/notes/notes.tsx';
  edit(page,'type NoteValues = { title: string;', 'type NoteValues = { tag: string; title: string;');
  edit(page,"defaultValues: { title:","defaultValues: { tag: note?.tag ?? '', title:");
  edit(page,'<AppField name="body" label={t(\'正文\')}>', '<AppField name="tag" label={t(\'笔记标签\')}><Input maxLength={32} /></AppField>\n      <AppField name="body" label={t(\'正文\')}>');
  edit(page,'{note.attachment_ids.length > 0', '{note.tag && <Badge>{note.tag}</Badge>}\n                  {note.attachment_ids.length > 0');
  const locale = JSON.parse(read('packages/web-ui/src/locales/en.json'));
  locale['笔记标签'] = 'Note tag';
  save('packages/web-ui/src/locales/en.json',JSON.stringify(locale,null,2)+'\n');
  const module = JSON.parse(read('product.identity.json')).go.module;
  save('internal/modules/notes/storage/tag_example_test.go',`// Author: yunnuo <ymz@ebox.vip>
// Description: First-feature persistence, validation, concurrency and owner boundaries.
package storage_test
import (
 "context"
 "errors"
 "path/filepath"
 "strings"
 "testing"
 "${module}/internal/adapter/storage/webdb"
 "${module}/internal/contracts"
 "${module}/internal/modules/notes/domain"
 "${module}/internal/modules/notes/storage/notessql"
 "${module}/internal/modules/notes/usecase"
 "${module}/migrations/runner"
)
func TestTutorialTag(t *testing.T) {
 ctx:=context.Background()
 store,err:=webdb.Open(ctx,"sqlite","",filepath.Join(t.TempDir(),"notes.db"));if err!=nil{t.Fatal(err)};defer store.Close()
 if err=runner.Apply(ctx,store.DB,runner.Options{Dialect:"sqlite",Profile:"desktop"});err!=nil{t.Fatal(err)}
 service:=usecase.Notes{Repo:&notessql.Repository{Store:store}}
 input:=contracts.NoteInput{Title:"First feature",Status:"open",Tag:"learning"}
 note,err:=service.Create(ctx,"local",input);if err!=nil{t.Fatal(err)}
 got,err:=service.Read(ctx,"local",note.ID,usecase.NoteVisibility{});if err!=nil||got.Tag!="learning"{t.Fatalf("tag not persisted: %+v %v",got,err)}
 update:=contracts.NoteUpdate{Title:got.Title,Status:got.Status,Version:got.Version,Tag:"done"}
 changed,err:=service.Update(ctx,"local",got.ID,update);if err!=nil||changed.Tag!="done"{t.Fatalf("tag update failed: %+v %v",changed,err)}
 if _,err=service.Update(ctx,"local",got.ID,update);!errors.Is(err,usecase.ErrNoteConflict){t.Fatal("stale update accepted",err)}
 update.Version=changed.Version
 if _,err=service.Update(ctx,"user/other",got.ID,update);!errors.Is(err,usecase.ErrNoteNotFound){t.Fatal("cross-owner update accepted",err)}
 input.Tag=strings.Repeat("测",33)
 if _,err=service.Create(ctx,"local",input);!errors.Is(err,domain.ErrNoteInvalid){t.Fatal("long tag accepted",err)}
}
`);
  // Validate every source marker before writing any project file.
  for (const [file,contents] of changes) writeFileSync(join(root,file),contents);
  return [...changes.keys()];
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Use apply.mjs /absolute/path/to/disposable-derived-project');
  console.log(applyNotesTag(process.argv[2]).join('\n'));
  console.log('Run pnpm generate && pnpm generate:migrations, gofmt, then the tutorial checks.');
}
