/**
 * Playwright Browser Adapter
 *
 * Implements the same interface as createCursorBrowserAdapter but uses
 * Chrome DevTools Protocol (CDP) for the accessibility tree and
 * Playwright's locator API for element interactions.
 *
 * Uses CDP because page.accessibility.snapshot() was removed in Playwright 1.49+.
 */

let refCounter = 0;

function assignRefs(node) {
  if (!node) return;
  node.ref = `pw_${refCounter++}`;
  if (node.children) {
    for (const child of node.children) {
      assignRefs(child);
    }
  }
}

function flattenTree(node, result = []) {
  if (!node) return result;
  result.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, result);
    }
  }
  return result;
}

/**
 * Convert flat CDP AX nodes into a nested tree matching
 * the old page.accessibility.snapshot() format:
 * { role, name, children, ref }
 */
function buildTreeFromCDP(cdpNodes) {
  const byId = {};
  for (const n of cdpNodes) {
    byId[n.nodeId] = n;
  }

  const skipRoles = new Set(['InlineTextBox', 'StaticText', 'none']);

  function collectVisibleChildren(cdpNode) {
    if (!cdpNode || !cdpNode.childIds) return [];
    const result = [];
    for (const childId of cdpNode.childIds) {
      const child = byId[childId];
      if (!child) continue;
      if (child.ignored || skipRoles.has(child.role?.value)) {
        result.push(...collectVisibleChildren(child));
      } else {
        result.push(child);
      }
    }
    return result;
  }

  function convert(cdpNode) {
    if (!cdpNode) return null;

    const role = cdpNode.role?.value || 'none';
    const name = cdpNode.name?.value || '';

    const states = [];
    if (cdpNode.properties) {
      for (const prop of cdpNode.properties) {
        if (prop.name === 'disabled' && prop.value?.value === true) states.push('disabled');
        if (prop.name === 'expanded' && prop.value?.value === true) states.push('expanded');
        if (prop.name === 'selected' && prop.value?.value === true) states.push('selected');
        if (prop.name === 'checked' && prop.value?.value === 'true') states.push('checked');
      }
    }

    const node = { role, name, states };

    const visibleChildren = collectVisibleChildren(cdpNode);
    if (visibleChildren.length > 0) {
      const children = [];
      for (const vc of visibleChildren) {
        const c = convert(vc);
        if (c) children.push(c);
      }
      if (children.length > 0) node.children = children;
    }

    return node;
  }

  const rootCDP = cdpNodes.find(n => !n.parentId);
  if (!rootCDP) return null;
  return convert(rootCDP);
}

function createPlaywrightAdapter(page, logFn) {
  const log = logFn || ((msg) => console.log(`[UberReport] ${msg}`));
  let lastSnapshot = null;
  let lastFlatNodes = [];
  let cdpSession = null;

  async function getCDP() {
    if (!cdpSession) {
      cdpSession = await page.context().newCDPSession(page);
    }
    return cdpSession;
  }

  return {
    async navigate(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    },

    async snapshot() {
      refCounter = 0;
      const client = await getCDP();
      const { nodes } = await client.send('Accessibility.getFullAXTree');
      const tree = buildTreeFromCDP(nodes);
      if (tree) {
        assignRefs(tree);
        lastSnapshot = tree;
        lastFlatNodes = flattenTree(tree);
      }
      return tree;
    },

    async click(ref, description) {
      const node = lastFlatNodes.find((n) => n.ref === ref);
      if (!node) {
        throw new Error(`Element not found for ref ${ref}: ${description}`);
      }

      const locator = await this._findLocator(node);
      await locator.click({ timeout: 5000 });
      await page.waitForTimeout(200);
    },

    async hover(ref, description) {
      const node = lastFlatNodes.find((n) => n.ref === ref);
      if (!node) {
        throw new Error(`Element not found for ref ${ref}: ${description}`);
      }

      const locator = await this._findLocator(node);
      await locator.hover({ timeout: 5000 });
    },

    async fill(ref, value, description) {
      const node = lastFlatNodes.find((n) => n.ref === ref);
      if (!node) {
        throw new Error(`Element not found for ref ${ref}: ${description}`);
      }

      const locator = await this._findLocator(node);
      await locator.fill(value, { timeout: 5000 });
      await page.waitForTimeout(200);
    },

    async pressKey(key) {
      await page.keyboard.press(key);
    },

    async waitFor(opts) {
      if (opts.time) {
        await page.waitForTimeout(opts.time * 1000);
      } else if (opts.text) {
        const timeout = opts.timeout || 30000;
        try {
          await page.getByText(opts.text).first().waitFor({ timeout });
        } catch (e) {
          log(`Timeout waiting for text: ${opts.text}`);
        }
      } else if (opts.textGone) {
        const timeout = opts.timeout || 30000;
        try {
          await page.getByText(opts.textGone).first().waitFor({ state: 'hidden', timeout });
        } catch (e) {
          log(`Timeout waiting for text to disappear: ${opts.textGone}`);
        }
      }
    },

    log(msg) {
      log(msg);
    },

    async _findLocator(node) {
      const role = node.role;
      const name = node.name || '';

      const interactiveRoles = [
        'button', 'link', 'option', 'tab', 'combobox',
        'listbox', 'textbox', 'spinbutton', 'checkbox', 'radio',
      ];

      if (interactiveRoles.includes(role)) {
        const locator = page.getByRole(role, { name, exact: false });
        const count = await locator.count();

        if (count === 1) return locator;

        if (count > 1) {
          const sameNameNodes = lastFlatNodes.filter(
            (n) => n.role === role && n.name === name
          );
          const idx = sameNameNodes.indexOf(node);
          if (idx >= 0 && idx < count) {
            return locator.nth(idx);
          }
        }

        return page.locator(`[role="${role}"]`).filter({ hasText: name }).first();
      }

      const structuralRoles = [
        'gridcell', 'columnheader', 'heading', 'listitem', 'row', 'cell',
      ];

      if (structuralRoles.includes(role)) {
        const locator = page.getByRole(role, { name, exact: false });
        const count = await locator.count();

        if (count === 1) return locator;

        if (count > 1) {
          const sameNameNodes = lastFlatNodes.filter(
            (n) => n.role === role && n.name === name
          );
          const idx = sameNameNodes.indexOf(node);
          if (idx >= 0 && idx < count) {
            return locator.nth(idx);
          }
        }
      }

      if (name) {
        return page.getByText(name, { exact: false }).first();
      }

      throw new Error(`Cannot create locator for node: role=${role}, name=${name}`);
    },
  };
}

module.exports = { createPlaywrightAdapter };
