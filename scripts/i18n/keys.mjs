import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !p.includes('i18n')) files.push(p); } })('src');
const keys = new Map();
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  (function v(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['t', 'tr', 'tn'].includes(n.expression.text)) {
      const args = n.expression.text === 'tn' ? n.arguments.slice(1, 3) : n.arguments.slice(0, 1);
      for (const a of args) {
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) { if (!keys.has(a.text)) keys.set(a.text, f + ':' + (sf.getLineAndCharacterOfPosition(a.pos).line + 1)); }
        else console.error('NON-LITERAL', f, sf.getLineAndCharacterOfPosition(a.pos).line + 1, a.getText().slice(0, 60));
      }
    }
    ts.forEachChild(n, v);
  })(sf);
}
console.log(JSON.stringify(Object.fromEntries(keys), null, 0));
