#!/usr/bin/env python3
"""
Blueprint Generator CLI

Command-line tool that parses Python source files and generates
JSON blueprints for the VS Code JSON Project Builder extension.

Usage:
    python generator.py <path_to_python_file> [options]
    
Examples:
    python generator.py /path/to/script.py
    python generator.py script.py -o blueprint.json
    python generator.py script.py --typing-speed 25 --voice "en-US-AriaNeural"
"""

import argparse
import json
import os
import sys
from pathlib import Path

from parser import parse_python_file, PythonParser
from blueprint_builder import BlueprintBuilder


def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description='Generate VS Code JSON Project Builder blueprints from Python files.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s script.py
      Parse script.py and output blueprint to stdout

  %(prog)s script.py -o blueprint.json
      Parse script.py and save blueprint to blueprint.json

  %(prog)s script.py --typing-speed 25 --action-delay 1500
      Customize typing speed and pause between actions

  %(prog)s script.py --no-voiceover
      Generate blueprint without voiceover (silent mode)
        '''
    )
    
    parser.add_argument(
        'file',
        type=str,
        help='Path to the Python file to parse'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        help='Output file path for the JSON blueprint (default: stdout)'
    )
    
    parser.add_argument(
        '--typing-speed',
        type=int,
        default=35,
        help='Milliseconds per character when typing (default: 35)'
    )
    
    parser.add_argument(
        '--action-delay',
        type=int,
        default=1000,
        help='Pause between actions in milliseconds (default: 1000)'
    )
    
    parser.add_argument(
        '--voice',
        type=str,
        default='en-US-BrianNeural',
        help='Azure TTS voice for voiceovers (default: en-US-BrianNeural)'
    )
    
    parser.add_argument(
        '--no-voiceover',
        action='store_true',
        help='Disable voiceover narration'
    )
    
    parser.add_argument(
        '--indent',
        type=int,
        default=2,
        help='JSON indentation level (default: 2)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Print parsing details to stderr'
    )
    
    args = parser.parse_args()
    
    # Validate input file
    input_path = Path(args.file)
    
    if not input_path.exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)
    
    if not input_path.suffix == '.py':
        print(f"Warning: File does not have .py extension: {args.file}", file=sys.stderr)
    
    # Read and parse the file
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            source_code = f.read()
    except Exception as e:
        print(f"Error reading file: {e}", file=sys.stderr)
        sys.exit(1)
    
    if args.verbose:
        print(f"Parsing: {input_path}", file=sys.stderr)
    
    # Parse the Python file
    try:
        parser_obj = PythonParser(source_code)
        segments = parser_obj.parse()
    except SyntaxError as e:
        print(f"Syntax error in Python file: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error parsing file: {e}", file=sys.stderr)
        sys.exit(1)
    
    if args.verbose:
        print(f"Found {len(segments)} segments:", file=sys.stderr)
        for seg in segments:
            print(f"  - {seg.segment_type}: lines {seg.start_line}-{seg.end_line}", file=sys.stderr)
            if seg.name:
                print(f"    Name: {seg.name}", file=sys.stderr)
            if seg.comment_above:
                print(f"    Comment: {seg.comment_above[:50]}...", file=sys.stderr)
            if seg.docstring:
                print(f"    Docstring: {seg.docstring[:50]}...", file=sys.stderr)
    
    # Build the blueprint
    filename = input_path.name
    builder = BlueprintBuilder(
        filename=filename,
        typing_speed=args.typing_speed,
        action_delay=args.action_delay,
        voice=args.voice,
        enable_voiceover=not args.no_voiceover
    )
    
    blueprint = builder.build(segments)
    
    # Generate JSON
    blueprint_json = json.dumps(blueprint, indent=args.indent, ensure_ascii=False)
    
    # Output
    if args.output:
        output_path = Path(args.output)
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(blueprint_json)
            if args.verbose:
                print(f"Blueprint saved to: {output_path}", file=sys.stderr)
            else:
                print(f"✅ Blueprint saved to: {output_path}")
        except Exception as e:
            print(f"Error writing output file: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        # Output to stdout
        print(blueprint_json)
    
    # Print summary
    if args.verbose or args.output:
        action_count = len(blueprint['actions'])
        voiceover_count = sum(1 for a in blueprint['actions'] if 'voiceover' in a)
        print(f"\n📊 Summary:", file=sys.stderr)
        print(f"   • Total actions: {action_count}", file=sys.stderr)
        print(f"   • Voiceovers: {voiceover_count}", file=sys.stderr)
        print(f"   • Root folder: {blueprint['rootFolder']}", file=sys.stderr)


if __name__ == '__main__':
    main()
