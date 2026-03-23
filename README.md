<div align="center">

# LPML Language Support

> Syntax highlighting for LPML (LPC Markup Language) files in Visual Studio Code

</div>

LPML is a human-friendly data serialization format designed for MUD configuration files. It extends JSON5 with features like spacey keys, file includes, string concatenation, and multiline string folding.

See [LPML-SPEC.md](LPML-SPEC.md) for the complete specification.

## Features

- Syntax highlighting for all LPML features:
  - Spacey keys (`hit points: 100`)
  - String includes (`"#./stats.lpml"`)
  - Single and double quoted strings with escape sequences
  - Numbers: decimal, hex (`0xFF`), octal (`0o77`), binary (`0b1010`)
  - Constants: `true`, `false`, `null`, `undefined`, `Infinity`, `NaN`, `MAX_INT`, `MAX_FLOAT`
  - Single-line and block comments
- Bracket matching and auto-closing
- Comment toggling

![Syntax Highlighting](./assets/highlighting.png)

## Credits

This extension builds on work from [better-json5](https://github.com/BlueGlassBlock/better-json5) by BlueGlassBlock.

LPML specification and language design by Gesslar for the Oxidus MUD codebase.

## License

`lpml` is released into the public domain under the [Unlicense](LICENSE.md).
