// Author: yunnuo <ymz@ebox.vip>
// Description: Shared site footer keeps copyright and registration details centered and wrap-safe.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Bootstrap } from '@unicore/sdk';
import { SiteFooter } from './site-footer';

const metadata = {
  site_name: 'A very long workspace name that should wrap on narrow screens',
  site_copyright: 'Crafted by Yunnuo',
  site_icp_number: '京ICP备12345678901234567890号',
  site_icp_url: 'https://beian.miit.gov.cn/',
  site_police_number: '京公网安备12345678901234567890号',
  site_footer_html: '<p>Terms and <a href="https://example.test/legal">privacy</a></p>',
} as Bootstrap;

it('centers copyright, registration numbers and custom footer content in separate wrap-safe rows', () => {
  render(<SiteFooter metadata={metadata} />);
  const footer = screen.getByRole('contentinfo');
  expect(footer).toHaveClass('mt-auto', 'items-center', 'text-center', 'py-3');
  expect(footer).toHaveTextContent('A very long workspace name that should wrap on narrow screens');
  expect(footer).toHaveTextContent('京ICP备12345678901234567890号');
  expect(footer).toHaveTextContent('京公网安备12345678901234567890号');
  expect(screen.getByRole('link', { name: '京ICP备12345678901234567890号' })).toHaveAttribute('href', 'https://beian.miit.gov.cn/');
  expect(footer.querySelectorAll(':scope > div')).toHaveLength(3);
  expect(footer.querySelector(':scope > div')).toHaveClass('[overflow-wrap:anywhere]');
});

it('keeps compact footers close to the viewport edge without changing their content flow', () => {
  render(<SiteFooter metadata={{ site_name: 'Unicore' } as Bootstrap} compact />);
  const footer = screen.getByRole('contentinfo');
  expect(footer).toHaveClass('mt-auto', 'py-4');
  expect(footer.querySelectorAll(':scope > div')).toHaveLength(1);
});
