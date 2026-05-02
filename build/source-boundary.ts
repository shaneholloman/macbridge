import { existsSync } from "node:fs";

if (existsSync("tools")) {
  process.stderr.write(
    "tools/ must not exist; put product code in src/ and repo workflow in build/.\n",
  );
  process.exit(1);
}

process.stdout.write("Source boundary check passed.\n");
