import ast
import sys
import json

class ASTVisitor(ast.NodeVisitor):
    def __init__(self):
        self.nodes = []
        self.calls = []
        self.current_function = None

    def visit_ClassDef(self, node):
        self.nodes.append({
            "name": node.name,
            "type": "class",
            "line": node.lineno
        })
        old_func = self.current_function
        self.current_function = node.name
        self.generic_visit(node)
        self.current_function = old_func

    def visit_FunctionDef(self, node):
        func_name = node.name
        if self.current_function:
            # If nested or class method
            func_name = f"{self.current_function}.{node.name}"
            
        self.nodes.append({
            "name": func_name,
            "type": "function",
            "line": node.lineno
        })
        
        old_func = self.current_function
        self.current_function = func_name
        self.generic_visit(node)
        self.current_function = old_func

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def visit_Call(self, node):
        # We want to trace what function was called
        caller = self.current_function or "global"
        
        if isinstance(node.func, ast.Name):
            callee = node.func.id
            self.calls.append({
                "caller": caller,
                "callee": callee,
                "line": node.lineno
            })
        elif isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name):
                callee = f"{node.func.value.id}.{node.func.attr}"
            else:
                callee = node.func.attr
            self.calls.append({
                "caller": caller,
                "callee": callee,
                "line": node.lineno
            })
        self.generic_visit(node)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        return

    filepath = sys.argv[1]
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            code = f.read()
        
        tree = ast.parse(code)
        visitor = ASTVisitor()
        visitor.visit(tree)
        
        result = {
            "nodes": visitor.nodes,
            "links": visitor.calls
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
