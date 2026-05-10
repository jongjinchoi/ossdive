import { readFile } from "node:fs/promises"

const pkg     = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string }
const version = process.env["PKG_VERSION"] ?? pkg.version

const TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
] as const

type Target = (typeof TARGETS)[number]

const arg = process.argv[2] as Target | undefined
const buildTargets = arg ? TARGETS.filter(t => t === arg) : TARGETS

if (buildTargets.length === 0) {
  console.error(`Unknown target: ${arg}`)
  console.error(`Available: ${TARGETS.join(", ")}`)
  process.exit(1)
}

for (const t of buildTargets) {
  const outfile = `./dist/bin/ossriff-${t}`
  console.log(`Building ${t}…`)

  const result = await Bun.build({
    entrypoints: ["./cli/index.ts"],
    compile: {
      target:  t,
      outfile,
    },
    minify:    true,
    sourcemap: "linked",
    define:    { PKG_VERSION: JSON.stringify(version) },
  })

  if (result.success) {
    console.log(`  ✓ ${outfile}`)
  } else {
    console.error(`  ✗ Failed:`, result.logs)
    process.exit(1)
  }
}

console.log("\nDone.")
