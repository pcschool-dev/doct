
(function () {
    'use strict';
    const PC = window.PC;
    if (!PC) return;
    const esc = (s) => (PC.esc ? PC.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const ST = { sent: 'ส่งแล้ว', failed: 'ล้มเหลว', skipped: 'ข้าม/ไม่ส่ง', pending: 'รอส่ง' };
    const CH = { tg: '<i class="fa-brands fa-telegram" style="color:#229ed9"></i> Telegram', line: '<i class="fa-brands fa-line" style="color:#06c755"></i> LINE', email: '<i class="fa-solid fa-envelope" style="color:#f59e0b"></i> อีเมล' };
    const CLS = { urgent: 'หนังสือใหม่ (ทันที)', digest: 'สรุปหนังสือใหม่', pending: 'สรุปหนังสือค้าง', due: 'กำหนดส่งงาน', chat: 'ข้อความแชต' };
    const PR = { 1: 'ปกติ', 2: 'ด่วน', 3: 'ด่วนมาก', 4: 'ด่วนที่สุด' };
    const PAGE = 100;
    let F = { days: '7', channel: '', status: '', cls: '', q: '' };
    let R = { rows: [], total: 0, counts: null, keepDays: 60, loading: false };
    let qTimer = null;
    const root = () => document.getElementById('nfh-root');

    function fmtTime(ms) {
        const d = new Date(Number(ms)); if (isNaN(d)) return '-';
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + String(d.getFullYear() + 543).slice(-2) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    async function fetchPage(offset) {
        const d = await PC.api('notifyHistory', { days: Number(F.days), channel: F.channel, status: F.status, cls: F.cls, q: F.q, limit: PAGE, offset: offset });
        return d;
    }
    async function reload() {
        R.loading = true; paintTable();
        try {
            const d = await fetchPage(0);
            R = { rows: d.rows, total: d.total, counts: d.counts, keepDays: d.keepDays, loading: false };
        } catch (e) { R.loading = false; R.error = e.message; }
        paint();
    }
    async function more(btn) {
        if (btn) btn.disabled = true;
        try { const d = await fetchPage(R.rows.length); R.rows = R.rows.concat(d.rows); R.total = d.total; R.counts = d.counts; } catch (e) { R.error = e.message; }
        paint();
    }
    const sel = (id, label, opts, val) => '<label>' + label + '<select id="' + id + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';

    function paintTable() {
        const box = document.getElementById('nfh-table'); if (!box) return;
        if (R.loading && !R.rows.length) { box.innerHTML = PC.skel ? PC.skel.cards(6) : '<div class="nf-h">กำลังโหลด...</div>'; return; }
        if (R.error) { box.innerHTML = '<div class="nf-h" style="color:#b91c1c">โหลดไม่สำเร็จ : ' + esc(R.error) + '</div>'; return; }
        const body = R.rows.map((x) => {
            const who = '<b>' + esc(x.userName || x.userId) + '</b>' + (x.userName ? '<div class="nf-h" style="margin:0">' + esc(x.userId) + '</div>' : '');
            const what = (x.no || x.title) ? (x.no ? '<span class="nf-pill ok" style="background:#e0f2fe;color:#0369a1">' + esc(x.no) + '</span> ' : '') + esc(x.title || '') : '<span class="nf-h" style="margin:0">' + (x.cls === 'pending' || x.cls === 'digest' || x.cls === 'chat' ? esc(x.action || '-') : 'ชั้นความลับ / -') + '</span>';
            return '<tr><td style="white-space:nowrap">' + fmtTime(x.at) + '</td><td>' + who + '</td><td>' + esc(CLS[x.cls] || x.kind || '-') + (x.priority >= 2 ? '<div class="nf-h" style="margin:0">' + esc(PR[x.priority]) + '</div>' : '') + '</td><td style="white-space:nowrap">' + (CH[x.channel] || '<span class="nf-h" style="margin:0">-</span>') + '</td><td><span class="nfh-st ' + esc(x.status) + '">' + esc(ST[x.status] || x.status) + '</span></td><td>' + what + (x.action && x.cls !== 'pending' ? '<div class="nf-h" style="margin:0">' + esc(x.action) + '</div>' : '') + '</td><td class="nf-h" style="margin:0">' + esc(x.err || '') + '</td></tr>';
        }).join('');
        box.innerHTML = '<div class="nf-scroll" style="max-height:62vh"><table class="nf-tbl nfh-tbl"><thead><tr><th>เวลา</th><th>ผู้รับ</th><th>ประเภท</th><th>ช่องทาง</th><th>สถานะ</th><th>เรื่อง</th><th>หมายเหตุ</th></tr></thead><tbody>' + (body || '<tr><td colspan="7" style="color:#94a3b8">ไม่พบรายการตามเงื่อนไข</td></tr>') + '</tbody></table></div>'
            + (R.rows.length < R.total ? '<div style="margin-top:8px"><button type="button" class="nf-tab" data-hact="more">โหลดเพิ่ม (แสดง ' + R.rows.length + ' จาก ' + R.total + ')</button></div>' : '<div class="nf-h" style="margin-top:6px">แสดงครบ ' + R.total + ' รายการ · เก็บประวัติย้อนหลัง ' + R.keepDays + ' วัน</div>');
    }
    function paint() {
        const el = root(); if (!el) return;
        const c = R.counts || { sent: 0, failed: 0, skipped: 0, pending: 0 };
        el.innerHTML = '<div class="nfh-bar">'
            + sel('nfh-days', 'ช่วงเวลา', [['1', '1 วันล่าสุด'], ['7', '7 วันล่าสุด'], ['30', '30 วันล่าสุด'], ['0', 'ทั้งหมดที่เก็บไว้']], F.days)
            + sel('nfh-channel', 'ช่องทาง', [['', 'ทุกช่องทาง'], ['tg', 'Telegram'], ['line', 'LINE'], ['email', 'อีเมล']], F.channel)
            + sel('nfh-status', 'สถานะ', [['', 'ทุกสถานะ'], ['sent', 'ส่งแล้ว'], ['failed', 'ล้มเหลว'], ['skipped', 'ข้าม/ไม่ส่ง'], ['pending', 'รอส่ง']], F.status)
            + sel('nfh-cls', 'ประเภท', [['', 'ทุกประเภท'], ['urgent', 'หนังสือใหม่ (ทันที)'], ['digest', 'สรุปหนังสือใหม่'], ['pending', 'สรุปหนังสือค้าง'], ['due', 'กำหนดส่งงาน'], ['chat', 'ข้อความแชต']], F.cls)
            + '<label>ค้นหา (ผู้รับ / เลขรับ / เรื่อง)<input id="nfh-q" placeholder="พิมพ์คำค้น" value="' + esc(F.q) + '" style="min-width:200px"></label>'
            + '<button type="button" class="nf-tab" data-hact="reload"><i class="fa-solid fa-rotate"></i> โหลดใหม่</button>'
            + '<button type="button" class="nf-tab" data-hact="csv"><i class="fa-solid fa-file-csv"></i> ดาวน์โหลด CSV</button></div>'
            + '<div class="nfh-sum"><span>ทั้งหมด ' + R.total + ' รายการ</span><span style="color:#047857">ส่งแล้ว ' + c.sent + '</span><span style="color:#b91c1c">ล้มเหลว ' + c.failed + '</span><span>ข้าม ' + c.skipped + '</span><span style="color:#b45309">รอส่ง ' + c.pending + '</span></div>'
            + '<div id="nfh-table"></div>';
        paintTable();
    }
    function csv() {
        const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const lines = [['เวลา', 'รหัสผู้รับ', 'ชื่อผู้รับ', 'ประเภท', 'ระดับ', 'ช่องทาง', 'สถานะ', 'เลขรับ', 'เรื่อง', 'ขั้นตอน', 'หมายเหตุ'].map(q).join(',')]
            .concat(R.rows.map((x) => [fmtTime(x.at), x.userId, x.userName, CLS[x.cls] || x.kind, PR[x.priority] || '', x.channel, ST[x.status] || x.status, x.no, x.title, x.action, x.err].map(q).join(',')));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ประวัติการแจ้งเตือน.csv';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function wire() {
        const el = root(); if (!el || el.dataset.wired) return;
        el.dataset.wired = '1';
        el.addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-hact]'); if (!t) return;
            if (t.dataset.hact === 'reload') reload();
            else if (t.dataset.hact === 'more') more(t);
            else if (t.dataset.hact === 'csv') csv();
        });
        el.addEventListener('change', (ev) => {
            const m = { 'nfh-days': 'days', 'nfh-channel': 'channel', 'nfh-status': 'status', 'nfh-cls': 'cls' }[ev.target.id];
            if (m) { F[m] = ev.target.value; reload(); }
        });
        el.addEventListener('input', (ev) => {
            if (ev.target.id !== 'nfh-q') return;
            F.q = ev.target.value; clearTimeout(qTimer);
            qTimer = setTimeout(async () => {   // รอผู้ใช้พิมพ์เสร็จก่อนค้น (ไม่วาดช่องค้นหาใหม่ จะได้ไม่เสียโฟกัส)
                try { const d = await fetchPage(0); R = { rows: d.rows, total: d.total, counts: d.counts, keepDays: d.keepDays, loading: false }; } catch (e) { R.error = e.message; }
                const s = el.querySelector('.nfh-sum'), c = R.counts || {};
                if (s) s.innerHTML = '<span>ทั้งหมด ' + R.total + ' รายการ</span><span style="color:#047857">ส่งแล้ว ' + (c.sent || 0) + '</span><span style="color:#b91c1c">ล้มเหลว ' + (c.failed || 0) + '</span><span>ข้าม ' + (c.skipped || 0) + '</span><span style="color:#b45309">รอส่ง ' + (c.pending || 0) + '</span>';
                paintTable();
            }, 400);
        });
    }
    /** เปิดหน้า (เรียกจาก switchSubTab('settings-history')) */
    PC.renderNotifyHistory = async function () {
        const el = root(); if (!el) return;
        if (PC.user && PC.user.role !== 'ADMIN') { el.innerHTML = '<div class="nf-h">เฉพาะผู้ดูแลระบบ</div>'; return; }
        wire();
        R.error = '';
        paint();
        await reload();
    };
})();
