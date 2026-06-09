# Helm — Forward Firm Task Hub Dashboard

A single-page dashboard (Ana's original "Helm" design) wired live to the Notion
**⭐ Task Hub**. It reads and writes tasks in real time, filtered by Owner
(defaults to **Ana**, switchable to anyone on the team).

```
apps/ana-dashboard/
├── index.html        # the whole UI (her CSS/feel, re-plumbed to the Task Hub)
├── api/tasks.js      # Vercel serverless function: live read + write-back to Notion
├── package.json
├── .env.example      # required env vars
└── README.md
```

## How it works

- The browser never sees the Notion token. `index.html` calls `/api/tasks`, and
  the serverless function (`api/tasks.js`) talks to Notion using `NOTION_TOKEN`
  held server-side as a Vercel env var.
- Every action in the UI maps to a Notion write:
  | UI action | Notion write |
  |---|---|
  | Check off a task | `Status -> Done` |
  | Status / Importance / Urgency dropdowns | matching `select` property |
  | Due date picker | `Due` date |
  | Rename inline | `Task` title |
  | Bucket / Lane (detail panel) | matching `select` |
  | Add Task | new page (Owner = current view) |
  | Delete | page archived (recoverable from Notion trash) |
- **Owner filter:** the "Viewing" dropdown in the sidebar switches which owner's
  lane is shown. Defaults to Ana. New tasks are created under whoever is being
  viewed.
- **Done** tasks move to the **Records** tab. **EOD Summary** is generated
  locally from the live data (no external AI call), copy-ready for Slack/email.
- **Access:** the dashboard prompts for an access code on first load and sends
  it as a header; the function rejects anything that doesn't match `APP_PASSCODE`.
  This keeps the live Task Hub off the open internet.

## Field mapping (Task Hub -> UI)

| Notion property | Type | Where it shows | Editable |
|---|---|---|---|
| `Task` | title | Task name | yes |
| `Bucket` | select | section grouping + detail | yes |
| `Status` | select | Status column / checkbox | yes |
| `Importance` | select | Importance column | yes |
| `Urgency` | select | Urgency column | yes |
| `Due` | date | Due column + progress bar | yes |
| `Lane` | select | detail panel | yes |
| `Entity` | multi-select | detail panel | read-only |
| `Source` | select | detail panel | read-only |
| `Level` | select | detail panel | read-only |
| `Slack link` | url | detail panel | read-only |
| `Owner` | select | "Viewing" filter | via filter |

## Deploy (Vercel)

1. **Create a Notion integration**
   - https://www.notion.so/profile/integrations -> New integration (internal).
   - Copy the token (`ntn_...`).
   - Open the **⭐ Task Hub** database in Notion -> `•••` -> **Connections** ->
     add your integration so it can read/write the data.

2. **Deploy**
   ```bash
   cd apps/ana-dashboard
   npx vercel            # first run links/creates the project
   npx vercel --prod     # production deploy
   ```

3. **Set environment variables** (Vercel dashboard -> Project -> Settings ->
   Environment Variables, or `npx vercel env add`):
   - `NOTION_TOKEN` — the integration token
   - `APP_PASSCODE` — the access code you'll give Ana
   - `NOTION_DATA_SOURCE_ID` — optional (default baked in)
   - `OWNER_NAME` — optional (default `Ana`)

   Redeploy after setting env vars: `npx vercel --prod`.

4. Open the URL, enter the access code, and it loads Ana's live tasks.

## Notes

- API version pinned to Notion `2025-09-03` (the data-sources API).
- To change buckets/statuses/owners, edit the constants at the top of the
  `<script>` block in `index.html` and the `OWNERS` / mapping in `api/tasks.js`
  to match the Task Hub schema.
