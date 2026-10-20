import { escapeHTML } from './format';
import {
    collectRenderableInlineTokenRaws,
    replaceInlineTokens,
    type ParsedInlineToken
} from './inlineTokens';

export const RICH_INPUT_TOKEN_ATTR = 'data-rich-raw';

export interface RichInputSelection {
    start: number;
    end: number;
}

export interface RichInputValueOptions {
    focus?: boolean;
    knownMeta?: Record<string, { width?: number; height?: number }>;
    selection?: RichInputSelection;
    silent?: boolean;
}

export interface RichInputController {
    focus: () => void;
    getSelection: () => RichInputSelection;
    getValue: () => string;
    insertText: (text: string, options?: RichInputValueOptions) => void;
    replaceRange: (text: string, start: number, end: number, options?: RichInputValueOptions) => void;
    setSelection: (start: number, end?: number) => void;
    setValue: (value: string, options?: RichInputValueOptions) => void;
}

type RichInputTokenElement = HTMLElement & {
    getAttribute(name: typeof RICH_INPUT_TOKEN_ATTR): string | null;
};

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI']);

function buildTokenHTML(raw: string, innerHTML: string, className: string): string {
    return `<span class="chat-input-token ${className}" ${RICH_INPUT_TOKEN_ATTR}="${escapeHTML(raw)}" contenteditable="false">${innerHTML}</span>`;
}

function renderRichInputToken(token: ParsedInlineToken): string {
    switch (token.type) {
        case 'custom-image': {
            const className = token.isCommunityEmoji
                ? 'smiley chat-input-inline-smiley'
                : 'custom-emoji chat-input-inline-sticker';
            const innerHTML = `<img src="${escapeHTML(token.src)}" class="${className}" alt="${escapeHTML(token.raw)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
            return buildTokenHTML(token.raw, innerHTML, 'chat-input-token-image');
        }
        case 'bmo':
            return buildTokenHTML(token.raw, `<span class="bmo" data-code="${escapeHTML(token.code)}"></span>`, 'chat-input-token-bmo');
        case 'smiley': {
            let className = 'smiley chat-input-inline-smiley';
            let wrapperClassName = 'chat-input-token-smiley';
            if (token.variant === 'musume') {
                className += ' smiley-musume chat-input-inline-large';
            } else if (token.variant === 'blake') {
                className += ' smiley-blake chat-input-inline-large';
            } else {
                wrapperClassName += ' chat-input-token-smiley-normal';
            }

            const attrs = token.variant === 'bgm' ? ' width="21" height="21"' : '';
            const innerHTML = `<img src="${escapeHTML(token.src)}" class="${className}" alt="${escapeHTML(token.raw)}"${attrs}>`;
            return buildTokenHTML(token.raw, innerHTML, wrapperClassName);
        }
    }
}

export function collectRenderableRichInputTokens(text: string): string[] {
    return collectRenderableInlineTokenRaws(text);
}

export function renderRichInputHTML(text: string): string {
    return replaceInlineTokens(
        text,
        (token, raw) => token ? renderRichInputToken(token) : escapeHTML(raw),
        { renderText: escapeHTML }
    );
}

function isTokenElement(node: Node): node is RichInputTokenElement {
    return node instanceof HTMLElement && node.hasAttribute(RICH_INPUT_TOKEN_ATTR);
}

function isBlockElement(node: Node): node is HTMLElement {
    return node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName);
}

function getNodeRawLength(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.length || 0;
    }

    if (!(node instanceof HTMLElement)) {
        return 0;
    }

    const raw = node.getAttribute(RICH_INPUT_TOKEN_ATTR);
    if (raw != null) {
        return raw.length;
    }

    if (node.tagName === 'BR') {
        return 1;
    }

    let total = 0;
    node.childNodes.forEach((child: Node) => {
        total += getNodeRawLength(child);
    });
    return total;
}

function appendBlockBoundary(parts: string[]) {
    const last = parts[parts.length - 1];
    if (last?.endsWith('\n')) return;
    parts.push('\n');
}

function extractNodeText(node: Node, parts: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
            parts.push(node.textContent);
        }
        return;
    }

    if (!(node instanceof HTMLElement)) {
        return;
    }

    const raw = node.getAttribute(RICH_INPUT_TOKEN_ATTR);
    if (raw != null) {
        parts.push(raw);
        return;
    }

    if (node.tagName === 'BR') {
        parts.push('\n');
        return;
    }

    const children = Array.from(node.childNodes);
    children.forEach((child, index) => {
        extractNodeText(child, parts);
        if (isBlockElement(child) && index < children.length - 1) {
            appendBlockBoundary(parts);
        }
    });
}

export function extractRichInputText(root: HTMLElement): string {
    const parts: string[] = [];
    const children = Array.from(root.childNodes);

    children.forEach((child, index) => {
        extractNodeText(child, parts);
        if (isBlockElement(child) && index < children.length - 1) {
            appendBlockBoundary(parts);
        }
    });

    return parts.join('');
}

function getRawOffset(root: Node, target: Node, offset: number): number {
    let total = 0;

    const walk = (node: Node): boolean => {
        if (node === target) {
            if (node.nodeType === Node.TEXT_NODE) {
                total += Math.min(offset, node.textContent?.length || 0);
                return true;
            }

            if (isTokenElement(node)) {
                total += offset > 0 ? node.getAttribute(RICH_INPUT_TOKEN_ATTR)?.length || 0 : 0;
                return true;
            }

            const limit = Math.min(offset, node.childNodes.length);
            for (let i = 0; i < limit; i++) {
                total += getNodeRawLength(node.childNodes[i]);
            }
            return true;
        }

        if (isTokenElement(node)) {
            total += node.getAttribute(RICH_INPUT_TOKEN_ATTR)?.length || 0;
            return false;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            total += node.textContent?.length || 0;
            return false;
        }

        if (node instanceof HTMLElement && node.tagName === 'BR') {
            total += 1;
            return false;
        }

        for (const child of Array.from(node.childNodes)) {
            if (walk(child)) {
                return true;
            }
        }
        return false;
    };

    walk(root);
    return total;
}

export function getRichInputSelection(root: HTMLElement): RichInputSelection | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        return null;
    }

    return {
        start: getRawOffset(root, range.startContainer, range.startOffset),
        end: getRawOffset(root, range.endContainer, range.endOffset)
    };
}

function findDomPosition(node: Node, rawOffset: number): { container: Node; offset: number } {
    if (node.nodeType === Node.TEXT_NODE) {
        return {
            container: node,
            offset: Math.min(rawOffset, node.textContent?.length || 0)
        };
    }

    if (isTokenElement(node) || (node instanceof HTMLElement && node.tagName === 'BR')) {
        const parent = node.parentNode;
        if (!parent) {
            return { container: node, offset: 0 };
        }

        const index = Array.from(parent.childNodes).indexOf(node);
        const nodeLength = getNodeRawLength(node);
        return {
            container: parent,
            offset: index + (rawOffset > 0 && nodeLength > 0 ? 1 : 0)
        };
    }

    let remaining = rawOffset;
    for (const child of Array.from(node.childNodes)) {
        const childLength = getNodeRawLength(child);
        if (remaining <= childLength) {
            return findDomPosition(child, remaining);
        }
        remaining -= childLength;
    }

    return {
        container: node,
        offset: node.childNodes.length
    };
}

export function setRichInputSelection(root: HTMLElement, start: number, end = start): void {
    const selection = window.getSelection();
    if (!selection) return;

    const totalLength = getNodeRawLength(root);
    const startOffset = Math.max(0, Math.min(start, totalLength));
    const endOffset = Math.max(0, Math.min(end, totalLength));
    const startPos = findDomPosition(root, startOffset);
    const endPos = findDomPosition(root, endOffset);
    const range = document.createRange();

    range.setStart(startPos.container, startPos.offset);
    range.setEnd(endPos.container, endPos.offset);
    selection.removeAllRanges();
    selection.addRange(range);
}

export function getRenderedRichInputTokens(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>(`[${RICH_INPUT_TOKEN_ATTR}]`))
        .map((node) => node.getAttribute(RICH_INPUT_TOKEN_ATTR) || '');
}

export function needsRichInputNormalization(root: HTMLElement, text: string): boolean {
    const expectedTokens = collectRenderableRichInputTokens(text);
    const renderedTokens = getRenderedRichInputTokens(root);

    if (expectedTokens.length !== renderedTokens.length) {
        return true;
    }

    if (expectedTokens.some((token, index) => token !== renderedTokens[index])) {
        return true;
    }

    return Array.from(root.querySelectorAll('div, p, br')).some(
        (node) => !(node as HTMLElement).closest(`[${RICH_INPUT_TOKEN_ATTR}]`)
    );
}
