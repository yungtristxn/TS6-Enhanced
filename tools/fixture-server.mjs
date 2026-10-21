// CSS-only lab using the installed client's styles. Synthetic streams; no network
// sessions, accounts, client JS or profile data are loaded into the lab browser.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
const project = resolve(import.meta.dirname, '..');
const client = join(process.env.LOCALAPPDATA, 'Programs/TeamSpeak/html/client_ui');
const routes = new Map([
  ['/', [join(project,'tests/fixture.html'),'text/html']],
  ['/layout.css', [join(project,'theme/local.tsix.layout/layout.css'),'text/css']],
  ['/base.css', [join(client,'main.css'),'text/css']],
  ['/base-theme.css', [join(project,'.local/fixture/base-theme.css'),'text/css']]
]);
const server = createServer(async (req,res) => {
  try {
    const path = new URL(req.url,'http://127.0.0.1').pathname;
    let item = routes.get(path);
    if (!item && /^\/[a-f0-9]{16,64}\.(woff2?|svg|png)$/.test(path)) item = [join(client,basename(path)),path.endsWith('svg')?'image/svg+xml':'application/octet-stream'];
    if (!item) {res.writeHead(404).end(); return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'}).end(await readFile(item[0]));
  } catch {res.writeHead(404).end();}
});
server.listen(9989,'127.0.0.1',()=>console.log('Synthetic CSS lab: http://127.0.0.1:9989 (Ctrl+C to stop)'));
