#!/usr/bin/env node

// Ported from the Ox mudlib's /tests/adm/simul_efun/lpml.encode.test.lpc.
// The core property: decode(encode(x)) deep-equals x, and no line exceeds
// the width when the data allows it.

import assert from "node:assert/strict"
import {describe, it} from "node:test"

import {decode, encode} from "../src/index.js"

const desc =
  "Enables Homestead (help homestead, help holiday), Hallowe'en themed " +
  "items in the J4, Haunted Series battlecards in the shops and " +
  "world drops, pumpkin searching, pumpkin submission at the Gamwich 3000 " +
  "Pumpkin Food Processsor, and pumpkin donations to the STEA."

const longLines = (text, width) => text.split("\n").filter(l => l.length > width)
const roundTrip = (value, options) => decode(encode(value, options))

describe("encode scalars", () => {
  it("int", () => assert.equal(encode(42), "42\n"))
  it("float uses shortest round-trip form", () => assert.equal(encode(0.1), "0.1\n"))
  it("integral number is an int", () => assert.equal(encode(15.0), "15\n"))
  it("large integer has no exponent", () => assert.equal(encode(1e21), "1000000000000000000000\n"))
  it("tiny float round-trips", () => assert.equal(roundTrip(1e-20), 1e-20))
  it("null", () => assert.equal(encode(null), "null\n"))
  it("undefined is null", () => assert.equal(encode(undefined), "null\n"))
  it("booleans", () => assert.equal(encode([true, false]), "[true, false]\n"))
  it("bigint", () => assert.equal(encode(9223372036854775807n), "9223372036854775807\n"))
  it("NaN is null", () => assert.equal(encode(NaN), "null\n"))
  it("Date uses toJSON", () =>
    assert.equal(encode(new Date(0)), "\"1970-01-01T00:00:00.000Z\"\n"))
})

describe("encode keys", () => {
  it("identifier key is bare", () => assert.equal(encode({name: 1}), "{ name: 1 }\n"))
  it("spacey and hyphen keys are bare, sorted", () =>
    assert.equal(encode({"hit points": 2, "10-15": 1}), "{ 10-15: 1, hit points: 2 }\n"))
  it("padded key is quoted", () => assert.equal(encode({"  <=9": 1}), "{ \"  <=9\": 1 }\n"))
  it("path key is quoted", () => assert.equal(encode({"/obj/x": 1}), "{ \"/obj/x\": 1 }\n"))
  it("colon key is quoted", () => assert.equal(encode({"a:b": 1}), "{ \"a:b\": 1 }\n"))
  it("empty key is quoted", () => assert.equal(encode({"": 1}), "{ \"\": 1 }\n"))
  it("sortKeys: false keeps insertion order", () =>
    assert.equal(encode({b: 1, a: 2}, {sortKeys: false}), "{ b: 1, a: 2 }\n"))
})

describe("encode include safety", () => {
  it("leading # survives", () => assert.equal(roundTrip("#ff0000"), "#ff0000"))
  it("quote-hash mid-string survives", () =>
    assert.equal(roundTrip("say \"#1\" it's '#2'"), "say \"#1\" it's '#2'"))
  it("hash key survives", () => assert.deepEqual(roundTrip({"#tag": 1}), {"#tag": 1}))
  it("backslash before hash survives", () => assert.equal(roundTrip("a\\#b"), "a\\#b"))
})

describe("encode wrapping", () => {
  it("long description stays within 79", () =>
    assert.deepEqual(longLines(encode({name: "Homestead", description: desc}), 79), []))

  it("long description round-trips", () => {
    const m = {name: "Homestead", description: desc}

    assert.deepEqual(roundTrip(m), m)
  })

  it("newlines and double spaces round-trip", () => {
    const s = "Usage: thing [opts]\n\nFirst paragraph that goes on and on " +
      "and on well past the width.  Two spaces here.\n Leading space line."

    assert.equal(roundTrip({help: s}).help, s)
  })

  it("narrow width still round-trips", () => {
    assert.deepEqual(roundTrip({description: desc}, 30), {description: desc})
    assert.deepEqual(roundTrip({description: desc}, {width: 30}), {description: desc})
  })
})

describe("encode containers", () => {
  it("small containers stay inline", () =>
    assert.equal(encode({a: [1, 2], b: {}}), "{ a: [1, 2], b: {} }\n"))

  it("overflowing object expands with trailing commas", () => {
    const m = {
      rewards: {
        "  <=9": 75000, "10-15": 150000, "16-20": 300000,
        "21-29": 450000, "30-34": 900000, " >=40": 1500000,
      },
    }
    const out = encode(m)

    assert.deepEqual(longLines(out, 79), [])
    assert.deepEqual(decode(out), m)
    assert.ok(out.includes("    10-15: 150000,\n"))
  })

  it("nested structure round-trips", () => {
    const m = {
      name: "Gesslar",
      tags: ["a", "b", desc],
      stats: {str: 5, dex: 7, nested: {deep: [1.5, 0]}},
    }

    assert.deepEqual(roundTrip(m), m)
  })

  it("circular reference errors", () => {
    const m = {}

    m.self = m
    assert.throws(() => encode(m), /circular reference at \$\.self/)
  })

  it("shared (non-circular) references are fine", () => {
    const shared = [1]

    assert.equal(encode({a: shared, b: shared}), "{ a: [1], b: [1] }\n")
  })

  it("sparse array holes encode as null", () => {
    assert.equal(encode([, 1]), "[null, 1]\n")
  })

  it("function value errors", () => assert.throws(() => encode({fn() {}}), TypeError))
})
