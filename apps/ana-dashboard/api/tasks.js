// Ana's Dashboard — Notion Task Hub API (Vercel serverless function)
//
// Live read + write-back against the Forward Firm "Task Hub" data source,
// filtered to Owner = Ana. The Notion integration token lives ONLY here as a
// server-side env var; it is never shipped to the browser.
//
// Endpoints (all under /api/tasks):
//   GET                 -> list Ana's tasks (active + done)
//   POST   {fields}     -> create a task (Owner forced to Ana)
//   PATCH  ?id=<pageId> -> update a task's properties
//   DELETE ?id=<pageId> -> archive (soft-delete) a task
//
// Access is gated by APP_PASSCODE (sent by the client as the x-app-key header)
// so the live Task Hub data is not exposed on the open internet.

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || '37f25735-7460-406e-9784-b6d9270a7cd8';
const DEFAULT_OWNER = process.env.OWNER_NAME || 'Ana';
// Valid Owner options from the Task Hub schema. The dashboard defaults to the
// default owner but anyone can switch the filter to view another owner's lane.
const OWNERS = ['Mitch', 'Ana', 'Tia', 'Tax', 'Eng/PM', 'Claude'];
const APP_PASSCODE = process.env.APP_PASSCODE || '';
const NOTION_VERSION = '2025-09-03'; // data_sources API (verified 2026-06)
const NOTION_BASE = 'https://api.notion.com/v1';

async function notion(path, method = 'GET', body) {
  const res = await fetch(NOTION_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(json.message || `Notion API error ${res.status}`);
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  return json;
}

// ── property readers ──
const sel = (p) => (p && p.select ? p.select.name : null);
const msel = (p) => (p && p.multi_select ? p.multi_select.map((o) => o.name) : []);
const ttl = (p) => (p && p.title ? p.title.map((t) => t.plain_text).join('') : '');
const dat = (p) => (p && p.date ? p.date.start : null);
const lnk = (p) => (p && p.url ? p.url : null);

function normalize(page) {
  const pr = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    name: ttl(pr['Task']),
    bucket: sel(pr['Bucket']),
    status: sel(pr['Status']),
    importance: sel(pr['Importance']),
    urgency: sel(pr['Urgency']),
    lane: sel(pr['Lane']),
    level: sel(pr['Level']),
    source: sel(pr['Source']),
    entity: msel(pr['Entity']),
    due: dat(pr['Due']),
    slack: lnk(pr['Slack link']),
    owner: sel(pr['Owner']),
    created: page.created_time,
    edited: page.last_edited_time,
  };
}

// ── property writer (only writes fields present in the body) ──
function buildProps(b) {
  const p = {};
  const setSel = (key, v) => { p[key] = v ? { select: { name: v } } : { select: null }; };
  if (b.name !== undefined) p['Task'] = { title: [{ type: 'text', text: { content: b.name || '' } }] };
  if (b.bucket !== undefined) setSel('Bucket', b.bucket);
  if (b.status !== undefined) setSel('Status', b.status);
  if (b.importance !== undefined) setSel('Importance', b.importance);
  if (b.urgency !== undefined) setSel('Urgency', b.urgency);
  if (b.lane !== undefined) setSel('Lane', b.lane);
  if (b.due !== undefined) p['Due'] = b.due ? { date: { start: b.due } } : { date: null };
  if (b.slack !== undefined) p['Slack link'] = b.slack ? { url: b.slack } : { url: null };
  return p;
}

// Resolve a requested owner to a valid Task Hub option, falling back to the
// default owner if the value is missing or not recognized.
function resolveOwner(value) {
  if (value && OWNERS.includes(value)) return value;
  return DEFAULT_OWNER;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  return await new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!NOTION_TOKEN) {
    res.status(500).json({ error: 'NOTION_TOKEN is not configured on the server.' });
    return;
  }
  // Passcode gate (confidentiality): require x-app-key to match APP_PASSCODE.
  if (APP_PASSCODE) {
    if ((req.headers['x-app-key'] || '') !== APP_PASSCODE) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  } else {
    res.status(500).json({ error: 'APP_PASSCODE is not configured on the server.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const owner = resolveOwner(req.query.owner);
      let tasks = [];
      let cursor;
      do {
        const body = {
          page_size: 100,
          filter: { property: 'Owner', select: { equals: owner } },
        };
        if (cursor) body.start_cursor = cursor;
        const data = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, 'POST', body);
        tasks = tasks.concat((data.results || []).map(normalize));
        cursor = data.has_more ? data.next_cursor : undefined;
      } while (cursor);
      res.status(200).json({ owner, owners: OWNERS, defaultOwner: DEFAULT_OWNER, tasks });
      return;
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const owner = resolveOwner(b.owner || req.query.owner);
      const props = buildProps({ status: 'To do', bucket: 'Today', ...b });
      props['Owner'] = { select: { name: owner } };
      const data = await notion('/pages', 'POST', {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCE_ID },
        properties: props,
      });
      res.status(200).json({ task: normalize(data) });
      return;
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) { res.status(400).json({ error: 'missing id' }); return; }
      const b = await readBody(req);
      const data = await notion(`/pages/${id}`, 'PATCH', { properties: buildProps(b) });
      res.status(200).json({ task: normalize(data) });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) { res.status(400).json({ error: 'missing id' }); return; }
      await notion(`/pages/${id}`, 'PATCH', { archived: true });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, detail: e.detail });
  }
}
