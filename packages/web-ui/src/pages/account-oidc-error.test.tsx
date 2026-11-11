/** Author: yunnuo <ymz@ebox.vip>
 * Description: Non-field server errors surfaced via applyServerError must render in the FormSummary alert.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { AppError } from '@unicore/sdk';
import { AppForm, AppField, useAppForm } from '@unicore/form';
import { Button, Input } from '@unicore/ui';

function Probe() {
  const form = useAppForm<{ password: string }>({
    defaultValues: { password: '' },
    onSubmit: async () => {
      // Mirrors account.tsx: the mutation rejects with a non-field AppError and the
      // page routes it through applyServerError (no global toast in this path).
      form.applyServerError(new AppError('INVALID_CREDENTIALS', '账号或密码不正确', 'req-1'));
    },
  });
  return <AppForm form={form} className="flex flex-col gap-2">
    <AppField name="password" label="确认本地密码">
      <Input type="password" />
    </AppField>
    <Button type="submit">验证并绑定企业账号</Button>
  </AppForm>;
}

it('renders a non-field server error as the form summary alert', async () => {
  const user = userEvent.setup();
  render(<Probe />);
  await user.type(screen.getByLabelText('确认本地密码'), 'wrong-password-value');
  await user.click(screen.getByRole('button', { name: '验证并绑定企业账号' }));
  const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
  expect(alert).toHaveTextContent('账号或密码不正确');
});
