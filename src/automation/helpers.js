/**
 * Utility functions for parsing and searching the accessibility tree.
 *
 * The accessibility snapshot from the Cursor Browser MCP returns a tree of nodes.
 * Each node has: ref, role, name (text content), and children.
 * These helpers let us traverse that tree to find elements the same way
 * the original extension used querySelectorAll + textContent matching.
 */

/**
 * Parse a Euro amount string into a number.
 * Handles European format: €1.234,56 -> 1234.56
 * Ported directly from the original content.js.
 */
function parseAmount(text) {
  if (!text) return 0;
  let cleaned = text.replace(/[€\s]/g, '');
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Find all nodes in the snapshot tree matching a predicate.
 * The snapshot is a nested structure; this flattens it via DFS.
 *
 * @param {object} tree - Snapshot root node or array of nodes
 * @param {function} predicate - (node) => boolean
 * @returns {object[]} Matching nodes
 */
function findNodes(tree, predicate) {
  const results = [];
  const nodes = Array.isArray(tree) ? tree : [tree];

  function walk(node) {
    if (!node) return;
    if (predicate(node)) {
      results.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const n of nodes) {
    walk(n);
  }
  return results;
}

/**
 * Find the first node matching a predicate.
 */
function findNode(tree, predicate) {
  const results = findNodes(tree, predicate);
  return results.length > 0 ? results[0] : null;
}

/**
 * Find nodes by their ARIA role.
 */
function findByRole(tree, role) {
  return findNodes(tree, (n) => n.role === role);
}

/**
 * Find a node whose name (text) includes any of the given patterns (case-insensitive).
 */
function findByTextPatterns(tree, patterns) {
  return findNode(tree, (n) => {
    if (!n.name) return false;
    const lower = n.name.toLowerCase();
    return patterns.some((p) => lower.includes(p.toLowerCase()));
  });
}

/**
 * Find all nodes whose name matches any of the given patterns.
 */
function findAllByTextPatterns(tree, patterns) {
  return findNodes(tree, (n) => {
    if (!n.name) return false;
    const lower = n.name.toLowerCase();
    return patterns.some((p) => lower.includes(p.toLowerCase()));
  });
}

/**
 * Find a clickable element (button/link) by text patterns.
 * Looks for role="button" or role="link" whose name matches.
 */
function findButtonByText(tree, patterns) {
  return findNode(tree, (n) => {
    if (n.role !== 'button' && n.role !== 'link') return false;
    if (!n.name) return false;
    const lower = n.name.toLowerCase();
    return patterns.some((p) => lower.includes(p.toLowerCase()));
  });
}

/**
 * Find all buttons whose name matches any pattern.
 */
function findAllButtonsByText(tree, patterns) {
  return findNodes(tree, (n) => {
    if (n.role !== 'button' && n.role !== 'link') return false;
    if (!n.name) return false;
    const lower = n.name.toLowerCase();
    return patterns.some((p) => lower.includes(p.toLowerCase()));
  });
}

/**
 * Extract the Euro amount from a node's name/text.
 * Returns 0 if no amount is found.
 */
function extractAmount(node) {
  if (!node || !node.name) return 0;
  const match = node.name.match(/-?€[\d.,]+/);
  return match ? parseAmount(match[0]) : 0;
}

/**
 * Categorize a drawer item by its label text.
 * Returns the field key (fare, serviceFee, etc.) or null if unrecognized.
 */
function categorizeEarningLabel(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const categories = [
    { key: 'fare', prefixes: ['fare', 'fahrtpreis'] },
    { key: 'serviceFee', prefixes: ['service fee', 'servicegebühr'] },
    { key: 'tip', prefixes: ['tip', 'trinkgeld'] },
    { key: 'promotions', prefixes: ['promotion', 'aktion'] },
    { key: 'refundsExpenses', prefixes: ['refund', 'erstattung'] },
    { key: 'yourEarnings', prefixes: ['your earning', 'deine einnahmen'] },
    { key: 'adjustments', prefixes: ['adjustment', 'anpassung'] },
    { key: 'cashCollected', prefixes: ['cash collected', 'bar eingenommen', 'bareinnahmen'] },
    { key: 'payout', prefixes: ['payout', 'auszahlung'] },
    { key: 'netEarnings', prefixes: ['net earning', 'nettoeinnahmen'] },
    { key: 'totalEarning', prefixes: ['total earning', 'gesamtumsatz'] },
  ];

  for (const cat of categories) {
    if (cat.prefixes.some((p) => lower.startsWith(p))) {
      return cat.key;
    }
  }
  return null;
}

/**
 * Check if a driver name passes the filter.
 * Empty filter means all drivers pass.
 */
function isDriverInFilter(driverName, filterNames) {
  if (!filterNames || filterNames.length === 0) return true;
  const lower = driverName.toLowerCase();
  return filterNames.some((f) => lower.includes(f.toLowerCase()));
}

/**
 * Deduplicate a driver name that the accessibility tree may have doubled.
 * E.g. "Max Mustermann Max Mustermann" -> "Max Mustermann"
 * This happens because the gridcell contains both a link and a text node.
 */
function deduplicateName(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(' ');
    const secondHalf = words.slice(half).join(' ');
    if (firstHalf === secondHalf) return firstHalf;
  }
  return name.trim();
}

/**
 * Sanitize a driver name for use as a filename.
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

/**
 * Get today's date as YYYY-MM-DD.
 */
function todayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate a summary of the snapshot tree: counts of key roles.
 * Useful for logging/debugging to understand the page state.
 */
function snapshotSummary(tree) {
  const counts = {};
  findNodes(tree, (n) => {
    const role = n.role || 'unknown';
    counts[role] = (counts[role] || 0) + 1;
    return false;
  });
  return {
    buttons: counts.button || 0,
    gridcells: counts.gridcell || 0,
    textboxes: counts.textbox || 0,
    tabs: counts.tab || 0,
    options: counts.option || 0,
    listboxes: counts.listbox || 0,
    links: counts.link || 0,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}

module.exports = {
  parseAmount,
  findNodes,
  findNode,
  findByRole,
  findByTextPatterns,
  findAllByTextPatterns,
  findButtonByText,
  findAllButtonsByText,
  extractAmount,
  categorizeEarningLabel,
  isDriverInFilter,
  deduplicateName,
  sanitizeFilename,
  todayString,
  snapshotSummary,
};
