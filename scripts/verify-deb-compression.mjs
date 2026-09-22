#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const AR_MAGIC = Buffer.from('!<arch>\n', 'ascii');
const AR_HEADER_SIZE = 60;
const targetPath = path.resolve(process.argv[2] ?? 'out/make/deb/x64');

function listDebFiles(target) {
  const stats = fs.statSync(target);
  if (stats.isFile()) {
    return [target];
  }

  return fs.readdirSync(target)
    .filter((entry) => entry.endsWith('.deb'))
    .sort()
    .map((entry) => path.join(target, entry));
}

function readArMembers(filePath) {
  const file = fs.openSync(filePath, 'r');
  const fileSize = fs.fstatSync(file).size;

  try {
    const magic = Buffer.alloc(AR_MAGIC.length);
    fs.readSync(file, magic, 0, magic.length, 0);
    if (!magic.equals(AR_MAGIC)) {
      throw new Error('файл не является ar-архивом');
    }

    const members = [];
    let offset = AR_MAGIC.length;

    while (offset + AR_HEADER_SIZE <= fileSize) {
      const header = Buffer.alloc(AR_HEADER_SIZE);
      fs.readSync(file, header, 0, header.length, offset);
      if (header.subarray(58, 60).toString('ascii') !== '`\n') {
        throw new Error(`повреждён заголовок ar по смещению ${offset}`);
      }

      const rawName = header.subarray(0, 16).toString('ascii').trim();
      const name = rawName.endsWith('/') ? rawName.slice(0, -1) : rawName;
      const memberSize = Number.parseInt(
        header.subarray(48, 58).toString('ascii').trim(),
        10,
      );
      if (!Number.isSafeInteger(memberSize) || memberSize < 0) {
        throw new Error(`некорректный размер секции ${name}`);
      }

      members.push(name);
      offset += AR_HEADER_SIZE + memberSize + (memberSize % 2);
    }

    return members;
  } finally {
    fs.closeSync(file);
  }
}

try {
  const debFiles = listDebFiles(targetPath);
  if (debFiles.length === 0) {
    throw new Error(`DEB-файлы не найдены: ${targetPath}`);
  }

  for (const debFile of debFiles) {
    const members = readArMembers(debFile);
    const requiredMembers = ['control.tar.xz', 'data.tar.xz'];
    const missingMembers = requiredMembers.filter((member) => !members.includes(member));
    if (missingMembers.length > 0) {
      throw new Error(
        `${path.basename(debFile)} несовместим с Astra Linux 1.7: `
        + `ожидались ${requiredMembers.join(' и ')}, получены ${members.join(', ')}`,
      );
    }

    console.log(`${path.basename(debFile)}: совместимое XZ-сжатие подтверждено.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
