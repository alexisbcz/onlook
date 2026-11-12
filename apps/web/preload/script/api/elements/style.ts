import type { DomElementStyles } from '@onlook/models';
import { getHtmlElement } from '../../helpers';

export function getStyles(element: HTMLElement): DomElementStyles {
    const computed = getElComputedStyle(element);
    const inline = getInlineStyles(element);
    const stylesheet = getStylesheetStyles(element);

    const defined = {
        width: 'auto',
        height: 'auto',
        ...inline,
        ...stylesheet,
    };

    return {
        defined,
        computed,
    };
}

export function getComputedStyleByDomId(domId: string): Record<string, string> {
    const element = getHtmlElement(domId);
    if (!element) {
        return {};
    }
    return getElComputedStyle(element as HTMLElement);
}

function getElComputedStyle(element: HTMLElement): Record<string, string> {
    // Copy each property by name. Cloning the declaration as JSON only works in Chrome, where
    // camelCase properties like `fontSize` are own properties; WebKit (Safari, the iOS app's
    // WebView) defines them on the prototype, so the clone would hold only numeric indices.
    const declaration = window.getComputedStyle(element);
    const computedStyle: Record<string, string> = {};
    for (let i = 0; i < declaration.length; i++) {
        const property = declaration.item(i);
        if (property.startsWith('--')) {
            continue;
        }
        const camelCased = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        computedStyle[camelCased] = declaration.getPropertyValue(property);
    }
    return computedStyle;
}

function getInlineStyles(element: HTMLElement) {
    const styles: Record<string, string> = {};
    const inlineStyles = parseCssText(element.style.cssText);
    Object.entries(inlineStyles).forEach(([prop, value]) => {
        styles[prop] = value;
    });
    return styles;
}

function getStylesheetStyles(element: HTMLElement) {
    const styles: Record<string, string> = {};
    const sheets = document.styleSheets;
    for (let i = 0; i < sheets.length; i++) {
        let rules: CSSStyleRule[];
        const sheet = sheets[i];
        try {
            if (!sheet) {
                console.warn('Sheet is undefined');
                continue;
            }
            rules = (Array.from(sheet.cssRules) as CSSStyleRule[]) || sheet.rules;
        } catch (e) {
            console.warn("Can't read the css rules of: " + sheet?.href, e);
            continue;
        }
        for (let j = 0; j < rules.length; j++) {
            try {
                const rule = rules[j];
                if (rule && element.matches(rule.selectorText)) {
                    const ruleStyles = parseCssText(rule.style.cssText);
                    Object.entries(ruleStyles).forEach(([prop, value]) => (styles[prop] = value));
                }
            } catch (e) {
                console.warn('Error', e);
            }
        }
    }
    return styles;
}

function parseCssText(cssText: string) {
    const styles: Record<string, string> = {};
    cssText.split(';').forEach((style) => {
        style = style.trim();
        if (!style) {
            return;
        }
        const [property, ...values] = style.split(':');
        styles[property?.trim() ?? ''] = values.join(':').trim();
    });
    return styles;
}
