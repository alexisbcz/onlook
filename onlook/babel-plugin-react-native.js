/**
 * Onlook × React Native
 *
 * Onlook tags every JSX element with `data-oid` (and friends) so the visual editor can map
 * DOM nodes back to source. react-native-web drops unknown props, but it forwards `dataSet`
 * to `data-*` attributes. This plugin rewrites `data-*` props on components into `dataSet`,
 * so your source keeps plain `data-oid` attributes and the web preview keeps them in the DOM.
 * On iOS and Android `dataSet` is ignored, so native builds are unaffected.
 */
module.exports = function onlookReactNative({ types: t }) {
    const toKey = (name) => name.slice('data-'.length).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    return {
        name: 'onlook-react-native',
        visitor: {
            JSXOpeningElement(path) {
                const { name } = path.node;
                // Host DOM elements (<div>) already keep data-* attributes.
                if (t.isJSXIdentifier(name) && /^[a-z]/.test(name.name)) return;

                const dataAttrs = [];
                let dataSetAttr = null;
                for (const attr of path.node.attributes) {
                    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
                    if (attr.name.name === 'dataSet') dataSetAttr = attr;
                    else if (attr.name.name.startsWith('data-')) dataAttrs.push(attr);
                }
                if (dataAttrs.length === 0) return;

                const properties = dataAttrs.map((attr) => {
                    let value = attr.value ?? t.booleanLiteral(true);
                    if (t.isJSXExpressionContainer(value)) value = value.expression;
                    return t.objectProperty(t.stringLiteral(toKey(attr.name.name)), value);
                });

                path.node.attributes = path.node.attributes.filter((a) => !dataAttrs.includes(a));
                if (dataSetAttr && t.isJSXExpressionContainer(dataSetAttr.value)) {
                    const existing = dataSetAttr.value.expression;
                    dataSetAttr.value.expression = t.isObjectExpression(existing)
                        ? t.objectExpression([...existing.properties, ...properties])
                        : t.objectExpression([t.spreadElement(existing), ...properties]);
                } else {
                    path.node.attributes.push(
                        t.jsxAttribute(
                            t.jsxIdentifier('dataSet'),
                            t.jsxExpressionContainer(t.objectExpression(properties)),
                        ),
                    );
                }
            },
        },
    };
};
