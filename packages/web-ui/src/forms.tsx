// Author: yunnuo <ymz@ebox.vip>
// Description: Contract-aware forms with shared pending, field errors and first-error focus.
import { createContext, useContext, useEffect, useId, useRef, useState, cloneElement, type FormHTMLAttributes, type ReactElement, type InputHTMLAttributes } from 'react';
import { AppError, validate, type SchemaName } from '@unicore/sdk';

const Errors = createContext<Record<string, string>>({});
type Props = FormHTMLAttributes<HTMLFormElement> & { schema?: SchemaName; value?: unknown; error?: Error | null; pending?: boolean };
export function Form({ schema, value, error, pending = false, children, onSubmit, onChange, ...props }: Props) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const server = error instanceof AppError ? error.fields : {};
  const fields = { ...server, ...local };
  function focus(errors: Record<string, string>) {
    const control = Array.from(form.current?.elements ?? []).find(element => Object.hasOwn(errors, element.getAttribute('name') ?? '')) as HTMLElement | undefined;
    (control ?? form.current?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
  }
  useEffect(() => { if (Object.keys(server).length) focus(server); }, [error]);
  return <Errors.Provider value={fields}><form {...props} ref={form} noValidate aria-busy={pending} onChange={event => { setLocal({}); onChange?.(event); }} onSubmit={event => {
    event.preventDefault(); if (pending) return;
    if (!event.currentTarget.reportValidity()) return;
    const errors = schema ? validate(schema, value) : {};
    setLocal(errors);
    if (Object.keys(errors).length) { queueMicrotask(() => focus(errors)); return; }
    onSubmit?.(event);
  }}>
    {Object.keys(fields).length > 0 && <div className="form-error" role={error ? "group" : "alert"} aria-label="表单校验" tabIndex={-1}><strong>请检查表单输入</strong><p>{Object.values(fields).join('；')}</p></div>}
    {children}
  </form></Errors.Provider>;
}

export function Field({ name, label, children }: { name: string; label: string; children: ReactElement<InputHTMLAttributes<HTMLInputElement>> }) {
  const id = useId(); const message = useContext(Errors)[name];
  return <div className="form-field"><label htmlFor={id}>{label}{cloneElement(children, { id, name, 'aria-invalid': !!message, 'aria-describedby': message ? `${id}-error` : children.props['aria-describedby'] })}</label>{message && <small id={`${id}-error`} className="form-error">{message}</small>}</div>;
}
