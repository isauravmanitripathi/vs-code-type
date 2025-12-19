"""
Blueprint Builder Module
Converts parsed Python code segments into JSON blueprints
compatible with the VS Code JSON Project Builder extension.
The builder creates actions for:
- Creating and opening the source file
- Writing code blocks with character-by-character typing
- Highlighting code with voiceover from comments/docstrings
- Handling inline comments as highlight explanations
"""
import json
import os
from typing import List, Dict, Any, Optional, Tuple
from parser import CodeSegment, PythonParser

class BlueprintBuilder:
    """
    Builds JSON blueprints from parsed Python segments.
    """
   
    def __init__(
        self,
        filename: str,
        typing_speed: int = 35,
        action_delay: int = 1000,
        voice: str = "en-US-BrianNeural",
        enable_voiceover: bool = True
    ):
        """
        Initialize the blueprint builder.
       
        Args:
            filename: Name of the Python file (e.g., 'main.py')
            typing_speed: Milliseconds per character when typing
            action_delay: Pause between actions in milliseconds
            voice: Azure TTS voice for voiceovers
            enable_voiceover: Whether to enable voiceover narration
        """
        self.filename = filename
        self.typing_speed = typing_speed
        self.action_delay = action_delay
        self.voice = voice
        self.enable_voiceover = enable_voiceover
        self.actions: List[Dict[str, Any]] = []
       
    def _create_root_folder_name(self) -> str:
        """Generate root folder name from filename."""
        base = os.path.splitext(self.filename)[0]
        return f"{base}-demo"
   
    def _add_action(self, action: Dict[str, Any]) -> None:
        """Add an action to the blueprint."""
        self.actions.append(action)
   
    def _add_write_text(
        self,
        content: str,
        highlight: bool = False,
        voiceover: Optional[str] = None,
        voiceover_timing: str = "after"
    ) -> None:
        """
        Add a writeText action.
       
        Args:
            content: The code to type
            highlight: Whether to highlight after typing
            voiceover: Optional voiceover text
            voiceover_timing: When to play voiceover ('before', 'during', 'after')
        """
        action = {
            "type": "writeText",
            "content": content
        }
       
        if highlight:
            action["highlight"] = True
           
        if voiceover and self.enable_voiceover:
            action["voiceover"] = voiceover
            action["voiceoverTiming"] = voiceover_timing
           
        self._add_action(action)
   
    def _add_highlight(
        self,
        find_pattern: str,
        voiceover: str,
        voiceover_timing: str = "during",
        move_cursor: str = "endOfFile"
    ) -> None:
        """
        Add a highlight action.
       
        Args:
            find_pattern: Pattern to find and highlight
            voiceover: Voiceover text
            voiceover_timing: When to play voiceover
            move_cursor: Where to move cursor after highlight
        """
        if not self.enable_voiceover:
            return
           
        action = {
            "type": "highlight",
            "path": self.filename,
            "find": find_pattern,
            "voiceover": voiceover,
            "voiceoverTiming": voiceover_timing,
            "moveCursor": move_cursor
        }
       
        self._add_action(action)
   
    def _get_first_line(self, code: str) -> str:
        """Get the first non-empty line of code for pattern matching."""
        for line in code.split('\n'):
            stripped = line.strip()
            if stripped and not stripped.startswith('#'):
                return stripped
        return code.split('\n')[0].strip()
   
    def _get_function_signature(self, code: str) -> str:
        """Extract function signature for highlighting."""
        for line in code.split('\n'):
            stripped = line.strip()
            if stripped.startswith('def ') or stripped.startswith('async def '):
                return stripped
        return self._get_first_line(code)
   
    def _strip_inline_comments(self, code: str, inline_comments: list) -> str:
        """
        Remove inline # comments from code for cleaner typing.
        The comments will be added back via highlight actions.
       
        Args:
            code: The code to clean
            inline_comments: List of inline comment dicts with 'line' keys
           
        Returns:
            Code with inline comments stripped
        """
        if not inline_comments:
            return code
           
        lines = code.split('\n')
        cleaned_lines = []
        for line in lines:
            if '#' in line:
                code_part = line.split('#')[0]
                if code_part.strip():
                    cleaned_lines.append(code_part.rstrip())
                else:
                    cleaned_lines.append(line)
            else:
                cleaned_lines.append(line)
       
        return '\n'.join(cleaned_lines)
   
    def _process_imports(self, segment: CodeSegment) -> None:
        """Process import statements."""
        self._add_write_text(segment.code + '\n')
       
        if segment.comment_above:
            first_line = self._get_first_line(segment.code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above
            )
       
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_function(self, segment: CodeSegment) -> None:
        """Process function definitions."""
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        if segment.docstring:
            self._add_write_text(
                clean_code + '\n',
                highlight=True,
                voiceover=segment.docstring,
                voiceover_timing="during"
            )
        elif segment.comment_above:
            self._add_write_text(clean_code + '\n', highlight=True)
            func_sig = self._get_function_signature(clean_code)
            self._add_highlight(
                find_pattern=func_sig,
                voiceover=segment.comment_above,
                voiceover_timing="during"
            )
        else:
            self._add_write_text(clean_code + '\n', highlight=True)
       
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_class(self, segment: CodeSegment) -> None:
        """Process class definitions."""
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        if segment.docstring:
            self._add_write_text(
                clean_code + '\n',
                highlight=True,
                voiceover=segment.docstring,
                voiceover_timing="during"
            )
        elif segment.comment_above:
            self._add_write_text(clean_code + '\n', highlight=True)
            first_line = self._get_first_line(clean_code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above,
                voiceover_timing="during"
            )
        else:
            self._add_write_text(clean_code + '\n', highlight=True)
       
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_variable(self, segment: CodeSegment) -> None:
        """Process variable assignments."""
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        self._add_write_text(clean_code + '\n')
       
        if segment.comment_above:
            first_line = self._get_first_line(clean_code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above
            )
       
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_generic_code(self, segment: CodeSegment) -> None:
        """Process generic code blocks."""
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        self._add_write_text(clean_code + '\n')
       
        if segment.comment_above:
            first_line = self._get_first_line(clean_code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above
            )
       
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def build(self, segments: List[CodeSegment]) -> Dict[str, Any]:
        """
        Build the complete blueprint from segments.
       
        Args:
            segments: List of CodeSegment objects from parser
           
        Returns:
            Complete blueprint dictionary
        """
        self.actions = []
       
        self._add_action({
            "type": "createFile",
            "path": self.filename,
            "voiceover": f"Let's create the {self.filename} file.",
            "voiceoverTiming": "before"
        })
       
        self._add_action({
            "type": "openFile",
            "path": self.filename
        })
       
        last_end_line = 0
       
        pending_voiceover = None
       
        for segment in segments:
            if last_end_line > 0:
                gap = segment.start_line - last_end_line - 1
                if gap > 0:
                    self._add_write_text('\n' * gap)
           
            if segment.segment_type == 'expression' and segment.code.strip().startswith('"""') and segment.code.strip().endswith('"""'):
                pending_voiceover = segment.code.strip()[3:-3].strip()
                last_end_line = segment.end_line
                continue
           
            if pending_voiceover and segment.segment_type in ['class', 'function']:
                if segment.docstring:
                    segment.docstring = pending_voiceover + '\n\n' + segment.docstring
                else:
                    segment.docstring = pending_voiceover
                pending_voiceover = None
           
            if segment.segment_type == 'imports':
                self._process_imports(segment)
            elif segment.segment_type == 'function':
                self._process_function(segment)
            elif segment.segment_type == 'class':
                self._process_class(segment)
            elif segment.segment_type == 'variable':
                self._process_variable(segment)
            else:
                self._process_generic_code(segment)
           
            last_end_line = segment.end_line
       
        blueprint = {
            "rootFolder": self._create_root_folder_name(),
            "globalTypingSpeed": self.typing_speed,
            "actionDelay": self.action_delay,
            "defaultVoice": self.voice,
            "enableVoiceover": self.enable_voiceover,
            "actions": self.actions
        }
       
        return blueprint
   
    def to_json(self, segments: List[CodeSegment], indent: int = 2) -> str:
        """
        Build blueprint and return as JSON string.
       
        Args:
            segments: List of CodeSegment objects
            indent: JSON indentation level
           
        Returns:
            JSON string of the blueprint
        """
        blueprint = self.build(segments)
        return json.dumps(blueprint, indent=indent, ensure_ascii=False)

def build_blueprint(
    segments: List[CodeSegment],
    filename: str,
    typing_speed: int = 35,
    action_delay: int = 1000,
    voice: str = "en-US-BrianNeural",
    enable_voiceover: bool = True
) -> Dict[str, Any]:
    """
    Convenience function to build a blueprint from segments.
   
    Args:
        segments: List of CodeSegment objects from parser
        filename: Name of the Python file
        typing_speed: Milliseconds per character
        action_delay: Pause between actions
        voice: Azure TTS voice
        enable_voiceover: Enable voiceover narration
       
    Returns:
        Blueprint dictionary
    """
    builder = BlueprintBuilder(
        filename=filename,
        typing_speed=typing_speed,
        action_delay=action_delay,
        voice=voice,
        enable_voiceover=enable_voiceover
    )
    return builder.build(segments)

def build_blueprint_from_path(path: str, output_json: str = 'full_project_blueprint.json') -> None:
    """
    Builds a single JSON blueprint from a file or directory path.
    - If path is a .py file, processes it as a single file.
    - If path is a directory, creates the full structure and processes all .py files.
    - Ignores hidden folders and files.
    - Non-.py files are created empty.
    - .py files are created, opened, parsed, and have write/highlight actions added.
    """
    def collect_structure(root_dir: str) -> Tuple[List[str], Dict[str, str]]:
        folders = []
        files = {}
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Ignore hidden folders
            dirnames[:] = [d for d in dirnames if not d.startswith('.')]
            rel_dir = os.path.relpath(dirpath, root_dir)
            if rel_dir != '.' and not rel_dir.startswith('.'):
                folders.append(rel_dir)
            for fname in filenames:
                if not fname.startswith('.'):
                    rel_path = os.path.join(rel_dir, fname) if rel_dir != '.' else fname
                    files[rel_path] = os.path.join(dirpath, fname)
        # Sort folders by depth (parents first)
        folders.sort(key=lambda f: (f.count(os.sep), f))
        return folders, files

    is_file = os.path.isfile(path)
    if is_file:
        if not path.endswith('.py'):
            raise ValueError("Single file must be a .py file.")
        with open(path, 'r', encoding='utf-8') as f:
            source_code = f.read()
        parser = PythonParser(source_code)
        segments = parser.parse()
        filename = os.path.basename(path)
        blueprint = build_blueprint(segments, filename)
    else:
        # Directory
        folders, all_files = collect_structure(path)
        py_files = {rel: abs_p for rel, abs_p in all_files.items() if rel.endswith('.py')}
        non_py_files = {rel: abs_p for rel, abs_p in all_files.items() if not rel.endswith('.py')}

        # Initialize blueprint
        root_name = os.path.basename(os.path.abspath(path)) + '-demo'
        blueprint = {
            "rootFolder": root_name,
            "globalTypingSpeed": 35,
            "actionDelay": 1000,
            "defaultVoice": "en-US-BrianNeural",
            "enableVoiceover": True,
            "actions": []
        }

        # Create folders with voiceover
        for folder in folders:
            blueprint['actions'].append({
                "type": "createFolder",
                "path": folder,
                "voiceover": f"Now we will create a folder {folder}.",
                "voiceoverTiming": "before"
            })

        # Create all files with voiceover
        file_paths = sorted(list(py_files.keys()) + list(non_py_files.keys()))
        for file_path in file_paths:
            blueprint['actions'].append({
                "type": "createFile",
                "path": file_path,
                "voiceover": f"Now we will create a file {file_path}.",
                "voiceoverTiming": "before"
            })

        # Process .py files
        for rel_path, abs_path in sorted(py_files.items()):
            blueprint['actions'].append({
                "type": "openFile",
                "path": rel_path
            })
            with open(abs_path, 'r', encoding='utf-8') as f:
                source_code = f.read()
            parser = PythonParser(source_code)
            segments = parser.parse()
            builder = BlueprintBuilder(filename=rel_path)
            file_blueprint = builder.build(segments)
            # Skip the create/open actions (already done), add the rest
            file_actions = file_blueprint['actions'][2:]
            blueprint['actions'].extend(file_actions)

    # Save
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(blueprint, f, indent=2, ensure_ascii=False)
    print(f"Blueprint saved to {output_json}")

if __name__ == '__main__':
    build_blueprint_from_path('/Users/sauravtripathi/Downloads/Ncert-books/nanochat-master-test', output_json='andrej-kara-nunuchat.json')