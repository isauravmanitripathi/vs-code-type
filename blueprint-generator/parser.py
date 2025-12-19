"""
Python Source Parser Module
Parses Python source files and extracts structured segments including:
- Import statements with associated comments
- Function definitions with docstrings
- Class definitions with docstrings (now split: header + individual methods)
- Module-level code with comments
- Inline comments for highlighting
Each segment contains the code, any associated comments/docstrings,
and line number information for accurate blueprint generation.
"""
import ast
import tokenize
import io
import re
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

@dataclass
class CodeSegment:
    """
    Represents a parsed segment of Python code.
   
    Attributes:
        segment_type: Type of segment ('imports', 'function', 'class', 'code', 'variable')
        code: The actual source code
        docstring: Function/class docstring (if applicable)
        comment_above: Single or multi-line comment above this block
        inline_comments: List of inline comments with their line positions
        start_line: Starting line number (1-indexed)
        end_line: Ending line number (1-indexed)
        name: Name of function/class/variable (if applicable)
    """
    segment_type: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    comment_above: Optional[str] = None
    inline_comments: List[Dict] = field(default_factory=list)
    name: Optional[str] = None

class PythonParser:
    """
    Parser for Python source files that extracts structured segments
    for blueprint generation.
    """
   
    def __init__(self, source_code: str):
        """
        Initialize parser with source code.
       
        Args:
            source_code: The complete Python source code as a string
        """
        self.source_code = source_code
        self.lines = source_code.split('\n')
        self.comments = self._extract_comments()
        try:
            self.tree = ast.parse(source_code)
        except (SyntaxError, IndentationError) as e:
            # If the file has syntax/indentation errors, create an empty module
            # This allows the blueprint builder to continue processing other files
            print(f"Warning: Failed to parse source code due to {type(e).__name__}: {e}")
            self.tree = ast.Module(body=[], type_ignores=[])
       
    def _extract_comments(self) -> Dict[int, Tuple[str, bool]]:
        """
        Extract all comments from the source code using tokenize.
       
        Returns:
            Dictionary mapping line numbers to (comment_text, is_inline) tuples.
            is_inline is True if the comment appears after code on the same line.
        """
        comments = {}
        try:
            tokens = list(tokenize.generate_tokens(io.StringIO(self.source_code).readline))
           
            for i, tok in enumerate(tokens):
                if tok.type == tokenize.COMMENT:
                    line_no = tok.start[0]
                    col = tok.start[1]
                    text = tok.string.lstrip('#').strip()
                   
                    # Check if it's an inline comment (has code before it on same line)
                    line_content = self.lines[line_no - 1][:col].strip()
                    is_inline = len(line_content) > 0
                   
                    comments[line_no] = (text, is_inline)
        except (tokenize.TokenError, IndentationError):
            pass # Handle incomplete code and indentation errors gracefully
           
        return comments
   
    def _get_source_lines(self, start: int, end: int) -> str:
        """
        Get source code for a range of lines.
       
        Args:
            start: Start line (1-indexed)
            end: End line (1-indexed, inclusive)
           
        Returns:
            Source code string for the specified lines
        """
        return '\n'.join(self.lines[start - 1:end])
   
    def _get_comments_above(self, line_no: int) -> Optional[str]:
        """
        Get all consecutive comments above a given line.
       
        Args:
            line_no: The line number to look above
           
        Returns:
            Combined comment text, or None if no comments found
        """
        comment_lines = []
        check_line = line_no - 1
       
        while check_line >= 1:
            if check_line in self.comments:
                text, is_inline = self.comments[check_line]
                if not is_inline: # Only standalone comments
                    comment_lines.insert(0, text)
                    check_line -= 1
                else:
                    break
            elif self.lines[check_line - 1].strip() == '':
                # Empty line - stop looking
                break
            else:
                break
               
        return ' '.join(comment_lines) if comment_lines else None
   
    def _get_inline_comments_in_range(self, start: int, end: int) -> List[Dict]:
        """
        Get all inline comments within a range of lines.
       
        Args:
            start: Start line (1-indexed)
            end: End line (1-indexed)
           
        Returns:
            List of dicts with 'line', 'text', and 'code' keys
        """
        inline_comments = []
       
        for line_no in range(start, end + 1):
            if line_no in self.comments:
                text, is_inline = self.comments[line_no]
                if is_inline:
                    # Get the code on this line (without the comment)
                    line = self.lines[line_no - 1]
                    code_part = line.split('#')[0].strip()
                    inline_comments.append({
                        'line': line_no,
                        'text': text,
                        'code': code_part
                    })
                   
        return inline_comments
   
    def _remove_docstring_from_function(self, code: str) -> str:
        """
        Remove the docstring from function code for cleaner display.
        We keep the docstring data but don't include it in typed code.
       
        Args:
            code: The complete function source code
           
        Returns:
            Function code with docstring removed
        """
        lines = code.split('\n')
        result_lines = []
        in_docstring = False
        docstring_delimiter = None
        found_def = False
        docstring_done = False
       
        for i, line in enumerate(lines):
            stripped = line.strip()
           
            if not found_def:
                result_lines.append(line)
                if stripped.startswith('def ') or stripped.startswith('async def '):
                    found_def = True
                continue
           
            # If we've already handled the docstring, include all remaining lines
            if docstring_done:
                result_lines.append(line)
                continue
           
            # After def line, look for docstring (only on first non-empty line after def)
            if not in_docstring and docstring_delimiter is None:
                # Skip empty lines when looking for docstring
                if stripped == '':
                    continue
                   
                if stripped.startswith('"""') or stripped.startswith("'''"):
                    docstring_delimiter = stripped[:3]
                   
                    # Check if docstring ends on same line (single line docstring)
                    if len(stripped) > 3 and stripped.endswith(docstring_delimiter):
                        # Single line docstring like """text"""
                        docstring_done = True
                        continue
                    elif stripped.count(docstring_delimiter) >= 2:
                        # Single line docstring
                        docstring_done = True
                        continue
                    else:
                        # Multi-line docstring starts
                        in_docstring = True
                        continue
                else:
                    # No docstring found, this is actual code
                    docstring_done = True
                    result_lines.append(line)
                   
            elif in_docstring:
                # Inside docstring, look for closing delimiter
                if docstring_delimiter in stripped:
                    # Found closing delimiter
                    in_docstring = False
                    docstring_done = True
                # Either way, skip this line (it's part of docstring)
                continue
               
        return '\n'.join(result_lines)

    def _remove_docstring_from_class(self, code: str) -> str:
        """
        Remove the docstring from class header code for cleaner display.
        Similar to function docstring removal, but triggered after 'class' line.
       
        Args:
            code: The class header source code
           
        Returns:
            Class header code with docstring removed
        """
        lines = code.split('\n')
        result_lines = []
        in_docstring = False
        docstring_delimiter = None
        found_class = False
        docstring_done = False
       
        for i, line in enumerate(lines):
            stripped = line.strip()
           
            if not found_class:
                result_lines.append(line)
                if stripped.startswith('class '):
                    found_class = True
                continue
           
            if docstring_done:
                result_lines.append(line)
                continue
           
            if not in_docstring and docstring_delimiter is None:
                if stripped == '':
                    continue
               
                if stripped.startswith('"""') or stripped.startswith("'''"):
                    docstring_delimiter = stripped[:3]
                   
                    if len(stripped) > 3 and stripped.endswith(docstring_delimiter):
                        docstring_done = True
                        continue
                    elif stripped.count(docstring_delimiter) >= 2:
                        docstring_done = True
                        continue
                    else:
                        in_docstring = True
                        continue
                else:
                    docstring_done = True
                    result_lines.append(line)
           
            elif in_docstring:
                if docstring_delimiter in stripped:
                    in_docstring = False
                    docstring_done = True
                continue
               
        return '\n'.join(result_lines)
   
    def parse(self) -> List[CodeSegment]:
        """
        Parse the source code and return a list of CodeSegments.
       
        Returns:
            List of CodeSegment objects representing the parsed structure
        """
        segments = []
        processed_lines = set()
       
        # First pass: Find all top-level nodes with their positions
        nodes_info = []
       
        for node in ast.iter_child_nodes(self.tree):
            if hasattr(node, 'lineno'):
                nodes_info.append({
                    'node': node,
                    'start': node.lineno,
                    'end': getattr(node, 'end_lineno', node.lineno)
                })
       
        # Sort by start line
        nodes_info.sort(key=lambda x: x['start'])
       
        # Track the last line we wrote to preserve spacing
        import_nodes = []
        other_nodes = []
       
        for info in nodes_info:
            node = info['node']
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                import_nodes.append(info)
            else:
                other_nodes.append(info)
       
        # Group consecutive imports
        if import_nodes:
            import_groups = []
            current_group = [import_nodes[0]]
           
            for i in range(1, len(import_nodes)):
                prev_end = current_group[-1]['end']
                curr_start = import_nodes[i]['start']
               
                # Check if there's only whitespace/comments between
                gap_lines = self.lines[prev_end:curr_start - 1]
                if all(line.strip() == '' or line.strip().startswith('#') for line in gap_lines):
                    current_group.append(import_nodes[i])
                else:
                    import_groups.append(current_group)
                    current_group = [import_nodes[i]]
           
            import_groups.append(current_group)
           
            # Create segments for import groups
            for group in import_groups:
                start_line = group[0]['start']
                end_line = group[-1]['end']
               
                comment_above = self._get_comments_above(start_line)
               
                import_code = self._get_source_lines(start_line, end_line)
               
                inline_comments = self._get_inline_comments_in_range(start_line, end_line)
               
                segments.append(CodeSegment(
                    segment_type='imports',
                    code=import_code,
                    start_line=start_line,
                    end_line=end_line,
                    comment_above=comment_above,
                    inline_comments=inline_comments
                ))
               
                for line in range(start_line, end_line + 1):
                    processed_lines.add(line)
       
        # Process other nodes (functions, classes, variables)
        for info in other_nodes:
            node = info['node']
            start_line = info['start']
            end_line = info['end']
           
            # Skip already processed lines
            if start_line in processed_lines:
                continue
           
            if isinstance(node, ast.ClassDef):
                comment_above = self._get_comments_above(start_line)
                docstring = ast.get_docstring(node)
               
                # Determine header end: include docstring lines if present
                if node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Str):
                    doc_node = node.body[0]
                    header_end = doc_node.end_lineno
                    body_start_idx = 1
                else:
                    header_end = node.lineno
                    body_start_idx = 0
               
                header_code = self._get_source_lines(start_line, header_end)
               
                # Clean docstring from header code if present
                if docstring:
                    header_code_clean = self._remove_docstring_from_class(header_code)
                else:
                    header_code_clean = header_code
               
                inline_comments = self._get_inline_comments_in_range(start_line, header_end)
               
                segments.append(CodeSegment(
                    segment_type='class',
                    code=header_code_clean,
                    start_line=start_line,
                    end_line=header_end,
                    docstring=docstring,
                    comment_above=comment_above,
                    inline_comments=inline_comments,
                    name=node.name
                ))
               
                for l in range(start_line, header_end + 1):
                    processed_lines.add(l)
               
                # Process class body (methods, variables, etc.)
                for sub_node in node.body[body_start_idx:]:
                    if not hasattr(sub_node, 'lineno'):
                        continue
                   
                    sub_start = sub_node.lineno
                    sub_end = getattr(sub_node, 'end_lineno', sub_start)
                   
                    if sub_start in processed_lines:
                        continue
                   
                    sub_code = self._get_source_lines(sub_start, sub_end)
                    sub_comment_above = self._get_comments_above(sub_start)
                    sub_inline = self._get_inline_comments_in_range(sub_start, sub_end)
                   
                    if isinstance(sub_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        sub_docstring = ast.get_docstring(sub_node)
                        if sub_docstring:
                            sub_code = self._remove_docstring_from_function(sub_code)
                        segments.append(CodeSegment(
                            segment_type='function',
                            code=sub_code,
                            start_line=sub_start,
                            end_line=sub_end,
                            docstring=sub_docstring,
                            comment_above=sub_comment_above,
                            inline_comments=sub_inline,
                            name=sub_node.name
                        ))
                    elif isinstance(sub_node, ast.Assign):
                        names = []
                        for target in sub_node.targets:
                            if isinstance(target, ast.Name):
                                names.append(target.id)
                        segments.append(CodeSegment(
                            segment_type='variable',
                            code=sub_code,
                            start_line=sub_start,
                            end_line=sub_end,
                            comment_above=sub_comment_above,
                            inline_comments=sub_inline,
                            name=', '.join(names) if names else None
                        ))
                    elif isinstance(sub_node, ast.Expr):
                        segments.append(CodeSegment(
                            segment_type='expression',
                            code=sub_code,
                            start_line=sub_start,
                            end_line=sub_end,
                            comment_above=sub_comment_above,
                            inline_comments=sub_inline
                        ))
                    else:
                        segments.append(CodeSegment(
                            segment_type='code',
                            code=sub_code,
                            start_line=sub_start,
                            end_line=sub_end,
                            comment_above=sub_comment_above,
                            inline_comments=sub_inline
                        ))
                   
                    for l in range(sub_start, sub_end + 1):
                        processed_lines.add(l)
           
            else:
                # Non-class nodes (top-level functions, variables, etc.)
                comment_above = self._get_comments_above(start_line)
                code = self._get_source_lines(start_line, end_line)
                inline_comments = self._get_inline_comments_in_range(start_line, end_line)
               
                if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                    docstring = ast.get_docstring(node)
                    clean_code = self._remove_docstring_from_function(code) if docstring else code
                    segments.append(CodeSegment(
                        segment_type='function',
                        code=clean_code,
                        start_line=start_line,
                        end_line=end_line,
                        docstring=docstring,
                        comment_above=comment_above,
                        inline_comments=inline_comments,
                        name=node.name
                    ))
                elif isinstance(node, ast.Assign):
                    names = []
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            names.append(target.id)
                    segments.append(CodeSegment(
                        segment_type='variable',
                        code=code,
                        start_line=start_line,
                        end_line=end_line,
                        comment_above=comment_above,
                        inline_comments=inline_comments,
                        name=', '.join(names) if names else None
                    ))
                elif isinstance(node, ast.Expr):
                    segments.append(CodeSegment(
                        segment_type='expression',
                        code=code,
                        start_line=start_line,
                        end_line=end_line,
                        comment_above=comment_above,
                        inline_comments=inline_comments
                    ))
                else:
                    # Generic code block
                    segments.append(CodeSegment(
                        segment_type='code',
                        code=code,
                        start_line=start_line,
                        end_line=end_line,
                        comment_above=comment_above,
                        inline_comments=inline_comments
                    ))
           
                for line in range(start_line, end_line + 1):
                    processed_lines.add(line)
       
        # Check for any unprocessed code between segments
        all_lines = set(range(1, len(self.lines) + 1))
        unprocessed = sorted(all_lines - processed_lines)
       
        # Group consecutive unprocessed lines
        if unprocessed:
            groups = []
            current_group = [unprocessed[0]]
           
            for i in range(1, len(unprocessed)):
                if unprocessed[i] == unprocessed[i-1] + 1:
                    current_group.append(unprocessed[i])
                else:
                    if any(self.lines[l-1].strip() for l in current_group):
                        groups.append(current_group)
                    current_group = [unprocessed[i]]
           
            if any(self.lines[l-1].strip() for l in current_group):
                groups.append(current_group)
           
            for group in groups:
                start_line = group[0]
                end_line = group[-1]
                code = self._get_source_lines(start_line, end_line)
               
                # Skip empty or comment-only blocks
                if not code.strip() or all(line.strip().startswith('#') or line.strip() == ''
                                           for line in code.split('\n')):
                    continue
               
                comment_above = self._get_comments_above(start_line)
                inline_comments = self._get_inline_comments_in_range(start_line, end_line)
               
                segments.append(CodeSegment(
                    segment_type='code',
                    code=code,
                    start_line=start_line,
                    end_line=end_line,
                    comment_above=comment_above,
                    inline_comments=inline_comments
                ))
       
        # Sort segments by start line
        segments.sort(key=lambda x: x.start_line)
       
        return segments

def parse_python_file(file_path: str) -> List[CodeSegment]:
    """
    Parse a Python file and return structured segments.
   
    Args:
        file_path: Path to the Python file
       
    Returns:
        List of CodeSegment objects
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        source_code = f.read()
   
    parser = PythonParser(source_code)
    return parser.parse()

if __name__ == '__main__':
    # Test with a simple example
    test_code = '''
# Importing libraries
import os
import sys
# Configuration constant
SEED = 42
def hello(name):
    """
    Says hello to someone.
    This is a detailed docstring.
    """
    print(f"Hello, {name}!") # Print greeting
    return True
'''
   
    parser = PythonParser(test_code)
    segments = parser.parse()
   
    for seg in segments:
        print(f"\n{'='*50}")
        print(f"Type: {seg.segment_type}")
        print(f"Lines: {seg.start_line}-{seg.end_line}")
        print(f"Name: {seg.name}")
        print(f"Comment above: {seg.comment_above}")
        print(f"Docstring: {seg.docstring[:50] if seg.docstring else None}...")
        print(f"Inline comments: {seg.inline_comments}")
        print(f"Code:\n{seg.code}")