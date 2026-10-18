'use strict';

// DealTwin maintained mitigation for GHSA-vfj7-8cjw-p6xm, revision 1.
// This is a local patch, not an upstream release. See README.md and manifest.json.
const MAX_DEPTH = 64;

const assertDepth = depth => {
  if (depth > MAX_DEPTH) {
    const error = new SyntaxError(`Braces nesting exceeds maximum depth (${MAX_DEPTH})`);
    error.code = 'ERR_BRACES_DEPTH';
    throw error;
  }
};

const invalidAst = () => {
  const error = new TypeError('Expected a tree-shaped braces AST with acyclic parent links');
  error.code = 'ERR_BRACES_AST';
  throw error;
};

const isNode = node => node !== null && typeof node === 'object' && !Array.isArray(node);

// Iterative validation runs before any recursive walker, including direct lib imports.
// Parent/prev backlinks are not children. Parent chains matter to expand's while loops;
// prev is deliberately ignored. Shared child identities are rejected as malformed trees.
const assertAst = ast => {
  const seen = new WeakSet();
  const pending = [{node: ast, depth: 0, top: true}];
  while (pending.length) {
    const {node, depth, top} = pending.pop();
    if (!isNode(node) || seen.has(node)) invalidAst();
    seen.add(node);

    const parents = new WeakSet([node]);
    let parent = node.parent;
    let parentDepth = 0;
    while (parent !== undefined && parent !== null) {
      if (!isNode(parent) || parents.has(parent)) invalidAst();
      parents.add(parent);
      // A leaf at container depth 64 has 65 ancestors including the root.
      assertDepth(parentDepth++);
      parent = parent.parent;
    }

    if (node.nodes !== undefined) {
      if (!Array.isArray(node.nodes)) invalidAst();
      const childDepth = depth + (top && node.type === 'root' ? 0 : 1);
      assertDepth(childDepth);
      for (let i = node.nodes.length - 1; i >= 0; i--) {
        pending.push({node: node.nodes[i], depth: childDepth, top: false});
      }
    }
  }
};

module.exports = {assertDepth, assertAst};
