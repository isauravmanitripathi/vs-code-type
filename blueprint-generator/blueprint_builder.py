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
from typing import List, Dict, Any, Optional
from parser import CodeSegment

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
        # Get the line numbers that have inline comments (relative to segment start)
        # We need to identify which lines have inline comments and strip the # part
       
        cleaned_lines = []
        for line in lines:
            # Check if this line has an inline comment (has # after code)
            if '#' in line:
                # Split on first # that's not in a string
                # Simple approach: split on # and keep only the code part
                code_part = line.split('#')[0]
                # Only strip if there's actual code before the #
                if code_part.strip():
                    cleaned_lines.append(code_part.rstrip())
                else:
                    # This is a comment-only line (starts with #), keep it
                    cleaned_lines.append(line)
            else:
                cleaned_lines.append(line)
       
        return '\n'.join(cleaned_lines)
   
    def _process_imports(self, segment: CodeSegment) -> None:
        """Process import statements."""
        # Write the imports
        self._add_write_text(segment.code + '\n')
       
        # If there's a comment above, highlight and explain
        if segment.comment_above:
            first_line = self._get_first_line(segment.code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above
            )
       
        # Handle inline comments
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_function(self, segment: CodeSegment) -> None:
        """Process function definitions."""
        # Strip inline comments from code - they'll be added via highlight actions later
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        # For functions with docstrings: voiceover DURING typing (no separate highlight)
        # For functions with # comment above: write then highlight
        if segment.docstring:
            # Docstring becomes voiceover while typing - no separate highlight
            self._add_write_text(
                clean_code + '\n',
                highlight=True,
                voiceover=segment.docstring,
                voiceover_timing="during"
            )
        elif segment.comment_above:
            # # comment above - write then highlight the function signature
            self._add_write_text(clean_code + '\n', highlight=True)
            func_sig = self._get_function_signature(clean_code)
            self._add_highlight(
                find_pattern=func_sig,
                voiceover=segment.comment_above,
                voiceover_timing="during"
            )
        else:
            # No voiceover, just write
            self._add_write_text(clean_code + '\n', highlight=True)
       
        # Handle inline comments - highlight specific lines and add comment as voiceover
        # These are typed AFTER the function is fully typed with docstring voiceover
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_class(self, segment: CodeSegment) -> None:
        """Process class definitions."""
        # Strip inline comments from code - they'll be added via highlight actions later
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        # For classes with docstrings: voiceover DURING typing (no separate highlight)
        # For classes with # comment above: write then highlight
        if segment.docstring:
            # Docstring becomes voiceover while typing - no separate highlight
            self._add_write_text(
                clean_code + '\n',
                highlight=True,
                voiceover=segment.docstring,
                voiceover_timing="during"
            )
        elif segment.comment_above:
            # # comment above - write then highlight the class definition
            self._add_write_text(clean_code + '\n', highlight=True)
            first_line = self._get_first_line(clean_code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above,
                voiceover_timing="during"
            )
        else:
            # No voiceover, just write
            self._add_write_text(clean_code + '\n', highlight=True)
       
        # Handle inline comments (# style) - these get highlighted after typing
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_variable(self, segment: CodeSegment) -> None:
        """Process variable assignments."""
        # Strip inline comments from code
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        # Write the variable assignment
        self._add_write_text(clean_code + '\n')
       
        # If there's a comment above, highlight and explain
        if segment.comment_above:
            first_line = self._get_first_line(clean_code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above
            )
       
        # Handle inline comments
        for inline in segment.inline_comments:
            self._add_highlight(
                find_pattern=inline['code'],
                voiceover=inline['text']
            )
   
    def _process_generic_code(self, segment: CodeSegment) -> None:
        """Process generic code blocks."""
        # Strip inline comments from code
        clean_code = self._strip_inline_comments(segment.code, segment.inline_comments)
       
        # Write the code
        self._add_write_text(clean_code + '\n')
       
        # If there's a comment above, highlight and explain
        if segment.comment_above:
            first_line = self._get_first_line(clean_code)
            self._add_highlight(
                find_pattern=first_line,
                voiceover=segment.comment_above
            )
       
        # Handle inline comments - highlight after typing
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
        # Reset actions
        self.actions = []
       
        # Add initial file creation and opening
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
       
        # Track the last line we wrote to preserve spacing
        last_end_line = 0
       
        # Pending voiceover for skipped module docstrings
        pending_voiceover = None
       
        # Process each segment based on its type
        for segment in segments:
            # Add blank lines to preserve original spacing
            if last_end_line > 0:
                gap = segment.start_line - last_end_line - 1
                if gap > 0:
                    self._add_write_text('\n' * gap)
           
            # Special handling for module-level docstrings: skip typing, save as pending voiceover, update last_end_line
            if segment.segment_type == 'expression' and segment.code.strip().startswith('"""') and segment.code.strip().endswith('"""'):
                pending_voiceover = segment.code.strip()[3:-3].strip()
                last_end_line = segment.end_line
                continue
           
            # If there's a pending voiceover and this is a class or function, prepend it to the docstring
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
           
            # Update last end line
            last_end_line = segment.end_line
       
        # Build final blueprint
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

if __name__ == '__main__':
    # Test with parser output
    from parser import PythonParser
   
    test_code = '''
# Importing libraries for data processing
import os
import sys
# Configuration seed for reproducibility
SEED = 42
def hello(name):
    """
    Says hello to someone with a friendly greeting.
    This function demonstrates basic string formatting.
    """
    print(f"Hello, {name}!") # Print the greeting
    return True
# Main execution block
if __name__ == '__main__':
    hello("World")
'''
   
    parser = PythonParser(test_code)
    segments = parser.parse()
   
    builder = BlueprintBuilder(filename='test.py')
    blueprint = builder.build(segments)
   
    print(json.dumps(blueprint, indent=2))
