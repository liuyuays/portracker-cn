#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Resolve the explicit frontend devDependency, including when invoked from the root. */
const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const { parse, parseExpression } = requireFrontend('@babel/parser');
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const localeDirectory = 'frontend/src/i18n/locales/zh-CN';
const allowlistFile = 'scripts/i18n-allowlist.json';
const visibleAttributes = new Set([
  'title', 'placeholder', 'aria-label', 'aria-description', 'aria-valuetext', 'alt',
  'label', 'description', 'tooltip', 'caption', 'text', 'message', 'children',
  'emptyText', 'loadingText', 'errorMessage',
]);
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);
const calls = new Set(['CallExpression', 'OptionalCallExpression']);
const members = new Set(['MemberExpression', 'OptionalMemberExpression']);
const normalize = text => text.replace(/\s+/g, ' ').trim();
const unknown = () => ({ values: [], unknown: true });
const known = (text, node) => ({ values: [{ text, node }], unknown: false });
const combine = results => ({ values: results.flatMap(result => result.values), unknown: results.some(result => result.unknown) });

function finding(file, node, code, message, text, severity = 'error') {
  const loc = node?.loc?.start || node?.loc || { line: 1, column: 0 };
  return { file, line: loc.line, column: loc.column + 1, code, severity, message, ...(text === undefined ? {} : { text }) };
}

function children(node) {
  return Object.values(node).flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => value && typeof value.type === 'string' && !value.type.startsWith('Comment'));
}

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return String(node.value);
  return null;
}

function callName(node) {
  if (!calls.has(node?.type)) return null;
  if (node.callee.type === 'Identifier') return node.callee.name;
  if (members.has(node.callee.type) && (!node.callee.computed || node.callee.property.type === 'StringLiteral')) {
    return propertyName(node.callee.property);
  }
  return null;
}

function placeholders(text) {
  const tokens = [];
  let valid = true;
  const remainder = text.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, body) => {
    const [rawName, ...formats] = body.split(',');
    const unescaped = rawName.trim().startsWith('-');
    const name = (unescaped ? rawName.trim().slice(1) : rawName).trim();
    if (!name) valid = false;
    tokens.push(JSON.stringify([unescaped, name, formats.join(',').replace(/\s+/g, '')]));
    return '';
  });
  return valid && !remainder.includes('{{') && !remainder.includes('}}') ? tokens.sort() : null;
}

function readCatalogs(catalogs, findings) {
  const translations = new Map();
  for (const { file, source } of catalogs) {
    try {
      const ast = parseExpression(source);
      const value = JSON.parse(source);
      if (!value || typeof value !== 'object' || Array.isArray(value) || ast.type !== 'ObjectExpression') {
        findings.push(finding(file, ast, 'catalog-error', 'Catalog must be a flat JSON object of English keys and Chinese string values.'));
        continue;
      }
      /** The AST preserves duplicate keys that JSON.parse drops. */
      for (const entry of ast.properties) {
        const key = entry.key.value;
        const translation = entry.value.value;
        if (entry.value.type !== 'StringLiteral' || !translation.trim()) {
          findings.push(finding(file, entry, 'catalog-error', 'Translation must be a nonempty string.', key));
          continue;
        }
        const sourcePlaceholders = placeholders(key);
        const translatedPlaceholders = placeholders(translation);
        if (!sourcePlaceholders || !translatedPlaceholders || JSON.stringify(sourcePlaceholders) !== JSON.stringify(translatedPlaceholders)) {
          findings.push(finding(file, entry, 'interpolation-mismatch', 'Preserve every {{placeholder}}, including its name, escaping and formatter.', key));
        }
        const previous = translations.get(key);
        if (previous && previous.value !== translation) {
          findings.push(finding(file, entry, 'conflicting-translation', `Translation conflicts with ${previous.file}:${previous.line}.`, key));
        } else {
          translations.set(key, { value: translation, file, line: entry.loc.start.line });
        }
      }
    } catch (error) {
      findings.push(finding(file, error, 'catalog-error', `Cannot read catalog: ${error.message}`));
    }
  }
  return translations;
}

function validAllowlist(allowlist, findings) {
  if (!allowlist || typeof allowlist !== 'object' || Array.isArray(allowlist)) {
    findings.push(finding(allowlistFile, null, 'allowlist-error', 'Allowlist must map exact strings to nonempty reasons.'));
    return {};
  }
  for (const [text, reason] of Object.entries(allowlist)) {
    if (!text.trim() || text !== normalize(text) || text === '*' || typeof reason !== 'string' || !reason.trim()) {
      findings.push(finding(allowlistFile, null, 'allowlist-error', 'Each allowlist entry needs an exact normalized string and a reason; wildcards are unsupported.', text));
    }
  }
  return allowlist;
}

/** Follow local values that reach a JSX display position, leaving code metadata alone. */
function indexBindings(ast) {
  const nodes = [];
  const scopes = new WeakMap();
  const parents = new WeakMap();
  const makeScope = (parent, kind) => ({ parent, kind, bindings: new Map() });
  const lookup = (name, scope) => {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return current.bindings.get(name);
    }
    return null;
  };
  function bind(pattern, reference, scope) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      if (!scope.bindings.has(pattern.name)) scope.bindings.set(pattern.name, { references: [] });
      const binding = scope.bindings.get(pattern.name);
      if (reference?.node) binding.references.push(reference);
      return binding;
    }
    if (pattern.type === 'AssignmentPattern') {
      bind(pattern.left, reference, scope);
      bind(pattern.left, { node: pattern.right, path: [] }, scope);
    } else if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        if (property.type !== 'ObjectProperty') continue;
        const name = propertyName(property.key);
        bind(property.value, reference && { node: reference.node, path: [...reference.path, name] }, scope);
      }
    } else if (pattern.type === 'ArrayPattern') {
      pattern.elements.forEach((element, index) => bind(element, reference && {
        node: reference.node, path: [...reference.path, String(index)],
      }, scope));
    } else if (pattern.type === 'RestElement') {
      bind(pattern.argument, null, scope);
    }
  }
  function visit(node, scope, parent) {
    if (node.type === 'Program') scope = makeScope(scope, 'function');
    if (functions.has(node.type)) {
      if (node.type === 'FunctionDeclaration' && node.id) bind(node.id, { node, path: [] }, scope);
      scope = makeScope(scope, 'function');
      if (node.type === 'FunctionExpression' && node.id) bind(node.id, { node, path: [] }, scope);
      node.params.forEach(parameter => bind(parameter, null, scope));
    } else if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement'].includes(node.type)) {
      scope = makeScope(scope, 'block');
      if (node.type === 'CatchClause') bind(node.param, null, scope);
    }
    nodes.push(node);
    scopes.set(node, scope);
    parents.set(node, parent);
    if (node.type === 'ImportDeclaration') node.specifiers.forEach(specifier => bind(specifier.local, null, scope));
    if (node.type === 'VariableDeclarator') {
      let target = scope;
      if (parent.kind === 'var') while (target.kind !== 'function' && target.parent) target = target.parent;
      if (callName(node.init) === 'useState' && node.id.type === 'ArrayPattern') {
        const state = bind(node.id.elements[0], { node: node.init.arguments[0], path: [] }, target);
        const setter = bind(node.id.elements[1], null, target);
        if (setter) setter.state = state;
      } else {
        bind(node.id, { node: node.init, path: [] }, target);
      }
    }
    for (const child of children(node)) visit(child, scope, node);
  }
  visit(ast, null, null);
  for (const node of nodes) {
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'Identifier') {
      lookup(node.left.name, scopes.get(node))?.references.push({ node: node.right, path: [] });
    }
    if (!calls.has(node.type)) continue;
    if (node.callee.type === 'Identifier') {
      const state = lookup(node.callee.name, scopes.get(node))?.state;
      if (state && node.arguments[0]) state.references.push({ node: node.arguments[0], path: [] });
    }
    if (callName(node) === 'map' && members.has(node.callee.type) && functions.has(node.arguments[0]?.type)) {
      const callback = node.arguments[0];
      bind(callback.params[0], { node: node.callee.object, path: ['*'] }, scopes.get(callback));
    }
  }
  return { nodes, scopes, parents, lookup };
}

function sourceFindings({ file, source }, translations, allowlist) {
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'unambiguous', sourceFilename: file,
      plugins: /\.[cm]?tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
    });
  } catch (error) {
    return [finding(file, error, 'parse-error', `Cannot parse source: ${error.message}`)];
  }
  const { nodes, scopes, parents, lookup } = indexBindings(ast);
  const findings = [];
  const emitted = new Set();
  const nodeIds = new WeakMap(nodes.map((node, index) => [node, index]));
  const emit = (node, code, message, text, severity, location = node) => {
    const id = `${nodeIds.get(node)}:${code}:${text}`;
    if (!emitted.has(id)) {
      emitted.add(id);
      findings.push(finding(file, location, code, message, text, severity));
    }
  };
  function returns(fn, selectors, mode, active) {
    if (fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement') {
      return evaluate(fn.body, selectors, mode, active);
    }
    const results = [];
    function visit(node) {
      if (functions.has(node.type)) return;
      if (node.type === 'ReturnStatement') results.push(evaluate(node.argument, selectors, mode, active));
      else children(node).forEach(visit);
    }
    visit(fn.body);
    return combine(results);
  }
  function concatenate(left, right) {
    const values = [];
    for (const first of left.values) {
      for (const second of right.values) {
        if (values.length === 64) return { values, unknown: true };
        values.push({ text: first.text + second.text, node: first.node });
      }
    }
    return { values, unknown: left.unknown || right.unknown };
  }
  function evaluate(node, selectors = [], mode = 'visible', active = new Set()) {
    if (!node) return unknown();
    const id = `${nodeIds.get(node)}:${mode}:${JSON.stringify(selectors)}`;
    if (active.has(id) || active.size > 80) return unknown();
    active.add(id);
    const next = (value, path = selectors) => evaluate(value, path, mode, active);
    try {
      if (node.type === 'Identifier') {
        const binding = lookup(node.name, scopes.get(node));
        if (!binding?.references.length) return unknown();
        return combine(binding.references.map(reference => next(reference.node, [...reference.path, ...selectors])));
      }
      if (members.has(node.type)) {
        const property = node.computed && !['StringLiteral', 'NumericLiteral'].includes(node.property.type) ? '*' : propertyName(node.property);
        return next(node.object, [property, ...selectors]);
      }
      if (node.type === 'ObjectExpression') {
        if (!selectors.length) return unknown();
        const [property, ...rest] = selectors;
        return combine(node.properties.flatMap(entry => {
          if (entry.type === 'SpreadElement') return [next(entry.argument)];
          if (entry.type === 'ObjectProperty' && (property === '*' || propertyName(entry.key) === property)) return [next(entry.value, rest)];
          return [];
        }));
      }
      if (node.type === 'ArrayExpression') {
        if (selectors.length && selectors[0] !== '*') return next(node.elements[Number(selectors[0])], selectors.slice(1));
        const rest = selectors.length ? selectors.slice(1) : [];
        return combine(node.elements.filter(Boolean).map(element => element.type === 'SpreadElement'
          ? next(element.argument, ['*', ...rest]) : next(element, rest)));
      }
      if (node.type === 'ConditionalExpression') return combine([next(node.consequent), next(node.alternate)]);
      if (node.type === 'LogicalExpression') return combine(node.operator === '&&' ? [next(node.right)] : [next(node.left), next(node.right)]);
      if (node.type === 'SequenceExpression') return next(node.expressions.at(-1));
      if (['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TypeCastExpression', 'ParenthesizedExpression'].includes(node.type)) return next(node.expression);
      if (calls.has(node.type)) {
        if (callName(node) === 't') return unknown();
        if (['useMemo', 'useCallback'].includes(callName(node))) return next(node.arguments[0]);
        if (members.has(node.callee.type)) {
          if (callName(node) === 'map') return next(node.arguments[0], selectors[0] === '*' ? selectors.slice(1) : selectors);
          if (callName(node) === 'join' && mode === 'visible' && !selectors.length) return combine([next(node.callee.object, ['*']), ...node.arguments.map(argument => next(argument))]);
        }
        if (node.callee.type === 'Identifier') return next(node.callee);
        return unknown();
      }
      if (functions.has(node.type)) return returns(node, selectors, mode, active);
      if (selectors.length) return unknown();
      if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return known(String(node.value), node);
      if (node.type === 'BinaryExpression' && node.operator === '+') {
        const left = next(node.left), right = next(node.right);
        return mode === 'key' ? concatenate(left, right) : combine([left, right]);
      }
      if (node.type === 'TemplateLiteral') {
        if (mode === 'visible') {
          const text = node.quasis.map(part => part.value.cooked ?? part.value.raw).join('${…}');
          return combine([known(text, node), ...node.expressions.map(expression => next(expression))]);
        }
        let result = known(node.quasis[0].value.cooked ?? node.quasis[0].value.raw, node);
        node.expressions.forEach((expression, index) => {
          result = concatenate(result, next(expression));
          result = concatenate(result, known(node.quasis[index + 1].value.cooked ?? node.quasis[index + 1].value.raw, node));
        });
        return result;
      }
      if (['NullLiteral', 'BooleanLiteral', 'JSXElement', 'JSXFragment'].includes(node.type)) return combine([]);
      return unknown();
    } finally {
      active.delete(id);
    }
  }
  function visible(node) {
    for (const value of evaluate(node).values) {
      const text = normalize(value.text);
      if (/[A-Za-z]/.test(text) && !Object.hasOwn(allowlist, text)) {
        emit(value.node, 'hardcoded', 'Visible English text needs t(...) or a documented exact allowlist entry.', text);
      }
    }
  }
  function nonDisplay(node) {
    for (let parent = parents.get(node); parent; parent = parents.get(parent)) {
      if (parent.type === 'JSXElement' && ['script', 'style'].includes(propertyName(parent.openingElement.name))) return true;
    }
    return false;
  }
  function displayAttribute(node) {
    const name = propertyName(node.name);
    if (visibleAttributes.has(name)) return true;
    const opening = parents.get(node);
    if (name !== 'value' || propertyName(opening?.name) !== 'input') return false;
    const type = opening.attributes.find(attribute => propertyName(attribute.name) === 'type')?.value;
    return ['button', 'submit', 'reset'].includes(type?.value ?? type?.expression?.value);
  }
  for (const node of nodes) {
    if (node.type.startsWith('JSX') && nonDisplay(node)) continue;
    if (calls.has(node.type) && callName(node) === 't') {
      for (let parent = parents.get(node); parent; parent = parents.get(parent)) {
        if (parent.type !== 'JSXAttribute') continue;
        if (['source', 'id', 'key', 'type', 'role', 'name', 'variant'].includes(propertyName(parent.name))) {
          emit(node, 'translated-identifier', 'Keep structural component props as raw identifiers; translate only their visible labels.', propertyName(parent.name));
        }
        break;
      }
      const result = evaluate(node.arguments[0], [], 'key');
      for (const { text, node: valueNode } of result.values) {
        if (text !== '' && !translations.has(text)) emit(valueNode, 'missing-key', 'Missing Chinese translation for literal English key.', text);
      }
      if (result.unknown || !result.values.length) emit(node, 'dynamic-key', 'Dynamic translation key requires manual review; static coverage is incomplete here.', undefined, 'info');
    } else if (node.type === 'JSXText') {
      const text = normalize(node.value);
      if (/[A-Za-z]/.test(text) && !Object.hasOwn(allowlist, text)) {
        const raw = node.extra?.raw ?? node.value;
        const prefix = raw.slice(0, raw.search(/\S|$/));
        const lines = prefix.split('\n');
        const location = { loc: { start: { line: node.loc.start.line + lines.length - 1, column: lines.length > 1 ? lines.at(-1).length : node.loc.start.column + prefix.length } } };
        emit(node, 'hardcoded', 'Visible JSX text needs t(...) or a documented exact allowlist entry.', text, undefined, location);
      }
    } else if (node.type === 'JSXExpressionContainer' && ['JSXElement', 'JSXFragment'].includes(parents.get(node)?.type)) {
      visible(node.expression);
    } else if (node.type === 'JSXAttribute' && displayAttribute(node)) {
      if (node.value?.type === 'StringLiteral') visible(node.value);
      else if (node.value?.type === 'JSXExpressionContainer') visible(node.value.expression);
    }
  }
  return findings;
}

/** Analyze in-memory snapshots so fixture tests never depend on the changing UI. */
export function analyze({ sources = [], catalogs = [], allowlist = {} } = {}) {
  const findings = [];
  const allowed = validAllowlist(allowlist, findings);
  const translations = readCatalogs(catalogs, findings);
  for (const source of sources) findings.push(...sourceFindings(source, translations, allowed));
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code));
  return { findings, sourceCount: sources.length, catalogCount: catalogs.length, keyCount: translations.size };
}

/** Read production source only; no components or source directories are exempt. */
export function checkProject(root = projectRoot) {
  const inputFindings = [];
  function files(directory, accepts) {
    const result = [];
    function visit(relative) {
      for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const name = `${relative}/${entry.name}`;
        if (entry.isDirectory()) visit(name);
        else if (entry.isFile() && accepts(name)) result.push({ file: name, source: readFileSync(path.join(root, name), 'utf8') });
      }
    }
    try { visit(directory); }
    catch (error) { inputFindings.push(finding(directory, null, 'input-error', `Cannot read input: ${error.message}`)); }
    return result.sort((a, b) => a.file.localeCompare(b.file));
  }
  const sources = files('frontend/src', name => /\.[cm]?[jt]sx?$/.test(name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name));
  const catalogs = files(localeDirectory, name => name.endsWith('.json'));
  if (!sources.length) inputFindings.push(finding('frontend/src', null, 'input-error', 'No production JavaScript/JSX/TypeScript source files found.'));
  if (!catalogs.length) inputFindings.push(finding(localeDirectory, null, 'input-error', 'No Chinese JSON catalogs found.'));
  let allowlist = {};
  if (existsSync(path.join(root, allowlistFile))) {
    try { allowlist = JSON.parse(readFileSync(path.join(root, allowlistFile), 'utf8')); }
    catch (error) { inputFindings.push(finding(allowlistFile, null, 'allowlist-error', `Cannot read allowlist: ${error.message}`)); }
  }
  const result = analyze({ sources, catalogs, allowlist });
  result.findings.unshift(...inputFindings);
  return result;
}

export function runCli(args = process.argv.slice(2), { root = projectRoot, write = text => process.stdout.write(text) } = {}) {
  const help = 'Usage: node scripts/check-i18n.mjs [--inventory]\n';
  if (args.some(arg => !['--inventory', '--help', '-h'].includes(arg))) {
    write(help);
    return 2;
  }
  if (args.includes('--help') || args.includes('-h')) { write(help); return 0; }
  const inventory = args.includes('--inventory');
  const result = checkProject(root);
  const errors = result.findings.filter(item => item.severity === 'error');
  const information = result.findings.length - errors.length;
  for (const item of inventory ? result.findings : errors) {
    write(`${item.file}:${item.line}:${item.column} [${item.code}] ${item.message}${item.text === undefined ? '' : ` ${JSON.stringify(item.text)}`}\n`);
  }
  write(`i18n ${inventory ? 'inventory' : 'check'}: ${result.sourceCount} source files, ${result.catalogCount} catalogs, ${result.keyCount} keys; ${errors.length} errors, ${information} manual-review findings.\n`);
  write('Static analysis covers literal keys and supported local JSX value flows; review dynamic keys, external data and runtime UI manually.\n');
  if (inventory) return result.findings.some(item => ['input-error', 'parse-error', 'catalog-error', 'allowlist-error'].includes(item.code)) ? 1 : 0;
  return errors.length ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCli();
}
