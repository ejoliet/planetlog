#!/usr/bin/env node
// planetlog CLI — zero runtime deps, Node >= 20.
import { tail } from "./tail.mjs";
import { log } from "./log.mjs";
import { verify } from "./verify.mjs";

const USAGE = `planetlog — the planetary changelog

Usage:
  planet tail   [--types quake,grb] [--min-mag 5] [--since <ulid>] [--json] [--url <base>]
  planet log    [--types launch] [--limit 100] [--json] [--url <base>]
  planet verify <event.json> [--url <base>]

Base URL: --url flag > PLANETLOG_URL env > https://api.planetlog.dev`;

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
args.url = args.url ?? process.env.PLANETLOG_URL ?? "https://api.planetlog.dev";

try {
  switch (cmd) {
    case "tail":
      await tail(args);
      break;
    case "log":
      await log(args);
      break;
    case "verify":
      await verify(args);
      break;
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(`planet ${cmd}: ${err.message}`);
  process.exit(1);
}
