#!/usr/bin/env node
// Builds the Chrome Web Store ZIP into dist/.
//
// Only the files Chrome loads at runtime are included. Docs, tests, and
// screenshots stay out, so a README screenshot can never bloat the package a
// reviewer has to look at. No dependencies: the ZIP is written by hand on top
// of node:zlib so this works on Windows, macOS, and Linux alike.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The complete runtime surface. Nothing else ships.
const INCLUDE = ["manifest.json", "src", "rules", "assets/icons"];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function walk(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => walk(join(path, entry.name))),
  );
  return nested.flat();
}

async function collect() {
  const files = [];
  for (const entry of INCLUDE) {
    const absolute = join(root, entry);
    for (const file of await walk(absolute)) {
      files.push({
        name: relative(root, file).split(sep).join("/"),
      });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function directoryEntries(files) {
  const dirs = new Set();
  for (const { name } of files) {
    const parts = name.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/") + "/");
    }
  }
  return [...dirs].sort().map((name) => ({ name, directory: true }));
}

function localHeader(record) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8 names
  header.writeUInt16LE(record.method, 8);
  header.writeUInt16LE(record.time, 10);
  header.writeUInt16LE(record.day, 12);
  header.writeUInt32LE(record.crc, 14);
  header.writeUInt32LE(record.compressed.length, 18);
  header.writeUInt32LE(record.uncompressed.length, 22);
  header.writeUInt16LE(Buffer.byteLength(record.name), 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, Buffer.from(record.name, "utf8")]);
}

function centralHeader(record) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4); // version made by
  header.writeUInt16LE(20, 6); // version needed
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(record.method, 10);
  header.writeUInt16LE(record.time, 12);
  header.writeUInt16LE(record.day, 14);
  header.writeUInt32LE(record.crc, 16);
  header.writeUInt32LE(record.compressed.length, 20);
  header.writeUInt32LE(record.uncompressed.length, 24);
  header.writeUInt16LE(Buffer.byteLength(record.name), 28);
  header.writeUInt16LE(0, 30); // extra
  header.writeUInt16LE(0, 32); // comment
  header.writeUInt16LE(0, 34); // disk
  header.writeUInt16LE(0, 36); // internal attrs
  header.writeUInt32LE(record.directory ? 0x10 : 0x20, 38);
  header.writeUInt32LE(record.offset, 42);
  return Buffer.concat([header, Buffer.from(record.name, "utf8")]);
}

function endOfCentralDirectory(count, size, offset, comment) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(count, 8);
  footer.writeUInt16LE(count, 10);
  footer.writeUInt32LE(size, 12);
  footer.writeUInt32LE(offset, 16);
  footer.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([footer, Buffer.from(comment, "utf8")]);
}

async function main() {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  const files = await collect();
  const entries = [...directoryEntries(files), ...files];

  const chunks = [];
  let offset = 0;

  for (const entry of entries) {
    const absolute = join(root, entry.name);
    const source = entry.directory ? Buffer.alloc(0) : await readFile(absolute);
    const { time, day } = dosDateTime((await stat(absolute)).mtime);
    // Directories are stored; files are always deflated, like `zip -r`.
    const compressed = entry.directory ? source : deflateRawSync(source, { level: 9 });

    const record = {
      ...entry,
      method: entry.directory ? 0 : 8,
      time,
      day,
      crc: crc32(source),
      compressed,
      uncompressed: source,
      offset,
    };

    const header = localHeader(record);
    chunks.push(header, compressed);
    offset += header.length + compressed.length;
    entry.record = record;
  }

  const directory = Buffer.concat(
    entries.map((entry) => centralHeader(entry.record)),
  );
  const directoryOffset = offset;

  let comment = "";
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    comment = `${manifest.name} ${manifest.version} (${commit})`;
  } catch {
    comment = `${manifest.name} ${manifest.version}`;
  }

  chunks.push(directory, endOfCentralDirectory(entries.length, directory.length, directoryOffset, comment));

  const output = join(root, "dist", `open-deepseek-sidebar-${manifest.version}.zip`);
  await mkdir(dirname(output), { recursive: true });
  const archive = Buffer.concat(chunks);
  await writeFile(output, archive);

  console.log(`Packaged ${files.length} files -> ${relative(root, output).split(sep).join("/")}`);
  console.log(`  ${(archive.length / 1024).toFixed(1)} KB, ${comment}`);
}

await main();
