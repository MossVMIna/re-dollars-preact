import { describe, expect, it } from 'vitest';
import { collectRenderableRichInputTokens, renderRichInputHTML } from './richInput';

describe('richInput', () => {
    it('collects renderable inline tokens in source order', () => {
        expect(
            collectRenderableRichInputTokens('hi (bgm38) [sticker]https://example.com/a.png[/sticker] (bmoCAIAWgEuAKIBf)')
        ).toEqual([
            '(bgm38)',
            '[sticker]https://example.com/a.png[/sticker]',
            '(bmoCAIAWgEuAKIBf)'
        ]);
    });

    it('renders bangumi smiles, large smiles, bmo, and sticker tags as inline nodes', () => {
        const html = renderRichInputHTML(
            '(bgm38) (musume_01) (blake_01) (bmoCAIAWgEuAKIBf) [sticker]https://example.com/a.png[/sticker]'
        );

        expect(html).toContain('data-rich-raw="(bgm38)"');
        expect(html).toContain('data-rich-raw="(musume_01)"');
        expect(html).toContain('data-rich-raw="(blake_01)"');
        expect(html).toContain('data-rich-raw="(bmoCAIAWgEuAKIBf)"');
        expect(html).toContain('data-rich-raw="[sticker]https://example.com/a.png[/sticker]"');
        expect(html).toContain('chat-input-inline-large');
        expect(html).toContain('class="bmo"');
    });

    it('marks small smileys and bmo for text-bottom alignment, but not large smileys', () => {
        const html = renderRichInputHTML('(bgm38) (musume_01) (blake_01) (bmoCAIAWgEuAKIBf)');

        // 普通小表情和 BMO 应用 text-bottom 对齐
        expect(html).toContain('chat-input-token-bmo');
        const normalCount = (html.match(/chat-input-token-smiley-normal/g) ?? []).length;
        expect(normalCount).toBe(1);

        // 大表情不应带 normal 类，保持原有 middle 对齐
        const musumeHtml = html.split('data-rich-raw="(musume_01)"')[1];
        expect(musumeHtml).not.toContain('chat-input-token-smiley-normal');
        const blakeHtml = html.split('data-rich-raw="(blake_01)"')[1];
        expect(blakeHtml).not.toContain('chat-input-token-smiley-normal');
    });

    it('keeps invalid sticker urls as escaped plain text', () => {
        expect(renderRichInputHTML('[sticker]not-a-url[/sticker]')).toBe('[sticker]not-a-url[/sticker]');
    });
});
