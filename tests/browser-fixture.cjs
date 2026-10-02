// Disposable client-list preview with fake peers. Never connects to a VPN or production API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/clients.html'), 'utf8');
const content = template.match(/{{define "page_content"}}([\s\S]*?){{end}}/)[1];
const css = template.match(/{{define "top_css"}}([\s\S]*?){{end}}/)[1];
const scripts = template.match(/{{define "bottom_js"}}([\s\S]*?){{end}}/)[1]
    .replaceAll('{{.basePath}}', '');
const fixtures = [
    { Client: { id: 'fixture-1', name: 'Example gateway', email: 'gateway@example.test',
      public_key: 'fake-public-key-one', telegram_userid: '',
      allocated_ips: ['192.0.2.10/32'], allowed_ips: ['192.0.2.0/24'], subnet_ranges: ['192.0.2.0/24'],
      additional_notes: 'Synthetic fixture', enabled: true, use_server_dns: false,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' }, QRCode: 'fake' },
    { Client: { id: 'fixture-2', name: 'Example laptop', email: 'laptop@example.test',
      public_key: 'fake-public-key-two', telegram_userid: '',
      allocated_ips: ['198.51.100.20/32'], allowed_ips: ['198.51.100.0/24'], subnet_ranges: ['198.51.100.0/24'],
      additional_notes: 'Synthetic fixture', enabled: false, use_server_dns: false,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' }, QRCode: '' },
];
const stub = `<script>
window.toastr = { error: console.warn, success: console.log };
window.updateApplyConfigVisibility = function () {};
jQuery.getJSON = function (url, params, callback) { callback(['192.0.2.0/24','198.51.100.0/24']); };
jQuery.ajax = function (options) {
    if (options.url.endsWith('/api/clients')) options.success(${JSON.stringify(fixtures)});
    else if (options.url.endsWith('/api/clients/online-status')) options.success({ available: true, source: 'preview_snapshot', as_of_unix: Math.floor(Date.now()/1000), online_keys: ['fake-public-key-one'] });
    else if (options.url.endsWith('/status')) options.success('<table><tr class="table-success"><th>1</th><td>Example gateway</td><td>gateway@example.test</td><td>192.0.2.10/32</td><td>fake</td><td>fake-public-key-one</td></tr></table>');
    else if (options.success) options.success({});
};
</script>`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/adminlte.css">${css}
</head><body><main class="container-fluid mt-3"><div class="alert alert-warning">SYNTHETIC TEST FIXTURE — NO REAL PEERS OR VPN ACTIONS</div>
<form id="search-form" class="form-inline mb-3"><input class="form-control" id="search-input" placeholder="Search client" aria-label="Search client">
<select class="form-control ml-2" id="status-selector"><option>All</option></select></form>
${content}</main><script src="/jquery.js"></script><script src="/bootstrap.js"></script>${stub}<script src="/helper.js"></script>${scripts}</body></html>`;
const files = {
    '/jquery.js': ['application/javascript', path.join(root, 'node_modules/jquery/dist/jquery.min.js')],
    '/bootstrap.js': ['application/javascript', path.join(root, 'node_modules/admin-lte/node_modules/bootstrap/dist/js/bootstrap.bundle.min.js')],
    '/helper.js': ['application/javascript', path.join(root, 'custom/js/helper.js')],
    '/adminlte.css': ['text/css', path.join(root, 'node_modules/admin-lte/dist/css/adminlte.min.css')],
};
const port = Number(process.env.PORT || 51822);
http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
    } else if (files[req.url]) {
        const [type, file] = files[req.url];
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
    } else {
        res.writeHead(404); res.end();
    }
}).listen(port, '127.0.0.1', () => console.log(`fixture-ready http://127.0.0.1:${port}/`));
