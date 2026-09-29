# @gesslar/lpml

Decode [LPML](https://github.com/gesslar/ox) (LPC Markup Language) to JSON and
encode JSON back to LPML.

LPML is the human-friendly config format used by the Ox mudlib: JSON5-ish with
LPC-flavoured extensions. This package is a faithful JavaScript port of Ox's
`lpml_decode()` / `lpml_encode()` simul_efuns (`/adm/simul_efun/lpml.lpc`), so
files written by either side read identically on the other.

## Install

```sh
npm install @gesslar/lpml
```

## Library

```js
import {decode, decodeFile, encode} from "@gesslar/lpml"

decode(`{
  name: "cave bat",
  weapon name: "fangs",           // spacey keys
  long: "A leathery cave bat"
        "clings to the ceiling.", // adjacent strings join with a space
  level: [1, 3,],                 // trailing commas
  mask: 0xFF,
}`)
// => { name: "cave bat", "weapon name": "fangs",
//      long: "A leathery cave bat clings to the ceiling.",
//      level: [1, 3], mask: 255 }

encode({name: "cave bat", level: [1, 3]})
// => '{ level: [1, 3], name: "cave bat" }\n'
```

### `decode(text, options?)`

| Option     | Default                   | Description                                                        |
| ---------- | ------------------------- | ------------------------------------------------------------------ |
| `basePath` | —                         | Directory for relative `"#./file.lpml"` includes.                  |
| `root`     | —                         | Mudlib root. Include paths become mudlib paths (`"#/adm/etc/x.lpml"` reads `<root>/adm/etc/x.lpml`); without it they are native paths. |
| `includes` | `true`                    | Set `false` to leave `"#path"` strings untouched.                  |
| `readFile` | `fs.readFileSync`         | Custom include reader `(path) => string \| null`.                  |
| `maxInt`   | `Number.MAX_SAFE_INTEGER` | Value of `MAX_INT`.                                                |
| `maxFloat` | `Number.MAX_VALUE`        | Value of `MAX_FLOAT`.                                              |

Throws `LpmlSyntaxError` (with `line` and `column`) on malformed input.

### `decodeFile(file, options?)`

Reads and decodes a file. Relative includes resolve against the file's
directory. With `root`, the file must live under it and includes are treated
as mudlib paths.

### `encode(value, options?)`

| Option     | Default | Description                                            |
| ---------- | ------- | ------------------------------------------------------ |
| `width`    | `79`    | Maximum line length. `encode(value, 60)` also works.    |
| `sortKeys` | `true`  | Sort keys like the LPC encoder; `false` keeps order.    |

Output uses bare keys where safe, trailing commas, expands containers only when
they overflow, and wraps long strings with adjacent-literal concatenation so
the decoded value is unchanged. Throws `TypeError` on circular references and
unrepresentable values (functions, symbols).

## CLI

```sh
lpml decode monster.lpml               # LPML -> JSON (indent 2)
lpml decode -i 0 < monster.lpml        # compact, from stdin
lpml decode -r /mud/ox/lib file.lpml   # resolve "#/abs" includes in the mudlib
lpml encode data.json -w 100           # JSON -> LPML
lpml encode --no-sort < data.json      # keep key order
```

## Differences from the LPC implementation

Most of these follow from JSON's data model; the include, number and `root`
items are deliberate tightenings.

- `true`/`false` decode to booleans (LPC: `1`/`0`) and encode back as
  `true`/`false`.
- `null`, `undefined`, `Infinity` and `NaN` decode to `null`.
- JavaScript has one number type, so `70.0` decodes to `70` and re-encodes as
  an int. LPC code reading the result gets an int where it had a float.
- `MAX_INT` defaults to `Number.MAX_SAFE_INTEGER`, since FluffOS's 64-bit
  `MAX_INT` is not exactly representable as a Number.
- `encode` accepts `BigInt` and writes it exactly, so you can emit 64-bit LPC
  ints. `decode` always returns Numbers, so a BigInt beyond
  `Number.MAX_SAFE_INTEGER` does not survive a JS round trip.
- Sparse array holes encode as `null`, as `JSON.stringify` does.
- A number literal that overflows (`1e999`) decodes to `null`, like `Infinity`.
- Includes only expand where a token begins, so a `"#path"` inside a comment
  or inside another string is left alone (LPC rewrites the raw source, so it
  expands those too).
- Incomplete numbers (`0x`, `.`, `-`, `1e+`) are syntax errors rather than
  decoding to `0`/`1`.
- With `root`, includes can't read outside the root (the driver enforces this
  in the MUD); such an include is left as its string, like a missing file.
- Circular includes fail after 64 levels instead of recursing without limit.

## License

`@gesslar/lpml` is released under the [0BSD](LICENSE.txt).
