// Author: yunnuo <ymz@ebox.vip>
// Description: Form validation stops transport calls, announces fields and focuses the first invalid control.
import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect,it,vi } from 'vitest';
import { AppError } from '@unicore/sdk';
import { Form,Field } from './forms';
it('blocks invalid contracts and focuses/announces the field',async()=>{
 const submit=vi.fn();render(<Form schema="MailTestInput" value={{recipient:''}} onSubmit={submit}><Field name="recipient" label="测试邮箱"><input /></Field><button>保存</button></Form>);
 await userEvent.click(screen.getByRole('button',{name:'保存'}));expect(submit).not.toHaveBeenCalled();expect(screen.getByLabelText('测试邮箱')).toHaveFocus();expect(screen.getByLabelText('测试邮箱')).toHaveAttribute('aria-invalid','true');expect(screen.getByRole('alert')).toHaveTextContent('至少 3 个字符');
});
it('shows server errors and blocks duplicate submissions while pending',async()=>{
 const submit=vi.fn();render(<Form pending error={new AppError('INVALID_INPUT','请检查输入','request',{email:'邮箱格式不正确'})} onSubmit={submit}><Field name="email" label="邮箱"><input /></Field><button>保存</button></Form>);
 expect(screen.getByLabelText('邮箱')).toHaveFocus();expect(screen.getByRole('alert')).toHaveTextContent('邮箱格式不正确');await userEvent.click(screen.getByRole('button'));expect(submit).not.toHaveBeenCalled();
});
