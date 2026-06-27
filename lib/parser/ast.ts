import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as acorn from 'acorn';

interface ASTNode {
  name: string;
  type: 'function' | 'class' | 'variable';
  line: number;
}

interface ASTLink {
  caller: string;
  callee: string;
  line: number;
}

interface ASTAnalysisResult {
  nodes: ASTNode[];
  links: ASTLink[];
  error?: string;
}

// Custom simple tree walker for Acorn AST
function walkAcornAST(node: any, callback: (node: any, parent?: any) => void, parent?: any) {
  if (!node) return;
  
  callback(node, parent);
  
  // Recursively walk children
  for (const key in node) {
    if (node.hasOwnProperty(key)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && typeof item.type === 'string') {
            walkAcornAST(item, callback, node);
          }
        }
      } else if (child && typeof child === 'object' && typeof child.type === 'string') {
        walkAcornAST(child, callback, node);
      }
    }
  }
}

export function getASTAnalysis(filePath: string): ASTAnalysisResult {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.py') {
    // Run python AST parser
    try {
      const parserScript = path.join(process.cwd(), 'lib', 'parser', 'parse_ast.py');
      const stdout = execSync(`python "${parserScript}" "${filePath}"`, { encoding: 'utf-8' });
      return JSON.parse(stdout) as ASTAnalysisResult;
    } catch (err: any) {
      return { nodes: [], links: [], error: `Python AST parser failed: ${err.message}` };
    }
  }
  
  if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
    try {
      const code = fs.readFileSync(filePath, 'utf-8');
      // Parse with acorn
      // Standard acorn options
      const ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
      });
      
      const nodes: ASTNode[] = [];
      const links: ASTLink[] = [];
      let currentFunction: string | null = null;
      let currentClass: string | null = null;
      
      walkAcornAST(ast, (node, parent) => {
        // Track current function context
        if (node.type === 'FunctionDeclaration') {
          const name = node.id?.name || 'anonymous';
          const fullName = currentClass ? `${currentClass}.${name}` : name;
          nodes.push({
            name: fullName,
            type: 'function',
            line: node.loc?.start.line || 0
          });
          currentFunction = fullName;
        } else if (node.type === 'ClassDeclaration') {
          const name = node.id?.name || 'AnonymousClass';
          nodes.push({
            name,
            type: 'class',
            line: node.loc?.start.line || 0
          });
          currentClass = name;
        } else if (node.type === 'MethodDefinition') {
          const name = node.key.name;
          const fullName = currentClass ? `${currentClass}.${name}` : name;
          nodes.push({
            name: fullName,
            type: 'function',
            line: node.loc?.start.line || 0
          });
          currentFunction = fullName;
        } else if (node.type === 'VariableDeclarator') {
          if (node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
            const name = node.id.name;
            const fullName = currentClass ? `${currentClass}.${name}` : name;
            nodes.push({
              name: fullName,
              type: 'function',
              line: node.loc?.start.line || 0
            });
            currentFunction = fullName;
          }
        } else if (node.type === 'CallExpression') {
          const caller = currentFunction || 'global';
          let callee = '';
          
          if (node.callee.type === 'Identifier') {
            callee = node.callee.name;
          } else if (node.callee.type === 'MemberExpression') {
            if (node.callee.object.type === 'Identifier') {
              callee = `${node.callee.object.name}.${node.callee.property.name || node.callee.property.value}`;
            } else {
              callee = node.callee.property.name || node.callee.property.value || 'methodCall';
            }
          }
          
          if (callee) {
            links.push({
              caller,
              callee,
              line: node.loc?.start.line || 0
            });
          }
        }
      });
      
      // Cleanup duplicate nodes or empty values
      const uniqueNodesMap = new Map<string, ASTNode>();
      nodes.forEach(n => uniqueNodesMap.set(`${n.type}-${n.name}`, n));
      
      return {
        nodes: Array.from(uniqueNodesMap.values()),
        links: links.filter(l => l.caller !== 'global' || l.callee !== 'require') // Filter out require/imports
      };
    } catch (err: any) {
      return { nodes: [], links: [], error: `JS AST parser failed: ${err.message}` };
    }
  }
  
  return { nodes: [], links: [], error: `Unsupported file extension for AST: ${ext}` };
}
