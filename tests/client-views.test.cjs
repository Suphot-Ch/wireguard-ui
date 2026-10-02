const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/clients.html'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'custom/js/helper.js'), 'utf8');
const client = (overrides = {}) => ({ Client: {
    id: 'abc-123', name: 'Alice', email: 'alice@example.test',
    public_key: 'public-key', private_key: 'PRIVATE-SHOULD-NOT-RENDER',
    preshared_key: 'PSK-SHOULD-NOT-RENDER', telegram_userid: '',
    allocated_ips: ['10.0.0.2/32'], allowed_ips: ['0.0.0.0/0'],
    subnet_ranges: ['10.0.0.0/24'], additional_notes: 'hello',
    enabled: true, use_server_dns: true,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    ...overrides
}, QRCode: 'qr' });

function setup(data = [client()], preference, statusFailure = false) {
    const page = template.match(/{{define "page_content"}}([\s\S]*?){{end}}/)[1];
    const html = `<form id="search-form"><input id="search-input"><select id="status-selector"><option>All</option></select></form>${page}`;
    const dom = new JSDOM(html, { url: 'https://wireguard.test/clients', runScripts: 'outside-only' });
    const { window } = dom;
    if (preference) window.localStorage.setItem('wireguard-ui-client-view', preference);
    const $ = jquery(window);
    window.$ = window.jQuery = $;
    $.validator = { setDefaults() {} };
    $.fn.validate = function () { return this; };
    window.toastr = { error() {}, success() {} };
    window.updateApplyConfigVisibility = () => {};
    $.getJSON = (url, params, callback) => callback(['10.0.0.0/24']);
    $.ajax = (options) => {
        if (options.url.endsWith('/api/clients')) options.success(data);
        else if (options.url.endsWith('/status')) {
            if (statusFailure) options.error();
            else options.success('<main><table><tbody><tr class="table-success"><th>1</th><td>Alice</td><td>a@test</td><td>10.0.0.2</td><td>endpoint</td><td>public-key</td></tr></tbody></table></main>');
        }
        else if (options.success) options.success({});
    };
    window.eval(helper);
    const scripts = template.match(/{{define "bottom_js"}}([\s\S]*?){{end}}/)[1];
    for (const [, code] of scripts.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        window.eval(code.replaceAll('{{.basePath}}', ''));
    }
    return { window, $, dom };
}

async function ready(window) {
    await new Promise(resolve => window.$(resolve));
    await new Promise(resolve => window.setTimeout(resolve, 0));
}

test('default cards and accessible toggle render compact table with existing client actions', async () => {
    const { window, $, dom } = setup();
    await ready(window);
    assert.equal($('#client-view-list').attr('aria-pressed'), 'true');
    assert.equal($('#client-table').prop('hidden'), true);
    assert.equal($('#client-list > .col-lg-4').length, 1);
    $('#client-view-table').trigger('click');
    assert.equal($('#client-view-table').attr('aria-pressed'), 'true');
    assert.equal($('#client-list').prop('hidden'), true);
    assert.equal($('#client-table').prop('hidden'), false);
    const row = $('#client-table tbody tr');
    assert.equal(row.length, 1);
    for (const value of ['Alice', 'alice@example.test', '10.0.0.2/32', '0.0.0.0/0', 'Enabled']) {
        assert.ok(row.text().includes(value), value);
    }
    assert.equal(row.find('button').length, 1);
    assert.equal(row.find('button').attr('data-target'), '#modal_client_actions');
    assert.equal(row.find('a').length, 0);
    assert.equal(window.localStorage.getItem('wireguard-ui-client-view'), 'table');
    dom.window.close();
});

test('restores a table preference and switches back without losing rows', async () => {
    const { window, $, dom } = setup([client()], 'table');
    await ready(window);
    assert.equal($('#client-view-table').attr('aria-pressed'), 'true');
    assert.equal($('#client-table').prop('hidden'), false);
    $('#client-view-list').trigger('click');
    assert.equal($('#client-list').prop('hidden'), false);
    assert.equal($('#client-table').prop('hidden'), true);
    assert.equal($('#client-list > .col-lg-4').length, 1);
    assert.equal(window.localStorage.getItem('wireguard-ui-client-view'), 'list');
    dom.window.close();
});

test('table escapes untrusted client text and attribute values without exposing secrets', async () => {
    const dangerous = '\"><img src=x onerror=alert(1)>';
    const { window, $, dom } = setup([client({ id: dangerous, name: dangerous,
        email: dangerous, allocated_ips: [dangerous], allowed_ips: [dangerous] })]);
    await ready(window);
    const row = $('#client-table tbody tr');
    assert.equal(row.length, 1);
    assert.equal(row.find('img').length, 0);
    assert.equal($('#client-list img').length, 0);
    assert.equal(row.find('td').first().text(), dangerous);
    assert.equal(row.find('[data-target="#modal_client_actions"]').attr('data-clientname'), dangerous);
    assert.equal(row.attr('data-client-id'), dangerous);
    assert.equal(row.find('a').length, 0);
    assert.ok(!row.text().includes('PRIVATE-SHOULD-NOT-RENDER'));
    assert.ok(!row.text().includes('PSK-SHOULD-NOT-RENDER'));
    dom.window.close();
});

test('search and status/subnet filters show the same matching clients in either view', async () => {
    const { window, $, dom } = setup([client(), client({ id: 'b', name: 'Bob', email: 'bob@test',
        public_key: 'Alice', allocated_ips: ['10.2.2.2/32'], allowed_ips: ['192.168.0.0/16'],
        subnet_ranges: ['10.2.0.0/16'], enabled: false, additional_notes: 'support' })]);
    await ready(window);
    const visible = (selector) => $(selector).filter(function () { return $(this).css('display') !== 'none'; }).length;
    $('#client-view-table').trigger('click');
    $('#search-input').val('10.2.2.2').trigger('keyup');
    assert.equal(visible('#client-table tbody tr'), 1);
    assert.equal(visible('#client-list > .col-lg-4'), 1);
    $('#search-input').val('SUPPORT').trigger('keyup');
    assert.equal(visible('#client-table tbody tr'), 1);
    $('#status-selector').val('Enabled').trigger('change');
    assert.equal(visible('#client-table tbody tr'), 1);
    assert.equal(visible('#client-list > .col-lg-4'), 1);
    $('#status-selector').val('10.0.0.0/24').trigger('change');
    assert.equal(visible('#client-table tbody tr'), 1);
    $('#status-selector').val('Connected').trigger('change');
    assert.equal(visible('#client-table tbody tr'), 1);
    assert.equal($('#client-table tbody tr').filter(function () { return $(this).css('display') !== 'none'; }).attr('data-client-id'), 'abc-123');
    $('#status-selector').val('Disconnected').trigger('change');
    assert.equal(visible('#client-table tbody tr'), 1);
    dom.window.close();
});

test('failed status lookup must not claim clients are disconnected', async () => {
    const { window, $, dom } = setup([client()], 'table', true);
    await ready(window);
    $('#status-selector').val('Disconnected').trigger('change');
    assert.equal($('#client-table tbody tr').filter(function () { return $(this).css('display') !== 'none'; }).length, 0);
    assert.equal($('#client-list > .col-lg-4').filter(function () { return $(this).css('display') !== 'none'; }).length, 0);
    dom.window.close();
});

test('row Actions opens a client-specific modal and forwards Edit after closing', async () => {
    const { window, $, dom } = setup();
    await ready(window);
    const calls = [];
    $.fn.modal = function (action, relatedTarget) {
        calls.push([this.attr('id'), action, relatedTarget && $(relatedTarget).attr('data-clientid')]);
        if (action === 'show' && this.attr('id') === 'modal_client_actions') {
            this.trigger($.Event('show.bs.modal', { relatedTarget }));
        }
        if (action === 'hide') this.trigger('hidden.bs.modal');
        return this;
    };
    const opener = $('#client-table tbody tr button').first();
    $('#modal_client_actions').modal('show', opener[0]);
    assert.match($('#modal_client_actions .modal-title').text(), /Alice/);
    assert.equal($('#client-action-download').attr('href'), 'download?clientid=abc-123');
    assert.equal($('#client-action-disable').prop('hidden'), false);
    assert.equal($('#client-action-enable').prop('hidden'), true);
    assert.equal($('#client-action-telegram').prop('hidden'), true);
    $('#client-action-edit').trigger('click');
    assert.deepEqual(calls.slice(-2), [['modal_client_actions', 'hide', undefined], ['modal_edit_client', 'show', 'abc-123']]);
    dom.window.close();
});

test('new client, disable, enable and delete keep both views synchronized', async () => {
    const { window, $, dom } = setup();
    await ready(window);
    $('#client-view-table').trigger('click');
    window.renderClientList([client({ id: 'new', name: 'New', enabled: false })]);
    assert.equal($('#client-table tbody tr').length, 2);
    const row = $('#client-table tbody tr').last();
    const opener = row.find('[data-target="#modal_client_actions"]');
    assert.equal(opener.attr('data-client-enabled'), 'false');
    $('#paused_new .paused-client').trigger('click');
    assert.equal(row.find('.client-table-status').text(), 'Enabled');
    window.pauseClient('new');
    $.fn.modal = function (action) {
        if (action === 'hide') this.trigger('hidden.bs.modal');
        return this;
    };
    $('#modal_client_actions').trigger($.Event('show.bs.modal', { relatedTarget: opener[0] }));
    assert.equal($('#client-action-enable').prop('hidden'), false);
    assert.equal($('#client-action-disable').prop('hidden'), true);
    $('#client-action-enable').trigger('click');
    assert.equal(row.find('.client-table-status').text(), 'Enabled');
    assert.equal($('#paused_new').css('visibility'), 'hidden');
    window.pauseClient('new');
    assert.equal(row.find('.client-table-status').text(), 'Disabled');
    assert.equal(opener.attr('data-client-enabled'), 'false');
    $('#remove_client_confirm').val('new').trigger('click');
    assert.equal($('#client-table tbody tr[data-client-id="new"]').length, 0);
    assert.equal($('#client_new').length, 0);
    dom.window.close();
});
