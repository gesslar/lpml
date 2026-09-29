#!/usr/bin/env node

/**
 * @file Command-line interface: convert between LPML and JSON.
 *
 *   lpml decode [file] [--indent N] [--root DIR]
 *   lpml encode [file] [--width N] [--no-sort]
 *
 * Reads stdin when no file is given (or the file is "-").
 */

import fs from "node:fs"
import {parseArgs} from "node:util"

import {decode, decodeFile, encode} from "./index.js"

const usage = `Usage:
  lpml decode [file] [--indent N] [--root DIR] [--no-includes]
  lpml encode [file] [--width N] [--no-sort]

Converts LPML to JSON (decode) or JSON to LPML (encode).
Reads stdin when no file is given or file is "-".

Options:
  -i, --indent N     JSON indent for decode (default 2, 0 for compact)
  -r, --root DIR     Mudlib root for absolute "#/path" includes
      --no-includes  Do not process "#path" includes
  -w, --width N      Maximum LPML line width for encode (default 79)
      --no-sort      Keep JSON key order instead of sorting
  -h, --help         Show this help
`

const {values, positionals} = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    indent: {type: "string", short: "i", default: "2"},
    root: {type: "string", short: "r"},
    includes: {type: "boolean", default: true},
    width: {type: "string", short: "w", default: "79"},
    sort: {type: "boolean", default: true},
    help: {type: "boolean", short: "h"},
  },
})

const [command, file] = positionals

if(values.help || !["decode", "encode"].includes(command)) {
  process.stdout.write(usage)
  process.exit(values.help ? 0 : 1)
}

const fromStdin = !file || file === "-"
const readInput = () => fs.readFileSync(fromStdin ? 0 : file, "utf8")

try {
  if(command === "decode") {
    const options = {root: values.root, includes: values.includes}
    const result = fromStdin
      ? decode(readInput(), {...options, basePath: values.root ? "/" : process.cwd()})
      : decodeFile(file, options)

    process.stdout.write(`${JSON.stringify(result, null, Number(values.indent))}\n`)
  } else {
    const data = JSON.parse(readInput())

    process.stdout.write(encode(data, {
      width: Number(values.width),
      sortKeys: values.sort,
    }))
  }
} catch(error) {
  process.stderr.write(`lpml ${command}: ${error.message.trimEnd()}\n`)
  process.exit(1)
}
