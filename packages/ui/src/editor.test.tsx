// Author: yunnuo <ymz@ebox.vip>
// Description: The editor's HTML sanitizer enforces the tag and link whitelist before anything renders.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichTextEditor, safeEditorHTML } from './editor';

describe('safeEditorHTML', () => {
  it('keeps the whitelisted tags and inline marks', () => {
    const html = '<p>你好</p><blockquote><strong>加粗</strong><em>斜体</em><u>下划线</u></blockquote><ul><li>一</li><li>二</li></ul><ol><li>三</li></ol><br>';
    expect(safeEditorHTML(html)).toBe(html);
  });

  it('removes executable and embedded elements entirely', () => {
    const html = '<p>正文<script>alert(1)</script></p><style>.x{}</style><iframe src="https://evil.test"></iframe><object></object><img src="https://evil.test/x.png"><svg onload="alert(1)"></svg><math></math>';
    expect(safeEditorHTML(html)).toBe('<p>正文</p>');
  });

  it('unwraps disallowed formatting instead of dropping the text', () => {
    expect(safeEditorHTML('<h1>标题</h1><div>正文</div><table><tr><td>单元格</td></tr></table>')).toBe('标题正文单元格');
  });

  it('strips every attribute except anchor href under the https contract', () => {
    const html = '<p id="x" onclick="alert(1)" style="color:red"><a href="https://example.test/help" target="_blank" rel="noopener">帮助</a></p>';
    expect(safeEditorHTML(html)).toBe('<p><a href="https://example.test/help">帮助</a></p>');
  });

  it('rejects javascript and relative hrefs', () => {
    expect(safeEditorHTML('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(safeEditorHTML('<a href="/relative">x</a>')).toBe('<a>x</a>');
    expect(safeEditorHTML('<a href="https://example.test">y</a>')).toBe('<a href="https://example.test">y</a>');
  });

  // The mail contract accepts the bare variable only; internal/mailcontent mirrors this exactly.
  it('accepts the bare {{site_url}} template only when the host opts in', () => {
    expect(safeEditorHTML('<a href="{{site_url}}">x</a>')).toBe('<a>x</a>');
    expect(safeEditorHTML('<a href="{{site_url}}">x</a>', { siteTemplate: true })).toBe('<a href="{{site_url}}">x</a>');
    expect(safeEditorHTML('<a href="{{site_url}}/help">x</a>', { siteTemplate: true })).toBe('<a>x</a>');
    expect(safeEditorHTML('<a href="{{other_url}}">x</a>', { siteTemplate: true })).toBe('<a>x</a>');
  });
});

it('exposes the editable surface as a labelled textbox', () => {
  render(<RichTextEditor value="<p>内容</p>" onChange={() => {}} label="邮件内容" />);
  const editor = screen.getByRole('textbox', { name: '邮件内容' });
  expect(editor).toHaveAttribute('contenteditable', 'true');
  expect(editor).toHaveTextContent('内容');
});
