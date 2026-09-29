/**
 * @file LPML decoder. A port of lpml_decode() from the Ox mudlib's
 * /adm/simul_efun/lpml.lpc, producing plain JavaScript (JSON-compatible)
 * values.
 *
 * Differences from the LPC original forced by the target being JSON:
 * - `true`/`false` decode to booleans rather than 1/0.
 * - `null`, `undefined`, `Infinity`, `NaN` and overflowing literals decode
 *   to `null`.
 * - `MAX_INT`/`MAX_FLOAT` decode to configurable numbers (see
 *   {@link DecodeOptions}).
 *
 * Deliberately stricter than the LPC original:
 * - `"#path"` includes only expand where a token begins, never inside
 *   comments or other strings.
 * - Incomplete numbers (`0x`, `.`, `1e+`) are syntax errors.
 * - With `root`, includes cannot read outside it.
 */

import fs from "node:fs"
import path from "node:path"

/** FluffOS MAX_INT (LONG_MAX). Not exactly representable as a Number. */
export const LPC_MAX_INT = 9223372036854775807

/** FluffOS MAX_FLOAT (DBL_MAX). */
export const LPC_MAX_FLOAT = Number.MAX_VALUE

const MAX_INCLUDE_DEPTH = 64

// `\#` is the include escape; LPC strips it from the whole source instead,
// which comes to the same thing inside strings.
const ESCAPES = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "#": "#"}

/**
 * @typedef {object} DecodeOptions
 * @property {string} [basePath] - Directory used to resolve relative
 *  `"#./path"` includes. Mirrors the LPC `base_path` argument. A native
 *  path, or a mudlib path (e.g. `/adm/etc`) when `root` is set.
 * @property {string} [root] - Mudlib root. When set, include paths are
 *  mudlib paths resolved exactly as the LPC implementation does, and
 *  absolute ones (`"#/adm/etc/x.lpml"`) are read from under this
 *  directory. When unset, include paths are native filesystem paths.
 * @property {boolean} [includes=true] - Whether to process `"#path"`
 *  includes at all.
 * @property {(file: string) => (string|null|undefined)} [readFile] - Custom
 *  include reader, given the resolved path. Return a nullish
 *  value when the file does not exist.
 * @property {number} [maxInt=Number.MAX_SAFE_INTEGER] - Value for `MAX_INT`.
 * @property {number} [maxFloat=Number.MAX_VALUE] - Value for `MAX_FLOAT`.
 */

/** Error thrown for malformed LPML. */
export class LpmlSyntaxError extends SyntaxError {
  /**
   * Creates a syntax error carrying the source position.
   *
   * @param {string} message - Error description.
   * @param {number} line - 1-based line.
   * @param {number} column - 1-based column.
   */
  constructor(message, line, column) {
    super(message)
    this.name = "LpmlSyntaxError"
    this.line = line
    this.column = column
  }
}

/**
 * Trims ASCII whitespace from both ends, like the LPC trim() sefun.
 *
 * @param {string} str - Input.
 * @returns {string} Trimmed string.
 */
const trim = str => str.replace(/^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g, "")

const isIdentStart = ch =>
  (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$"

const isIdentChar = ch => isIdentStart(ch) || (ch >= "0" && ch <= "9")

const hexDigit = ch => {
  if(ch >= "0" && ch <= "9")
    return ch.charCodeAt(0) - 48

  if(ch >= "a" && ch <= "f")
    return ch.charCodeAt(0) - 87

  if(ch >= "A" && ch <= "F")
    return ch.charCodeAt(0) - 55

  return -1
}

/**
 * Resolves an include path relative to a base directory. Absolute paths, or
 * a missing/non-absolute base, are returned unchanged.
 *
 * @param {string} relativePath - Path from the include.
 * @param {string} relativeTo - Base directory.
 * @returns {string} Resolved path.
 */
function resolveRelativePath(relativePath, relativeTo) {
  if(typeof relativePath !== "string" || !relativePath.length ||
     relativePath[0] === "/" ||
     typeof relativeTo !== "string" || !relativeTo.length ||
     relativeTo[0] !== "/")
    return relativePath

  let pathParts = relativePath.split("/").map(trim).filter(p => p.length)
  let toParts = relativeTo.split("/").map(trim).filter(p => p.length)

  if(pathParts[0] === "..") {
    while(pathParts[0] === "..") {
      if(!toParts.length)
        throw new Error(
          `Invalid path relative resolution to '${relativePath}' from '${relativeTo}'`
        )

      pathParts = pathParts.slice(1)
      toParts = toParts.slice(0, -1)
    }

    return `/${toParts.join("/")}/${pathParts.join("/")}`
  }

  if(pathParts[0] === ".")
    pathParts = pathParts.slice(1)

  return `/${toParts.join("/")}/${pathParts.join("/")}`
}

/**
 * @typedef {object} IncludeContext
 * @property {(file: string) => (string|null|undefined)} read - Include reader.
 * @property {(file: string, base: string) => string} resolve - Resolves an
 *  include path against the including file's directory.
 * @property {(file: string) => string} dirname - Directory of a resolved
 *  include, used as the base for its own includes.
 */

/**
 * Builds the include context. With a mudlib `root`, paths are mudlib paths
 * resolved exactly as the LPC implementation does and read from under the
 * root. Without one, they are native filesystem paths, which keeps
 * Windows paths working.
 *
 * @param {DecodeOptions} options - Decode options.
 * @returns {IncludeContext} The context.
 */
function includeContext(options) {
  const {root} = options

  if(root) {
    const realRoot = path.resolve(root)

    return {
      // Like the driver, never read outside the mudlib: a path that climbs
      // above the root is treated as not found.
      read: options.readFile ?? (file => {
        const real = path.join(realRoot, file)
        const rel = path.relative(realRoot, real)

        if(rel.startsWith("..") || path.isAbsolute(rel))
          return null

        return readOrNull(real)
      }),
      resolve: resolveRelativePath,
      dirname: file => {
        const slash = file.lastIndexOf("/")

        return slash !== -1 ? file.slice(0, slash) : ""
      },
    }
  }

  return {
    read: options.readFile ?? readOrNull,
    resolve: (file, base) =>
      base && file && !path.isAbsolute(file) ? path.resolve(base, file) : file,
    dirname: file => path.dirname(file),
  }
}

/**
 * Reads a UTF-8 file, or returns null if it cannot be read.
 *
 * @param {string} file - Path to read.
 * @returns {string|null} Contents.
 */
function readOrNull(file) {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return null
  }
}

/** Recursive-descent LPML parser over a single source string. */
class Parser {
  /**
   * Creates a parser positioned at the start of the text.
   *
   * @param {string} text - LPML source.
   * @param {DecodeOptions} options - Decode options.
   * @param {IncludeContext|null} includes - Include handling, or null to
   *  leave `"#path"` strings alone.
   */
  constructor(text, options, includes) {
    // NUL sentinel marks end of input, as in the LPC implementation.
    this.text = `${text}\0`
    this.pos = 0
    this.line = 1
    this.char = 1
    this.maxInt = options.maxInt ?? Number.MAX_SAFE_INTEGER
    this.maxFloat = options.maxFloat ?? LPC_MAX_FLOAT
    this.includes = includes
    // Spliced-in include regions, innermost last. Each knows where it ends
    // in the text, how deep it is, and the directory its own includes
    // resolve against.
    this.scopes = [{end: Infinity, depth: 0, base: options.basePath}]
    this.missingIncludeAt = -1
  }

  get ch() {
    return this.text[this.pos] ?? "\0"
  }

  peek(offset = 1) {
    return this.text[this.pos + offset] ?? "\0"
  }

  next(n = 1) {
    this.pos += n
    this.char += n
  }

  nextLine() {
    this.pos++
    this.line++
    this.char = 1
  }

  atToken(token) {
    return this.text.startsWith(token, this.pos)
  }

  error(msg, ch) {
    if(ch !== undefined)
      msg = `${msg}, '${ch}'`

    const snippet = this.text.slice(this.pos, this.pos + 21).replace(/\0$/, "")

    throw new LpmlSyntaxError(
      `${msg} @ line ${this.line} char ${this.char}\n'${snippet}'\n`,
      this.line,
      this.char
    )
  }

  skipWhitespaceAndComments() {
    const len = this.text.length

    while(this.pos < len) {
      const ch = this.ch

      if(ch === " " || ch === "\t" || ch === "\r") {
        this.next()
        continue
      }

      if(ch === "\n" || ch === "\f") {
        this.nextLine()
        continue
      }

      if(ch === "/") {
        const nextCh = this.peek()

        if(nextCh === "/") {
          while(this.pos < len && this.ch !== "\n")
            this.next()

          continue
        }

        if(nextCh === "*") {
          this.next(2)

          let found = false

          while(this.pos + 1 < len) {
            if(this.ch === "*" && this.peek() === "/") {
              this.next(2)
              found = true
              break
            }

            if(this.ch === "\n")
              this.nextLine()
            else
              this.next()
          }

          if(!found)
            this.error("Unterminated multi-line comment")

          continue
        }
      }

      if(this.expandInclude())
        continue

      break
    }
  }

  /**
   * If the next token is a `"#path"` string, replaces it in the text with
   * the file's contents. Unlike the LPC implementation, which rewrites the
   * raw source up front, this only fires where a token begins, so `"#`
   * inside comments or other strings is left alone.
   *
   * @returns {boolean} True if an include was spliced in.
   */
  expandInclude() {
    const quote = this.ch

    if(!this.includes || (quote !== "\"" && quote !== "'") ||
       this.peek() !== "#" || this.pos === this.missingIncludeAt)
      return false

    let close = this.pos + 2

    for(; close < this.text.length - 1; close++) {
      if(this.text[close] === "\\")
        close++
      else if(this.text[close] === quote)
        break
    }

    // Unterminated; let the string parser report it.
    if(this.text[close] !== quote)
      return false

    while(this.scopes.at(-1).end <= this.pos)
      this.scopes.pop()

    const scope = this.scopes.at(-1)
    const target = this.text.slice(this.pos + 2, close)
    const file = this.includes.resolve(target, scope.base)
    let content = this.includes.read(file)

    if(content === null || content === undefined) {
      // Not found - parse it as an ordinary string.
      this.missingIncludeAt = this.pos

      return false
    }

    if(scope.depth >= MAX_INCLUDE_DEPTH)
      this.error(`Include depth exceeded ${MAX_INCLUDE_DEPTH} (circular include?)`)

    if(content.endsWith("\n"))
      content = content.slice(0, -1)

    const delta = content.length - (close + 1 - this.pos)

    for(const open of this.scopes)
      open.end += delta

    this.scopes.push({
      end: this.pos + content.length,
      depth: scope.depth + 1,
      base: this.includes.dirname(file),
    })
    this.text =
      this.text.slice(0, this.pos) + content + this.text.slice(close + 1)
    this.missingIncludeAt = -1

    return true
  }

  parseIdentifier() {
    const from = this.pos

    if(!isIdentStart(this.ch))
      this.error("Invalid identifier start")

    this.next()

    while(isIdentChar(this.ch))
      this.next()

    return this.text.slice(from, this.pos)
  }

  parseSpaceyKey() {
    const from = this.pos

    while(this.pos < this.text.length) {
      const ch = this.ch

      if(ch === "\0")
        this.error("Unexpected end of data in spacey key")

      if(ch === ":")
        break

      if(ch === "\n")
        this.nextLine()
      else
        this.next()
    }

    const out = trim(this.text.slice(from, this.pos))

    if(!out.length)
      this.error("Empty spacey key")

    return out
  }

  parseObject() {
    const out = {}

    this.next() // {
    this.skipWhitespaceAndComments()

    if(this.ch === "}") {
      this.next()

      return out
    }

    for(;;) {
      this.skipWhitespaceAndComments()

      let ch = this.ch
      let key

      if(ch === "\0")
        this.error("Unexpected end of data")

      if(ch === "\"" || ch === "'") {
        key = this.parseString(ch)
      } else if(isIdentStart(ch)) {
        const {pos, char, line} = this

        key = this.parseIdentifier()
        this.skipWhitespaceAndComments()

        if(this.ch !== ":") {
          // Not a plain identifier (e.g. contains '-' or interior spaces);
          // rewind and re-read verbatim as a spacey key.
          Object.assign(this, {pos, char, line})
          key = this.parseSpaceyKey()
        }
      } else {
        key = this.parseSpaceyKey()
      }

      this.skipWhitespaceAndComments()
      ch = this.ch

      if(ch !== ":")
        this.error("Expected ':'", ch)

      this.next()
      this.skipWhitespaceAndComments()

      const value = this.parseValue()

      Object.defineProperty(out, key, {
        value, enumerable: true, writable: true, configurable: true,
      })

      this.skipWhitespaceAndComments()
      ch = this.ch

      if(ch === ",") {
        this.next()
        this.skipWhitespaceAndComments()

        if(this.ch === "}") {
          this.next()
          break
        }
      } else if(ch === "}") {
        this.next()
        break
      } else {
        this.error("Expected ',' or '}'", ch)
      }
    }

    return out
  }

  parseArray() {
    const out = []

    this.next() // [
    this.skipWhitespaceAndComments()

    if(this.ch === "]") {
      this.next()

      return out
    }

    for(;;) {
      this.skipWhitespaceAndComments()
      out.push(this.parseValue())
      this.skipWhitespaceAndComments()

      const ch = this.ch

      if(ch === ",") {
        this.next()
        this.skipWhitespaceAndComments()

        if(this.ch === "]") {
          this.next()
          break
        }
      } else if(ch === "]") {
        this.next()
        break
      } else {
        this.error("Expected ',' or ']'", ch)
      }
    }

    return out
  }

  /**
   * Parses a quoted string, folding source newlines and joining adjacent
   * literals ("foo" "bar" -> "foo bar"; no space after a trailing \n).
   *
   * @param {string} quote - The quote character.
   * @returns {string} Decoded string.
   */
  parseString(quote) {
    this.next() // opening quote

    const from = this.pos
    let to = -1
    let escState = false
    let escActive = false
    let hasRealNewlines = false

    while(to === -1) {
      const ch = this.ch

      if(ch === "\0")
        this.error("Unexpected end of data in string")

      if(ch === "\n") {
        hasRealNewlines = true
        this.nextLine()
        continue
      }

      if(ch === "\\") {
        escState = !escState

        if(!escState)
          escActive = true
      } else if(ch === quote) {
        if(escState) {
          escState = false
          escActive = true
        } else {
          to = this.pos
        }
      } else if(escState) {
        escState = false
        escActive = true
      }

      this.next()
    }

    let out = this.text.slice(from, to)

    // Fold source newlines before escape processing so \n escapes survive.
    if(hasRealNewlines && out.includes("\n")) {
      const lines = out.split("\n")

      out = ""

      for(const raw of lines) {
        const line = trim(raw)

        if(!line.length) {
          if(out.length && !out.endsWith("\n"))
            out += "\n"
        } else {
          if(out.length && !out.endsWith("\n") && !out.endsWith(" "))
            out += " "

          out += line
        }
      }

      out = trim(out)
    }

    // Single left-to-right pass: same result as the LPC implementation's
    // sequential replacements, without its placeholder colliding with input.
    // Unknown escapes keep their backslash.
    if(escActive) {
      out = out.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (match, esc) => {
        if(esc.length > 1)
          return String.fromCharCode(parseInt(esc.slice(1), 16))

        if(esc === "\\" || esc === quote || esc === "/")
          return esc

        return ESCAPES[esc] ?? match
      })
    }

    // Adjacent string concatenation.
    this.skipWhitespaceAndComments()

    const ch = this.ch

    if(ch === "\"" || ch === "'") {
      const needsSpace = !out.endsWith("\n")
      const nextStr = this.parseString(ch)

      out = needsSpace ? `${out} ${nextStr}` : out + nextStr
    }

    return out
  }

  parseNumber() {
    let from = this.pos
    let to = -1
    let dot = -1
    let exp = -1
    let negative = false
    let ch = this.ch

    if(ch === "-" || ch === "+") {
      negative = ch === "-"
      this.next()
      ch = this.ch

      if(ch === "M") {
        if(this.atToken("MAX_INT")) {
          this.next(7)

          return negative ? -this.maxInt : this.maxInt
        }

        if(this.atToken("MAX_FLOAT")) {
          this.next(9)

          return negative ? -this.maxFloat : this.maxFloat
        }
      }

      if(ch === "I" && this.atToken("Infinity")) {
        this.next(8)

        return null
      }
    }

    if(ch === "0") {
      const nextCh = this.peek()
      const radix = {x: 16, X: 16, o: 8, O: 8, b: 2, B: 2}[nextCh]

      if(radix) {
        this.next(2)
        from = this.pos

        const valid = radix === 16
          ? c => hexDigit(c) !== -1
          : c => c >= "0" && c < String(radix)

        while(this.pos < this.text.length && valid(this.ch))
          this.next()

        const digits = this.text.slice(from, this.pos)

        // Stricter than LPC, where sscanf() reads an empty `0x` as 0.
        if(!digits.length)
          this.error("Expected digits in number")

        const result = parseInt(digits, radix)

        return negative ? -result : result
      }
    }

    // Stricter than LPC, whose to_int()/to_float() read `.`, `-` or `1e+`
    // as whatever prefix parses: every mantissa and exponent needs a digit.
    let mantissaDigits = 0
    let expDigits = 0

    while(to === -1 && this.pos < this.text.length) {
      ch = this.ch

      if(ch >= "0" && ch <= "9") {
        if(exp === -1)
          mantissaDigits++
        else
          expDigits++

        this.next()
      } else if(ch === "." && dot === -1 && exp === -1) {
        dot = this.pos
        this.next()
      } else if((ch === "e" || ch === "E") && exp === -1 && mantissaDigits) {
        exp = this.pos
        this.next()

        if(this.ch === "+" || this.ch === "-")
          this.next()
      } else {
        to = this.pos
      }
    }

    if(!mantissaDigits || (exp !== -1 && !expDigits))
      this.error("Expected digits in number")

    const result = Number(this.text.slice(from, to === -1 ? this.pos : to))

    // Overflow (1e999) is Infinity, which decodes to null like the keyword.
    return Number.isFinite(result) ? result : null
  }

  parseValue() {
    this.skipWhitespaceAndComments()

    const ch = this.ch

    if(ch === "\0")
      this.error("Unexpected end of data")

    if(ch === "{")
      return this.parseObject()

    if(ch === "[")
      return this.parseArray()

    if(ch === "\"" || ch === "'")
      return this.parseString(ch)

    if(ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9"))
      return this.parseNumber()

    const keywords = [
      ["true", true],
      ["false", false],
      ["null", null],
      ["undefined", null],
      ["Infinity", null],
      ["NaN", null],
      ["MAX_INT", this.maxInt],
      ["MAX_FLOAT", this.maxFloat],
    ]

    for(const [token, value] of keywords) {
      if(this.atToken(token)) {
        this.next(token.length)

        return value
      }
    }

    return this.error("Unexpected character", ch)
  }

  parse() {
    const out = this.parseValue()

    this.skipWhitespaceAndComments()

    if(this.ch !== "\0")
      this.error("Unexpected character after value", this.ch)

    return out
  }
}

/**
 * Deserializes LPML text into a JavaScript value.
 *
 * @param {string} text - LPML source.
 * @param {DecodeOptions} [options] - Decode options.
 * @returns {unknown} The decoded value.
 * @throws {LpmlSyntaxError} On malformed input.
 * @example
 * decode(`{ name: "cave bat", level: [1, 3], }`)
 * // => { name: "cave bat", level: [1, 3] }
 */
export function decode(text, options = {}) {
  if(typeof text !== "string")
    throw new TypeError("decode: text must be a string")

  const includes = options.includes !== false ? includeContext(options) : null

  return new Parser(text, options, includes).parse()
}

/**
 * Reads and decodes an LPML file. Relative includes resolve against the
 * file's directory unless `basePath` is given. When `root` is given, the
 * file is expected to live under it and includes are treated as mudlib
 * paths.
 *
 * @param {string} file - Path to the LPML file.
 * @param {DecodeOptions} [options] - Decode options.
 * @returns {unknown} The decoded value.
 */
export function decodeFile(file, options = {}) {
  const text = fs.readFileSync(file, "utf8")
  const dir = path.dirname(path.resolve(file))
  // With a mudlib root, includes are mudlib paths, so the base must be too.
  const basePath = options.basePath ?? (options.root
    ? `/${path.relative(path.resolve(options.root), dir).split(path.sep).join("/")}`
    : dir)

  return decode(text, {...options, basePath})
}
