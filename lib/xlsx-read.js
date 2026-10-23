'use strict';

/**
 * 极简 XLSX 读取器（零依赖）
 * 支持 .xlsx 的 sharedStrings / inlineStr / 数值 / 布尔，读取第一个工作表
 */

const zlib = require('node:zlib');

function findEOCD(buf) {
  const min = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function unzip(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('不是有效的 xlsx 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else data = Buffer.alloc(0);
    files.set(name, data);

    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

function textOf(xml) {
  const parts = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
  return parts.join('');
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

function colIndex(ref) {
  const letters = String(ref).replace(/\d+/g, '').toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  const rowMatches = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = [...rowMatch[1].matchAll(/<c\b([^>]*)\/?>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)];
    for (const cm of cellMatches) {
      const attrs = cm[1] || cm[3] || '';
      const inner = cm[2] || '';
      const refMatch = attrs.match(/r="([A-Z]+\d+)"/);
      const idx = refMatch ? colIndex(refMatch[1]) : cells.length;
      const type = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
      let value = '';
      if (type === 'inlineStr') {
        value = textOf(inner);
      } else if (type === 's') {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = v !== undefined ? shared[Number(v)] || '' : '';
      } else if (type === 'str') {
        value = decodeXml((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      } else {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = v !== undefined ? decodeXml(v) : '';
      }
      if (value !== '') cells[idx] = String(value).trim();
    }
    if (cells.some((c) => c && String(c).trim())) rows.push(cells.map((c) => (c === undefined ? '' : c)));
    if (rows.length > 20000) break;
  }
  return rows;
}

function readWorkbook(buf) {
  const files = unzip(buf);
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8'));

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wbXml = files.get('xl/workbook.xml')?.toString('utf8');
  const relsXml = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (wbXml && relsXml) {
    const firstSheet = (wbXml.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    if (firstSheet) {
      const relMatch = relsXml.match(new RegExp(`<Relationship[^>]*Id="${firstSheet}"[^>]*Target="([^"]+)"`));
      if (relMatch) {
        const target = relMatch[1].replace(/^\/?xl\//, '').replace(/^\//, '');
        sheetPath = `xl/${target}`;
        if (!files.has(sheetPath)) sheetPath = 'xl/worksheets/sheet1.xml';
      }
    }
  }

  const sheetXml = files.get(sheetPath)?.toString('utf8') || files.get('xl/worksheets/sheet1.xml')?.toString('utf8');
  if (!sheetXml) throw new Error('未找到工作表');
  return parseSheet(sheetXml, shared);
}

module.exports = { readWorkbook };
