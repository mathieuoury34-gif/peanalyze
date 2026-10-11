// Repère les textes français de l'interface (TS AST) : node scripts/i18n/scan.mjs [--json]
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
const files = ['src/App.tsx', 'src/ui/kit.tsx', 'src/ui/charts.tsx', 'src/ui/WelcomeCard.tsx', ...readdirSync('src/screens').map((f) => 'src/screens/' + f), 'src/data/prices.ts', 'src/data/sync.ts', 'src/data/excel.ts'];
const SKIP_ATTR = new Set(['className', 'style', 'href', 'data-component', 'data-screen', 'id', 'key', 'type', 'inputMode', 'name', 'role', 'autoComplete', 'accept', 'value', 'htmlFor', 'aria-labelledby', 'aria-controls', 'aria-describedby', 'viewBox', 'd', 'fill', 'stroke', 'icon', 'to', 'fallback', 'mode', 'variant', 'kind', 'size']);
const looksText = (s) => /[A-Za-zÀ-ÿ]/.test(s) && (/\s/.test(s.trim()) || /[À-ÿ]/.test(s) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(s.trim())) && !/^(var\(|#|\/|[a-z-]+:|https?:|\.\/|[a-z]+\/[a-z]|[\w-]+\.(js|css|json|xlsx)$)/.test(s.trim()) && !/^[A-Z0-9_]+$/.test(s.trim());
const out = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isCallExpression(n) && ['t', 'tr', 'tn', 'tl'].includes(n.expression.getText(sf))) return;
    if (ts.isJsxAttribute(n) && SKIP_ATTR.has(n.name.getText(sf))) return;
    if (ts.isPropertyAssignment(n) && ['className', 'style', 'to', 'id', 'key', 'icon'].includes(n.name.getText(sf))) return;
    if (ts.isElementAccessExpression(n) || ts.isTypeNode(n)) return;
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(n.operatorToken.kind)) return;
    if (ts.isCaseClause(n)) { n.statements.forEach(visit); return; }
    let text = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isJsxText(n)) text = n.text.replace(/\s+/g, ' ').trim();
    else if (ts.isTemplateExpression(n)) text = n.getText(sf);
    if (text && looksText(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      out.push({ f, line: line + 1, kind: ts.SyntaxKind[n.kind], text });
      if (ts.isTemplateExpression(n)) return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else { for (const o of out) console.log(o.f.replace('src/', '') + ':' + o.line, o.kind.replace('Literal', '').replace('Expression', ''), '|', o.text.slice(0, 110)); console.error(out.length, 'textes'); }
