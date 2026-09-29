#!/usr/bin/env node

// Ported from the Ox mudlib's /tests/adm/simul_efun/lpml.*.test.lpc suites.

import assert from "node:assert/strict"
import path from "node:path"
import {describe, it} from "node:test"

import {decode, decodeFile, LpmlSyntaxError} from "../src/index.js"

const fixtures = path.join(import.meta.dirname, "fixtures")

describe("decode scalars", () => {
  it("bare integer", () => assert.equal(decode("42"), 42))
  it("bare string", () => assert.equal(decode("\"hello\""), "hello"))
  it("true", () => assert.equal(decode("true"), true))
  it("false", () => assert.equal(decode("false"), false))
  it("null", () => assert.equal(decode("null"), null))
  it("undefined keyword is null", () => assert.equal(decode("undefined"), null))
  it("surrounding whitespace is ignored", () => assert.equal(decode("   7   "), 7))
  it("rejects non-string input", () => assert.throws(() => decode(undefined), TypeError))
})

describe("decode special values", () => {
  it("Infinity is null", () => assert.equal(decode("Infinity"), null))
  it("-Infinity is null", () => assert.equal(decode("-Infinity"), null))
  it("+Infinity is null", () => assert.equal(decode("+Infinity"), null))
  it("NaN is null", () => assert.equal(decode("NaN"), null))
  it("MAX_INT", () => assert.equal(decode("MAX_INT"), Number.MAX_SAFE_INTEGER))
  it("-MAX_INT", () => assert.equal(decode("-MAX_INT"), -Number.MAX_SAFE_INTEGER))
  it("MAX_FLOAT", () => assert.equal(decode("MAX_FLOAT"), Number.MAX_VALUE))
  it("-MAX_FLOAT", () => assert.equal(decode("-MAX_FLOAT"), -Number.MAX_VALUE))
  it("MAX_INT is configurable", () => assert.equal(decode("[MAX_INT]", {maxInt: 7})[0], 7))
})

describe("decode numbers", () => {
  const cases = [
    ["42", 42], ["+42", 42], ["-42", -42], ["0", 0],
    ["3.14", 3.14], ["-3.14", -3.14], [".5", 0.5], ["5.", 5],
    ["1e3", 1000], ["1.5e2", 150], ["2e-1", 0.2],
    ["0xFF", 255], ["0XFF", 255], ["0xff", 255], ["-0xFF", -255],
    ["0o77", 63], ["0O17", 15], ["-0o17", -15],
    ["0b1010", 10], ["0B11", 3], ["-0b10", -2],
    ["1e999", null], ["-1e999", null],
    ["-.5", -0.5], ["+.5e-1", 0.05], ["1.e2", 100],
  ]

  for(const [text, expected] of cases)
    it(text, () => assert.equal(decode(text), expected))
})

describe("decode strings", () => {
  const cases = [
    ["double-quoted", "\"hello\"", "hello"],
    ["single-quoted", "'hello'", "hello"],
    ["empty", "\"\"", ""],
    ["escaped newline", "\"a\\nb\"", "a\nb"],
    ["escaped tab", "\"a\\tb\"", "a\tb"],
    ["escaped carriage return", "\"a\\rb\"", "a\rb"],
    ["escaped backslash", "\"a\\\\b\"", "a\\b"],
    ["escaped double quote", "\"a\\\"b\"", "a\"b"],
    ["escaped forward slash", "\"a\\/b\"", "a/b"],
    ["escaped single quote", "'it\\'s'", "it's"],
    ["unknown escape kept verbatim", "\"a\\qb\"", "a\\qb"],
    ["escaped backslash before n", "\"a\\\\nb\"", "a\\nb"],
    ["placeholder-like text survives", "\"x\x01BACKSLASH\x01\\\\z\"", "x\x01BACKSLASH\x01\\z"],
    ["surrogate pair escape", "\"\\uD83D\\uDE00\"", "\u{1F600}"],
    ["BMP unicode escape", "\"caf\\u00e9\"", "café"],
    ["ASCII unicode escape", "\"\\u0041\"", "A"],
    ["adjacent strings join with a space", "\"A\" \"B\" \"C\"", "A B C"],
    ["newline-terminated joins without space", "\"a\\n\" \"b\"", "a\nb"],
    ["mixed quote styles concatenate", "\"foo\" 'bar'", "foo bar"],
    ["concatenation across a comment", "\"foo\" /* c */ \"bar\"", "foo bar"],
    ["source newline folds to space", "\"line one\nline two\"", "line one line two"],
    ["indentation trimmed per line", "\"one\n    two\n    three\"", "one two three"],
    ["blank line is paragraph break", "\"para one\n\npara two\"", "para one\npara two"],
  ]

  for(const [name, text, expected] of cases)
    it(name, () => assert.equal(decode(text), expected))
})

describe("decode keys", () => {
  const cases = [
    ["plain identifier", "{ name: 1 }", "name", 1],
    ["digits and underscore", "{ hit_points_2: 5 }", "hit_points_2", 5],
    ["double-quoted", "{ \"name\": 2 }", "name", 2],
    ["single-quoted", "{ 'name': 3 }", "name", 3],
    ["interior spaces", "{ hit points: 100 }", "hit points", 100],
    ["hyphenated", "{ admin-heal: \"x\" }", "admin-heal", "x"],
    ["multi-word", "{ max hit points: 120 }", "max hit points", 120],
    ["UTF-8 letters", "{ café: \"v\" }", "café", "v"],
    ["surrounding whitespace trimmed", "{   spaced key   : 9 }", "spaced key", 9],
    ["digit-leading", "{ 10-15: 1 }", "10-15", 1],
    ["quoted key keeps colon", "{ \"a:b\": 7 }", "a:b", 7],
  ]

  for(const [name, text, key, expected] of cases)
    it(name, () => assert.equal(decode(text)[key], expected))

  it("__proto__ is an ordinary key", () => {
    const r = decode("{ \"__proto__\": 1 }")

    assert.equal(Object.getPrototypeOf(r), Object.prototype)
    assert.deepEqual(Object.keys(r), ["__proto__"])
  })
})

describe("decode structures", () => {
  it("empty object", () => assert.deepEqual(decode("{}"), {}))
  it("flat object", () => assert.deepEqual(decode("{ a: 1, b: 2 }"), {a: 1, b: 2}))
  it("nested object", () => assert.equal(decode("{ a: { b: { c: 1 } } }").a.b.c, 1))
  it("object trailing comma", () => assert.deepEqual(decode("{ a: 1, b: 2, }"), {a: 1, b: 2}))
  it("empty array", () => assert.deepEqual(decode("[]"), []))
  it("array order", () => assert.deepEqual(decode("[1, 2, 3]"), [1, 2, 3]))
  it("array trailing comma", () => assert.deepEqual(decode("[1, 2, 3,]"), [1, 2, 3]))
  it("mixed-type array", () =>
    assert.deepEqual(decode("[\"s\", 42, true, null]"), ["s", 42, true, null]))
  it("nested arrays", () => assert.deepEqual(decode("[[1, 2], [3, 4]]"), [[1, 2], [3, 4]]))
  it("array of objects", () => assert.deepEqual(decode("[{ a: 1 }, { a: 2 }]"), [{a: 1}, {a: 2}]))
  it("leading line comment", () => assert.equal(decode("// header\n{ a: 1 }").a, 1))
  it("inline block comment", () => assert.equal(decode("{ /* c */ a: 1 }").a, 1))
  it("trailing line comment", () => assert.equal(decode("{ a: 1 // note\n}").a, 1))
  it("block comment between entries", () =>
    assert.deepEqual(decode("{ a: 1, /* x\ny */ b: 2 }"), {a: 1, b: 2}))
})

describe("decode malformed input", () => {
  const cases = [
    ["unterminated string", "\"foo"],
    ["unterminated object", "{ a: 1"],
    ["unterminated array", "[1, 2"],
    ["unterminated block comment", "/* unfinished"],
    ["missing colon", "{ a 1 }"],
    ["missing comma", "{ a: 1 b: 2 }"],
    ["empty spacey key", "{ : 1 }"],
    ["trailing garbage", "1 2"],
    ["unexpected character", "@"],
    ...["0x", "-0x", "0o", "0b", ".", "-", "+", "1e", "1e+", ".e5", "[-]"]
      .map(n => [`incomplete number ${n}`, n]),
  ]

  for(const [name, text] of cases)
    it(name, () => assert.throws(() => decode(text), LpmlSyntaxError))

  it("reports line and column", () => {
    assert.throws(() => decode("{\n  a: 1\n  b: 2\n}"), {line: 3, column: 3})
  })
})

describe("decode includes", () => {
  it("include is replaced with parsed file contents", () => {
    const r = decode("{ stats: \"#./lpml_stats.lpml\" }", {basePath: fixtures})

    assert.deepEqual(r.stats, {str: 10, dex: 15, con: 12})
  })

  it("includes are processed recursively", () => {
    const r = decode("{ data: \"#./lpml_outer.lpml\" }", {basePath: fixtures})

    assert.equal(r.data.wrapped.leaf, "value")
  })

  it("missing file keeps the include string verbatim", () => {
    const r = decode("{ x: \"#./does_not_exist.lpml\" }", {basePath: fixtures})

    assert.equal(r.x, "#./does_not_exist.lpml")
  })

  it("\\# yields a literal leading hash", () => {
    assert.equal(decode("{ c: \"\\#FF0000\" }").c, "#FF0000")
  })

  it("includes can be disabled", () => {
    const r = decode("{ x: \"#./lpml_stats.lpml\" }", {basePath: fixtures, includes: false})

    assert.equal(r.x, "#./lpml_stats.lpml")
  })

  it("absolute includes resolve against root", () => {
    const r = decode("{ x: \"#/lpml_stats.lpml\" }", {root: fixtures})

    assert.equal(r.x.dex, 15)
  })

  it("rooted includes cannot climb out of root", () => {
    const root = path.join(fixtures, "rooted")

    // Absolute and ./.. paths reach the reader, which refuses them.
    for(const include of ["#/../lpml_stats.lpml", "#./../lpml_stats.lpml"])
      assert.equal(decode(`"${include}"`, {root, basePath: "/"}), include)

    // A leading .. above the root is rejected by the resolver, as in LPC.
    assert.throws(() => decode("\"#../lpml_stats.lpml\"", {root, basePath: "/"}),
      /Invalid path relative resolution/)

    // A filename that merely starts with two dots is fine.
    assert.deepEqual(decode("\"#/..dotted.lpml\"", {root, basePath: "/"}), {ok: true})

    // Same for a nested include.
    assert.equal(decodeFile(path.join(root, "inside.lpml"), {root}).inner,
      "#./../lpml_stats.lpml")
  })

  it("only whole string values are includes", () => {
    const read = []
    const readFile = f => (read.push(f), "42")
    const r = decode(`{
      // "#/line-comment"
      /* "#/block-comment" */
      a: "say \\"#/mid-string\\"",
      b: '"#/in-single-quotes"',
      "#/key": 1,
      dragon's hoard: "#/real",
    }`, {readFile})

    assert.deepEqual(read, ["/real"])
    assert.deepEqual(r, {
      "a": "say \"#/mid-string\"",
      "b": "\"#/in-single-quotes\"",
      "#/key": 1,
      "dragon's hoard": 42,
    })
  })

  it("\\# mid-string yields a literal hash", () => {
    assert.equal(decode("\"a\\#b\""), "a#b")
  })

  it("commented-out circular include is ignored", () => {
    assert.deepEqual(decode("// \"#/a\"\n[1]", {readFile: () => "\"#/a\""}), [1])
  })

  it("nested includes resolve from their own directory", () => {
    const files = {"/lib/sub/x": "[\"#./leaf\"]", "/lib/sub/leaf": "1", "/lib/y": "2"}
    const read = []
    const readFile = f => (read.push(f), files[f] ?? null)
    const r = decode("[\"#./sub/x\", \"#./y\"]", {root: "/unused", basePath: "/lib", readFile})

    assert.deepEqual(r, [[1], 2])
    assert.deepEqual(read, ["/lib/sub/x", "/lib/sub/leaf", "/lib/y"])
  })

  it("an included file must be a complete value", () => {
    const readFile = f => (f === "/frag" ? "a: 1, b: 2" : null)

    assert.throws(() => decode("{ x: \"#/frag\" }", {readFile}), LpmlSyntaxError)
  })

  it("custom reader", () => {
    const r = decode("[\"#/a\"]", {readFile: f => (f === "/a" ? "42\n" : null)})

    assert.deepEqual(r, [42])
  })

  it("decodeFile resolves relative includes from the file", () => {
    assert.equal(decodeFile(path.join(fixtures, "lpml_outer.lpml")).wrapped.leaf, "value")
  })

  it("decodeFile with root", () => {
    const r = decodeFile(path.join(fixtures, "lpml_outer.lpml"), {root: fixtures})

    assert.equal(r.wrapped.leaf, "value")
  })

  it("circular include errors", () => {
    assert.throws(() => decode("\"#/a\"", {readFile: () => "\"#/a\""}), /include depth/i)
  })
})

describe("decode bat.lpml fixture", () => {
  const r = decodeFile(path.join(fixtures, "bat.lpml"))

  it("scalar fields", () => {
    assert.equal(r.type, "mammal")
    assert.equal(r.name, "cave bat")
    assert.equal(r.race, "mammal")
  })

  it("spacey keys", () => {
    assert.equal(r["weapon name"], "fangs")
    assert.equal(r["weapon type"], "piercing")
    assert.equal(r["loot chance"], 70)
  })

  it("concatenated description", () => {
    assert.match(r.long, /leathery cave bat/)
    assert.match(r.long, /glisten in the gloom\.$/)
  })

  it("arrays", () => {
    assert.deepEqual(r.id, ["cave bat", "bat"])
    assert.deepEqual(r.adj, ["cave", "leathery"])
    assert.deepEqual(r.level, [1, 3])
    assert.equal(r.loot.length, 3)
  })

  it("nested mixed int/float array", () => assert.deepEqual(r.coins.copper, [1, 25]))
})
