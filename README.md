<div align="center">

# LPML Language Support

> LPML (LPC Markup Language) support for Visual Studio Code ⚡

</div>

Syntax highlighting, validation, formatting, and JSON schema based intellisense / completion for LPML files in Visual Studio Code. Also supports JSON5 files for compatibility.

LPML is a human-friendly data serialization format designed for MUD configuration files. It extends JSON5 with features like file includes, string concatenation, and spacey keys (YAML-style unquoted keys with spaces).

See [LPML-SPEC.md](LPML-SPEC.md) for the complete LPML specification.

## Features

#### Syntax highlighting with correctly colored keys, with your favorite theme support out-of-the-box
![Syntax Highlighting](./assets/highlighting.png)

#### JSON Schema based validation and intellisense
![Overview](./assets/overview.gif)

#### Completely configurable formatting

![Formatting](./assets/formatting.gif)

#### Sorting Command

![Sorting](./assets/sorting.gif)

#### Proper folding for objects, arrays and multiline strings

![Folding](./assets/folding.gif)

</div>

## Extension Settings

- `lpml.schemas`: Associate schemas to LPML files in the current project.
- `lpml.validate.enable`: Enable/disable validation.
- `lpml.format.enable`: Enable/disable formatting.
- `lpml.format.keepLines`: Keep all existing new lines when formatting.
- `lpml.format.trailingCommas`: Control the occurrence of trailing commas in objects and arrays.
- `lpml.format.keyQuotes`: Control the usage of quotes for object keys.
- `lpml.format.stringQuotes`: Control the usage of quotes for string values in objects and arrays.
- `lpml.format.tabSize`: Override the tab size for formatting. If set to `false`, it will use the default tab size of the editor. If set to `true`, it will use <kbd>Tab</kbd> (`\t`) for indentation. If set to a number, it will use that number of spaces for indentation.
- `lpml.format.startIgnoreDirective`: The start of ignore directive for formatting. Default to `lpml-fmt: off`. Only works for `//` line comments.
- `lpml.format.endIgnoreDirective`: The end of ignore directive for formatting. Default to `lpml-fmt: on`. Only works for `//` line comments.
- `lpml.tracing`: Traces the communication between VS Code and the LPML language server.

## Credits

This extension is based on [better-json5](https://github.com/BlueGlassBlock/better-json5) by BlueGlassBlock, which itself is heavily based on the [JSON Language Features](https://github.com/microsoft/vscode/tree/main/extensions/json-language-features) extension by Microsoft.

LPML specification and language design by Gesslar for the Oxidus MUD codebase.

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE.md)