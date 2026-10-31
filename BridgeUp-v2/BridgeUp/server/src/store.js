import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const collections = ['requests', 'offers', 'events', 'circles', 'joinedEvents'];
const cleanText = (value, max = 260) => String(value ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const cleanTags = value => Array.isArray(value) ? [...new Set(value.map(x => cleanText(x, 28).toLowerCase()).filter(Boolean))].slice(0, 8) : [];
export function normalizeSnapshot(input, current = {}) {
  const output = {};
  for (const key of collections) {
    const incoming = input?.[key];
    if (incoming === undefined) { output[key] = current[key] ?? []; continue; }
    if (!Array.isArray(incoming) || incoming.length > 250) throw new Error(`${key} must be an array with no more than 250 items`);
    if (key === 'joinedEvents') { output[key] = [...new Set(incoming.map(x => cleanText(x, 80)).filter(Boolean))].slice(0, 250); continue; }
    output[key] = incoming.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Each ${key} item must be an object`);
      const record = {
        id: cleanText(item.id || randomUUID(), 80),
        title: cleanText(item.title, 90),
        description: cleanText(item.description, 320),
        category: cleanText(item.category, 40),
        tags: cleanTags(item.tags),
        location: cleanText(item.location, 90),
        time: cleanText(item.time, 70),
        author: cleanText(item.author || 'Community member', 50),
        status: cleanText(item.status || 'Open', 20)
      };
      if (key === 'requests') record.supporters = Math.max(0, Math.min(9999, Number.parseInt(item.supporters, 10) || 0));
      if (key === 'events') { record.date = cleanText(item.date, 40); record.people = Math.max(0, Math.min(9999, Number.parseInt(item.people, 10) || 0)); record.category = cleanText(item.category, 40); record.color = cleanText(item.color, 20); }
      if (key === 'circles') { record.name = cleanText(item.name, 70); record.members = Math.max(0, Math.min(9999, Number.parseInt(item.members, 10) || 0)); record.joined = Boolean(item.joined); record.icon = cleanText(item.icon, 20); }
      return record;
    });
  }
  return output;
}
export function createStore(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const read = () => {
    try { return normalizeSnapshot(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; return normalizeSnapshot({}); }
  };
  const write = snapshot => {
    const normalized = normalizeSnapshot(snapshot, read());
    const temp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(normalized, null, 2), { mode: 0o600 });
    fs.renameSync(temp, filePath);
    return normalized;
  };
  return { read, write };
}
