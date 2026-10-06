
    (function () {
        'use strict';

        // ---------------------------------------------------------------
        // 0) ตั้งค่า
        // ---------------------------------------------------------------
        const GAS_URL = 'https:/\/script.google.com/a/macros/pcschool.ac.th/s/AKfycbwREpyTX2QqplH5qg4F1iZU2jOdb0sQwRxkt5yjd3KkNVicP6sEdMCTpjEpXFmNCP0cTg/exec';
        const DEFAULT_AVATAR = 'https:/\/cdn-icons-png.flaticon.com/512/3135/3135715.png';
        const HEAVY_MIN = 1500;            // data URL ยาวเกินนี้ -> เก็บเป็นไฟล์ใน Drive
        const ASSET = '@@asset:';
        const JSONTOK = '@@json:';
        const POLL_MS = 30000;             // ดึงข้อมูลใหม่จากเซิร์ฟเวอร์ทุก 30 วินาที
        const AUTOSAVE_MS = 15000;         // ตรวจการเปลี่ยนแปลงของหนังสือทุก 15 วินาที
        const SNAP_VER = 1;
        const SESSION_KEY = 'pc_session_v1';
        /* [แก้ login] ต้องตรงกับ CONFIG.API_VERSION ใน Code.gs
           ถ้าไม่ตรง = เว็บแอปบนเซิร์ฟเวอร์ยังไม่ได้ Deploy เป็นเวอร์ชันล่าสุด */
        const EXPECTED_API = '2026.10.01.43';
        const CENTRAL = 'ห้องสารบรรณกลาง';
        const SIG_ROLES = ['admin', 'director', 'admingroup', 'subdirectorgroup', 'subgroupadmin', 'assistantgroup', 'assignee', 'assistant', 'subdirector'];
        const ALL_TABS = [
            { id: 'stats', name: 'สถิติหนังสือรับ', icon: 'fa-chart-pie' },       // [v28 ข้อ 5] , [v35 ข้อ 4] แท็บแรก
            { id: 'activities', name: 'งานและกิจกรรม', icon: 'fa-bullhorn' },
            { id: 'usage', name: 'สถิติการใช้งานระบบ (ผู้ดูแลระบบ)', icon: 'fa-chart-line' },   // [v35 ข้อ 6]
            { id: 'alldocs', name: 'ทะเบียนหนังสือรับ', icon: 'fa-folder-open' },
            { id: 'inbox', name: 'กล่องหนังสือเข้า', icon: 'fa-tray-arrow-down' },
            { id: 'calendar', name: 'ปฏิทินงาน', icon: 'fa-calendar-days' },
            { id: 'tasks', name: 'กำหนดงาน', icon: 'fa-list-check' },
            { id: 'mywork', name: 'งานของฉัน', icon: 'fa-clipboard-list' },
            { id: 'admin', name: 'ธุรการกลาง', icon: 'fa-inbox' },
            { id: 'director', name: 'ผอ. / รักษาการ ผอ.', icon: 'fa-crown' },
            { id: 'admingroup', name: 'ธุรการกลุ่มบริหาร', icon: 'fa-inbox' },
            { id: 'subdirectorgroup', name: 'รอง ผอ. กลุ่มบริหาร', icon: 'fa-user-tie' },
            { id: 'subgroupadmin', name: 'ธุรการกลุ่มงาน', icon: 'fa-inbox' },
            { id: 'assistantgroup', name: 'ผู้ช่วยกลุ่มงาน', icon: 'fa-user-tag' },
            { id: 'assignee', name: 'ผู้รับผิดชอบ', icon: 'fa-user-check' }
        ];
        const ROLE_LABEL = { ADMIN: 'ผู้ดูแลระบบ', Director: 'ผอ.', Administrative: 'ธุรการกลาง', SubdirectorGroup: 'รอง ผอ.กลุ่ม', AdminGroup: 'ธุรการกลุ่ม', AssistantGroup: 'ผช.กลุ่ม', Assignee: 'ผู้รับผิดชอบ' };

        const PC = window.PC = {
            version: '1.0.0', url: GAS_URL, token: '', user: null, serverTime: 0,
            store: null, users: [], rooms: null, unreadActivities: 0, remoteTouched: new Set()
        };

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
        const stableStr = (v) => {
            if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : stableStr(x))).join(',') + ']';
            if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
            return JSON.stringify(v === undefined ? null : v);
        };
        const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const jsq = (s) => String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
        const isVisible = (id) => { const el = document.getElementById(id); return !!(el && !el.classList.contains('hidden')); };
        const realRole = () => (PC.user ? PC.user.role : '');
        const clientInfo = (navigator.userAgent || '').replace(/^Mozilla\/5\.0 /, '').substring(0, 110);

        /* ============================================================================
           [ข้อ 6] ข้อมูลอุปกรณ์และ IP สำหรับบันทึกลง System Logs
           หมายเหตุ : Google Apps Script อ่าน IP ของผู้เรียกเองไม่ได้ (ไม่มี API ให้)
                     จึงให้หน้าเว็บถาม public IP หนึ่งครั้งต่อการเปิดเว็บ แล้วแนบไปกับทุกคำขอ
                     ถ้าเครือข่ายบล็อกหรือช้า จะข้ามไปโดยไม่กระทบการใช้งาน (แสดงเป็น "-")
           ============================================================================ */
        function detectDevice() {
            const ua = navigator.userAgent || '';
            if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'แท็บเล็ต';
            if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'มือถือ';
            return 'คอมพิวเตอร์';
        }
        const deviceType = detectDevice();
        PC.device = deviceType;
        PC.ip = '';

        (function resolvePublicIp() {
            try {
                const cached = sessionStorage.getItem('pc_ip');
                if (cached) { PC.ip = cached; return; }
            } catch (e) { /* ข้าม */ }
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 2500);   // ไม่ให้ถ่วงการเข้าระบบ
                fetch('https:/\/api.ipify.org?format=json', { signal: ctrl.signal, cache: 'no-store' })
                    .then(r => r.json())
                    .then(j => {
                        clearTimeout(timer);
                        if (j && j.ip) {
                            PC.ip = String(j.ip).substring(0, 45);
                            try { sessionStorage.setItem('pc_ip', PC.ip); } catch (e) { /* ข้าม */ }
                        }
                    })
                    .catch(() => { clearTimeout(timer); });
            } catch (e) { /* ข้าม */ }
        })();

        // ---------------------------------------------------------------
        // 1) แถบสถานะการบันทึก (มุมขวาล่าง)
        // ---------------------------------------------------------------
        const status = {
            el: null, timer: null,
            show(text, kind, hideMs) {
                if (!this.el) {
                    this.el = document.createElement('div');
                    this.el.id = 'pc-sync-status';
                    this.el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:4000;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.15);display:none;align-items:center;gap:8px;font-family:Sarabun,sans-serif;pointer-events:none;';
                    document.body.appendChild(this.el);
                }
                const colors = { busy: ['#eff6ff', '#1d4ed8', 'fa-solid fa-rotate fa-spin'], ok: ['#ecfdf5', '#047857', 'fa-solid fa-circle-check'], warn: ['#fffbeb', '#b45309', 'fa-solid fa-triangle-exclamation'], error: ['#fef2f2', '#b91c1c', 'fa-solid fa-circle-xmark'] };
                const c = colors[kind] || colors.busy;
                this.el.style.background = c[0];
                this.el.style.color = c[1];
                this.el.style.border = '1px solid ' + c[1] + '33';
                this.el.innerHTML = '<i class="' + c[2] + '"></i><span>' + esc(text) + '</span>';
                this.el.style.display = 'flex';
                clearTimeout(this.timer);
                if (hideMs) this.timer = setTimeout(() => this.hide(), hideMs);
            },
            hide() { if (this.el) this.el.style.display = 'none'; }
        };
        PC.status = status;

        /* [v39] แถบความก้าวหน้า + % ระหว่างโหลดไฟล์จาก Google Drive
           Apps Script ไม่บอกจำนวนไบต์ที่รับแล้ว จึงคิด % จาก "จำนวนไฟล์ที่โหลดเสร็จ ÷ ทั้งหมด"
           และระหว่างรอแต่ละไฟล์ ขยับตามเวลาโดยเทียบกับเวลาที่ใช้จริงของครั้งก่อน ๆ (จำไว้ในเครื่อง) */
        const loadProg = (function () {
            let el = null, depth = 0, total = 0, done = 0, t0 = 0, pct = 0, text = '', timer = null, showT = null, hideT = null, ema = 6000;
            try { const v = Number(localStorage.getItem('pc-dl-ms')); if (v > 500 && v < 120000) ema = v; } catch (e) { /* ข้าม */ }
            function box() {
                if (el) return el;
                el = document.createElement('div');
                el.id = 'pc-dl-prog';
                el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:4001;width:min(330px,calc(100vw - 28px));padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #bfdbfe;box-shadow:0 12px 32px rgba(15,23,42,.22);font-family:Sarabun,sans-serif;display:none;pointer-events:none;';
                el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:#1d4ed8"><i class="fa-solid fa-cloud-arrow-down" data-k="ic"></i><span data-k="tx" style="flex:1;min-width:0"></span><span data-k="pc" style="font-size:16px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums"></span></div>'
                    + '<div style="margin-top:8px;height:9px;border-radius:999px;background:#e2e8f0;overflow:hidden"><div data-k="bar" style="height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#2563eb,#06b6d4);transition:width .25s linear"></div></div>'
                    + '<div data-k="sub" style="margin-top:5px;font-size:11px;color:#64748b"></div>';
                document.body.appendChild(el);
                return el;
            }
            function render() {
                const b = box(), q = (k) => b.querySelector('[data-k="' + k + '"]');
                const p = Math.round(pct);
                q('tx').textContent = text;
                q('pc').textContent = p + '%';
                q('bar').style.width = p + '%';
                q('bar').style.background = p >= 100 ? 'linear-gradient(90deg,#059669,#34d399)' : 'linear-gradient(90deg,#2563eb,#06b6d4)';
                q('ic').className = p >= 100 ? 'fa-solid fa-circle-check' : 'fa-solid fa-cloud-arrow-down fa-fade';
                q('sub').textContent = p >= 100 ? 'โหลดเสร็จแล้ว' : (total > 1 ? 'โหลดแล้ว ' + done + ' จาก ' + total + ' ไฟล์' : 'กำลังรับข้อมูล…');
            }
            function tick() {
                const tau = Math.min(20000, Math.max(1200, ema / 2.3));
                const e = (1 - Math.exp(-(Date.now() - t0) / tau)) * 0.94;
                pct = Math.max(pct, Math.min(99, 100 * (done + (total - done) * e) / Math.max(1, total)));
                if (el && el.style.display !== 'none') render();
            }
            function hide() { clearInterval(timer); clearTimeout(showT); timer = showT = null; if (el) el.style.display = 'none'; }
            return {
                begin(txt, n) {
                    depth++;
                    clearTimeout(hideT);
                    if (depth === 1) { total = 0; done = 0; pct = 0; t0 = Date.now(); if (el) el.style.display = 'none'; }
                    total += Math.max(1, Number(n) || 1);
                    text = txt || text;
                    clearInterval(timer); timer = setInterval(tick, 200);
                    // ไฟล์ที่มีในเครื่องอยู่แล้ว (เสร็จในพริบตา) ไม่ต้องแสดงกล่องให้รบกวน
                    clearTimeout(showT);
                    showT = setTimeout(() => { if (depth > 0) { box().style.display = 'block'; tick(); render(); } }, 250);
                },
                step() { if (depth > 0) { done = Math.min(total, done + 1); tick(); } },
                end(ok) {
                    depth = Math.max(0, depth - 1);
                    if (depth) return;
                    const ms = Date.now() - t0, shown = el && el.style.display !== 'none';
                    clearInterval(timer); clearTimeout(showT); timer = showT = null;
                    if (ok && ms > 400) { ema = ema * 0.6 + ms * 0.4; try { localStorage.setItem('pc-dl-ms', String(Math.round(ema))); } catch (e) { /* ข้าม */ } }
                    if (ok && shown) { done = total; pct = 100; render(); hideT = setTimeout(hide, 600); }
                    else hide();
                },
                state: () => ({ depth: depth, total: total, done: done, pct: pct, ema: ema })
            };
        })();
        PC.loadProg = loadProg;

        /* [ข้อ 13] สะพานไปยัง Progress overlay แบบ % (ประกาศไว้ใน <script> ก้อนล่าง)
           ถ้ายังโหลดไม่ถึง ให้ถอยไปใช้ Swal loading เดิมอัตโนมัติ */
        function prog(title, detail) {
            if (typeof window.showProgress === 'function') { window.showProgress(title, detail); if (typeof window.startFakeProgress === 'function') window.startFakeProgress(); }
            else if (window.Swal) Swal.fire({ title: title, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        }
        function progSet(percent, detail) {
            if (typeof window.updateProgress === 'function') window.updateProgress(percent, detail);
            else if (window.Swal && Swal.isVisible() && detail) Swal.update({ title: detail });
        }
        function progEnd() {
            if (typeof window.hideProgress === 'function') window.hideProgress();
            if (window.Swal && Swal.isVisible() && Swal.isLoading()) Swal.close();
        }
        PC.prog = prog; PC.progSet = progSet; PC.progEnd = progEnd;

        function toast(icon, title) {
            if (window.Swal && !Swal.isVisible()) {
                Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 1800 });
            } else {
                status.show(title, icon === 'success' ? 'ok' : (icon === 'error' ? 'error' : 'warn'), 2500);
            }
        }

        // ---------------------------------------------------------------
        // 2) Fetch API
        // ---------------------------------------------------------------
        /* [v46 ข้อ 6] คำสั่งเขียนข้อมูลทุกครั้งแนบ "รหัสคำขอ" (rid) : ถ้าส่งซ้ำเพราะหมดเวลา/เซิร์ฟเวอร์ไม่ว่าง
           เซิร์ฟเวอร์จะรู้ว่าเป็นคำขอเดิม และคืนผลที่ทำไว้แล้วแทนการทำซ้ำ (ไม่เกิดรายการซ้ำ / เลขรับข้ามเลข / กดถูกใจสลับสองรอบ)
           จึงลองส่งซ้ำได้มากขึ้น (เดิม 2 ครั้ง -> 4 ครั้ง) พร้อมแสดงสถานะให้ผู้ใช้เห็น */
        const WRITE_ACTIONS = new Set(['saveDocs', 'markRead', 'allocReceiveNo', 'releaseReceiveNo', 'uploadAssets', 'saveRoom', 'deleteRoom',
            'saveProfile', 'saveSignature', 'saveAnnouncement', 'deleteAnnouncement', 'updateAssignmentStatus', 'saveComment', 'deleteComment',
            'toggleReaction', 'saveEvent', 'importEvents', 'deleteEvent', 'saveTask', 'deleteTask', 'toggleTask', 'saveSettings', 'setAssetsPublic', 'saveNotifyPrefs', 'chatNotify', 'saveNotifyRules', 'saveNotifyConfig', 'saveNotifyOptions', 'saveNotifyPrefsBulk']);
        const newRid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));
        /* [ต.ค. 2569] ข้อความผิดจากเซิร์ฟเวอร์ที่ไม่ได้ตั้งใจ ("Exception: …", "TypeError …" + ท้าย "[คำสั่ง → ฟังก์ชัน บรรทัด]")
           -> ข้อความที่ผู้ใช้อ่านรู้เรื่อง ; ผู้ดูแลระบบ (ADMIN) ยังเห็นจุดที่เกิดต่อท้ายเพื่อไล่ปัญหา ; ข้อความที่เซิร์ฟเวอร์ตั้งใจเขียน (มี code) ผ่านตามเดิม */
        function pcHumanErr(msg, code) {
            msg = String(msg || '');
            if (!msg) return 'ทำรายการไม่สำเร็จ ลองอีกครั้ง';
            if (code && code !== 'ERROR') return msg;
            const where = (msg.match(/\s\[[^\]]*→[^\]]*\]\s*$/) || [''])[0];
            const raw = msg.slice(0, msg.length - where.length);
            const tech = /^(Exception|TypeError|ReferenceError|RangeError|SyntaxError|Error)\b|Service invoked too many times|Exceeded maximum execution time|Lock timeout|Request failed for|Address unavailable|is not a function|undefined|null/i;
            if (!where && !tech.test(raw)) return msg;
            let human = 'ทำรายการไม่สำเร็จ ลองอีกครั้ง ถ้ายังเป็นอยู่แจ้งผู้ดูแลระบบ';
            if (/too many times|quota|โควตา/i.test(raw)) human = 'วันนี้ระบบใช้บริการของ Google ครบโควตาแล้ว ลองใหม่พรุ่งนี้ หรือแจ้งผู้ดูแลระบบ';
            else if (/maximum execution time|timed? ?out|Lock timeout/i.test(raw)) human = 'ระบบใช้เวลานานเกินไป ลองอีกครั้งในอีกสักครู่';
            else if (/Request failed for|Address unavailable|DNS/i.test(raw)) human = 'เชื่อมต่อบริการภายนอกไม่สำเร็จ ลองอีกครั้งในอีกสักครู่';
            else if (!tech.test(raw)) human = raw;   // ข้อความภาษาคนที่แค่มีท้ายจุดเกิด
            const admin = window.PC && PC.user && PC.user.role === 'ADMIN';
            return admin ? human + ' (' + raw.replace(/^Exception:\s*/, '') + where + ')' : human;
        }
        async function api(action, payload, opt) {
            opt = opt || {};
            const rid = WRITE_ACTIONS.has(action) ? (opt.rid || newRid()) : '';
            const retries = opt.retries === undefined ? (rid ? 4 : 2) : opt.retries;
            let retryShown = false;
            let lastErr = null;
            let reauthed = false;
            for (let attempt = 0; attempt <= retries; attempt++) {
                /* [v44] เปิดแอปจากสำเนาในเครื่องไปก่อน แล้วตรวจบัตรผ่านกับเซิร์ฟเวอร์เบื้องหลัง -> คำสั่งอื่นรอผลตรวจสิทธิ์ก่อนค่อยส่ง */
                if (PC.authPending && !opt.noAuthRedirect) {
                    const okAuth = await Promise.race([PC.authPending, new Promise(r => setTimeout(() => r(false), 90000))]);
                    if (!okAuth || !PC.token) { const e0 = new Error('ยังไม่ได้เข้าสู่ระบบ'); e0.code = 'AUTH'; e0.server = true; throw e0; }
                }
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), opt.timeout || 90000);
                const onStop = () => ctrl.abort();   // [v100] ผู้เรียกยกเลิกได้ (login : ได้คำตอบจากคำขออื่นแล้ว)
                if (opt.signal) { if (opt.signal.aborted) ctrl.abort(); else opt.signal.addEventListener('abort', onStop); }
                try {
                    const body = JSON.stringify({
                        action: action, payload: payload || {}, token: PC.token, client: clientInfo, rid: rid,
                        ip: PC.ip || '', device: PC.device || ''      // [ข้อ 6]
                    });
                    const res = await fetch(PC.url, {
                        method: 'POST', body: body, redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                    });
                    const text = await res.text();
                    let json;
                    try { json = JSON.parse(text); } catch (e) {
                        /* [v100] วัดจริง : ช่วงคนใช้งานพร้อมกัน Google ตอบหน้า HTML 404 ("ไม่สามารถเปิดไฟล์ได้ในขณะนี้") หลังรอคิว 13-57 วิ
                           โดยไม่ได้เข้าโค้ดใน Code.gs เลย = อาการชั่วคราว ลองใหม่ได้ ไม่ใช่การ Deploy ผิด */
                        const busy = res.status === 404 || res.status === 429 || res.status >= 500;
                        /* [ต.ค. 2569] ข้อความถึงผู้ใช้เป็นภาษาคน ; รายละเอียดทางเทคนิคไปที่ console + err.http (loginErrorDetail ใช้ต่อ) */
                        console.error('[api] ' + action + ' HTTP ' + res.status + (busy ? ' (Apps Script ไม่ว่าง)' : ' ตอบไม่ใช่ JSON — ตรวจการ Deploy Web App เป็น "Anyone"'));
                        const err = new Error(busy ? 'ขณะนี้มีผู้ใช้ระบบพร้อมกันมาก ลองอีกครั้งในอีกสักครู่'
                            : 'ระบบตอบกลับผิดรูปแบบ ลองอีกครั้ง ถ้ายังเป็นอยู่แจ้งผู้ดูแลระบบ');
                        err.code = busy ? 'BUSY' : 'BAD_RESPONSE';
                        if (busy) err.http = res.status;
                        throw err;
                    }
                    if (json && json.st) { (PC.stByAction = PC.stByAction || {})[action] = json.st; }   // [v99] เวลาที่ Apps Script ทำงานจริงของคำขอนี้
                    PC.serverApi = (json && json.v) ? String(json.v) : 'old';   // [แก้ login] 'old' = Code.gs ก่อนมีเลขเวอร์ชัน
                    if (!json.ok) {
                        const err = new Error(pcHumanErr(json.error, json.code));
                        if (err.message !== String(json.error || '')) { err.detail = String(json.error || ''); console.error('[api] ' + action + ' : ' + err.detail); }
                        err.code = json.code || 'ERROR';
                        err.server = true;
                        throw err;
                    }
                    if (retryShown) status.hide();
                    if (PC.user && PC.token && !PC.authPending && !opt.noAuthRedirect) markVerified();   // [v45] เซิร์ฟเวอร์ยืนยันบัญชีนี้ล่าสุดเมื่อไร
                    return json.data;
                } catch (e) {
                    if (e.name === 'AbortError') { e = new Error('เชื่อมต่อนานเกินไป เน็ตอาจช้าหรือหลุด ลองอีกครั้ง'); e.code = 'TIMEOUT'; }
                    lastErr = e;
                    if (e.code === 'AUTH' && !opt.noAuthRedirect && !reauthed) {
                        reauthed = true;
                        const okAuth = await reauth();
                        if (!okAuth) throw e;
                        attempt--;
                        continue;
                    }
                    if (e.server && e.code !== 'BUSY') throw e;
                    if (attempt < retries) {
                        if (rid) { retryShown = true; status.show('เซิร์ฟเวอร์ไม่ว่าง กำลังส่งข้อมูลอีกครั้ง (' + (attempt + 1) + '/' + retries + ')...', 'warn'); }   // [v46]
                        await sleep(700 * Math.pow(2, attempt) + Math.random() * 600 * (attempt + 1));   // [v42] สุ่มเวลาเล็กน้อย
                    } else if (retryShown) status.hide();
                } finally {
                    clearTimeout(timer);
                    if (opt.signal) opt.signal.removeEventListener('abort', onStop);
                }
            }
            throw lastErr;
        }
        PC.api = api;

        // คำสั่งบันทึก (ระหว่างบันทึก จะไม่วาดรายการใหม่จากข้อมูลซิงก์ เพื่อไม่ให้รายการที่เพิ่งเพิ่มหายชั่วคราว)
        PC.inflightWrites = 0;
        async function apiWrite(action, payload, opt) {
            PC.inflightWrites++;
            try {
                return await api(action, payload, opt);
            } finally {
                PC.inflightWrites--;
                if (PC.inflightWrites === 0 && PC.needRebuild && PC.store) {
                    PC.needRebuild = false;
                    buildRooms();
                    buildAnnouncements();
                    buildEvents();
                    rerenderAll({ rooms: true, ann: true, events: true });
                }
            }
        }
        function storePut(table, key, data, res) {
            if (!PC.store || !PC.store[table]) return;
            const s0 = res && res.saved && res.saved[0];
            PC.store[table][key] = { d: clone(data), r: s0 ? s0.rev : 0, u: s0 ? s0.updatedAt : Date.now(), c: s0 ? s0.createdAt : Date.now(), x: 0 };
        }
        window.apiPost = function (payload) { return api(payload.action, payload); };
        if (window.Swal && !window.Toast) {
            window.Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1800 });
        }

        async function runPool(items, size, worker) {
            let i = 0;
            const runners = new Array(Math.min(size, items.length)).fill(0).map(async () => {
                while (i < items.length) { const idx = i++; await worker(items[idx], idx); }
            });
            await Promise.all(runners);
        }

        // ---------------------------------------------------------------
        // 3) IndexedDB (แคชข้อมูลในเครื่อง -> เปิดเว็บเร็ว)
        // ---------------------------------------------------------------
        const idb = {
            p: null,
            open() {
                if (this.p) return this.p;
                this.p = new Promise((resolve) => {
                    try {
                        const req = indexedDB.open('pc-doc-cache', 1);
                        req.onupgradeneeded = () => {
                            const db = req.result;
                            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                            if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
                        };
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => resolve(null);
                    } catch (e) { resolve(null); }
                });
                return this.p;
            },
            async run(store, mode, fn) {
                const db = await this.open();
                if (!db) return undefined;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction(store, mode);
                        const req = fn(tx.objectStore(store));
                        tx.oncomplete = () => resolve(req ? req.result : undefined);
                        tx.onerror = () => resolve(undefined);
                        tx.onabort = () => resolve(undefined);
                    } catch (e) { resolve(undefined); }
                });
            },
            get(store, key) { return this.run(store, 'readonly', s => s.get(key)); },
            set(store, key, val) { return this.run(store, 'readwrite', s => s.put(val, key)); },
            del(store, key) { return this.run(store, 'readwrite', s => s.delete(key)); },
            keys(store) { return this.run(store, 'readonly', s => s.getAllKeys()); }
        };
        PC.idb = idb;

        const assetCache = {
            index: null,
            async load() {
                if (this.index) return this.index;
                this.index = (await idb.get('kv', 'assetIndex')) || {};
                return this.index;
            },
            async get(id) {
                const v = await idb.get('assets', id);
                if (v !== undefined) { (await this.load())[id] = Date.now(); this.saveIndexSoon(); }
                return v;
            },
            async put(id, value) {
                if (!id || typeof value !== 'string') return;
                await idb.set('assets', id, value);
                (await this.load())[id] = Date.now();
                this.saveIndexSoon();
            },
            saveIndexSoon() {
                clearTimeout(this.t);
                this.t = setTimeout(async () => {
                    const idx = await this.load();
                    const ids = Object.keys(idx);
                    if (ids.length > 400) {
                        ids.sort((a, b) => idx[a] - idx[b]).slice(0, ids.length - 300).forEach(id => { delete idx[id]; idb.del('assets', id); });
                    }
                    idb.set('kv', 'assetIndex', idx);
                }, 2000);
            }
        };

        // ---------------------------------------------------------------
        // 4) Session / Login / Logout
        // ---------------------------------------------------------------
        function saveSession() {
            try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: PC.token, role: state.user.role, title: state.user.title, uid: PC.user ? PC.user.id : '' }));
            } catch (e) { /* ข้าม */ }
        }
        function loadSession() {
            try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
        }
        function clearSession() {
            try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ข้าม */ }
        }

        // ---------------------------------------------------------------
        // [ข้อ 19] จดจำการเข้าสู่ระบบข้ามการปิด/เปิดเบราว์เซอร์ (refresh token)
        // ---------------------------------------------------------------
        const REMEMBER_KEY = 'pc_remember_v1';
        function saveRemember(userId, rt, rtExp) {
            try {
                if (rt) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ userId: userId, rt: rt, exp: rtExp || 0 }));
            } catch (e) { /* ข้าม */ }
        }
        function loadRemember() {
            try {
                const r = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
                if (!r || !r.userId || !r.rt) return null;
                if (r.exp && Date.now() > r.exp) { clearRemember(); return null; }
                return r;
            } catch (e) { return null; }
        }
        function clearRemember() {
            try { localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* ข้าม */ }
        }
        PC.clearRemember = clearRemember;

        // ---------------------------------------------------------------
        // [v100] ตรวจรหัสผ่านในเครื่อง : เข้าสู่ระบบทันทีบนเครื่องที่เคยเข้าสำเร็จ (ดู localLogin)
        //  เก็บเฉพาะค่าที่แปลงทางเดียว PBKDF2-SHA256 100,000 รอบ + salt สุ่ม (ไม่เก็บรหัสผ่านจริง)
        //  ใช้ได้แค่เปิดสำเนาข้อมูลที่อยู่ในเครื่องนี้อยู่แล้ว ส่วนการคุยกับเซิร์ฟเวอร์ยังต้องรอเซิร์ฟเวอร์ยืนยันรหัสผ่านเสมอ
        // ---------------------------------------------------------------
        /* [ความปลอดภัย ต.ค. 2569] กติการหัสผ่านเดียวกับเซิร์ฟเวอร์ (pwRuleError_) : ตรวจก่อนส่ง ให้รู้ทันทีว่าต้องแก้อะไร (เซิร์ฟเวอร์ตรวจซ้ำเสมอ) */
        window.pcPwRule = function (pw, uid) {
            const v = String(pw || '');
            if (v.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว (ที่กรอกมา ' + v.length + ' ตัว)';
            if (v.length > 72) return 'รหัสผ่านยาวได้ไม่เกิน 72 ตัว';
            if (/^(.)\1+$/.test(v)) return 'รหัสผ่านต้องไม่เป็นตัวเดิมซ้ำกันทั้งหมด';
            if (/^\d+$/.test(v)) return 'รหัสผ่านต้องมีตัวอักษรผสมด้วย ไม่ใช่ตัวเลขล้วน';
            if (uid && v.toLowerCase() === String(uid).toLowerCase()) return 'รหัสผ่านต้องไม่ซ้ำกับรหัสผู้ใช้งาน';
            return null;
        };
        const LOCAL_PW_KEY = 'pc_lpw_v1';
        const LOCAL_PW_ITER = 100000;
        const LOCAL_PW_MAX_AGE = 30 * 86400000;   // ไม่ได้เข้าสำเร็จกับเซิร์ฟเวอร์เกิน 30 วัน -> ต้องรอเซิร์ฟเวอร์ตรวจก่อน
        const b64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
        async function pwDigest(pass, saltB64, iter) {
            const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
            const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
            return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, key, 256));
        }
        function localPwAll() { try { return JSON.parse(localStorage.getItem(LOCAL_PW_KEY) || '{}') || {}; } catch (e) { return {}; } }
        function localPwUid(id) { const r = localPwAll()[String(id || '').trim().toLowerCase()]; return r && r.uid ? String(r.uid) : ''; }
        async function saveLocalPw(uid, pass) {
            if (!uid || !pass || !window.crypto || !crypto.subtle) return;
            try {
                const s = b64(crypto.getRandomValues(new Uint8Array(16)));
                const h = await pwDigest(pass, s, LOCAL_PW_ITER);
                const all = localPwAll();
                all[String(uid).toLowerCase()] = { uid: String(uid), s: s, i: LOCAL_PW_ITER, h: h, at: Date.now() };
                const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
                keys.slice(8).forEach(k => delete all[k]);                           // เก็บไม่เกิน 8 บัญชีต่อเครื่อง
                localStorage.setItem(LOCAL_PW_KEY, JSON.stringify(all));
            } catch (e) { /* ข้าม */ }
        }
        function forgetLocalPw(uid) {
            try {
                const all = localPwAll();
                delete all[String(uid || '').toLowerCase()];
                localStorage.setItem(LOCAL_PW_KEY, JSON.stringify(all));
            } catch (e) { /* ข้าม */ }
        }
        /** รหัสผ่านตรงกับครั้งล่าสุดที่เข้าสำเร็จบนเครื่องนี้ -> รหัสผู้ใช้จริง , อื่น ๆ -> '' */
        async function checkLocalPw(id, pass) {
            const r = localPwAll()[String(id || '').trim().toLowerCase()];
            if (!r || !r.uid || !r.s || !r.h || !window.crypto || !crypto.subtle) return '';
            if (!r.at || Date.now() - r.at > LOCAL_PW_MAX_AGE) return '';
            try { return (await pwDigest(pass, r.s, r.i || LOCAL_PW_ITER)) === r.h ? String(r.uid) : ''; } catch (e) { return ''; }
        }
        PC.saveLocalPw = saveLocalPw;

        // ---------------------------------------------------------------
        // [ข้อ 17] สร้าง "ชื่อตำแหน่ง (title)" อัตโนมัติจากบทบาท+กลุ่มงานในชีต Users
        //          (เดิมได้จาก dropdown หน้า login ซึ่งถูกตัดออกแล้ว)
        //          รูปแบบต้องตรงกับที่ renderDashboardRooms() ใช้ตรวจสิทธิ์ห้อง
        // ---------------------------------------------------------------
        function deriveTitle(u) {
            const role = String(u.role || '');
            const groups = Array.isArray(u.groups) && u.groups.length ? u.groups : (u.group ? [u.group] : []);
            const g = String(groups[0] || '').trim();
            if (role === 'ADMIN') return 'ผู้ดูแลระบบ (ADMIN)';
            if (role === 'Director' || role === 'ActingDirector') return 'ผอ.';
            if (role === 'Administrative') return 'ธุรการกลาง';
            if (role === 'SubdirectorGroup') return g ? 'รอง ผอ. ' + g : 'รอง ผอ.';
            if (role === 'AssistantGroup') return g ? 'ผช. ผอ. ' + g : 'ผช. ผอ.';
            if (role === 'AdminGroup') return g ? 'ธุรการ' + g : 'ธุรการกลุ่มบริหาร';
            if (role === 'Assignee') return 'ผู้รับผิดชอบ (ครู)';
            return ROLE_LABEL[role] || role || 'ผู้ใช้งาน';
        }
        PC.deriveTitle = deriveTitle;

        function applyUserToState(u, roleVal, roleText) {
            /* [แก้ login] เดิมถ้าเซิร์ฟเวอร์ไม่ส่งข้อมูลผู้ใช้มา (u = undefined)
               จะพังที่ u.role เป็น "Cannot read properties of undefined (reading 'role')"
               -> ตรวจก่อน แล้วแจ้งสาเหตุที่แท้จริงเป็นภาษาไทย */
            if (!u || typeof u !== 'object' || !u.id) {
                const e = new Error('เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลผู้ใช้กลับมา');
                e.code = 'NO_USER';
                throw e;
            }
            PC.user = u;
            const role = roleVal || u.role;
            state.user = {
                id: u.id,
                role: role,
                title: roleText || deriveTitle(u),       // [ข้อ 17] คำนวณจากข้อมูลผู้ใช้เสมอ
                name: u.name || u.id,
                email: u.email || u.id,
                phone: u.phone || '',
                image: window.pcThumb(u.image, 160) || DEFAULT_AVATAR,   // [v46 ข้อ 8]
                group: u.group || '',
                groups: Array.isArray(u.groups) ? u.groups : (u.group ? [u.group] : []),
                subjectGroup: u.subjectGroup || '',
                position: u.position || '',
                rooms: u.rooms || [],
                tabs: u.tabs || []
            };
        }

        /* [v100] ส่งคำขอ login ไปเซิร์ฟเวอร์
           วัดจริง 6 ต.ค. 2026 : ตัวคำสั่งในเซิร์ฟเวอร์ใช้ 0-4 ms แต่ช่วงมีผู้ใช้งานพร้อมกัน คำขอรอคิวของ Google 13-57 วิ
           และบางคำขอได้หน้า HTML 404 กลับมา (ไม่ได้เข้าโค้ดใน Code.gs เลย)
           เดิม : ยิงพร้อมกันได้ 4 คำขอ/รอบ x 4 รอบ และตัดคำขอทิ้งที่ 25 วิ -> เพิ่มคิวให้เซิร์ฟเวอร์ที่หนาแน่นอยู่แล้ว
                  และตัดคำขอที่ใกล้ได้คำตอบทิ้ง แล้วไปต่อท้ายคิวใหม่ จนหมดเวลา
           ใหม่ : ค้างพร้อมกันไม่เกิน 2 คำขอ (คำขอสำรองเมื่อเกิน 6 วิ) , แต่ละคำขอรอได้ถึง 60 วิ ,
                  คำขอที่ล้มชั่วคราว (404/เครือข่าย) ส่งแทนหลังพัก 1-2.5 วิ , รวมไม่เกิน 4 คำขอ ภายใน deadlineMs
                  รหัสผ่านผิด/บัญชีถูกปิด/ถูกล็อก = คำตอบจากเซิร์ฟเวอร์ แจ้งทันทีเหมือนเดิม */
        function serverLogin(id, pass, remember, boot, deadlineMs) {
            const HEDGE_MS = 6000, PER_REQ_MS = 60000, MAX_REQ = 4, MAX_INFLIGHT = 2;
            const end = Date.now() + (deadlineMs || 90000);
            return new Promise(function (resolve, reject) {
                let settled = false, inflight = 0, sent = 0, lastErr = null, hedgeT = null, nextT = null, endT = null;
                const ctrls = new Set();
                const left = function () { return end - Date.now(); };
                const done = function (fn, v) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(hedgeT); clearTimeout(nextT); clearTimeout(endT);
                    ctrls.forEach(function (c) { c.abort(); });   // ได้ผลแล้ว : คำขอที่เหลือไม่ต้องรอ
                    fn(v);
                };
                const netErr = function (er) {   // fetch ล้มระดับเครือข่าย ("Failed to fetch") -> ข้อความภาษาไทย
                    if (er && !er.code && er.name === 'TypeError') { const x = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (เครือข่ายขัดข้องหรือเซิร์ฟเวอร์ไม่ตอบ)'); x.code = 'TIMEOUT'; return x; }
                    return er;
                };
                const fire = function () {
                    if (settled || sent >= MAX_REQ || inflight >= MAX_INFLIGHT || left() < 5000) return false;
                    sent++; inflight++;
                    if (PC.perf) PC.perf.tries = (PC.perf.tries || 0) + 1;
                    const ctrl = new AbortController();
                    ctrls.add(ctrl);
                    api('login', { userId: id, password: pass, remember: remember, boot: boot }, { retries: 0, noAuthRedirect: true, timeout: Math.min(PER_REQ_MS, left()), signal: ctrl.signal })
                        .then(function (r) {
                            /* [v97] พบจริง : บางครั้งคำขอ login ได้คำตอบของคำสั่ง ping กลับมา ({app, time}) แทน token -> นับเป็นความผิดพลาดชั่วคราว ลองใหม่ */
                            if (!r || !r.token) {
                                const x = new Error('เซิร์ฟเวอร์ไม่ได้ส่งบัตรผ่าน (token) กลับมา');
                                x.code = 'BAD_RESPONSE';
                                x.detail = 'คำตอบที่ได้จากเซิร์ฟเวอร์: ' + (r && typeof r === 'object' ? '{' + Object.keys(r).slice(0, 8).join(', ') + '}' : String(r));
                                throw x;
                            }
                            try { const st = PC.stByAction && PC.stByAction.login; if (PC.perf && st) { PC.perf.loginSrv = st.t || 0; PC.perf.loginPre = st.p || 0; } } catch (eSt) { /* ข้าม */ }
                            done(resolve, r);
                        })
                        .catch(function (er) {
                            inflight--; ctrls.delete(ctrl);
                            if (settled) return;
                            if (er && er.server && er.code !== 'BUSY') return done(reject, er);
                            lastErr = netErr(er);
                            clearTimeout(nextT);
                            nextT = setTimeout(function () {   // ส่งแทนหลังพักสั้น ๆ (สุ่มเวลา ไม่ให้ทุกเครื่องยิงซ้ำพร้อมกัน)
                                if (!fire() && inflight === 0) done(reject, lastErr);
                            }, 1000 + Math.random() * 1500);
                        });
                    clearTimeout(hedgeT);
                    hedgeT = setTimeout(fire, HEDGE_MS);
                    return true;
                };
                endT = setTimeout(function () {
                    const t = new Error('หมดเวลาเชื่อมต่อเซิร์ฟเวอร์'); t.code = 'TIMEOUT';
                    done(reject, lastErr && (lastErr.code === 'BUSY' || lastErr.code === 'BAD_RESPONSE') ? lastErr : t);
                }, Math.max(0, left()));
                fire();
            });
        }

        /* [v100] เข้าสู่ระบบทันทีบนเครื่องที่เคยเข้าสำเร็จ (ไม่ต้องรอเซิร์ฟเวอร์)
           - รหัสผ่านตรงกับค่าที่เก็บไว้ในเครื่อง (checkLocalPw) + มีสำเนาข้อมูลของผู้ใช้นี้ -> เปิดแอปจากสำเนาทันที (ไม่ถึง 1 วิ)
           - login กับเซิร์ฟเวอร์ต่อเบื้องหลัง : ระหว่างนั้นคำสั่งที่ต้องใช้เซิร์ฟเวอร์รอผล (PC.authPending) เหมือนการเปิดแอปจากสำเนา [v44]
             งานที่บันทึกระหว่างรอจะถูกส่งขึ้นเซิร์ฟเวอร์เมื่อยืนยันสำเร็จ
           - เซิร์ฟเวอร์ปฏิเสธ (เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว , บัญชีถูกปิด , ถูกล็อก) -> กลับหน้า login ทันทีพร้อมแจ้งเหตุผล
           - เซิร์ฟเวอร์ไม่ตอบเกิน 2 นาที -> ถามผู้ใช้ว่าจะลองต่อหรือออกจากระบบ (ระหว่างนั้นยังดูข้อมูลในเครื่องได้)
           - รหัสผ่านไม่ตรงในเครื่อง = ไปตรวจที่เซิร์ฟเวอร์ตามปกติ (การล็อกเมื่อกรอกผิด 5 ครั้งยังทำงานที่เซิร์ฟเวอร์) */
        async function localLogin(uid, id, pass, remember) {
            const snap = await peekSnapshot(uid);
            if (!snap) return false;
            PC.perf = { t0: Date.now(), via: 'local', sent: false }; PC.loadTiming = null;
            let release;
            const pending = new Promise(r => { release = r; });
            PC.authPending = pending;
            PC.authRelease = release;
            PC.token = '';
            try {
                await startSession(Object.assign({}, snap.data.me));
            } catch (e) {
                console.warn('[PC] localLogin startSession', e && e.message);
                try { endSession(); showLoginView(); } catch (e2) { /* ข้าม */ }
                return false;                                                     // ใช้ขั้นตอนเดิม (รอเซิร์ฟเวอร์)
            }
            const pwEl = document.getElementById('login-password');
            if (pwEl) pwEl.value = '';
            const gen = PC.loginGen || 0;
            const same = () => (PC.loginGen || 0) === gen && !!PC.user && String(PC.user.id) === String(uid);
            const WAIT_MSG = 'เปิดจากข้อมูลในเครื่องแล้ว · กำลังยืนยันกับเซิร์ฟเวอร์เบื้องหลัง…';
            const barT = setTimeout(() => { if (PC.authPending === pending) verifyBar(true, WAIT_MSG); }, 400);
            const finish = (ok) => {
                clearTimeout(barT); verifyBar(false);
                if (PC.authPending === pending) PC.authPending = null;
                if (PC.authRelease === release) PC.authRelease = null;
                release(ok);
            };
            const leave = () => { PC.token = ''; finish(false); try { if (same()) { endSession(); showLoginView(); } } catch (e) { /* ข้าม */ } };
            const DEFINITE = { LOGIN_FAILED: 1, LOCKED: 1, AUTH: 1, VALIDATION: 1 };
            (async () => {
                for (;;) {
                    try {
                        const res = await serverLogin(id, pass, remember, false, 120000);
                        if (!same()) return finish(false);                       // ออกจากระบบ/เปลี่ยนผู้ใช้ระหว่างรอ : ทิ้งผล
                        let me = res.user;
                        if (!me || !me.id) { PC.token = res.token; me = await api('me', {}, { retries: 1, noAuthRedirect: true }); }
                        if (!same()) { if (PC.token === res.token) PC.token = ''; return finish(false); }
                        if (!me || String(me.id) !== String(uid)) {
                            forgetLocalPw(uid); leave();
                            Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ', text: 'ข้อมูลบัญชีในเครื่องไม่ตรงกับเซิร์ฟเวอร์ กรุณาเข้าสู่ระบบใหม่' });
                            return;
                        }
                        PC.token = res.token;
                        if (remember && res.rt) saveRemember(me.id, res.rt, res.rtExp);
                        PC.freshMe = Object.assign({}, me); mergeMe(me); saveSession(); markVerified();
                        saveLocalPw(uid, pass);                                   // ต่ออายุอีก 30 วัน
                        if (PC.perf) PC.perf.login = Date.now() - PC.perf.t0;
                        finish(true);
                        try { rerenderAll({ rooms: true, perm: true, docs: true, users: true }); } catch (e) { /* ข้าม */ }
                        if (PC.syncNow) PC.syncNow();
                        warnApiMismatch();
                        if (res.mustChangePw && typeof PC.promptChangePassword === 'function') setTimeout(() => PC.promptChangePassword(pass), 400);
                        else if (typeof PC.offerCalendarSync === 'function') PC.offerCalendarSync(false);
                        return;
                    } catch (e) {
                        if (!same()) return finish(false);
                        console.warn('[PC] localLogin ยืนยันกับเซิร์ฟเวอร์', e);
                        if (e && e.server && DEFINITE[e.code]) {
                            if (e.code === 'LOGIN_FAILED' || e.code === 'AUTH') forgetLocalPw(uid);
                            if (e.code === 'AUTH' && /ปิดการใช้งาน|ไม่พบบัญชี|ถูกปิด/.test(String(e.message))) { clearRemember(); wipeLocal(uid); }
                            leave();
                            Swal.fire({
                                icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ',
                                html: '<div class="text-sm">' + esc(e.code === 'LOGIN_FAILED' ? 'รหัสผ่านนี้ใช้ไม่ได้แล้ว (อาจมีการเปลี่ยนหรือรีเซ็ตรหัสผ่าน) กรุณาเข้าสู่ระบบใหม่' : e.message) + '</div>'
                            });
                            return;
                        }
                        verifyBar(true, 'ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ · กำลังแสดงข้อมูลที่บันทึกไว้ในเครื่อง');
                        const r = await Swal.fire({
                            icon: 'warning', title: 'ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
                            html: '<div class="text-sm">ขณะนี้แสดงข้อมูลที่บันทึกไว้ในเครื่องนี้ งานใหม่จะยังไม่ถูกส่งขึ้นเซิร์ฟเวอร์จนกว่าจะเชื่อมต่อสำเร็จ</div>' + loginErrorDetail(e || {}),
                            showDenyButton: true, confirmButtonText: 'ลองเชื่อมต่ออีกครั้ง', denyButtonText: 'ออกจากระบบ', allowOutsideClick: false
                        });
                        if (!same()) return finish(false);
                        if (!r.isConfirmed) return leave();
                        verifyBar(true, WAIT_MSG);
                    }
                }
            })();
            return true;
        }

        window.handleLogin = async function (e) {
            if (e) e.preventDefault();
            try { localStorage.setItem('pc_login_mode', 'pw'); } catch (e2) { /* ข้าม */ }   // [ต.ค. 2569] ครั้งหน้ากางช่องรหัสผ่านไว้ให้
            const captchaEl = document.getElementById('captchaAnswer');
            const captchaInput = captchaEl ? captchaEl.value.trim() : '';
            const ans = parseInt(captchaInput, 10);
            if (captchaEl) {
                if (!captchaInput || isNaN(ans)) {
                    Swal.fire({ icon: 'warning', title: 'ยังไม่ได้ตอบคำถามยืนยัน', text: 'กรอกผลบวกในช่องคำถามยืนยันก่อนเข้าสู่ระบบ' });
                    return;
                }
                if (ans !== captchaCorrectAnswer) {
                    Swal.fire({ icon: 'warning', title: 'คำตอบยังไม่ถูกต้อง', text: 'ระบบเปลี่ยนโจทย์ให้แล้ว กรอกผลบวกของโจทย์ใหม่อีกครั้ง' });
                    if (typeof generateCaptcha === 'function') generateCaptcha();
                    return;
                }
            }
            const id = (document.getElementById('login-userid')?.value || '').trim();
            const pass = (document.getElementById('login-password')?.value || '').trim();
            if (!id || !pass) {
                Swal.fire({ icon: 'warning', title: 'ยังกรอกไม่ครบ', text: 'กรอกรหัสผู้ใช้งานและรหัสผ่าน' });
                return;
            }
            const remember = document.getElementById('rememberMe')?.checked || false;
            try {
                if (remember) {
                    localStorage.setItem('savedUserId', id);
                    localStorage.setItem('savedRememberMe', 'true');
                } else {
                    localStorage.removeItem('savedUserId');
                    localStorage.removeItem('savedRememberMe');
                    window.pcForgetPassword();             // [v40] ไม่ติ๊ก = ไม่จำรหัสผ่านไว้
                    clearRemember();                       // [ข้อ 19] ไม่ติ๊ก = ต้องกรอกรหัสผ่านใหม่ทุกครั้ง
                }
                localStorage.removeItem('savedUserRole');  // [ข้อ 17] ไม่ใช้บทบาทจากหน้า login แล้ว
                localStorage.removeItem('savedUserPass');  // ไม่เก็บรหัสผ่านไว้ในเครื่องเพื่อความปลอดภัย
            } catch (err) { /* ข้าม */ }

            prog('กำลังเข้าสู่ระบบ…', 'ตรวจสอบรหัสผู้ใช้งานและรหัสผ่าน');
            /* [v100] เครื่องนี้เคยเข้าสำเร็จด้วยรหัสผ่านนี้ + มีสำเนาข้อมูล -> เปิดแอปทันที ไม่ต้องรอเซิร์ฟเวอร์ (ยืนยันเบื้องหลัง) */
            try {
                const localUid = await checkLocalPw(id, pass);
                if (localUid && await localLogin(localUid, id, pass, remember)) return;
            } catch (eL) { console.warn('[PC] localLogin', eL && eL.message); }
            /* [v100] มีสำเนาข้อมูลในเครื่องแล้ว -> ไม่ต้องให้เซิร์ฟเวอร์แนบข้อมูลส่วนหลักมากับคำตอบ (startSession ใช้สำเนาในเครื่องอยู่ดี) */
            let hasSnap = false;
            try { hasSnap = !!(await peekSnapshot(localPwUid(id) || id)); } catch (eS) { /* ข้าม */ }
            PC.perf = { t0: Date.now(), via: 'password', sent: false }; PC.loadTiming = null;   // [v43] เริ่มจับเวลา
            let phase = 'login';                           // [แก้ login] login = ตรวจรหัส , load = โหลดข้อมูลหลังเข้าได้แล้ว
            if (typeof window.stopFakeProgress === 'function') window.stopFakeProgress();   // [v99] ไม่ใช้แถบจำลอง ขณะรอ login
            const slowHintTimer = setInterval(function () {   // [v99] แจ้งสถานะจริง + จำนวนวินาทีที่รอ (clearTimeout ใช้หยุดได้เหมือนเดิม)
                const t0w = (PC.perf && PC.perf.t0) || Date.now();
                const sw = Math.floor((Date.now() - t0w) / 1000);
                const base = sw < 6 ? 'ตรวจสอบรหัสผู้ใช้งานและรหัสผ่าน'
                    : (sw < 20 ? 'เซิร์ฟเวอร์ตอบช้ากว่าปกติ ระบบส่งคำขอสำรองให้แล้ว กรุณารอสักครู่'
                        : 'เซิร์ฟเวอร์ Google มีคิวคำขอมาก (ผู้ใช้งานพร้อมกันมาก) ระบบยังรอคำตอบให้อยู่ ไม่ต้องปิดหน้านี้');
                progSet(Math.round(5 + 27 * (1 - Math.exp(-sw / 20))), base + ' · ' + sw + ' วิ');
            }, 1000);
            try {
                // [ข้อ 17] ไม่ส่ง role อีกต่อไป — เซิร์ฟเวอร์อ่านบทบาทจากชีต Users เอง
                const res = await serverLogin(id, pass, remember, !hasSnap, 90000);   // [v100]
                clearTimeout(slowHintTimer);
                if (PC.perf) PC.perf.login = Date.now() - PC.perf.t0;       // [v43]
                PC.token = res.token;
                /* [แก้ login] ถ้าคำตอบ login ไม่มีข้อมูลผู้ใช้ (Code.gs คนละเวอร์ชัน) -> ขอข้อมูลตัวเองด้วยบัตรผ่านที่เพิ่งได้ */
                let user = res.user;
                if (!user || !user.id) user = await api('me', {}, { retries: 1, noAuthRedirect: true });
                if (!user || !user.id) {
                    const e = new Error('เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลผู้ใช้กลับมา');
                    e.code = 'NO_USER';
                    throw e;
                }
                if (remember && res.rt) saveRemember(user.id, res.rt, res.rtExp);
                if (remember) window.pcSavePassword(pass);   // [v40 ข้อ 3] รหัสผ่านถูกต้องแล้ว จึงจำไว้
                saveLocalPw(user.id, pass);                  // [v100] ครั้งหน้าเครื่องนี้เข้าได้ทันทีโดยไม่ต้องรอเซิร์ฟเวอร์
                phase = 'load';
                progSet(35, 'เข้าสู่ระบบสำเร็จ กำลังเตรียมข้อมูล…');
                await startSession(user, undefined, undefined, { rooms: res.rooms, boot: res.boot });   // [ชุด 3 ข้อ 9]
                const pw = document.getElementById('login-password');
                if (pw) pw.value = '';
                warnApiMismatch();
                // [ชุด 3 ข้อ 3] ยังใช้รหัสผ่านเริ่มต้น (= รหัสผู้ใช้) -> ถามให้เปลี่ยน
                if (res.mustChangePw && typeof PC.promptChangePassword === 'function') setTimeout(() => PC.promptChangePassword(pass), 400);
                else if (typeof PC.offerCalendarSync === 'function') PC.offerCalendarSync(false);   // [รอบ 5 ข้อ 4]
            } catch (err) {
                clearTimeout(slowHintTimer);
                const loaded = phase === 'load';
                console.error('[PC] login ขั้น ' + phase, err);
                // โหลดข้อมูลไม่สำเร็จ -> ล้างสถานะที่ค้างครึ่งทาง แล้วกลับหน้า login ให้สะอาด
                if (loaded) { try { endSession(); showLoginView(); } catch (e2) { /* ข้าม */ } }
                PC.token = '';
                progEnd();
                Swal.fire({
                    icon: 'error',
                    title: loaded ? 'เข้าสู่ระบบแล้ว แต่โหลดข้อมูลไม่สำเร็จ' : 'เข้าสู่ระบบไม่สำเร็จ',
                    html: '<div class="text-sm">' + esc(err.message) + '</div>' + loginErrorDetail(err)
                });
                if (typeof generateCaptcha === 'function') generateCaptcha();
            }
        };

        /* [แก้ login] รายละเอียดทางเทคนิคใต้ข้อความผิดพลาด (ช่วยระบุจุดที่เสียได้ทันที)
           - ข้อผิดพลาดฝั่งหน้าเว็บ : ชื่อฟังก์ชัน + บรรทัด
           - Code.gs บนเซิร์ฟเวอร์ไม่ใช่เวอร์ชันเดียวกับหน้าเว็บ : แจ้งให้ Deploy New version */
        function loginErrorDetail(err) {
            const out = [];
            if (err && !err.server && !err.code && err.stack && /Error/.test(String(err.name || ''))) {
                const at = String(err.stack).split('\n').map(l => l.match(/at\s+(?:(.+?)\s+\()?.*?:(\d+):\d+\)?\s*$/)).filter(Boolean).slice(0, 2)
                    .map(m => (m[1] || 'ไม่ระบุชื่อ').replace(/^(async\s+)?(window\.|Object\.)/, '') + ' บรรทัด ' + m[2]);
                if (at.length) out.push('จุดที่เกิด (หน้าเว็บ): ' + at.join(' ← '));
            }
            if (err && err.code === 'BAD_RESPONSE' && err.detail) out.push(err.detail + ' (ลองส่งซ้ำอัตโนมัติแล้วยังไม่สำเร็จ)');   // [v97]
            if (err && err.server && err.code === 'ERROR' && err.detail) out.push('รายละเอียดจากเซิร์ฟเวอร์: ' + err.detail);   // [ต.ค. 2569] ข้อความหลักแปลเป็นภาษาคนแล้ว (pcHumanErr)
            if (PC.serverApi && PC.serverApi !== EXPECTED_API) {
                out.push('⚠ Code.gs บนเซิร์ฟเวอร์เป็นเวอร์ชัน ' + (PC.serverApi === 'old' ? 'เก่า (ก่อน ' + EXPECTED_API + ')' : PC.serverApi) +
                    ' แต่หน้าเว็บนี้ต้องการ ' + EXPECTED_API +
                    ' → เปิด Apps Script > Deploy > Manage deployments > ✏️ Edit > Version: New version > Deploy');
            } else if (err && (err.code === 'NO_USER' || err.code === 'NO_TOKEN')) {
                if (err.detail) out.push(err.detail);   // [v99]
                out.push('ตรวจว่า Code.gs ที่ Deploy อยู่เป็นไฟล์ล่าสุด แล้วรันฟังก์ชัน diagnoseLogin ใน Apps Script เพื่อดูจุดที่เสีย');
            } else if (err && err.code === 'TIMEOUT') {
                // [แก้ login ช้า] เซิร์ฟเวอร์ไม่ตอบภายในเวลา มักเกิดจากมีคนเข้าระบบพร้อมกันจำนวนมาก
                out.push('เซิร์ฟเวอร์ไม่ตอบสนองภายในเวลา อาจมีผู้เข้าสู่ระบบพร้อมกันจำนวนมาก กรุณารอสักครู่แล้วลองใหม่');
            } else if (err && err.http) {
                // [v100] Google ตอบหน้า 404/5xx หลังรอคิว = เซิร์ฟเวอร์ Apps Script รับคำขอพร้อมกันไม่ไหว (ไม่ใช่รหัสผ่านผิด)
                out.push('Google Apps Script ตอบ HTTP ' + err.http + ' หลังรอคิว : มีคำขอเข้าเซิร์ฟเวอร์พร้อมกันมากเกินไป (ไม่ใช่รหัสผ่านผิด) กรุณารอสักครู่แล้วลองใหม่' +
                    ' ; ถ้าเป็นทุกครั้ง ให้ตรวจว่า Deploy Web App ยังใช้งานอยู่');
            } else if (err && err.code === 'BUSY') {
                out.push('ระบบกำลังบันทึกข้อมูลของผู้ใช้อื่นอยู่ กรุณาลองใหม่อีกครั้งในอีกไม่กี่วินาที');
            }
            return out.length ? '<div class="mt-3 text-[11px] leading-relaxed text-slate-500 text-left bg-slate-50 border rounded-lg p-2">' + out.map(esc).join('<br>') + '</div>' : '';
        }

        /* [แก้ login] เข้าระบบได้แล้ว แต่ Code.gs บนเซิร์ฟเวอร์ไม่ตรงเวอร์ชัน -> เตือนมุมจอ (ไม่ขวางการใช้งาน) */
        function warnApiMismatch() {
            if (!PC.serverApi || PC.serverApi === EXPECTED_API) return;
            console.warn('[PC] Code.gs บนเซิร์ฟเวอร์ = ' + PC.serverApi + ' , หน้าเว็บต้องการ ' + EXPECTED_API);
            status.show('Code.gs บนเซิร์ฟเวอร์ยังไม่ใช่เวอร์ชันล่าสุด (Deploy > New version)', 'warn', 12000);
        }

        /* [v43] หน้าจอพร้อมใช้งานแล้ว -> จดเวลา และส่งรายงานความเร็ว (เมื่อข้อมูลส่วนที่เหลือมาครบ หรือสูงสุดไม่เกิน 30 วินาที) */
        function markUsable() {
            if (PC.perf && !PC.perf.usable) PC.perf.usable = Date.now() - PC.perf.t0;
            setTimeout(() => { if (PC.reportPerf) PC.reportPerf(); }, 30000);
        }
        async function startSession(user, roleVal, roleText, extra) {
            applyUserToState(user, roleVal, roleText);
            /* [รอบ 5 ข้อ 2] ข้อมูลผู้ใช้ "สด" จากเซิร์ฟเวอร์ (login / autoLogin / me) ต้องชนะข้อมูลในสำเนาในเครื่องเสมอ */
            PC.freshMe = Object.assign({}, user);
            saveSession();
            extra = extra || {};
            /* [ชุด 3 ข้อ 2/9] เดิมต้องรอโหลดข้อมูลทั้งหมด (bootstrap) ให้เสร็จก่อนจึงเห็นหน้า Dashboard/แท็บ
               ครั้งแรกบนเครื่องใหม่หรือช่วงเซิร์ฟเวอร์หนาแน่นจึงรอนานหลายวินาที
               แก้ใหม่ : ไม่มีสำเนาในเครื่องแต่ได้รายชื่อห้องมาจากคำตอบ login -> เข้าหน้า Dashboard ทันที
                         แท็บตามสิทธิ์แสดงทันที แล้วโหลดข้อมูลหนังสือ/ประกาศ/ผู้ใช้เบื้องหลัง */
            if (Array.isArray(extra.rooms) && extra.rooms.length) PC.loginRooms = extra.rooms;     // [v42] ไว้ใช้สำรองถ้าห้องหาย
            const snap = await freshSnapshot();
            if (snap || !Array.isArray(extra.rooms) || !extra.rooms.length) {
                await loadAllData();
                progSet(92, 'กำลังจัดหน้าจอ…');
                enterApp();
                startBackground();
                loadMySignature();
                progEnd();
                markUsable();
                return;
            }
            seedRooms(extra.rooms);
            PC.bgLoading = true;
            enterApp();
            progEnd();
            markUsable();
            status.show('กำลังโหลดข้อมูลหนังสือเบื้องหลัง…', 'busy');
            PC.bgLoad = loadAllData(false, { quiet: true, core: extra.boot }).then(() => {
                PC.bgLoading = false;
                if (!PC.token || !PC.store) return;
                status.show('โหลดข้อมูลครบแล้ว', 'ok', 1500);
                rerenderAll({ docs: true, rooms: true, ann: true, events: true, users: true, perm: true, tasks: true });
                try { if (isVisible('tab-alldocs')) renderAllDocsList(); } catch (e) { /* ข้าม */ }
                startBackground();
                loadMySignature();
            }).catch(err => {
                PC.bgLoading = false;
                if (!PC.token) return;
                status.hide();
                console.error('[PC] background load', err);
                Swal.fire({
                    icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ',
                    html: '<div class="text-sm">' + esc(err.message) + '</div>' + loginErrorDetail(err),
                    showDenyButton: true, confirmButtonText: 'ลองใหม่', denyButtonText: 'ออกจากระบบ', allowOutsideClick: false
                }).then(r => {
                    if (r.isConfirmed) {
                        PC.bgLoading = true;
                        status.show('กำลังโหลดข้อมูลหนังสือ…', 'busy');
                        loadAllData(true, { quiet: true }).then(() => {
                            PC.bgLoading = false; status.show('โหลดข้อมูลครบแล้ว', 'ok', 1500);
                            rerenderAll({ docs: true, rooms: true, ann: true, events: true, users: true, perm: true, tasks: true });
                            startBackground(); loadMySignature();
                        }).catch(e2 => { PC.bgLoading = false; status.show('โหลดข้อมูลไม่สำเร็จ : ' + e2.message, 'error', 8000); });
                    } else if (r.isDenied) {
                        endSession(); showLoginView();
                    }
                });
            });
        }

        /** [ชุด 3 ข้อ 9] ตั้งรายชื่อห้องจากคำตอบ login (ใช้ก่อนข้อมูลเต็มจะโหลดเสร็จ) */
        function seedRooms(list) {
            const rows = (list || []).filter(r => r && r.id);
            rows.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)));
            PC.rooms = rows.map(r => ({ id: r.id, name: r.name, color: r.color || 'from-blue-600 to-indigo-700', type: r.type || '', parent: r.parent || '', order: r.order }));
            defaultRooms = PC.rooms.slice();
        }

        function enterApp() {
            const navName = document.getElementById('nav-user-name');
            const navRole = document.getElementById('nav-user-role');
            const avatar = document.getElementById('nav-user-avatar');
            if (navName) navName.innerText = state.user.name;
            if (navRole) navRole.innerText = state.user.title;
            if (avatar) avatar.src = state.user.image || DEFAULT_AVATAR;

            document.getElementById('view-login')?.classList.add('hidden');
            document.getElementById('main-navbar')?.classList.remove('hidden');
            const footer = document.getElementById('global-footer');
            if (footer) footer.style.display = 'flex';
            const btnCreateRoom = document.getElementById('btn-create-room');
            if (btnCreateRoom) btnCreateRoom.classList.toggle('hidden', state.user.role !== 'ADMIN');

            const availableRooms = renderDashboardRooms();
            if (availableRooms && availableRooms.length === 1) {
                document.getElementById('view-dashboard')?.classList.add('hidden');
                openRoom(availableRooms[0].id, availableRooms[0].name);
            } else {
                document.getElementById('view-room')?.classList.add('hidden');
                document.getElementById('view-dashboard')?.classList.remove('hidden');
            }
            const todayEventCount = updateCalendarBadge();
            if (todayEventCount > 0) setTimeout(() => { playCalendarAlert(); }, 500);
        }

        let reauthPromise = null;
        function reauth() {
            if (reauthPromise) return reauthPromise;
            if (!PC.user) return Promise.resolve(false);
            reauthPromise = (async () => {
                const r = await Swal.fire({
                    icon: 'info',
                    title: 'หมดเวลาการเข้าสู่ระบบ',
                    html: '<div class="text-sm">กรุณากรอกรหัสผ่านของ <b>' + esc(PC.user.id) + '</b> เพื่อทำงานต่อ<br><span class="text-xs text-slate-500">(ข้อมูลที่ยังไม่ได้บันทึกจะไม่สูญหาย)</span></div>',
                    input: 'password',
                    inputPlaceholder: 'รหัสผ่าน',
                    showCancelButton: true,
                    confirmButtonText: 'เข้าสู่ระบบต่อ',
                    cancelButtonText: 'ออกจากระบบ',
                    allowOutsideClick: false,
                    preConfirm: async (pw) => {
                        try {
                            const res = await api('login', { userId: PC.user.id, password: pw, remember: !!loadRemember() }, { retries: 0, noAuthRedirect: true });
                            return res;
                        } catch (err) {
                            Swal.showValidationMessage(err.message);
                            return false;
                        }
                    }
                });
                if (r.isConfirmed && r.value && r.value.token) {
                    PC.token = r.value.token;
                    if (r.value.rt) saveRemember(r.value.user.id, r.value.rt, r.value.rtExp);  // [ข้อ 19] ต่ออายุการจดจำ
                    saveSession();
                    return true;
                }
                endSession();
                showLoginView();
                return false;
            })();
            reauthPromise.finally(() => { reauthPromise = null; });
            return reauthPromise;
        }

        function showLoginView() {
            ['view-room', 'view-dashboard', 'main-navbar'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
            const nb = document.getElementById('nav-back-rooms');   // [รอบ 5 ข้อ 3]
            if (nb) { nb.classList.add('hidden'); nb.classList.remove('flex'); }
            document.getElementById('view-login')?.classList.remove('hidden');
            const footer = document.getElementById('global-footer');
            if (footer) footer.style.display = 'none';
            if (typeof closeAllWorkspaceModalsAndShowInbox === 'function') {
                ['admin', 'director', 'admingroup', 'subdirectorgroup', 'subgroupadmin', 'assistantgroup', 'assignee'].forEach(t => {
                    const el = document.getElementById('tab-' + t);
                    if (el) { el.classList.remove('fixed', 'top-0', 'left-0', 'w-full', 'h-full', 'z-[100]', 'bg-slate-100', 'p-4', 'sm:p-6', 'overflow-y-auto'); el.classList.add('hidden'); }
                });
            }
            if (typeof generateCaptcha === 'function') generateCaptcha();
            if (typeof window.pcRestoreLogin === 'function') window.pcRestoreLogin();   // [v40 ข้อ 3] ถ้ายังติ๊กจำไว้ -> ใส่รหัสผู้ใช้/รหัสผ่านกลับให้
        }

        function endSession() {
            stopBackground();
            PC.loginGen = (PC.loginGen || 0) + 1;                  // [v100] ผลยืนยันของ localLogin ที่มาช้าหลังออกจากระบบ -> ทิ้ง
            if (PC.authRelease) { const rel = PC.authRelease; PC.authRelease = null; PC.authPending = null; rel(false); }
            PC.token = '';
            PC.user = null;
            PC.freshMe = null;                                     // [รอบ 5 ข้อ 2]
            PC.store = null;
            PC.serverTime = 0;
            docSync.reset();
            clearSession();
            state.user = { id: '', role: '', name: '', email: '', image: '' };
            state.documentQueue = [];
            state.assignments = [];
            state.calendarEvents = [];
            Object.keys(state.activeDocIds).forEach(k => { state.activeDocIds[k] = null; });
            Object.values(state.canvases || {}).forEach(c => { try { if (c && c.clear) c.clear(); } catch (e) { /* ข้าม */ } });
            PC.muteSig = true;
            Object.keys(sigTarget).forEach(k => delete sigTarget[k]);
            PC.muteSig = false;
            // [แก้ลายเซ็นผิดคน] ล้างลายเซ็นของผู้ใช้คนนี้ออกจากหน่วยความจำและทุกช่องลายเซ็น ก่อนคนถัดไปเข้าระบบ
            try { clearAllSignaturePads(); } catch (e) { /* ข้าม */ }
            // [รอบ 5 ข้อ 4] ล้างนัดหมายส่วนตัวจาก Google + สิทธิ์ปฏิทิน ของผู้ใช้คนนี้ (คนถัดไปในเครื่องเดียวกันต้องไม่เห็น)
            try { if (typeof PC.clearGoogleData === 'function') PC.clearGoogleData(); } catch (e) { /* ข้าม */ }
            try { if (!loadRemember() && PC.clearGoogleHint) PC.clearGoogleHint(); } catch (e) { /* ข้าม */ }   // ไม่ได้จดจำ = ไม่จำบัญชี Google
            try { updateCalendarBadge(); } catch (e) { /* ข้าม */ }
        }

        window.logout = function () {
            Swal.fire({
                title: 'ยืนยันการออกจากระบบ?',
                text: 'คุณต้องการออกจากระบบการทำงานใช่หรือไม่',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fa-solid fa-arrow-right-from-bracket mr-1"></i> ใช่, ออกจากระบบ',
                cancelButtonText: 'ยกเลิก',
                reverseButtons: true
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                prog('กำลังบันทึกข้อมูลล่าสุด…', 'ส่งข้อมูลที่ยังไม่ได้บันทึกขึ้นเซิร์ฟเวอร์');   // [ข้อ 13]
                try { await docSync.flush(); } catch (e) { /* ข้าม */ }
                // [รอบ 5 ข้อ 1] ส่ง token จดจำของเครื่องนี้ไปด้วย -> เซิร์ฟเวอร์ยกเลิกการจดจำ "เฉพาะเครื่องนี้" (เครื่องอื่นยังจดจำอยู่)
                const remNow = loadRemember();
                api('logout', { rt: remNow && PC.user && remNow.userId === PC.user.id ? remNow.rt : '' }, { retries: 0, noAuthRedirect: true }).catch(() => {});
                clearRemember();                 // [ข้อ 19] ออกจากระบบเอง = ยกเลิกการเข้าระบบอัตโนมัติ
                try { if (PC.clearGoogleHint) PC.clearGoogleHint(); } catch (e) { /* ข้าม */ }   // [รอบ 5 ข้อ 4] คนถัดไปต้องเลือกบัญชี Google เอง
                endSession();
                showLoginView();
                const loginIdInput = document.getElementById('login-userid');
                if (loginIdInput && localStorage.getItem('savedRememberMe') !== 'true') loginIdInput.value = '';
                Swal.fire({ icon: 'success', title: 'ออกจากระบบเรียบร้อย', showConfirmButton: false, timer: 1200 });
            });
        };

        // ---------------------------------------------------------------
        // 5) โหลดข้อมูลทั้งหมด / นำข้อมูลเข้า state
        // ---------------------------------------------------------------
        function emptyStore() {
            return { docs: {}, rooms: {}, announcements: {}, comments: {}, events: {}, tasks: {}, reads: {}, users: {}, settings: {}, me: null };
        }

        /** [ข้อ 10] สำเนาในเครื่องที่ยังใช้ได้ (IndexedDB) หรือ null */
        async function freshSnapshot() {
            if (!PC.user) return null;
            const snap = await idb.get('kv', 'snap:' + PC.user.id);
            /* ขยายอายุสำเนาจาก 7 วันเป็น 30 วัน เพราะ syncNow() ดึงเฉพาะส่วนต่างอยู่แล้ว */
            if (snap && snap.v === SNAP_VER && snap.url === PC.url && (Date.now() - snap.savedAt) < 30 * 86400000 && snap.serverTime) return snap;
            return null;
        }

        async function loadAllData(forceFull, opt) {
            opt = opt || {};
            const quiet = !!opt.quiet;             // [ชุด 3 ข้อ 9] โหลดเบื้องหลัง : ไม่แสดงหน้าจอรอ
            const tok = PC.token;
            const t0 = Date.now();
            if (!quiet) progSet(45, 'เปิดข้อมูลที่บันทึกไว้ในเครื่อง…');
            let snap = forceFull ? null : await freshSnapshot();
            if (snap && !(snap.data && Array.isArray(snap.data.rooms) && snap.data.rooms.length)) snap = null;   // [v42] สำเนาที่ไม่มีห้องเลย = เสีย -> ดึงใหม่ (เดิมทำให้ "ไม่พบห้อง" ค้างจนกว่าจะล้างข้อมูลเครื่อง)
            /* [ข้อ 10] มีสำเนาในเครื่อง (IndexedDB) -> เข้าใช้งานได้ทันที แล้วค่อยซิงก์ส่วนต่างเบื้องหลัง */
            if (snap) {
                if (!quiet) progSet(75, 'เตรียมข้อมูลจากสำเนาในเครื่อง…');
                PC.partialLoad = false;
                applyBootstrap(snap.data, true);                      // [รอบ 5 ข้อ 2] true = จากสำเนาในเครื่อง
                PC.serverTime = snap.serverTime;
                PC.loadMs = Date.now() - t0;
                syncNow();                       // ซิงก์ส่วนต่างเบื้องหลัง ไม่ต้องรอ
                return;
            }
            if (!quiet) {
                prog('กำลังโหลดข้อมูล…', 'ดึงข้อมูลจากฐานข้อมูล (ครั้งแรกอาจใช้เวลาสักครู่)');
                progSet(50, 'ดึงข้อมูลจากฐานข้อมูล…');
            }
            /* [v35 ข้อ 1] ขอข้อมูล 4 ส่วนพร้อมกัน : core มาถึง -> ใช้งานได้ทันที , ส่วนที่เหลือเติมเข้ามาเบื้องหลัง
               (เซิร์ฟเวอร์รุ่นเก่าที่ยังไม่ได้ Deploy จะตอบข้อมูลทั้งก้อนเหมือนเดิม -> ใช้ก้อนนั้นเลย) */
            const timing = { start: t0, parts: {} };
            PC.loadTiming = timing;
            const ask = (part) => {
                const a = Date.now();
                return api('bootstrap', { part: part }, { timeout: 180000 }).then(d => {
                    timing.parts[part] = { total: Date.now() - a, server: d && d.ms };
                    return d;
                });
            };
            // รู้อยู่แล้วว่าเซิร์ฟเวอร์ยังเป็นรุ่นเก่า (ดูจากคำตอบตอน login) -> ขอก้อนเดียวแบบเดิม ไม่ยิงคำขอซ้ำซ้อน
            const partsOk = !PC.serverApi || PC.serverApi === EXPECTED_API;
            const restParts = partsOk ? ['rest'] : [];       // [v42] done+feed+mine รวมเป็นคำขอเดียว (ลดการใช้งานพร้อมกันของ Apps Script ต่อผู้ใช้ 1 คน)
            const restReq = restParts.map(p => ask(p).catch(e => ({ _err: e, _part: p })));
            /* [v44] เซิร์ฟเวอร์แนบข้อมูลส่วนหลักมากับคำตอบ login แล้ว -> ไม่ต้องขอซ้ำ (ประหยัดไป-กลับเครือข่าย 1 รอบ) */
            const piggy = partsOk && opt.core && opt.core.part === 'core' && Array.isArray(opt.core.docs) && Array.isArray(opt.core.rooms) ? opt.core : null;
            if (piggy) timing.parts.core = { total: 0, server: piggy.ms, piggy: true };
            const data = piggy || (partsOk ? await ask('core') : await api('bootstrap', {}, { timeout: 180000 }));
            if (PC.token !== tok) return;          // ออกจากระบบไปแล้วระหว่างรอ -> ทิ้งผลลัพธ์
            if (!quiet) progSet(80, 'จัดเรียงข้อมูล…');
            const legacy = data.part !== 'core';   // เซิร์ฟเวอร์รุ่นเก่า = ได้ข้อมูลครบทั้งก้อนแล้ว
            PC.partialLoad = !legacy;              // ระหว่างนี้ห้ามบันทึกสำเนาในเครื่อง (ข้อมูลยังไม่ครบ)
            applyBootstrap(data);
            PC.serverTime = data.serverTime;
            PC.loadMs = Date.now() - t0;
            PC.lastBootstrapCached = !!data.cached;
            if (legacy) { saveSnapshotSoon(0); return; }
            const mergePart = (d) => {
                if (!d || PC.token !== tok || !PC.store) return;
                applyChanges(d);
                // ข้อมูลชุดแรก ไม่ใช่ "เรื่องใหม่" -> ไม่ขึ้นตัวเลขแจ้งเตือนกิจกรรม
                try { if (PC.unreadAnn) PC.unreadAnn.clear(); PC.unreadActivities = 0; updateActivitiesBadge(0); } catch (e) { /* ข้าม */ }
            };
            PC.restLoad = Promise.all(restReq.map(req => req.then(async d => {
                if (d && d._err) {             // ลองใหม่ 1 ครั้ง
                    try { d = await ask(d._part); } catch (e) { return false; }
                }
                mergePart(d);
                return true;
            }))).then(oks => {
                if (PC.token !== tok) return;
                timing.all = Date.now() - t0;
                setTimeout(() => { if (PC.reportPerf) PC.reportPerf(); }, 500);       // [v43]
                console.table(Object.keys(timing.parts).map(k => ({ part: k, totalMs: timing.parts[k].total, serverMs: timing.parts[k].server })));
                if (oks.every(Boolean)) {
                    PC.partialLoad = false;
                    saveSnapshotSoon(0);
                    try { if (isVisible('tab-alldocs')) renderAllDocsList(); } catch (e) { /* ข้าม */ }
                } else {
                    status.show('โหลดข้อมูลบางส่วนไม่สำเร็จ (ระบบจะโหลดใหม่เมื่อเข้าสู่ระบบครั้งถัดไป)', 'warn', 8000);
                }
            });
        }
        PC.reload = () => loadAllData(true).then(() => rerenderAll({ docs: true, rooms: true, ann: true, events: true, users: true }));

        function applyBootstrap(data, fromSnap) {
            const st = emptyStore();
            (data.docs || []).forEach(r => { st.docs[r.d.id] = r; });
            (data.rooms || []).forEach(r => { st.rooms[r.d.id] = r; });
            (data.announcements || []).forEach(r => { st.announcements[r.d.AssignmentID] = r; });
            (data.comments || []).forEach(r => { st.comments[r.d.CommentID] = r; });
            (data.events || []).forEach(r => { st.events[r.d.id] = r; });
            (data.tasks || []).forEach(r => { st.tasks[r.d.id] = r; });          // [ข้อ 18]
            (data.reads || []).forEach(r => { st.reads[r.d.id] = r; });          // [v28 ข้อ 3] การเปิดอ่านหนังสือ
            (data.users || []).forEach(u => { st.users[u.id] = u; });
            (data.settings || []).forEach(s => { st.settings[s.key] = s; });
            st.me = data.me || null;
            /* [รอบ 5 ข้อ 2] สาเหตุ "ห้องที่ได้รับสิทธิ์ใช้ไม่ได้เมื่อ login ใหม่"
               สำเนาในเครื่อง (IndexedDB) เก็บ me ของการโหลดครั้งแรกไว้ตลอด (ซิงก์ไม่เคยอัปเดตส่วนนี้)
               login ครั้งถัดไปจึงเอาสิทธิ์ห้อง/แท็บ/บทบาท "ชุดเก่า" มาทับข้อมูลสดที่เพิ่งได้จาก login
               และถ้าแถวผู้ใช้ไม่ได้เปลี่ยนหลังซิงก์ครั้งล่าสุด ระบบจะไม่ส่งข้อมูลตัวเองมาแก้ให้ -> ใช้สิทธิ์เก่าทั้งรอบ
               แก้ : ข้อมูลจากสำเนาในเครื่อง -> ใช้ข้อมูลผู้ใช้สดจากเซิร์ฟเวอร์ทับเสมอ */
            if (fromSnap && PC.freshMe && PC.user && PC.freshMe.id === PC.user.id) st.me = Object.assign({}, st.me || {}, PC.freshMe);
            PC.store = st;
            PC.docsEpoch = data.epoch || '';                                      // [ชุด 3 ข้อ 4]
            PC.archiveYears = Array.isArray(data.archiveYears) ? data.archiveYears : [];
            if (st.me && PC.user && st.me.id === PC.user.id) mergeMe(st.me);

            // หนังสือ: ธุรการกลางเรียงตามลำดับคิว, ที่เหลือเรียงตามเวลาสร้าง
            const recs = Object.values(st.docs);
            const s1 = recs.filter(r => Number(r.d.stage) === 1).sort((a, b) => (a.o ?? 1e9) - (b.o ?? 1e9) || a.c - b.c);
            const rest = recs.filter(r => Number(r.d.stage) !== 1).sort((a, b) => a.c - b.c);
            state.documentQueue = s1.concat(rest).map(r => clone(r.d));
            docSync.reset();
            const om = docSync.orders();
            state.documentQueue.forEach(d => docSync.markSynced(d, st.docs[d.id], om));
            Object.keys(state.activeDocIds).forEach(k => { state.activeDocIds[k] = null; });

            buildRooms();
            buildUsers();
            buildAnnouncements();
            buildEvents();
            buildTasks();                                                         // [ข้อ 18]
            applySettings(Object.values(st.settings), true);
            rerenderAll({ docs: true, rooms: true, ann: true, events: true, users: true });
        }

        function mergeMe(me) {
            PC.user = Object.assign({}, PC.user, me);
            // [รอบ 5 ข้อ 2] เก็บข้อมูลตัวเองล่าสุดลงสำเนาในเครื่องด้วย (เดิมเก็บแค่ครั้งแรกที่โหลด)
            if (me && me.id) {
                if (PC.store && (!PC.store.me || PC.store.me.id === me.id)) PC.store.me = Object.assign({}, PC.store.me || {}, me);
                if (PC.freshMe && PC.freshMe.id === me.id) PC.freshMe = Object.assign({}, PC.freshMe, me);
            }
            if (state.user && state.user.id === me.id) {
                state.user.name = me.name || state.user.name;
                state.user.email = me.email || me.id;
                state.user.phone = me.phone || '';                 // [ข้อ 16]
                state.user.image = window.pcThumb(me.image, 160) || DEFAULT_AVATAR;   // [v46 ข้อ 8]
                state.user.rooms = me.rooms || [];
                state.user.tabs = me.tabs || [];
                state.user.group = me.group || '';
                state.user.groups = Array.isArray(me.groups) ? me.groups : (me.group ? [me.group] : []);  // [ข้อ 12]
                state.user.subjectGroup = me.subjectGroup || '';   // [ข้อ 11]
                state.user.position = me.position || state.user.position || '';
                // [ข้อ 17] บทบาท/กลุ่มงานเปลี่ยน -> คำนวณชื่อตำแหน่งใหม่ (มีผลต่อสิทธิ์เข้าห้อง)
                if (me.role) state.user.role = me.role;
                state.user.title = deriveTitle(PC.user);
            }
        }

        function buildRooms() {
            const list = Object.values(PC.store.rooms).map(r => r.d).filter(r => r && r.id);
            list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)));
            PC.rooms = list.map(r => ({ id: r.id, name: r.name, color: r.color || 'from-blue-600 to-indigo-700', type: r.type || '', parent: r.parent || '', order: r.order }));
            defaultRooms = PC.rooms.slice();
        }

        function buildUsers() {
            PC.users = Object.values(PC.store.users).filter(u => !u.x).sort((a, b) => String(a.id).localeCompare(String(b.id)))
                .map(u => (u.image && window.pcThumb(u.image, 128) !== u.image) ? Object.assign({}, u, { image: window.pcThumb(u.image, 128), imageRaw: u.image }) : u);   // [v46 ข้อ 8]
            state.activeClassMembers = PC.users.map(u => ({ Name: u.name || u.id, id: u.id }));
        }

        function buildAnnouncements() {
            const byAnn = {};
            Object.values(PC.store.comments).forEach(r => {
                const c = clone(r.d);
                (byAnn[c.AssignmentID] = byAnn[c.AssignmentID] || []).push(c);
            });
            Object.values(byAnn).forEach(arr => arr.sort((a, b) => String(a.CreatedAt).localeCompare(String(b.CreatedAt))));
            state.assignments = Object.values(PC.store.announcements).map(r => {
                const a = clone(r.d);
                a.comments = byAnn[a.AssignmentID] || [];
                return a;
            }).sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));
        }

        function buildEvents() {
            state.calendarEvents = Object.values(PC.store.events).map(r => clone(r.d));
        }

        // ค่าตั้งค่า (Flow / เลขทะเบียน / ข้อสั่งการ / เสียงแจ้งเตือน)
        function applySettings(list, isFull) {
            let touchedLs = false, flow = false;
            list.forEach(s => {
                if (s.name === 'flowSteps') {
                    if (!s.x && Array.isArray(s.value) && s.value.length) { currentFlowSteps = clone(s.value); flow = true; }
                } else if (String(s.name).indexOf('ls:') === 0) {
                    const k = s.name.substring(3);
                    bridge.mute = true;
                    try {
                        if (s.x || s.value === null || s.value === undefined) localStorage.removeItem(k);
                        else localStorage.setItem(k, String(s.value));
                    } catch (e) { /* ข้าม */ }
                    bridge.mute = false;
                    touchedLs = true;
                    if (k.indexOf('start-no-') === 0) {
                        const el = document.getElementById(k);
                        if (el && document.activeElement !== el) el.value = s.x ? '' : String(s.value || '');
                    }
                }
            });
            if (touchedLs) {
                try { if (typeof loadBellSettings === 'function') loadBellSettings(); } catch (e) { /* ข้าม */ }
                try { if (typeof loadCalendarSettings === 'function') loadCalendarSettings(); } catch (e) { /* ข้าม */ }
                try { if (typeof loadAssistantCommands === 'function') loadAssistantCommands(); } catch (e) { /* ข้าม */ }
            }
            if (flow && isVisible('subtab-settings-flow') && typeof renderFlowList === 'function') renderFlowList();
        }

        function rerenderAll(what) {
            const inRoom = isVisible('view-room');
            // [ข้อ 4] ผู้ดูแลระบบแก้สิทธิ์ห้อง/แท็บของผู้ใช้ที่กำลังออนไลน์ -> มีผลทันทีโดยไม่ต้อง login ใหม่
            if (what.perm && inRoom && typeof applyRolePermissions === 'function') {
                try {
                    const roomName = document.getElementById('banner-room-name')?.innerText || '';
                    const roomId = document.getElementById('banner-room-id')?.innerText || '';
                    if (!PC.roomAllowed(roomId, roomName)) {
                        document.getElementById('view-room')?.classList.add('hidden');
                        document.getElementById('view-dashboard')?.classList.remove('hidden');
                        renderDashboardRooms();
                        toast('warning', 'สิทธิ์เข้าห้องของท่านถูกปรับปรุง');
                    } else {
                        applyRolePermissions();
                    }
                } catch (e) { /* ข้าม */ }
            }
            if (what.rooms && isVisible('view-dashboard')) renderDashboardRooms();
            if (what.rooms || what.perm) { try { updateNavBack(); } catch (e) { /* ข้าม */ } }   // [รอบ 5 ข้อ 3]
            if (what.docs && inRoom) {
                renderAllQueues();
                if (isVisible('tab-calendar')) renderCalendar();
            }
            if (what.ann && inRoom) safeRenderAssignments();
            if (what.events && inRoom && isVisible('tab-calendar')) renderCalendar();
            if (what.events || what.docs) { try { updateCalendarBadge(); } catch (e) { /* ข้าม */ } }
            if (what.users && isVisible('tab-settings')) renderUsersTable();
            if (what.tasks) {                                                     // [ข้อ 18/20]
                try { if (isVisible('tab-tasks')) renderTasks(); else updateTasksBadge(); } catch (e) { /* ข้าม */ }
            }
        }

        function safeRenderAssignments() {
            const list = document.getElementById('assignments-list');
            if (!list) return;
            const active = document.activeElement;
            const typing = Array.from(list.querySelectorAll('input[id^="comment-input-"]')).some(i => i.value.trim() !== '');
            if ((active && list.contains(active)) || typing) { PC.pendingAnnRender = true; return; }
            PC.pendingAnnRender = false;
            renderAssignmentsList();
        }
        document.addEventListener('focusout', () => {
            if (PC.pendingAnnRender) setTimeout(safeRenderAssignments, 300);
        });

        // รับการเปลี่ยนแปลงจากผู้ใช้อื่น
        function applyChanges(data) {
            if (!PC.store) return;
            const st = PC.store;
            const what = {};
            const me = PC.user ? PC.user.id : '';
            let newActivity = 0;

            // หนังสือ
            let stage1Touched = false;
            const touched = new Set();
            (data.docs || []).forEach(rec => {
                const id = rec.d.id;
                const old = st.docs[id];
                if (old && old.r >= rec.r && !rec.x) return;
                if (docSync.isBusy(id)) return;           // กำลังบันทึก/มีการแก้ไขในเครื่อง -> ให้ระบบตรวจชนกันตอนบันทึก
                const local = state.documentQueue.find(d => d.id === id);
                if (local && docSync.isDirty(local)) return;
                if (rec.x) {
                    if (!old && !local) return;
                    delete st.docs[id];
                    state.documentQueue = state.documentQueue.filter(d => d.id !== id);
                    docSync.forget(id);
                    Object.keys(state.activeDocIds).forEach(k => { if (state.activeDocIds[k] === id) PC.remoteTouched.add(id); });
                } else {
                    st.docs[id] = rec;
                    if (local) {
                        replaceInPlace(local, clone(rec.d));
                        if (Object.values(state.activeDocIds).includes(id)) PC.remoteTouched.add(id);
                    } else {
                        state.documentQueue.push(clone(rec.d));
                    }
                    if (Number(rec.d.stage) === 1 || (local && Number(local.stage) === 1)) stage1Touched = true;
                    touched.add(id);
                }
                what.docs = true;
            });
            if (stage1Touched) reorderStage1();
            if (what.docs) {
                const om = docSync.orders();
                state.documentQueue.forEach(d => {
                    if (!touched.has(d.id) && !(stage1Touched && Number(d.stage) === 1)) return;
                    const r = st.docs[d.id];
                    if (r && !docSync.isBusy(d.id) && !docSync.isDirtyAgainst(d, r)) docSync.markSynced(d, r, om);
                });
            }

            // ห้อง
            (data.rooms || []).forEach(rec => { if (rec.x) delete st.rooms[rec.d.id]; else st.rooms[rec.d.id] = rec; what.rooms = true; });
            const deferBuild = PC.inflightWrites > 0;
            if (what.rooms) { if (deferBuild) PC.needRebuild = true; else buildRooms(); }

            // ประกาศ + ความคิดเห็น
            (data.announcements || []).forEach(rec => {
                const id = rec.d.AssignmentID;
                if (rec.x) delete st.announcements[id];
                else {
                    // [v25 ข้อ 14] นับเป็น "จำนวนเรื่อง" ที่มีความเคลื่อนไหว (ไม่ใช่จำนวนความคิดเห็น)
                    if (!st.announcements[id] && rec.d.CreatedBy !== me) { PC.unreadAnn = PC.unreadAnn || new Set(); PC.unreadAnn.add(id); newActivity++; }
                    st.announcements[id] = rec;
                }
                what.ann = true;
            });
            (data.comments || []).forEach(rec => {
                const id = rec.d.CommentID;
                if (rec.x) delete st.comments[id];
                else {
                    if (!st.comments[id] && rec.d.UserId !== me) { PC.unreadAnn = PC.unreadAnn || new Set(); PC.unreadAnn.add(String(rec.d.AssignmentID)); newActivity++; }
                    st.comments[id] = rec;
                }
                what.ann = true;
            });
            if (what.ann) { if (deferBuild) PC.needRebuild = true; else buildAnnouncements(); }
            if (newActivity > 0 && !isVisible('tab-activities')) {
                PC.unreadActivities = PC.unreadAnn ? PC.unreadAnn.size : newActivity;
                updateActivitiesBadge(PC.unreadActivities);
            } else if (newActivity > 0 && PC.unreadAnn) {
                PC.unreadAnn.clear();                      // กำลังเปิดแท็บกิจกรรมอยู่ = เห็นแล้ว
            }

            // ปฏิทิน
            (data.events || []).forEach(rec => { if (rec.x) delete st.events[rec.d.id]; else st.events[rec.d.id] = rec; what.events = true; });
            if (what.events) { if (deferBuild) PC.needRebuild = true; else buildEvents(); }

            // กำหนดงาน [ข้อ 18]
            (data.tasks || []).forEach(rec => { if (rec.x) delete st.tasks[rec.d.id]; else st.tasks[rec.d.id] = rec; what.tasks = true; });
            if (what.tasks) { buildTasks(); }

            // [v28 ข้อ 3] การเปิดอ่านหนังสือของผู้รับขั้นตอนปัจจุบัน
            if (!st.reads) st.reads = {};
            (data.reads || []).forEach(rec => { if (rec.x) delete st.reads[rec.d.id]; else st.reads[rec.d.id] = rec; what.docs = true; });

            // ผู้ใช้งาน
            (data.users || []).forEach(u => {
                if (u.x) delete st.users[u.id]; else st.users[u.id] = u;
                what.users = true;
                if (me && u.id === me) {
                    if (u.x || u.active === false) { forceLogout('บัญชีของท่านถูกปิดการใช้งาน'); return; }
                    mergeMe(u);
                    what.rooms = true;
                    what.perm = true;   // [ข้อ 4] สิทธิ์ของตัวเองเปลี่ยน -> ต้องบังคับใช้ใหม่ทันที
                }
            });
            if (what.users) buildUsers();

            // ตั้งค่า
            if (data.settings && data.settings.length) {
                data.settings.forEach(s => { if (s.x) delete st.settings[s.key]; else st.settings[s.key] = s; });
                applySettings(data.settings, false);
            }
            rerenderAll(what);
        }

        function forceLogout(msg) {
            clearRemember();                     // [ข้อ 19] บัญชีถูกปิด -> ห้ามเข้าระบบอัตโนมัติอีก
            endSession();
            showLoginView();
            Swal.fire({ icon: 'warning', title: msg });
        }

        function replaceInPlace(target, fresh) {
            Object.keys(target).forEach(k => { if (!(k in fresh)) delete target[k]; });
            Object.keys(fresh).forEach(k => {
                const ov = target[k];
                if (ov !== undefined) {
                    const probe = { pending: [] };
                    const lv = lightify(ov, [k], probe);
                    if (!probe.pending.length && stableStr(lv) === stableStr(fresh[k])) return;
                }
                target[k] = fresh[k];
            });
        }

        function reorderStage1() {
            const st = PC.store;
            const q = state.documentQueue;
            const slots = [];
            const s1 = [];
            q.forEach((d, i) => { if (Number(d.stage) === 1) { slots.push(i); s1.push(d); } });
            const pos = new Map(s1.map((d, i) => [d, i]));
            s1.sort((a, b) => {
                const oa = st.docs[a.id] ? st.docs[a.id].o : null;
                const ob = st.docs[b.id] ? st.docs[b.id].o : null;
                if (oa === null || oa === undefined || ob === null || ob === undefined) return pos.get(a) - pos.get(b);
                return oa - ob;
            });
            slots.forEach((slot, i) => { q[slot] = s1[i]; });
        }

        // ---------------------------------------------------------------
        // 6) ระบบบันทึกหนังสือ (แยกไฟล์หนักไป Drive, ข้อมูลเบาไป Sheet)
        // ---------------------------------------------------------------
        const assetIds = new Map();   // เนื้อหาไฟล์ (data URL / JSON) -> Drive fileId
        PC.assetIds = assetIds;

        const isJsonPath = (path) => path[0] === 'canvasState' || path[0] === 'canvasStateHistory';
        const isToken = (s) => s.indexOf(ASSET) === 0 || s.indexOf(JSONTOK) === 0;

        function isHeavy(s, path) {
            if (!s || isToken(s)) return false;
            if (isJsonPath(path)) return true;
            return s.length > HEAVY_MIN && s.indexOf('data:') === 0;
        }

        function lightify(value, path, ctx) {
            if (typeof value === 'string') {
                if (!isHeavy(value, path)) return value;
                const id = assetIds.get(value);
                if (id) return (isJsonPath(path) ? JSONTOK : ASSET) + id;
                ctx.pending.push({ value: value, path: path.slice() });
                return '@@pending';
            }
            if (Array.isArray(value)) return value.map((v, i) => lightify(v, path.concat(i), ctx));
            if (value && typeof value === 'object') {
                const o = {};
                Object.keys(value).forEach(k => {
                    const v = value[k];
                    if (v === undefined || typeof v === 'function') return;
                    o[k] = lightify(v, path.concat(k), ctx);
                });
                return o;
            }
            if (typeof value === 'number' && !isFinite(value)) return null;
            return value;
        }
        PC.lightify = (doc) => lightify(doc, [], { pending: [] });

        function createdMs(doc) {
            const m = /doc_(\d{12,})/.exec(String(doc.rootDocId || doc.id || ''));
            if (m) return Number(m[1]);
            const r = PC.store && PC.store.docs[doc.id];
            return (r && r.c) || Date.now();
        }

        function routeOf(doc) {
            const main = (Array.isArray(doc.assignedGroups) && doc.assignedGroups[0]) || '';
            const sub = (Array.isArray(doc.subGroups) && doc.subGroups[0]) || '';
            if (!main && !sub) return { main: CENTRAL, sub: 'ทะเบียนรับกลาง' };
            return { main: main, sub: sub };
        }

        const FIELD_LABEL = { stampedImage: 'ภาพที่ประทับตรา', stampedCover: 'ภาพหน้าแรกที่ประทับตรา', currentImage: 'ภาพหนังสือ', originalFile: 'ต้นฉบับ', attachments: 'ไฟล์แนบ', imageHistory: 'ภาพก่อนประทับตรา', canvasState: 'ข้อมูลตราประทับ', canvasStateHistory: 'ประวัติตราประทับ', _embedded: 'ภาพประกอบตรา' };

        function fileNameFor(doc, path) {
            const rec = String(doc.receiveNo || 'รอเลขรับ').replace(/\//g, '-');
            let label = FIELD_LABEL[path[0]] || String(path[0]);
            if (path[0] === 'originalFile' && doc.originalFile && doc.originalFile.name) label = 'ต้นฉบับ_' + doc.originalFile.name;
            if (path[0] === 'attachments' && doc.attachments && doc.attachments[path[1]]) label = 'แนบ_' + doc.attachments[path[1]].name;
            const subj = String(doc.subject || doc.title || '').substring(0, 60);
            return (rec + '_' + label + '_' + subj).replace(/[\\/:*?"<>|]/g, ' ').substring(0, 150);
        }

        const docSync = {
            meta: {},              // id -> {rev, sig}
            busy: new Set(),
            timer: null, running: false, again: false, failed: false,
            reset() { this.meta = {}; this.busy.clear(); clearTimeout(this.timer); this.failed = false; },
            forget(id) { delete this.meta[id]; },
            orders() {
                const m = new Map();
                let i = 0;
                state.documentQueue.forEach(d => { if (d && Number(d.stage) === 1) m.set(d, i++); });
                return m;
            },
            order(doc, om) {
                if (Number(doc.stage) !== 1) return null;
                const v = (om || this.orders()).get(doc);
                return v === undefined ? null : v;
            },
            sig(doc, light, om) { return JSON.stringify(light) + '#' + (this.order(doc, om) ?? ''); },
            markSynced(doc, rec, om) {
                const probe = { pending: [] };
                const light = lightify(doc, [], probe);
                this.meta[doc.id] = { rev: rec ? rec.r : 0, sig: probe.pending.length ? '' : this.sig(doc, light, om) };
            },
            isBusy(id) { return this.busy.has(id); },
            isDirty(doc, om) {
                const m = this.meta[doc.id];
                if (!m) return true;
                const probe = { pending: [] };
                const light = lightify(doc, [], probe);
                return probe.pending.length > 0 || this.sig(doc, light, om) !== m.sig;
            },
            isDirtyAgainst(doc, rec) {
                const probe = { pending: [] };
                const light = lightify(doc, [], probe);
                return probe.pending.length > 0 || stableStr(light) !== stableStr(rec.d);
            },
            hasPending() {
                if (this.running || this.failed) return true;
                const om = this.orders();
                const ids = new Set(state.documentQueue.map(d => d && d.id));
                return state.documentQueue.some(d => d && d.id && this.isDirty(d, om)) ||
                    Object.keys(this.meta).some(id => !ids.has(id));
            },
            schedule(delay) {
                if (!PC.token) return;
                clearTimeout(this.timer);
                this.timer = setTimeout(() => { this.timer = null; this.run(); }, delay === undefined ? 1500 : delay);
            },
            async flush() {
                clearTimeout(this.timer);
                this.timer = null;
                const deadline = Date.now() + 25000;
                for (let i = 0; i < 4 && Date.now() < deadline; i++) {
                    while (this.running && Date.now() < deadline) await sleep(150);
                    await Promise.race([this.run(), sleep(Math.max(0, deadline - Date.now()))]);
                    if (!this.failed && !this.running) {
                        const om = this.orders();
                        const left = state.documentQueue.some(d => d && d.id && this.isDirty(d, om));
                        if (!left) return true;
                    }
                }
                return false;
            },
            async run() {
                if (!PC.token || !PC.store) return;
                if (this.running) { this.again = true; return; }
                this.running = true;
                this.again = false;
                const sentIds = [];
                try {
                    const dirty = [];
                    const present = new Set();
                    const om = this.orders();
                    for (const doc of state.documentQueue) {
                        if (!doc || !doc.id) continue;
                        present.add(doc.id);
                        const probe = { pending: [] };
                        const light = lightify(doc, [], probe);
                        const m = this.meta[doc.id];
                        if (m && !probe.pending.length && m.sig === this.sig(doc, light, om)) continue;
                        dirty.push({ doc: doc, pending: probe.pending });
                    }
                    const deletes = Object.keys(this.meta).filter(id => !present.has(id));
                    if (!dirty.length && !deletes.length) { this.failed = false; return; }
                    dirty.forEach(x => { this.busy.add(x.doc.id); sentIds.push(x.doc.id); });
                    deletes.forEach(id => { this.busy.add(id); sentIds.push(id); });
                    status.show('กำลังบันทึกหนังสือ ' + (dirty.length + deletes.length) + ' รายการ…', 'busy');

                    await uploadPending(dirty);

                    const items = [];
                    const om2 = this.orders();
                    dirty.forEach(x => {
                        if (!state.documentQueue.includes(x.doc)) return;
                        const probe = { pending: [] };
                        const light = lightify(x.doc, [], probe);
                        if (probe.pending.length) return;
                        const m = this.meta[x.doc.id];
                        items.push({ doc: x.doc, light: light, sig: this.sig(x.doc, light, om2), payload: { d: light, r: m ? m.rev : 0, o: this.order(x.doc, om2) } });
                    });
                    const delItems = deletes.map(id => ({ id: id, r: this.meta[id] ? this.meta[id].rev : 0 }));

                    // ส่งเป็นชุด ชุดละไม่เกิน ~1.5MB / 150 รายการ
                    const batches = [];
                    let cur = { docs: [], size: 0 };
                    items.forEach(it => {
                        const sz = it.sig.length;
                        if (cur.docs.length && (cur.size + sz > 1500000 || cur.docs.length >= 150)) { batches.push(cur); cur = { docs: [], size: 0 }; }
                        cur.docs.push(it);
                        cur.size += sz;
                    });
                    if (cur.docs.length || delItems.length) batches.push(cur);
                    let conflicts = 0;
                    for (let b = 0; b < batches.length; b++) {
                        const batch = batches[b];
                        const payload = { docs: batch.docs.map(x => x.payload) };
                        if (b === batches.length - 1 && delItems.length) payload.deletes = delItems;
                        const res = await api('saveDocs', payload, { timeout: 120000 });
                        const byId = {};
                        batch.docs.forEach(x => { byId[x.doc.id] = x; });
                        (res.saved || []).forEach(s => {
                            const x = byId[s.id];
                            if (x) {
                                this.meta[s.id] = { rev: s.rev, sig: x.sig };
                                PC.store.docs[s.id] = { d: x.light, r: s.rev, u: s.updatedAt, o: x.payload.o, c: s.createdAt || (PC.store.docs[s.id] && PC.store.docs[s.id].c) || s.updatedAt, x: 0 };
                            } else {
                                delete this.meta[s.id];
                                delete PC.store.docs[s.id];
                            }
                        });
                        (res.conflicts || []).forEach(c => { conflicts++; adoptServerDoc(c.record); });
                    }
                    this.failed = false;
                    if (conflicts) {
                        rerenderAll({ docs: true });
                        Swal.fire({ icon: 'info', title: 'มีผู้ใช้อื่นแก้ไขหนังสือพร้อมกัน', text: 'ระบบได้โหลดข้อมูลฉบับล่าสุดจากเซิร์ฟเวอร์ให้แล้ว (' + conflicts + ' รายการ)' });
                    }
                    status.show('บันทึกข้อมูลเรียบร้อย', 'ok', 1600);
                    saveSnapshotSoon();
                } catch (e) {
                    console.error('[PC] save docs error', e);
                    this.failed = true;
                    status.show('บันทึกไม่สำเร็จ: ' + e.message + ' (จะลองใหม่อัตโนมัติ)', 'error');
                    this.schedule(15000);
                } finally {
                    sentIds.forEach(id => this.busy.delete(id));
                    this.running = false;
                    if (this.again) { this.again = false; this.schedule(300); }
                }
            }
        };
        PC.docSync = docSync;

        function adoptServerDoc(rec) {
            const id = rec.d.id;
            const idx = state.documentQueue.findIndex(d => d.id === id);
            if (rec.x) {
                delete PC.store.docs[id];
                if (idx >= 0) state.documentQueue.splice(idx, 1);
                docSync.forget(id);
                return;
            }
            PC.store.docs[id] = rec;
            if (idx >= 0) replaceInPlace(state.documentQueue[idx], clone(rec.d));
            else state.documentQueue.push(clone(rec.d));
            const doc = state.documentQueue.find(d => d.id === id);
            if (Object.values(state.activeDocIds).includes(id)) PC.remoteTouched.add(id);
            docSync.markSynced(doc, rec);
            if (docSync.isDirtyAgainst(doc, rec)) docSync.meta[id].sig = '';
        }

        async function uploadPending(dirty) {
            const jobs = new Map();
            dirty.forEach(x => x.pending.forEach(p => {
                if (!assetIds.has(p.value) && !jobs.has(p.value)) jobs.set(p.value, { value: p.value, path: p.path, doc: x.doc });
            }));
            if (!jobs.size) return;
            const all = Array.from(jobs.values());
            const jsonJobs = all.filter(j => isJsonPath(j.path));
            const binJobs = all.filter(j => !isJsonPath(j.path));
            // ภาพที่ฝังอยู่ในข้อมูลตราประทับ (เช่น ภาพพื้นหลัง/ลายเซ็น)
            const embedded = new Map();
            const re = /"(data:[^"]{1500,})"/g;
            jsonJobs.forEach(j => {
                let m;
                re.lastIndex = 0;
                while ((m = re.exec(j.value)) !== null) {
                    if (!assetIds.has(m[1]) && !jobs.has(m[1]) && !embedded.has(m[1])) embedded.set(m[1], { value: m[1], path: ['_embedded'], doc: j.doc });
                }
            });
            await uploadJobs(binJobs.concat(Array.from(embedded.values())).map(j => ({
                data: j.value, kind: 'data', name: fileNameFor(j.doc, j.path), route: routeOf(j.doc), date: createdMs(j.doc), job: j,
                // [v35 ข้อ 2] ภาพหน้ากระดาษของหนังสือชั้น "ทั่วไป" : เปิดแชร์แบบลิงก์ตั้งแต่อัปโหลด -> เปิดดูครั้งแรกก็โหลดตรงจาก Google ได้
                pub: (j.path[0] === 'currentImage' || j.path[0] === 'stampedImage' || j.path[0] === 'stampedCover') && (!j.doc.secrecy || j.doc.secrecy === 'normal') && /^data:image\//.test(j.value)
            })));
            await uploadJobs(jsonJobs.map(j => ({
                data: j.value.replace(/"(data:[^"]{1500,})"/g, (all0, d) => {
                    const id = assetIds.get(d);
                    return id ? '"' + ASSET + id + '"' : all0;
                }),
                kind: 'text', name: fileNameFor(j.doc, j.path), route: routeOf(j.doc), date: createdMs(j.doc), job: j
            })));
        }

        async function uploadJobs(list) {
            if (!list.length) return;
            const batches = [];
            let cur = [], size = 0;
            list.forEach(f => {
                const len = f.data.length;
                if (cur.length && (size + len > 6000000 || cur.length >= 10)) { batches.push(cur); cur = []; size = 0; }
                cur.push(f);
                size += len;
            });
            if (cur.length) batches.push(cur);
            let done = 0;
            await runPool(batches, 2, async (batch) => {
                const res = await api('uploadAssets', {
                    files: batch.map((f, i) => ({ key: String(i), data: f.data, kind: f.kind, name: f.name, route: f.route, date: f.date }))
                }, { timeout: 300000, retries: 1 });
                res.forEach(r => {
                    const f = batch[Number(r.key)];
                    if (!f || !r.id) return;
                    assetIds.set(f.job.value, r.id);
                    assetCache.put(r.id, f.kind === 'text' ? f.data : f.job.value);
                });
                done += batch.length;
                status.show('กำลังอัปโหลดไฟล์ไป Google Drive ' + done + '/' + list.length, 'busy');
            });
        }

        // ---------------------------------------------------------------
        // 7) โหลดไฟล์หนักเมื่อจำเป็น (Lazy load + แคชในเครื่อง)
        // ---------------------------------------------------------------
        const inflight = new Map();
        const HYDRATE_GROUPS = {
            image: [['currentImage'], ['canvasState']],   // [v27] ภาพพร้อมตราสร้างจาก canvasState
            core: [['currentImage'], ['canvasState']],
            original: [['originalFile', 'content']],
            attachments: [['attachments', '*', 'content']],
            history: [['imageHistory', '*'], ['canvasStateHistory', '*']],
            imgonly: [['currentImage']]                   // [v34] ใช้เฉพาะกรณีสร้างภาพจากข้อมูลตราไม่ได้
        };
        HYDRATE_GROUPS.all = [].concat(HYDRATE_GROUPS.core, HYDRATE_GROUPS.original, HYDRATE_GROUPS.attachments, HYDRATE_GROUPS.history);

        function collectTokens(doc, group) {
            const out = [];
            /* [v34] หนังสือที่มีข้อมูลตรา (canvasState) : หน้าลงนามและหน้าดูหนังสือสร้างภาพจากข้อมูลตรา + ภาพพื้นหลังในนั้น
               จึงไม่ต้องโหลดภาพหน้ากระดาษ (currentImage) ซ้ำอีกไฟล์ -> หนังสือเก่าโหลดน้อยลงครึ่งหนึ่ง */
            const skipImage = (group === 'image' || group === 'core') && !!(doc && doc.canvasState);
            (HYDRATE_GROUPS[group] || []).forEach(path => {
                if (skipImage && path[0] === 'currentImage') return;
                const walk = (obj, i) => {
                    if (!obj || typeof obj !== 'object') return;
                    const key = path[i];
                    const keys = key === '*' ? Object.keys(obj) : [key];
                    keys.forEach(k => {
                        if (i === path.length - 1) {
                            const v = obj[k];
                            if (typeof v === 'string' && isToken(v)) out.push({ obj: obj, key: k, token: v });
                        } else {
                            walk(obj[k], i + 1);
                        }
                    });
                };
                walk(doc, 0);
            });
            return out;
        }
        const needsHydrate = (doc, group) => !!doc && collectTokens(doc, group).length > 0;

        /* [v35 ข้อ 2] โหลดภาพตรงจาก Google (ไม่ผ่าน Apps Script) สำหรับหนังสือชั้น "ทั่วไป"
           ไฟล์ภาพถูกตั้งเป็น "ทุกคนที่มีลิงก์ดูได้" -> ดึงจาก lh3.googleusercontent.com ได้ทันที
           ยังไม่ได้แชร์ / โดเมนไม่อนุญาต -> คืน null แล้วไปโหลดผ่านเซิร์ฟเวอร์ตามเดิม (พร้อมขอให้เปิดแชร์ไว้ใช้ครั้งถัดไป) */
        const CDN = { ok: 0, fail: 0, off: false };
        PC.cdnStatus = () => Object.assign({}, CDN);
        async function fetchCdn(id) {
            if (CDN.off) return null;
            const ctrl = new AbortController();
            const tm = setTimeout(() => ctrl.abort(), 12000);
            try {
                const res = await fetch('https:/\/lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=s0', { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const blob = await res.blob();
                if (!/^image\//.test(blob.type) || blob.size < 300) throw new Error('not image');
                const data = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
                CDN.ok++;
                return data;
            } catch (e) {
                CDN.fail++;
                if (CDN.fail >= 8 && CDN.ok === 0) CDN.off = true;     // ใช้ไม่ได้ในเครือข่าย/โดเมนนี้ -> เลิกลองในรอบการใช้งานนี้
                return null;
            } finally {
                clearTimeout(tm);
            }
        }

        async function fetchRaw(ids, opt) {
            opt = opt || {};
            const out = {};
            let missing = [];
            await Promise.all(ids.map(async id => {
                const v = await assetCache.get(id);
                if (v !== undefined) out[id] = v; else missing.push(id);
            }));
            if (opt.cdn && missing.length) {
                const got = await Promise.all(missing.map(id => fetchCdn(id)));
                const left = [];
                missing.forEach((id, i) => { if (got[i]) { out[id] = got[i]; assetCache.put(id, got[i]); } else left.push(id); });
                missing = left;
            }
            const chunks = [];
            for (let i = 0; i < missing.length; i += 4) chunks.push(missing.slice(i, i + 4));
            await runPool(chunks, 2, async (chunk) => {
                // [v34] expand : เซิร์ฟเวอร์ส่งภาพที่ข้อมูลตราอ้างถึงมาในคำตอบเดียวกัน (ไม่ต้องขอรอบที่ 2)
                const req = { ids: chunk, expand: opt.expand !== false };
                if (opt.skipBg) req.skipBg = true;                      // [v35] ภาพพื้นหลังดึงตรงจาก Google เอง
                if (opt.pub) req.pub = chunk;                           // [v35] ขอให้เปิดแชร์ภาพไว้ใช้ครั้งถัดไป
                const res = await api('getAssets', req, { timeout: 180000 });
                Object.keys(res || {}).forEach(id => {
                    const r = res[id];
                    if (id.charAt(0) !== '_' && chunk.indexOf(id) === -1 && r && r.t !== 'error' && typeof r.v === 'string') assetCache.put(id, r.v);
                });
                chunk.forEach(id => {
                    const r = res[id];
                    if (!r || r.t === 'error') throw new Error('ไม่สามารถโหลดไฟล์จาก Drive ได้ (' + ((r && r.v) || id) + ')');
                    out[id] = r.v;
                    assetCache.put(id, r.v);
                });
            });
            return out;
        }

        /** [v35] ดึงไฟล์ของ token ลงแคชในเครื่องเท่านั้น (ไม่เก็บในหน่วยความจำ) ใช้กับการโหลดล่วงหน้า
            pub = หนังสือชั้น "ทั่วไป" : ข้อมูลตราขอจากเซิร์ฟเวอร์ (เล็ก) ส่วนภาพดึงตรงจาก Google */
        async function warmToken(token, pub) {
            if (token.indexOf(ASSET) === 0) { await fetchRaw([token.substring(ASSET.length)], { cdn: pub, pub: pub }); return; }
            const id = token.substring(JSONTOK.length);
            const text = (await fetchRaw([id], { skipBg: pub }))[id];
            const inner = [];
            String(text || '').replace(/"@@asset:([^"]+)"/g, (m, x) => { inner.push(x); return m; });
            await fetchInner(text, inner, pub);
        }
        PC.warmToken = warmToken;
        /** ภาพที่ข้อมูลตราอ้างถึง : เฉพาะ "ภาพพื้นหลังหน้ากระดาษ" ที่โหลดตรงจาก Google / เปิดแชร์ได้
            ภาพอื่นในตรา (เช่น ลายเซ็น) โหลดผ่านเซิร์ฟเวอร์เสมอ และไม่ถูกเปิดแชร์ */
        async function fetchInner(text, inner, pub) {
            const ids = Array.from(new Set(inner));
            if (!ids.length) return {};
            let bg = '';
            if (pub) { const m = /"backgroundImage"\s*:\s*\{[^{}]*?"src"\s*:\s*"@@asset:([^"]+)"/.exec(String(text || '')); bg = m ? m[1] : ''; }
            if (!bg) return fetchRaw(ids);
            const rest = ids.filter(x => x !== bg);
            const [a, b] = await Promise.all([fetchRaw([bg], { cdn: true, pub: true }), rest.length ? fetchRaw(rest) : Promise.resolve({})]);
            return Object.assign({}, b, a);
        }

        function resolveToken(token, o) {
            if (inflight.has(token)) return inflight.get(token);
            o = o || {};
            const img = { cdn: !!(o.pub && o.img), pub: !!(o.pub && o.img) };
            const p = (async () => {
                if (token.indexOf(ASSET) === 0) {
                    const id = token.substring(ASSET.length);
                    const v = (await fetchRaw([id], img))[id];
                    assetIds.set(v, id);
                    return v;
                }
                const id = token.substring(JSONTOK.length);
                // หนังสือชั้น "ทั่วไป" : ขอเฉพาะข้อมูลตรา (เล็ก) จากเซิร์ฟเวอร์ แล้วดึงภาพพื้นหลังตรงจาก Google
                const text = (await fetchRaw([id], { skipBg: img.cdn }))[id];
                const inner = [];
                text.replace(/"@@asset:([^"]+)"/g, (m, x) => { inner.push(x); return m; });
                const vals = await fetchInner(text, inner, img.cdn);
                inner.forEach(x => assetIds.set(vals[x], x));
                const full = text.replace(/"@@asset:([^"]+)"/g, (m, x) => JSON.stringify(vals[x]));
                assetIds.set(full, id);
                return full;
            })();
            inflight.set(token, p);
            p.then(() => inflight.delete(token), () => inflight.delete(token));
            return p;
        }

        const hydratedOrder = [];
        async function hydrateDoc(doc, group, opt) {
            opt = opt || {};
            const toks = collectTokens(doc, group);
            if (!toks.length) return true;
            const uniq = Array.from(new Set(toks.map(t => t.token)));
            if (!opt.silent) loadProg.begin('กำลังโหลดไฟล์หนังสือจาก Google Drive', uniq.length);   // [v39] แถบความก้าวหน้า + %
            try {
                const vals = {};
                // [v35 ข้อ 2] หนังสือชั้น "ทั่วไป" + ไฟล์ภาพหน้ากระดาษ -> โหลดตรงจาก Google ได้
                const ro = { pub: !doc.secrecy || doc.secrecy === 'normal', img: group === 'image' || group === 'core' || group === 'imgonly' };
                await Promise.all(uniq.map(async t => { vals[t] = await resolveToken(t, ro); if (!opt.silent) loadProg.step(); }));
                toks.forEach(t => { if (t.obj[t.key] === t.token) t.obj[t.key] = vals[t.token]; });
                const i = hydratedOrder.indexOf(doc.id);
                if (i >= 0) hydratedOrder.splice(i, 1);
                hydratedOrder.push(doc.id);
                evictHydrated();
                if (!opt.silent) loadProg.end(true);
                return true;
            } catch (e) {
                console.error('[PC] hydrate error', e);
                if (!opt.silent) {
                    loadProg.end(false);
                    Swal.fire({ icon: 'error', title: 'โหลดไฟล์หนังสือไม่สำเร็จ', text: e.message });
                }
                return false;
            }
        }
        PC.hydrateDoc = hydrateDoc;

        // คืนหน่วยความจำ: เอกสารที่ไม่ได้เปิดใช้งาน เปลี่ยนไฟล์กลับเป็นตัวอ้างอิง
        function evictHydrated() {
            if (hydratedOrder.length <= 25) return;
            const active = new Set(Object.values(state.activeDocIds).filter(Boolean));
            while (hydratedOrder.length > 20) {
                const id = hydratedOrder[0];
                const doc = state.documentQueue.find(d => d.id === id);
                hydratedOrder.shift();
                if (!doc || active.has(id) || docSync.isBusy(id) || docSync.isDirty(doc)) continue;
                const probe = { pending: [] };
                const light = lightify(doc, [], probe);
                if (probe.pending.length) continue;
                replaceInPlace(doc, {});
                Object.assign(doc, clone(light));
            }
        }

        const findDoc = (id) => state.documentQueue.find(d => d.id === id);

        function prefetchNext(stage, currentId) {
            const items = state.documentQueue.filter(d => Number(d.stage) === Number(stage));
            const i = items.findIndex(d => d.id === currentId);
            items.slice(i + 1, i + 3).forEach(d => { if (needsHydrate(d, 'core')) hydrateDoc(d, 'core', { silent: true }); });
        }

        // ---------------------------------------------------------------
        // 8) ครอบฟังก์ชันเดิมของหน้าเว็บ
        // ---------------------------------------------------------------
        function wrapAfter(name, delay) {
            const orig = window[name];
            if (typeof orig !== 'function') return;
            window[name] = function () {
                const r = orig.apply(this, arguments);
                if (r && typeof r.then === 'function') r.then(() => docSync.schedule(delay), () => docSync.schedule(delay));
                else docSync.schedule(delay);
                return r;
            };
        }
        ['forwardDoc', 'forwardDocToDirector', 'deleteDoc', 'drop', 'autoRunReceiveNumbers', 'handleFileUpload',
            'handleAttachmentsUpload', 'applyAdminStamp', 'applyAdminGroupReceiveStamp', 'applySubgroupAdminReceiveStamp',
            'deleteActiveAdminDoc'
        ].forEach(n => wrapAfter(n, 800));
        ['updateActiveDocPriority', 'updateActiveDocCategories', 'updateActiveDocField'].forEach(n => wrapAfter(n, 2500));

        (function () {
            const orig = window.recallDocument;
            if (typeof orig !== 'function') return;
            window.recallDocument = function () {
                const r = orig.apply(this, arguments);
                docSync.schedule(2500);
                setTimeout(() => docSync.schedule(300), 8000);
                return r;
            };
        })();

        (function () {
            const orig = window.selectDoc;
            window.selectDoc = function (docId, stage) {
                const cur = state.activeDocIds[stage];
                if (cur && PC.remoteTouched.has(cur)) {
                    // เอกสารเดิมถูกแก้ไขโดยผู้ใช้อื่น -> ไม่เขียนทับ
                    state.activeDocIds[stage] = null;
                    PC.remoteTouched.delete(cur);
                    toast('info', 'หนังสือฉบับก่อนหน้าถูกอัปเดตโดยผู้ใช้อื่น ระบบใช้ข้อมูลล่าสุด');
                }
                const doc = findDoc(docId);
                const go = () => {
                    const r = orig.call(this, docId, stage);
                    PC.remoteTouched.delete(docId);
                    docSync.schedule(1500);
                    prefetchNext(stage, docId);
                    return r;
                };
                if (doc && needsHydrate(doc, 'core')) {
                    return hydrateDoc(doc, 'core').then(ok => (ok ? go() : undefined));
                }
                return go();
            };
        })();

        function wrapHydrate(name, group, argIndex, after) {
            const orig = window[name];
            if (typeof orig !== 'function') return;
            window[name] = function () {
                const args = arguments;
                const doc = findDoc(args[argIndex || 0]);
                const call = () => {
                    const r = orig.apply(this, args);
                    if (after && doc) after(doc);
                    return r;
                };
                if (doc && needsHydrate(doc, group)) return hydrateDoc(doc, group).then(ok => (ok ? call() : undefined));
                return call();
            };
        }
        /* [v34] เดิม : ทุกครั้งที่เปิดดูหนังสือ ระบบโหลด "ไฟล์ต้นฉบับ + ไฟล์แนบทุกไฟล์" ตามมาเบื้องหลังทันที
                  (ไฟล์ PDF หลาย MB ต่อครั้ง ทั้งที่ผู้ใช้ส่วนใหญ่ไม่ได้กดดู) -> คำขอซ้อนกันจนช้าและล่ม
           ใหม่ : โหลดเฉพาะเมื่อผู้ใช้กดปุ่ม ไฟล์ต้นฉบับ / ไฟล์แนบ เท่านั้น */
        const warmViewer = (doc) => { /* ไม่โหลดล่วงหน้าแล้ว */ };
        wrapHydrate('viewFinalDocument', 'image', 0, warmViewer);
        wrapHydrate('viewMainDocument', 'image', 0, warmViewer);
        wrapHydrate('downloadFinalDoc', 'image', 0);
        wrapHydrate('printFinalDoc', 'image', 0);
        wrapHydrate('exportFinalPdf', 'image', 0);
        wrapHydrate('viewOriginalDocument', 'original', 0);
        wrapHydrate('printOriginalDocument', 'original', 0);
        wrapHydrate('previewAttachments', 'attachments', 0);
        wrapHydrate('printAttachment', 'attachments', 1);

        window.shareFinalDoc = async function (docId) {
            const doc = findDoc(docId);
            if (!doc) return;
            try {
                status.show('กำลังเตรียมลิงก์แชร์…', 'busy');
                await docSync.flush();
                const light = PC.lightify(doc);
                const tok = String(light.currentImage || '');
                if (tok.indexOf(ASSET) !== 0) throw new Error('หนังสือยังไม่ถูกบันทึกขึ้น Google Drive');
                const res = await api('shareAsset', { id: tok.substring(ASSET.length) });
                status.hide();
                try { await navigator.clipboard.writeText(res.url); } catch (e) { /* ข้าม */ }
                Swal.fire({ icon: 'success', title: 'คัดลอกลิงก์แชร์แล้ว', html: '<input class="w-full p-2 border rounded-lg text-xs" readonly value="' + esc(res.url) + '" onclick="this.select()"><a href="' + esc(res.url) + '" target="_blank" class="inline-block mt-3 text-blue-600 font-bold text-sm">เปิดลิงก์</a>' });
            } catch (e) {
                status.hide();
                Swal.fire({ icon: 'error', title: 'แชร์ไม่สำเร็จ', text: e.message });
            }
        };

        (function () {
            const orig = window.openWorkspaceModal;
            window.openWorkspaceModal = function (tabName, docId) {
                // [ชุด 3 ข้อ 7] เปิดจากปุ่ม "ลงนาม" (ตรวจสิทธิ์ตามขั้นตอน/กลุ่มแล้ว) -> ไม่ต้องมีสิทธิ์เห็นแท็บ
                if (!tabAllowed(tabName) && PC.signBypass !== tabName) {
                    Swal.fire('ไม่มีสิทธิ์', 'บัญชีของท่านไม่ได้รับสิทธิ์ใช้งานเมนูนี้', 'warning');
                    return;
                }
                const doc = docId ? findDoc(docId) : null;
                if (doc && needsHydrate(doc, 'core')) hydrateDoc(doc, 'core', { silent: true });
                return orig.apply(this, arguments);
            };
        })();

        // ---------------------------------------------------------------
        // [ข้อ 4] บังคับใช้สิทธิ์จริง : สิทธิ์เข้าห้อง (rooms) + สิทธิ์มองเห็น Tab (tabs)
        // ---------------------------------------------------------------
        function tabAllowed(tab) {
            if (!PC.user) return true;
            if (realRole() === 'ADMIN') return true;             // ผู้ดูแลระบบเห็นทุกแท็บเสมอ
            if (tab === 'settings') return false;                // แท็บตั้งค่าระบบ = ADMIN เท่านั้น
            if (tab === 'tasks') return true;                    // [ชุด 3 ข้อ 8] แท็บกำหนดงานเป็นค่าเริ่มต้นของทุกคน
            /* [ชุด 3 ข้อ 1] ผอ. / รอง ผอ. / ผช.ผอ. / ผู้รับผิดชอบ : ไม่แสดงแท็บลงนามของตนเอง
               เข้าหน้าลงนามได้ทางปุ่ม "ลงนาม" ในกล่องหนังสือเข้าเท่านั้น (ข้อ 7 : goToSign เปิดให้โดยตรง) */
            if (['Director', 'ActingDirector', 'SubdirectorGroup', 'AssistantGroup', 'Assignee'].includes(realRole()) &&
                ['director', 'subdirectorgroup', 'assistantgroup', 'assignee'].includes(tab)) return false;
            const tabs = PC.user.tabs || [];
            return !tabs.length || tabs.includes(tab);           // ไม่เลือกเลย = ใช้สิทธิ์ตามบทบาทเดิม
        }
        PC.tabAllowed = tabAllowed;

        /** รหัสห้องที่ผู้ใช้เข้าได้ ('' = ไม่จำกัดโดยการตั้งค่า ให้ใช้กติกาตามตำแหน่ง) */
        function grantedRoomIds() {
            if (!PC.user || realRole() === 'ADMIN') return null;
            const ids = PC.user.rooms || [];
            return ids.length ? ids : null;
        }
        function roomAllowed(roomId, roomName) {
            const ids = grantedRoomIds();
            if (!ids) return true;
            if (roomId && ids.includes(roomId)) return true;
            if (roomName) {
                const hit = (defaultRooms || []).find(r => r.name === roomName);
                if (hit && ids.includes(hit.id)) return true;
            }
            return false;
        }
        PC.roomAllowed = roomAllowed;

        /* [ข้อ 17] ทำให้ "สิทธิ์การมองเห็น Tab" ใช้งานได้จริง
           ปัญหาเดิม : applyRolePermissions() ซ่อนปุ่มแท็บทั้งหมดก่อน แล้วค่อยเปิดเฉพาะ
                       activities / alldocs / calendar / inbox / settings / mywork
                       ส่วนแท็บทำงาน (director, admingroup, subdirectorgroup, subgroupadmin,
                       assistantgroup, assignee) ถูก comment คำสั่ง remove('hidden') ทิ้งไว้
                       จึงไม่มีทางแสดงได้เลย ต่อให้ผู้ดูแลระบบติ๊กอนุญาตไว้ก็ตาม
                       และ enforceTabPermissions เดิม "ซ่อนอย่างเดียว ไม่เคยแสดง"
           วิธีแก้    : เมื่อผู้ใช้มีการกำหนด tabs ไว้ชัดเจน ให้ "แสดง" แท็บที่อนุญาตด้วย
                       (ADMIN ตัวจริงเห็นทุกแท็บเสมอ) */
        function enforceTabPermissions() {
            if (!PC.user) return null;
            const isAdmin = realRole() === 'ADMIN';
            const explicit = (PC.user.tabs || []).length > 0;
            let firstAllowed = null;

            document.querySelectorAll('.tab-btn').forEach(btn => {
                const t = btn.id.replace('tab-btn-', '');
                const panel = document.getElementById('tab-' + t);
                const allowed = tabAllowed(t);

                if (!allowed) {
                    btn.classList.add('hidden');
                    if (panel) panel.classList.add('hidden');
                    return;
                }
                // แสดงแท็บที่อนุญาต : ADMIN เห็นทุกแท็บ / ผู้ใช้ที่ถูกกำหนด tabs ไว้ให้เห็นตามที่กำหนด
                if (isAdmin || explicit) {
                    if (t !== 'settings' || isAdmin) btn.classList.remove('hidden');
                }
                if (!firstAllowed && !btn.classList.contains('hidden')) firstAllowed = t;
            });
            return firstAllowed;
        }
        PC.enforceTabPermissions = enforceTabPermissions;

        (function () {
            const orig = window.applyRolePermissions;
            window.applyRolePermissions = function () {
                const r = orig.apply(this, arguments);
                // แท็บ "ตั้งค่าระบบ" ต้องอิงบทบาทจริงในฐานข้อมูล ไม่ใช่ state.user.role
                const settingsBtn = document.getElementById('tab-btn-settings');
                if (realRole() === 'ADMIN') {
                    // [ข้อ 17] ผู้ดูแลระบบเห็นทุกแท็บเสมอ (รวมแท็บทำงานทุกขั้นตอน)
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('hidden'));
                } else if (settingsBtn) {
                    settingsBtn.classList.add('hidden');
                }
                enforceTabPermissions();
                // [ข้อ 23] วางปุ่มประทับตรา + ส่งต่อ ไว้ใต้ส่วนลายเซ็นของทุกแผง
                // [ข้อ 22] เติมลายเซ็นที่บันทึกไว้ให้อัตโนมัติ
                setTimeout(() => {
                    try { if (typeof window.renderAllSignPanelActions === 'function') window.renderAllSignPanelActions(); } catch (e) { /* ข้าม */ }
                    try { if (typeof window.autoApplyAllSignatures === 'function') window.autoApplyAllSignatures(); } catch (e) { /* ข้าม */ }
                }, 300);
                return r;
            };
        })();

        (function () {
            const orig = window.openRoom;
            window.openRoom = function (roomId, roomName) {
                // [ข้อ 4] กันเข้าห้องที่ไม่ได้รับสิทธิ์ (เช่น ถูกเรียกจากโค้ดอื่น หรือกดย้อนกลับ)
                if (!roomAllowed(roomId, roomName)) {
                    Swal.fire('ไม่มีสิทธิ์เข้าห้องนี้', 'บัญชีของท่านไม่ได้รับสิทธิ์เข้าใช้งาน "' + esc(roomName || roomId) + '"', 'warning');
                    document.getElementById('view-room')?.classList.add('hidden');
                    document.getElementById('view-dashboard')?.classList.remove('hidden');
                    return;
                }
                const r = orig.apply(this, arguments);
                const actBtn = document.getElementById('tab-btn-activities');
                if (actBtn && actBtn.classList.contains('hidden')) {
                    const first = Array.from(document.querySelectorAll('.tab-btn')).find(b => !b.classList.contains('hidden'));
                    if (first) switchTab(first.id.replace('tab-btn-', ''));
                }
                updateNavBack();                                   // [รอบ 5 ข้อ 3]
                return r;
            };
        })();

        (function () {
            const orig = window.switchTab;
            window.switchTab = function (tabName) {
                // [ข้อ 4] ห้ามเปิดแท็บที่ไม่มีสิทธิ์ แม้จะถูกเรียกจากโค้ดภายใน
                if (tabName && !tabAllowed(tabName)) {
                    const fallback = enforceTabPermissions();
                    if (fallback && fallback !== tabName) return window.switchTab(fallback);
                    Swal.fire('ไม่มีสิทธิ์', 'บัญชีของท่านไม่ได้รับสิทธิ์ใช้งานเมนูนี้', 'warning');
                    return;
                }
                const r = orig.apply(this, arguments);
                if (tabName === 'activities') {
                    PC.unreadActivities = 0;
                    if (PC.unreadAnn) PC.unreadAnn.clear();      // [v25 ข้อ 14]
                    if (PC.pendingAnnRender) safeRenderAssignments();
                }
                if (tabName === 'settings') {
                    renderUsersTable();
                    if (isVisible('subtab-settings-stats')) renderSettingsStats(1);
                }
                return r;
            };
        })();

        (function () {
            const orig = window.switchSubTab;
            window.switchSubTab = function (subTabId) {
                const r = orig.apply(this, arguments);
                if (subTabId === 'settings-users') renderUsersTable();
                if (subTabId === 'settings-stats') renderSettingsStats(1);
                return r;
            };
        })();

        // หน้าเว็บตั้งค่าห้องเริ่มต้นใน window.onload -> ใช้ข้อมูลจากฐานข้อมูลแทนเมื่อโหลดแล้ว
        (function () {
            const orig = window.onload;
            window.onload = function (ev) {
                if (typeof orig === 'function') orig.call(window, ev);
                if (PC.rooms) {
                    defaultRooms = PC.rooms.slice();
                    if (isVisible('view-dashboard')) renderDashboardRooms();
                }
            };
        })();

        // บันทึกอัตโนมัติเมื่อมีการกรอกข้อมูลในหน้าลงรับ/สั่งการ
        ['change', 'input'].forEach(evt => document.addEventListener(evt, (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            if (t.closest('[id^="tab-"]') && !t.closest('#tab-settings') && !t.closest('#tab-activities') && !t.closest('#tab-calendar')) {
                docSync.schedule(2500);
            }
        }, true));

        // ---------------------------------------------------------------
        // 9) ห้องหนังสือ (Dashboard Rooms)
        // ---------------------------------------------------------------
        /** [รอบ 5 ข้อ 3] รายชื่อห้องที่ผู้ใช้เข้าได้ (คำนวณอย่างเดียว ไม่วาดหน้าจอ) ใช้ร่วมกับปุ่มย้อนกลับบน navbar */
        function allowedRoomList() {
            const title = (state.user && state.user.title) || '';
            let allowedRooms = [];
            let showAll = false;

            if (title === 'ผู้ดูแลระบบ (ADMIN)' || title === 'ผอ.' || title === 'รักษาการ ผอ.') {
                showAll = true;
            } else if (title === 'ธุรการกลาง') {
                allowedRooms = [CENTRAL];
            } else if (title.indexOf('รอง ผอ. ') === 0) {
                const main = title.replace('รอง ผอ. ', '').trim();
                allowedRooms = [main].concat(defaultRooms.filter(r => r.parent === main).map(r => r.name));
                if (allowedRooms.length === 1) {
                    const legacy = {
                        'กลุ่มบริหารวิชาการ': ['กลุ่มงานการจัดการศึกษา', 'กลุ่มงานพัฒนาโครงการพิเศษ'],
                        'กลุ่มบริหารงบประมาณ': ['กลุ่มงานอำนวยการ', 'กลุ่มงานแผนงาน การเงิน พัสดุและสินทรัพย์'],
                        'กลุ่มบริหารงานบุคคล': ['กลุ่มงานบุคลากร', 'กลุ่มงานกิจการนักเรียน'],
                        'กลุ่มบริหารทั่วไป': ['กลุ่มงานอาคารสถานที่ฯ', 'กลุ่มงานชุมชนและภาคีเครือข่าย']
                    };
                    allowedRooms = allowedRooms.concat(legacy[main] || []);
                }
            } else if (title.includes('ผช. ผอ.')) {
                allowedRooms = [title.replace('ผช. ผอ. ', '').trim()];
            } else if (title.includes('ธุรการกลุ่มบริหาร') || title.includes('ธุรการกลุ่มงาน')) {
                allowedRooms = [title.replace('ธุรการ', '').trim()];
            } else if (title === 'ผู้รับผิดชอบ (ครู)') {
                const g = (state.user.group || '').replace(/ฯ/g, '').trim();
                const match = g ? defaultRooms.find(r => r.name.replace(/ฯ/g, '').trim() === g) : null;
                allowedRooms = match ? [match.name] : ['กลุ่มงานการจัดการศึกษา'];
            }

            // [ข้อ 12] ผู้ใช้ที่สังกัดมากกว่า 1 กลุ่มงาน -> เห็นห้องของทุกกลุ่มที่สังกัด
            const myGroups = Array.isArray(state.user.groups) ? state.user.groups : [];
            if (!showAll && myGroups.length > 1) {
                myGroups.forEach(g => {
                    const gg = String(g).replace(/ฯ/g, '').trim();
                    if (!gg) return;
                    defaultRooms.forEach(r => {
                        const rn = String(r.name).replace(/ฯ/g, '').trim();
                        if (rn === gg && !allowedRooms.includes(r.name)) allowedRooms.push(r.name);
                        if (r.parent && String(r.parent).replace(/ฯ/g, '').trim() === gg && !allowedRooms.includes(r.name)) allowedRooms.push(r.name);
                    });
                });
            }

            let filteredRooms = showAll ? defaultRooms : defaultRooms.filter(r => allowedRooms.includes(r.name));
            // [ข้อ 4] สิทธิ์เข้าห้องที่ผู้ดูแลระบบกำหนดให้ผู้ใช้ (ถ้ามี) มีผลเหนือกว่าเสมอ
            const granted = PC.user && realRole() !== 'ADMIN' ? (PC.user.rooms || []) : [];
            if (granted.length) filteredRooms = defaultRooms.filter(r => granted.includes(r.id));
            return filteredRooms;
        }
        PC.allowedRoomList = allowedRoomList;

        window.renderDashboardRooms = function () {
            const grid = document.getElementById('rooms-grid');
            const role = state.user.role;
            const filteredRooms = allowedRoomList();

            /* [ต.ค. 2569] ทั้งใบกดได้ (เดิมกดได้เฉพาะด้านในขอบ) + คีย์บอร์ด ; รหัสห้องแสดงเฉพาะผู้ดูแลระบบ คนอื่นเห็นประเภทห้อง */
            const typeLabel = (r) => { const t = r.type || roomType(r.name); return t === 'central' ? 'ห้องกลาง' : (t === 'main' ? 'กลุ่มบริหาร' : 'กลุ่มงาน'); };
            const isAdm = role === 'ADMIN';
            grid.innerHTML = filteredRooms.map(r => `
                <div class="room-card bg-gradient-to-br ${esc(r.color)} rounded-3xl p-6 text-white shadow-lg hover:-translate-y-1 transition cursor-pointer relative overflow-hidden group focus:outline-none" data-id="${esc(r.id)}"
                     role="button" tabindex="0" aria-label="เปิดห้อง ${esc(r.name)}" onclick="openRoom('${jsq(r.id)}', '${jsq(r.name)}')"
                     onkeydown="if (event.target === this && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.click(); }">
                    <div class="absolute top-4 right-4 z-10 flex gap-2 admin-controls ${isAdm ? '' : 'hidden'}">
                        <button onclick="event.stopPropagation(); editRoom(this)" class="w-8 h-8 bg-white/30 hover:bg-white/50 rounded-full flex items-center justify-center backdrop-blur-sm transition" title="แก้ไขห้อง" aria-label="แก้ไขห้อง ${esc(r.name)}"><i class="fa-solid fa-pen text-xs"></i></button>
                        <button onclick="event.stopPropagation(); deleteRoom(this)" class="w-8 h-8 bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center backdrop-blur-sm transition" title="ลบห้อง" aria-label="ลบห้อง ${esc(r.name)}"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                    <div class="w-full h-full">
                        <div class="absolute -right-4 -bottom-4 opacity-20 text-7xl" aria-hidden="true"><i class="fa-solid fa-folder-tree"></i></div>
                        <span class="pc-room-type">${typeLabel(r)}${isAdm ? ` <span class="room-id-span">${esc(r.id)}</span>` : ''}</span>
                        <h3 class="room-name-span text-xl font-bold mb-1 pr-6">${esc(r.name)}</h3>
                        ${r.parent ? `<p class="pc-room-parent">สังกัด ${esc(r.parent)}</p>` : ''}
                        <span class="pc-room-go" aria-hidden="true">เปิดห้อง <i class="fa-solid fa-arrow-right"></i></span>
                    </div>
                </div>
            `).join('');
            const tEl = document.getElementById('rooms-title'), sEl = document.getElementById('rooms-sub');
            const all = filteredRooms.length && filteredRooms.length === defaultRooms.length;
            if (tEl) tEl.textContent = all ? 'ห้องหนังสือราชการทั้งหมด' : 'ห้องหนังสือราชการของท่าน';
            if (sEl) sEl.textContent = filteredRooms.length ? filteredRooms.length + ' ห้อง · เลือกห้องเพื่อดูและดำเนินการหนังสือ' : '';
            if (!filteredRooms.length) {
                grid.innerHTML = '<div class="col-span-full text-center text-slate-500 py-16 px-6 bg-white rounded-3xl border-2 border-dashed"><i class="fa-solid fa-folder-open text-4xl mb-3 text-slate-400" aria-hidden="true"></i>' +
                    '<p class="font-bold text-slate-700">ยังไม่มีห้องที่ท่านเข้าใช้งานได้</p>' +
                    '<p class="text-sm mt-2 max-w-md mx-auto leading-relaxed">บัญชีของท่านยังไม่ได้ผูกกับกลุ่มงานหรือห้องใด แจ้งผู้ดูแลระบบให้กำหนดกลุ่มงานหรือสิทธิ์เข้าห้อง แล้วเข้าสู่ระบบใหม่</p></div>';
                if (typeof PC.onNoRooms === 'function') { try { PC.onNoRooms(grid); } catch (e) { /* ข้าม */ } }   // [v42] ซ่อมแซมอัตโนมัติ
            }
            updateNavBack();
            return filteredRooms;
        };

        /* [รอบ 5 ข้อ 3] ปุ่ม "เลือกห้อง" บน navbar : อยู่ในห้อง + มีสิทธิ์ใช้งานมากกว่า 1 ห้อง -> แสดง */
        function updateNavBack() {
            const btn = document.getElementById('nav-back-rooms');
            if (!btn) return;
            let show = false;
            if (PC.user && isVisible('view-room')) {
                try { show = allowedRoomList().length > 1; } catch (e) { show = false; }
            }
            btn.classList.toggle('hidden', !show);
            btn.classList.toggle('flex', show);
        }
        PC.updateNavBack = updateNavBack;

        window.backToRooms = function () {
            try { docSync.schedule(300); } catch (e) { /* ข้าม */ }   // งานที่แก้ค้างไว้ในห้องนี้ถูกบันทึกต่อเบื้องหลัง
            document.getElementById('view-room')?.classList.add('hidden');
            document.getElementById('view-dashboard')?.classList.remove('hidden');
            renderDashboardRooms();
            updateNavBack();
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* ข้าม */ }
        };

        function roomType(name) {
            if (name === CENTRAL) return 'central';
            return name.indexOf('กลุ่มบริหาร') === 0 ? 'main' : 'sub';
        }

        function fillRoomParentOptions(selected) {
            const sel = document.getElementById('create-room-parent');
            if (!sel) return;
            const mains = defaultRooms.filter(r => (r.type || roomType(r.name)) === 'main');
            sel.innerHTML = '<option value="">- ไม่สังกัด (เป็นกลุ่มบริหาร / ห้องกลาง) -</option>' +
                mains.map(r => `<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
            sel.value = selected || '';
        }

        function setRoomModalMode(editing) {
            const modal = document.getElementById('modal-create-room');
            if (!modal) return;
            const h3 = modal.querySelector('h3');
            const btn = modal.querySelector('button[type="submit"]');
            if (h3) h3.innerText = editing ? 'แก้ไขห้องหนังสือ' : 'สร้างห้องหนังสือใหม่';
            if (btn) btn.innerText = editing ? 'บันทึกการแก้ไข' : 'บันทึกสร้างห้อง';
        }

        (function () {
            const orig = window.openCreateRoomModal;
            window.openCreateRoomModal = function () {
                if (!PC.editingRoomId) {
                    setRoomModalMode(false);
                    const maxId = defaultRooms.reduce((m, r) => Math.max(m, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0), 0);
                    const idEl = document.getElementById('create-room-id');
                    if (idEl && !idEl.value.trim()) idEl.value = 'ROOM_' + String(maxId + 1).padStart(2, '0');
                    fillRoomParentOptions('');
                }
                return orig.apply(this, arguments);
            };
        })();

        window.closeCreateRoomModal = function () {
            document.getElementById('create-room-id').value = '';
            document.getElementById('modal-create-room').classList.add('hidden');
            PC.editingRoomId = null;
            setRoomModalMode(false);
        };

        window.handleCreateRoom = async function (e) {
            e.preventDefault();
            const rId = document.getElementById('create-room-id').value.trim().toUpperCase();
            const rName = document.getElementById('create-room-name').value.trim();
            const rColor = document.getElementById('create-room-color').value;
            const parentEl = document.getElementById('create-room-parent');
            const type = roomType(rName);
            const parent = type === 'sub' && parentEl ? parentEl.value : '';
            const oldId = PC.editingRoomId;
            if (!rId || !rName) return;
            if (!oldId && defaultRooms.some(r => r.id === rId)) {
                Swal.fire('แจ้งเตือน', 'รหัสห้อง ' + rId + ' มีอยู่แล้ว', 'warning');
                return;
            }
            const old = defaultRooms.find(r => r.id === (oldId || rId));
            const room = { id: rId, name: rName, color: rColor, type: type, parent: parent, order: old ? old.order : (parseInt(rId.replace(/\D/g, ''), 10) || defaultRooms.length) };
            const backup = defaultRooms.slice();
            defaultRooms = defaultRooms.filter(r => r.id !== rId && r.id !== oldId).concat([room])
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
            renderDashboardRooms();
            closeCreateRoomModal();
            e.target.reset();
            try {
                const res = await apiWrite('saveRoom', { room: room, oldId: oldId || '' });
                if (PC.store) { storePut('rooms', rId, room, res); if (oldId && oldId !== rId) delete PC.store.rooms[oldId]; buildRooms(); }
                Swal.fire({ icon: 'success', title: 'ดำเนินการเรียบร้อย', showConfirmButton: false, timer: 1500 });
                syncNow();
            } catch (err) {
                defaultRooms = backup;
                renderDashboardRooms();
                Swal.fire('บันทึกห้องไม่สำเร็จ', err.message, 'error');
            }
        };

        window.editRoom = function (btn) {
            const card = btn.closest('.room-card');
            const rId = card.getAttribute('data-id') || card.querySelector('.room-id-span').innerText;
            const room = defaultRooms.find(r => r.id === rId);
            if (!room) return;
            PC.editingRoomId = rId;
            document.getElementById('create-room-id').value = rId;
            document.getElementById('create-room-name').value = room.name;
            const color = document.getElementById('create-room-color');
            if (color) {
                if (!Array.from(color.options).some(o => o.value === room.color)) color.add(new Option(room.color, room.color));
                color.value = room.color;
            }
            fillRoomParentOptions(room.parent || '');
            setRoomModalMode(true);
            document.getElementById('modal-create-room').classList.remove('hidden');
        };

        window.deleteRoom = function (btn) {
            Swal.fire({
                title: 'ยืนยันการลบ?',
                text: 'คุณต้องการลบห้องหนังสือนี้ใช่หรือไม่ (ไฟล์ใน Google Drive จะไม่ถูกลบ)',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'ใช่, ลบเลย',
                cancelButtonText: 'ยกเลิก'
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                const card = btn.closest('.room-card');
                const rId = card.getAttribute('data-id') || card.querySelector('.room-id-span').innerText;
                const backup = defaultRooms.slice();
                defaultRooms = defaultRooms.filter(r => r.id !== rId);
                renderDashboardRooms();
                try {
                    await apiWrite('deleteRoom', { id: rId });
                    if (PC.store) { delete PC.store.rooms[rId]; buildRooms(); }
                    Swal.fire({ icon: 'success', title: 'ลบห้องเรียบร้อย', showConfirmButton: false, timer: 1500 });
                } catch (err) {
                    defaultRooms = backup;
                    renderDashboardRooms();
                    Swal.fire('ลบห้องไม่สำเร็จ', err.message, 'error');
                }
            });
        };

        // ---------------------------------------------------------------
        // 10) แจ้งข่าวสาร / ประกาศ / ความคิดเห็น
        // ---------------------------------------------------------------
        function readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
                r.readAsDataURL(file);
            });
        }

        function annPayload(a) {
            const o = Object.assign({}, a);
            delete o.comments;
            return o;
        }

        window.handleCreateAnnouncement = async function (e) {
            e.preventDefault();
            const formEl = document.getElementById('form-create-announcement');
            const editId = formEl.dataset.editId;
            const isEdit = !!editId;
            const title = document.getElementById('announce-title').value.trim();
            const desc = document.getElementById('announce-desc').value.trim();
            // [ข้อ 14] กลุ่มงาน + ชื่อผู้แจ้ง
            const annGroup = (document.getElementById('announce-group')?.value || '').trim();
            const annReporter = (document.getElementById('announce-reporter')?.value || '').trim();
            let imgUrl = document.getElementById('announce-img-url').value.trim();
            const videoUrl = document.getElementById('announce-video-url').value.trim();
            let fileUrl = document.getElementById('announce-file-url').value.trim();
            const linkUrl = document.getElementById('announce-link-url').value.trim();
            const fileMode = document.getElementById('toggle-announce-media')?.checked;
            const fileInput = document.getElementById('announce-file-upload');
            const file = fileMode && fileInput && fileInput.files ? fileInput.files[0] : null;

            try {
                if (file) {
                    if (file.size > 25 * 1024 * 1024) throw new Error('ไฟล์มีขนาดเกิน 25MB');
                    prog('กำลังอัปโหลดไฟล์ไป Google Drive', file.name);   // [ข้อ 13]
                    const data = await readFileAsDataURL(file);
                    const up = await api('uploadAssets', {
                        files: [{ key: '0', data: data, name: file.name, route: { main: 'ประกาศและข่าวสาร', sub: 'ไฟล์ประกอบประกาศ' }, date: Date.now(), public: true }]
                    }, { timeout: 300000, retries: 0 });
                    if (file.type.indexOf('image/') === 0) imgUrl = up[0].url;
                    else fileUrl = up[0].viewUrl;
                }
                // [ข้อ 14] เก็บ group/reporter ไว้ใน Instructions ด้วย เพื่อให้ข้อมูลเก่า/ใหม่อ่านได้เหมือนกัน
                const mediaData = { desc, imgUrl, videoUrl, fileUrl, linkUrl, group: annGroup, reporter: annReporter };
                let item;
                const backup = clone(state.assignments);
                if (isEdit) {
                    const target = state.assignments.find(a => a.AssignmentID === editId);
                    if (!target) throw new Error('ไม่พบประกาศที่ต้องการแก้ไข');
                    target.Title = title;
                    target.Instructions = JSON.stringify(mediaData);
                    target.Group = annGroup;            // [ข้อ 14]
                    target.Reporter = annReporter;      // [ข้อ 14]
                    target.Audience = typeof PC.getAnnAudience === 'function' ? PC.getAnnAudience() : (target.Audience || []);   // [v25 ข้อ 3]
                    item = annPayload(target);
                } else {
                    const newAnnounce = {
                        AssignmentID: 'ANN_' + Date.now(),
                        Category: '📌 ประกาศสำคัญ',
                        Title: title,
                        Instructions: JSON.stringify(mediaData),
                        isNotified: true,
                        isHidden: false,
                        isPinned: false,
                        comments: [],
                        Group: annGroup,                                  // [ข้อ 14]
                        Reporter: annReporter,                            // [ข้อ 14]
                        Audience: typeof PC.getAnnAudience === 'function' ? PC.getAnnAudience() : [],   // [v25 ข้อ 3] แจ้งถึง
                        CreatedAt: new Date().toISOString(),
                        CreatedBy: state.user.id,
                        CreatedByName: state.user.name || state.user.id
                    };
                    state.assignments.unshift(newAnnounce);
                    item = annPayload(newAnnounce);
                }
                document.getElementById('modal-announcement').classList.add('hidden');
                if (fileInput) fileInput.value = '';
                renderAssignmentsList();
                try {
                    const res = await apiWrite('saveAnnouncement', { item: item });
                    storePut('announcements', item.AssignmentID, item, res);
                } catch (err) {
                    state.assignments = backup;
                    renderAssignmentsList();
                    throw err;
                }
                Swal.fire({ icon: 'success', title: isEdit ? 'อัปเดตประกาศแล้ว' : 'เผยแพร่ประกาศแล้ว', showConfirmButton: false, timer: 1500 });
                syncNow();
            } catch (err) {
                Swal.fire('บันทึกประกาศไม่สำเร็จ', err.message, 'error');
            }
        };

        window.deleteAnnouncement = function (id) {
            Swal.fire({
                title: 'ยืนยันการลบ?',
                text: 'ประกาศนี้จะถูกลบออก',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#e11d48',
                confirmButtonText: 'ใช่, ลบเลย'
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                const backup = state.assignments.slice();
                state.assignments = state.assignments.filter(a => a.AssignmentID !== id);
                renderAssignmentsList();
                try {
                    await apiWrite('deleteAnnouncement', { id: id });
                    if (PC.store) delete PC.store.announcements[id];
                    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', showConfirmButton: false, timer: 1000 });
                } catch (err) {
                    state.assignments = backup;
                    renderAssignmentsList();
                    Swal.fire('ลบไม่สำเร็จ', err.message, 'error');
                }
            });
        };

        async function saveAnnStatus(target, field) {
            renderAssignmentsList();
            try {
                await apiWrite('updateAssignmentStatus', { assignmentId: target.AssignmentID, options: JSON.stringify({ isPinned: !!target.isPinned, isHidden: !!target.isHidden }) });
                const rec = PC.store && PC.store.announcements[target.AssignmentID];
                if (rec) { rec.d.isPinned = !!target.isPinned; rec.d.isHidden = !!target.isHidden; }
                return true;
            } catch (err) {
                target[field] = !target[field];
                renderAssignmentsList();
                Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
                return false;
            }
        }

        window.togglePinAssignment = async function (assignId) {
            const target = state.assignments.find(a => a.AssignmentID === assignId);
            if (!target) return;
            target.isPinned = !target.isPinned;
            if (await saveAnnStatus(target, 'isPinned')) toast('success', target.isPinned ? '📌 ปักหมุดประกาศไว้บนสุดแล้ว' : 'ยกเลิกการปักหมุดแล้ว');
        };

        window.toggleHideAnnouncement = async function (id) {
            const target = state.assignments.find(a => a.AssignmentID === id);
            if (!target) return;
            target.isHidden = !target.isHidden;
            await saveAnnStatus(target, 'isHidden');
        };

        window.handleAddComment = async function (e, assignmentId, uniqueUID) {
            e.preventDefault();
            const uid = uniqueUID || `${assignmentId}_announcement`;
            const inputEl = document.getElementById(`comment-input-${uid}`);
            const message = inputEl.value.trim();
            if (!message) return;
            const parentId = (state.replyingTo && state.replyingTo.assignmentId === assignmentId) ? state.replyingTo.commentId : '';
            const tempComment = {
                CommentID: 'CMT_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                AssignmentID: assignmentId,
                ParentCommentID: parentId,
                UserId: state.user.id,
                UserEmail: state.user.email || '',
                UserName: state.user.name || state.user.title || 'ผู้ใช้งาน',
                UserImage: state.user.image || '',
                Message: message,
                CreatedAt: new Date().toISOString(),
                Reactions: '{}'
            };
            const assign = state.assignments.find(a => a.AssignmentID === assignmentId);
            if (!assign) return;
            if (!assign.comments) assign.comments = [];
            assign.comments.push(tempComment);
            inputEl.value = '';
            cancelReply(uid);
            inputEl.blur();
            renderAssignmentsList();
            try {
                const res = await apiWrite('saveComment', { item: tempComment });
                storePut('comments', tempComment.CommentID, tempComment, res);
            } catch (err) {
                assign.comments = assign.comments.filter(c => c.CommentID !== tempComment.CommentID);
                renderAssignmentsList();
                Swal.fire('ส่งความคิดเห็นไม่สำเร็จ', err.message, 'error');
            }
        };

        window.handleReaction = async function (assignmentId, commentId, reactionType) {
            const assign = state.assignments.find(a => a.AssignmentID === assignmentId);
            if (!assign || !assign.comments) return;
            const comment = assign.comments.find(c => c.CommentID === commentId);
            if (!comment) return;
            let rx = {};
            try { rx = typeof comment.Reactions === 'string' ? JSON.parse(comment.Reactions || '{}') : (comment.Reactions || {}); } catch (e) { rx = {}; }
            const before = JSON.stringify(rx);
            const uEmail = state.user.email || 'user';
            if (!rx[reactionType]) rx[reactionType] = [];
            const idx = rx[reactionType].indexOf(uEmail);
            if (idx > -1) {
                rx[reactionType].splice(idx, 1);
            } else {
                Object.keys(rx).forEach(k => { if (!Array.isArray(rx[k])) return; const i = rx[k].indexOf(uEmail); if (i > -1) rx[k].splice(i, 1); });
                rx[reactionType].push(uEmail);
            }
            const redraw = () => {
                const box = document.getElementById(`comment-box-${commentId}`);
                if (box) box.outerHTML = buildSingleComment(comment, state.user.email, assignmentId, !!comment.ParentCommentID);
            };
            comment.Reactions = JSON.stringify(rx);
            redraw();
            try {
                const res = await apiWrite('toggleReaction', { commentId: commentId, type: reactionType });
                comment.Reactions = res.Reactions;
                const rec = PC.store && PC.store.comments[commentId];
                if (rec) rec.d.Reactions = res.Reactions;
                redraw();
            } catch (err) {
                comment.Reactions = before;
                redraw();
                toast('error', 'บันทึกความรู้สึกไม่สำเร็จ');
            }
        };

        // ---------------------------------------------------------------
        // 11) ปฏิทินงาน
        // ---------------------------------------------------------------
        const canEditEvent = (evt) => !!evt && (realRole() === 'ADMIN' || realRole() === 'Director' || !evt.recorder || evt.recorder === state.user.id);
        PC.canEditEvent = canEditEvent;

        /* [ข้อ 2] แถบสรุป "วันที่เลือก + กิจกรรมเดิมของวันนั้น" ที่โผล่บนสุดของโมดอลเพิ่มกิจกรรม
           ทำให้คลิกวันที่ในปฏิทิน 1 ครั้ง ได้ทั้งเพิ่มกิจกรรมใหม่ และเห็น/แก้ของเดิม */
        function renderEventModalDayBanner(dateStr) {
            let box = document.getElementById('event-day-banner');
            if (!box) {
                const form = document.getElementById('form-event');
                if (!form) return;
                box = document.createElement('div');
                box.id = 'event-day-banner';
                form.insertBefore(box, form.firstChild);
            }
            if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { box.innerHTML = ''; box.className = ''; return; }

            const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            const fullDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
            const d = new Date(dateStr + 'T00:00:00');
            const dayEvents = buildCalendarEvents().filter(e => e.date === dateStr);
            const info = (typeof window.pcDayInfo === 'function') ? window.pcDayInfo(dateStr, dayEvents) : { isOff: false, cellStyle: '', isHoliday: false };
            const holidayNames = dayEvents.filter(e => e.isHoliday).map(e => e.title).join(', ');
            const mine = dayEvents.filter(e => !e.isHoliday);

            box.className = 'rounded-xl border p-3 mb-1';
            box.setAttribute('style', info.cellStyle || 'background:#eff6ff;border-color:#bfdbfe;');
            box.innerHTML =
                `<div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="font-bold text-sm" style="${info.isOff ? 'color:#dc2626;' : 'color:#1e3a8a;'}">
                        <i class="fa-solid fa-calendar-day mr-1"></i>
                        วัน${fullDays[d.getDay()]}ที่ ${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543}
                    </div>
                    ${holidayNames ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-rose-200" style="color:#dc2626;">${esc(holidayNames)}</span>` : ''}
                </div>` +
                (mine.length
                    ? `<div class="mt-2 space-y-1 max-h-28 overflow-y-auto no-scrollbar">
                        <div class="text-[11px] font-bold text-slate-500">กิจกรรมที่มีอยู่แล้ว ${mine.length} รายการ (คลิกเพื่อแก้ไข)</div>
                        ${mine.map(e => `<div class="text-[11px] bg-white/80 border border-slate-200 rounded-lg px-2 py-1 flex items-center gap-2 ${e.eventId ? 'cursor-pointer hover:bg-white' : ''}"
                              ${e.eventId ? `onclick="editEvent('${jsq(e.eventId)}')"` : ''}>
                            <i class="fa-solid ${e.eventId ? 'fa-calendar-check text-purple-500' : 'fa-clipboard-check text-blue-500'}"></i>
                            <span class="font-bold text-slate-700 truncate">${esc(e.title)}</span>
                            <span class="text-slate-400 ml-auto shrink-0">${esc(e.time || '')}</span>
                        </div>`).join('')}
                       </div>`
                    : `<div class="mt-1 text-[11px] text-slate-500">ยังไม่มีกิจกรรมในวันนี้ — กรอกแบบฟอร์มด้านล่างเพื่อเพิ่ม</div>`);
        }

        window.openEventModal = function (presetDate) {
            const form = document.getElementById('form-event');
            form.reset();
            document.getElementById('event-id').value = '';
            document.getElementById('modal-event-title').innerHTML = '<i class="fa-solid fa-calendar-plus"></i> เพิ่มกิจกรรมใหม่';
            document.getElementById('event-recorder').value = state.user.id || '';
            document.getElementById('event-responsible').value = state.user.name || '';
            initFlatpickrForEvents();
            const hasPreset = typeof presetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(presetDate);
            if (hasPreset) {
                flatpickrInstances.start.setDate(presetDate);
                flatpickrInstances.end.setDate(presetDate);
            }
            // [ข้อ 2] แสดงสรุปวันที่เลือก + กิจกรรมเดิม
            renderEventModalDayBanner(hasPreset ? presetDate : '');
            // [ข้อ 11/12] เติมกลุ่มงานของผู้ใช้เป็นค่าเริ่มต้นให้ช่อง "กลุ่มงาน/ฝ่าย"
            try {
                const dept = document.getElementById('event-dept');
                const g = (state.user.groups && state.user.groups[0]) || state.user.group || '';
                if (dept && g) {
                    if (!Array.from(dept.options).some(o => o.value === g)) dept.add(new Option(g, g));
                    dept.value = g;
                }
            } catch (e) { /* ข้าม */ }
            document.getElementById('modal-event').classList.remove('hidden');
            setTimeout(() => document.getElementById('event-title')?.focus(), 80);
        };

        window.closeEventModal = function () {
            document.getElementById('modal-event').classList.add('hidden');
        };

        window.editEvent = function (id) {
            const evt = state.calendarEvents.find(e => e.id === id);
            if (!evt) return;
            if (!canEditEvent(evt)) { Swal.fire('ไม่มีสิทธิ์', 'แก้ไขได้เฉพาะกิจกรรมที่ท่านบันทึกเอง', 'warning'); return; }
            if (typeof closeDayEventsModal === 'function') closeDayEventsModal();
            document.getElementById('form-event').reset();
            renderEventModalDayBanner('');   // [ข้อ 2] โหมดแก้ไขไม่ต้องแสดงแถบสรุปวัน
            document.getElementById('modal-event-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขกิจกรรม';
            document.getElementById('event-id').value = evt.id;
            document.getElementById('event-title').value = evt.title || '';
            document.getElementById('event-desc').value = evt.desc || '';
            const dept = document.getElementById('event-dept');
            if (evt.dept && !Array.from(dept.options).some(o => o.value === evt.dept)) dept.add(new Option(evt.dept, evt.dept));
            dept.value = evt.dept || dept.options[0].value;
            document.getElementById('event-location').value = evt.loc || evt.location || '';
            document.getElementById('event-start-time').value = evt.startTime || '';
            document.getElementById('event-end-time').value = evt.endTime || '';
            document.getElementById('event-recorder').value = evt.recorder || '';
            document.getElementById('event-responsible').value = evt.responsible || '';
            initFlatpickrForEvents();
            flatpickrInstances.start.setDate(evt.startDate || evt.date);
            flatpickrInstances.end.setDate(evt.endDate || evt.startDate || evt.date);
            document.getElementById('modal-event').classList.remove('hidden');
        };

        window.saveEvent = async function () {
            const id = document.getElementById('event-id').value;
            const title = document.getElementById('event-title').value.trim();
            const startDate = document.getElementById('event-start-date').value;
            let endDate = document.getElementById('event-end-date').value || startDate;
            const loc = document.getElementById('event-location').value.trim();
            if (!title || !startDate) {
                Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อกิจกรรมและวันที่เริ่ม', 'warning');
                return;
            }
            if (endDate < startDate) {
                Swal.fire('แจ้งเตือน', 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม', 'warning');
                return;
            }
            const old = id ? state.calendarEvents.find(e => e.id === id) : null;
            const item = {
                id: id || ('evt_' + Date.now()),
                title: title,
                desc: document.getElementById('event-desc').value.trim(),
                dept: document.getElementById('event-dept').value,
                loc: loc,
                location: loc || 'ไม่ระบุสถานที่',
                date: startDate,
                startDate: startDate,
                endDate: endDate,
                startTime: document.getElementById('event-start-time').value,
                endTime: document.getElementById('event-end-time').value,
                recorder: old && old.recorder ? old.recorder : (state.user.id || ''),
                responsible: document.getElementById('event-responsible').value.trim(),
                room: document.getElementById('banner-room-name')?.innerText || '',
                shareTo: typeof PC.getShareTo === 'function' ? PC.getShareTo('event') : [],   // [v25 ข้อ 10] ผู้มองเห็น ([] = ทุกคน)
                // [v31 ข้อ 3/4] ประเภทกิจกรรม + แจ้งเตือนล่วงหน้า
                scope: document.getElementById('event-scope')?.value || '',
                scopeName: ['subject', 'group'].includes(document.getElementById('event-scope')?.value) ? (document.getElementById('event-scope-name')?.value || '') : '',
                remind: Number(document.getElementById('event-remind')?.value || 0)
            };
            const backup = state.calendarEvents.slice();
            if (old) state.calendarEvents = state.calendarEvents.map(e => (e.id === item.id ? item : e));
            else state.calendarEvents.push(item);
            closeEventModal();
            renderCalendar();
            updateCalendarBadge();
            Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', showConfirmButton: false, timer: 1500 });
            try {
                const res = await apiWrite('saveEvent', { item: item });
                storePut('events', item.id, (res && res.item) || item, res);
            } catch (err) {
                state.calendarEvents = backup;
                renderCalendar();
                updateCalendarBadge();
                Swal.fire('บันทึกกิจกรรมไม่สำเร็จ', err.message, 'error');
            }
        };

        /* [v101] หลังนำเข้ากิจกรรมจากไฟล์ : ใส่รายการใหม่ลงข้อมูลในเครื่อง + วาดปฏิทินใหม่ (ไปที่เดือนของรายการแรก) */
        PC.addEventsLocal = function (items, meta) {
            (items || []).forEach(function (it) {
                if (!it || !it.id) return;
                const sv = meta && meta[it.id];
                storePut('events', it.id, it, sv ? { saved: [sv] } : null);
                if (!state.calendarEvents.some(function (e) { return e.id === it.id; })) state.calendarEvents.push(clone(it));
            });
            try { renderCalendar(items && items[0] ? new Date(items[0].startDate + 'T00:00:00') : null); } catch (e) { console.warn('[evi] renderCalendar', e); }
            try { updateCalendarBadge(); } catch (e) { /* ข้าม */ }
        };

        window.deleteEvent = function (id) {
            const evt = state.calendarEvents.find(e => e.id === id);
            if (!canEditEvent(evt)) { Swal.fire('ไม่มีสิทธิ์', 'ลบได้เฉพาะกิจกรรมที่ท่านบันทึกเอง', 'warning'); return; }
            Swal.fire({
                title: 'ยืนยันการลบกิจกรรม?',
                text: 'หากลบแล้วจะไม่สามารถกู้คืนได้',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'ใช่, ลบเลย',
                cancelButtonText: 'ยกเลิก'
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                const backup = state.calendarEvents.slice();
                state.calendarEvents = state.calendarEvents.filter(e => e.id !== id);
                if (typeof closeDayEventsModal === 'function') closeDayEventsModal();
                renderCalendar();
                updateCalendarBadge();
                try {
                    await apiWrite('deleteEvent', { id: id });
                    if (PC.store) delete PC.store.events[id];
                    Swal.fire({ icon: 'success', title: 'ลบกิจกรรมเรียบร้อย', showConfirmButton: false, timer: 1500 });
                } catch (err) {
                    state.calendarEvents = backup;
                    renderCalendar();
                    updateCalendarBadge();
                    Swal.fire('ลบกิจกรรมไม่สำเร็จ', err.message, 'error');
                }
            });
        };

        function eventActionButtons(e) {
            if (!e.eventId) return '';
            const evt = state.calendarEvents.find(x => x.id === e.eventId);
            if (!canEditEvent(evt)) return '';
            return `<div class="flex gap-1 shrink-0">
                <button type="button" onclick="event.stopPropagation(); editEvent('${jsq(e.eventId)}')" class="w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center transition border border-amber-200" title="แก้ไข"><i class="fa-solid fa-pen text-[10px]"></i></button>
                <button type="button" onclick="event.stopPropagation(); deleteEvent('${jsq(e.eventId)}')" class="w-7 h-7 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition border border-rose-200" title="ลบ"><i class="fa-solid fa-trash text-[10px]"></i></button>
            </div>`;
        }
        PC.eventActionButtons = eventActionButtons;

        window.renderCalEventListPagination = function () {
            const listEl = document.getElementById('cal-event-list');
            const paginationEl = document.getElementById('cal-event-pagination');
            const pageInfo = document.getElementById('cal-page-info');
            const pageBtns = document.getElementById('cal-page-buttons');
            if (!listEl || !paginationEl) return;
            const totalItems = currentMonthlyEvents.length;
            const totalPages = Math.ceil(totalItems / calItemsPerPage);
            if (totalItems === 0) {
                listEl.innerHTML = `<div class="text-center text-sm text-slate-400 py-10">ไม่มีกิจกรรมในช่วงเวลานี้</div>`;
                paginationEl.classList.add('hidden');
                return;
            }
            if (calCurrentPage > totalPages) calCurrentPage = totalPages;
            const startIdx = (calCurrentPage - 1) * calItemsPerPage;
            const displayEvents = currentMonthlyEvents.slice(startIdx, startIdx + calItemsPerPage);
            const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            listEl.innerHTML = displayEvents.map(e => {
                const eDate = new Date(e.date + 'T00:00:00');
                // [ข้อ 1] วันหยุด = ตัวหนังสือสีแดง + พื้นหลังโทนแดงอ่อน
                const off = e.isHoliday || eDate.getDay() === 0 || eDate.getDay() === 6;
                const iconColor = e.isHoliday ? 'text-rose-600 bg-rose-100' : 'text-blue-600 bg-blue-100';
                const iconName = e.isHoliday ? 'fa-calendar-day' : (e.gcal ? 'fa-user-clock' : (e.eventId ? 'fa-calendar-check' : 'fa-clipboard-check'));
                const timeText = e.isHoliday ? 'ทั้งวัน' : ((e.eventId || e.gcal) ? (e.time || 'ไม่ระบุเวลา') : 'กำหนดส่ง');
                const cardStyle = e.isHoliday ? 'background:#fff1f2;border-color:#fecdd3;' : '';
                return `
                    <div class="flex gap-3 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition" style="${cardStyle}">
                        <div class="flex flex-col items-center justify-start min-w-[45px]">
                            <div class="text-[11px] font-bold" style="${off ? 'color:#dc2626;' : 'color:#64748b;'}">${eDate.getDate()} ${thMonths[eDate.getMonth()].substring(0, 3)}.</div>
                            <div class="text-[9px] text-slate-400 mb-1">${eDate.getFullYear() + 543}</div>
                            <div class="w-7 h-7 rounded-full ${iconColor} flex items-center justify-center text-[10px]"><i class="fa-solid ${iconName}"></i></div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-xs mb-1 leading-snug truncate" style="${e.isHoliday ? 'color:#dc2626;' : 'color:#1e293b;'}" title="${esc(e.title)}">${esc(e.title)}</div>
                            <div class="text-[10px] text-slate-500 flex flex-col gap-0.5">
                                <span class="truncate"><i class="fa-regular fa-clock text-slate-400 w-3"></i> ${esc(timeText)}</span>
                                <span class="truncate"><i class="fa-solid fa-location-dot text-slate-400 w-3"></i> ${esc(e.location)}</span>
                                ${e.responsible ? `<span class="truncate"><i class="fa-solid fa-user-tie text-slate-400 w-3"></i> ${esc(e.responsible)}</span>` : ''}
                            </div>
                        </div>
                        ${eventActionButtons(e)}
                    </div>`;
            }).join('');
            if (totalPages > 1) {
                paginationEl.classList.remove('hidden');
                pageInfo.innerText = `หน้า ${calCurrentPage} จาก ${totalPages}`;
                let btnHtml = `<button onclick="changeCalPage(${Math.max(1, calCurrentPage - 1)})" class="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center shadow-xs hover:bg-slate-100 transition disabled:opacity-50" ${calCurrentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left text-[9px]"></i></button>`;
                for (let i = 1; i <= totalPages; i++) {
                    const activeClass = i === calCurrentPage ? 'bg-purple-600 text-white' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200';
                    btnHtml += `<button onclick="changeCalPage(${i})" class="w-6 h-6 rounded-md ${activeClass} font-bold flex items-center justify-center shadow-xs text-[10px] transition">${i}</button>`;
                }
                btnHtml += `<button onclick="changeCalPage(${Math.min(totalPages, calCurrentPage + 1)})" class="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center shadow-xs hover:bg-slate-100 transition disabled:opacity-50" ${calCurrentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right text-[9px]"></i></button>`;
                pageBtns.innerHTML = btnHtml;
            } else {
                paginationEl.classList.add('hidden');
            }
        };

        function buildCalendarEvents() {
            const events = (googleHolidays || []).map(h => ({ date: h.date, title: h.title, location: h.location || 'ประเทศไทย', isHoliday: true }));
            state.documentQueue.forEach(doc => {
                if (doc.deadline) events.push({ date: doc.deadline, title: `กำหนดส่ง: ${doc.title} (เลขรับ: ${doc.receiveNo || '-'})`, location: 'ระบบรับหนังสือราชการ', isHoliday: false });
            });
            (state.calendarEvents || []).forEach(evt => PC.expandEvent(evt).forEach(x => events.push(x)));
            if (typeof PC.gcalVisible === 'function') PC.gcalVisible().forEach(x => events.push(x));   // [ชุด 3 ข้อ 6] [รอบ 5 ข้อ 4] เฉพาะของตัวเอง
            return events;
        }

        PC.expandEvent = function (evt) {
            const out = [];
            const start = evt.startDate || evt.date;
            if (!start) return out;
            const end = evt.endDate && evt.endDate >= start ? evt.endDate : start;
            const d = new Date(start + 'T00:00:00');
            const last = new Date(end + 'T00:00:00');
            let guard = 0;
            while (d <= last && guard < 62) {
                const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                out.push({
                    date: ds, title: evt.title, location: evt.location || evt.loc || 'ไม่ระบุสถานที่', isHoliday: false,
                    eventId: evt.id, responsible: evt.responsible || '', desc: evt.desc || '', dept: evt.dept || '',
                    time: evt.startTime ? (evt.startTime + (evt.endTime ? ' - ' + evt.endTime : '') + ' น.') : ''
                });
                d.setDate(d.getDate() + 1);
                guard++;
            }
            return out;
        };

        window.openDayEventsModal = function (dateStr) {
            const selectedDate = new Date(dateStr + 'T00:00:00');
            const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            const titleDate = `${selectedDate.getDate()} ${thMonths[selectedDate.getMonth()]} ${selectedDate.getFullYear() + 543}`;
            const titleEl = document.getElementById('day-events-title');
            if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-calendar-day"></i> กิจกรรมวันที่ ${titleDate}`;
            const dayEvents = buildCalendarEvents().filter(e => e.date === dateStr);
            const contentEl = document.getElementById('day-events-content');
            if (!contentEl) return;
            const addBtn = `<button type="button" onclick="closeDayEventsModal(); openEventModal('${dateStr}')" class="w-full mb-3 py-2 rounded-xl border-2 border-dashed border-purple-300 text-purple-600 font-bold text-xs hover:bg-purple-50 transition"><i class="fa-solid fa-plus mr-1"></i> เพิ่มกิจกรรมในวันนี้</button>`;
            if (dayEvents.length === 0) {
                contentEl.innerHTML = addBtn + `<div class="text-center text-slate-400 py-6 text-sm">ไม่มีกิจกรรมในวันนี้</div>`;
            } else {
                contentEl.innerHTML = addBtn + dayEvents.map(e => {
                    // [ข้อ 1] วันหยุด = โทนแดง
                    const iconColor = e.isHoliday ? 'text-rose-600 bg-rose-100 border-rose-200' : 'text-blue-600 bg-blue-100 border-blue-200';
                    const iconName = e.isHoliday ? 'fa-calendar-day' : (e.gcal ? 'fa-user-clock' : (e.eventId ? 'fa-calendar-check' : 'fa-clipboard-check'));
                    const timeText = e.isHoliday ? 'ตลอดวัน' : ((e.eventId || e.gcal) ? (e.time || 'ไม่ระบุเวลา') : 'กำหนดส่ง / ลงเวลา');
                    return `
                        <div class="mb-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-3" style="${e.isHoliday ? 'background:#fff1f2;border-color:#fecdd3;' : ''}">
                            <div class="w-10 h-10 rounded-full border ${iconColor} flex items-center justify-center shrink-0"><i class="fa-solid ${iconName} text-lg"></i></div>
                            <div class="flex-1 min-w-0">
                                ${e.dept ? `<div class="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 inline-block mb-1">${esc(e.dept)}</div>` : ''}
                                <h4 class="font-bold text-sm mb-1" style="${e.isHoliday ? 'color:#dc2626;' : 'color:#1e293b;'}">${esc(e.title)}</h4>
                                ${e.desc ? `<div class="text-[11px] text-slate-500 mb-1">${esc(e.desc)}</div>` : ''}
                                <div class="text-[11px] text-slate-600 space-y-1">
                                    <div><i class="fa-regular fa-clock w-4 text-center"></i> ${esc(timeText)}</div>
                                    <div><i class="fa-solid fa-location-dot w-4 text-center text-rose-500"></i> ${esc(e.location)}</div>
                                    ${e.responsible ? `<div><i class="fa-solid fa-user-tie w-4 text-center text-blue-500"></i> ผรช. ${esc(e.responsible)}</div>` : ''}
                                </div>
                            </div>
                            ${eventActionButtons(e)}
                        </div>`;
                }).join('');
            }
            document.getElementById('modal-day-events')?.classList.remove('hidden');
        };

        const holidayYears = {};
        window.fetchThaiHolidays = async function (year) {
            year = Number(year);
            if (!year || year < 1970 || year > 3000) return;
            if (holidayYears[year]) return;
            holidayYears[year] = true;
            try {
                const list = await api('holidays', { year: year }, { retries: 1, noAuthRedirect: true });
                const others = (googleHolidays || []).filter(h => !String(h.date).startsWith(String(year)));
                googleHolidays = others.concat((list || []).map(h => ({
                    date: h.date, title: h.title, location: h.location || 'ประเทศไทย', isHoliday: true
                })));
                holidayYears[year] = 'done';
                if (typeof renderCalendar === 'function' && isVisible('tab-calendar')) renderCalendar();
                try { if (typeof updateCalendarBadge === 'function') updateCalendarBadge(); } catch (e) { /* ข้าม */ }
            } catch (e) {
                holidayYears[year] = false;
                console.warn('[PC] holidays', e.message);
            }
        };

        /* [ข้อ 5] ตัวช่วยที่ renderCalendar เรียกทุกครั้งที่วาดปฏิทิน
           - กันการยิงซ้ำด้วย holidayYears
           - เรียกได้ทุกมุมมองโดยไม่ทำให้เกิดการวาดซ้ำไม่รู้จบ (ยิงจริงครั้งเดียวต่อปี) */
        window.ensureHolidayYear = function (year) {
            year = Number(year);
            if (!year || year < 1970 || year > 3000) return;
            if (holidayYears[year]) return;
            window.fetchThaiHolidays(year);
        };

        // ---------------------------------------------------------------
        // 12) ตั้งค่าระบบ : ผู้ใช้งาน
        // ---------------------------------------------------------------
        const userForm = PC.userForm = { editingId: null, rooms: [], tabs: [], groups: [], signRoles: [], imageData: '', image: '', imageId: '', signatureId: '', signatureData: '' };

        /* [ข้อ 12] แสดงกลุ่มงานที่สังกัดเป็น chip พร้อมปุ่มลบ และซิงก์กับช่อง "กลุ่มงานหลัก" */
        function renderUserGroupChips() {
            const box = document.getElementById('user-groups-chips');
            if (!box) return;
            if (!userForm.groups.length) {
                box.innerHTML = '<span class="text-[10px] text-slate-400 px-1">ยังไม่ได้เลือก — ระบบจะใช้ค่าในช่อง "กลุ่มงานหลัก"</span>';
            } else {
                box.innerHTML = userForm.groups.map((g, i) => `
                    <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${i === 0 ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300'}">
                        ${i === 0 ? '<i class="fa-solid fa-star text-[8px]"></i>' : ''}${esc(g)}
                        <button type="button" onclick="removeUserGroup(${i})" class="ml-0.5 ${i === 0 ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-rose-600'}"><i class="fa-solid fa-xmark"></i></button>
                    </span>`).join('');
            }
            const primary = document.getElementById('user-group');
            if (primary && userForm.groups.length) primary.value = userForm.groups[0];
        }
        PC.renderUserGroupChips = renderUserGroupChips;

        window.removeUserGroup = function (i) {
            userForm.groups.splice(i, 1);
            renderUserGroupChips();
        };

        window.openUserGroupsPicker = function () {
            const current = userForm.groups.slice();
            const primaryVal = (document.getElementById('user-group')?.value || '').trim();
            if (!current.length && primaryVal) current.push(primaryVal);
            const options = (defaultRooms || []).map(r => r.name);
            current.forEach(g => { if (!options.includes(g)) options.push(g); });
            const html = options.map(name => `
                <label class="flex items-center p-2 border border-slate-200 rounded-lg hover:bg-blue-50 cursor-pointer transition text-left">
                    <input type="checkbox" value="${esc(name)}" ${current.includes(name) ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded border-slate-300 shrink-0">
                    <span class="ml-2 text-xs font-bold text-slate-700">${esc(name)}</span>
                </label>`).join('');
            Swal.fire({
                title: '<div class="flex items-center justify-center gap-2 text-base"><i class="fa-solid fa-layer-group text-blue-500"></i> เลือกกลุ่มงานที่สังกัด</div>',
                html: `<div class="text-left mt-2">
                        <div class="text-xs font-bold text-slate-500 mb-2">เลือกได้มากกว่า 1 กลุ่ม — กลุ่มแรกที่เลือกจะเป็นกลุ่มงานหลัก</div>
                        <div id="swal-groups-list" class="max-h-[50vh] overflow-y-auto no-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-2">${html}</div>
                       </div>`,
                showCancelButton: true, confirmButtonText: 'ใช้กลุ่มที่เลือก', cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
                customClass: { popup: 'settings-wide-modal' },
                preConfirm: () => Array.from(document.querySelectorAll('#swal-groups-list input[type=checkbox]:checked')).map(cb => cb.value)
            }).then(res => {
                if (!res.isConfirmed) return;
                userForm.groups = res.value || [];
                renderUserGroupChips();
                toast('info', userForm.editingId ? 'กด "บันทึกข้อมูล" เพื่อยืนยัน' : 'กลุ่มงานจะถูกบันทึกพร้อมข้อมูลผู้ใช้');
            });
        };

        function roomNames(ids) {
            if (!ids || !ids.length) return 'ตามตำแหน่ง';
            return ids.map(id => (defaultRooms.find(r => r.id === id) || { name: id }).name).join(', ');
        }
        function tabNames(ids) {
            if (!ids || !ids.length) return 'ตามบทบาท';
            return ids.map(id => (ALL_TABS.find(t => t.id === id) || { name: id }).name).join(', ');
        }

        /* ============================================================================
           [ข้อ 5] สิทธิ์การลงนามในเอกสาร (กำหนดได้รายบุคคล)
           ============================================================================ */
        const SIGN_ROLE_LIST = [
            { id: 'admin', name: 'ลงรับ (ธุรการกลาง)', stage: 1, icon: 'fa-inbox' },
            { id: 'director', name: 'สั่งการ (ผอ.)', stage: 4, icon: 'fa-crown' },
            { id: 'admingroup', name: 'ลงรับ (ธุรการกลุ่มบริหาร)', stage: 5, icon: 'fa-inbox' },
            { id: 'subdirectorgroup', name: 'มอบหมาย (รอง ผอ.กลุ่ม)', stage: 6, icon: 'fa-user-tie' },
            { id: 'subgroupadmin', name: 'ลงรับ (ธุรการกลุ่มงาน)', stage: 65, icon: 'fa-inbox' },
            { id: 'assistantgroup', name: 'มอบหมาย (ผช.กลุ่มงาน)', stage: 7, icon: 'fa-user-tag' },
            { id: 'assignee', name: 'รับทราบ/ปฏิบัติ (ผู้รับผิดชอบ)', stage: 8, icon: 'fa-user-check' }
        ];
        PC.SIGN_ROLE_LIST = SIGN_ROLE_LIST;

        function signRoleNames(ids) {
            if (!ids || !ids.length) return 'ตามบทบาท';
            return ids.map(id => (SIGN_ROLE_LIST.find(t => t.id === id) || { name: id }).name).join(', ');
        }
        PC.signRoleNames = signRoleNames;

        /** [ข้อ 5] ผู้ใช้คนนี้มีสิทธิ์ลงนามในขั้นตอนนี้หรือไม่ (ไม่ตั้งค่า = ใช้สิทธิ์ตามบทบาทเดิม) */
        function canSign(sigPadKey) {
            if (!PC.user) return true;
            if (realRole() === 'ADMIN') return true;
            const list = PC.user.signRoles || [];
            return !list.length || list.includes(sigPadKey);
        }
        PC.canSign = canSign;

        window.openSignRoleModal = function () {
            const checkboxesHtml = SIGN_ROLE_LIST.map(t => `
                <label class="flex items-center p-3 border border-slate-200 rounded-xl hover:bg-amber-50 cursor-pointer transition shadow-sm">
                    <input type="checkbox" value="${t.id}" ${(userForm.signRoles || []).includes(t.id) ? 'checked' : ''} class="w-5 h-5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer">
                    <span class="ml-3 text-sm font-bold text-slate-700 flex items-center gap-2"><i class="fa-solid ${t.icon} text-slate-400 w-4 text-center"></i> ${t.name}</span>
                </label>`).join('');
            Swal.fire({
                title: '<div class="flex items-center justify-center gap-2"><i class="fa-solid fa-file-signature text-amber-500"></i> ตั้งค่าสิทธิ์การลงนามในเอกสาร</div>',
                html: `<div class="text-left mt-4">
                        <div class="flex justify-between items-center mb-4 px-1 gap-2">
                            <span class="text-sm font-bold text-slate-500">เลือกขั้นตอนที่อนุญาตให้ลงนาม (ไม่เลือกเลย = ตามบทบาท)</span>
                            <div class="flex gap-2 shrink-0">
                                <button type="button" onclick="document.querySelectorAll('#swal-sign-list input[type=checkbox]').forEach(cb => cb.checked = true)" class="text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 px-3 py-2 rounded-lg transition whitespace-nowrap">เลือกทั้งหมด</button>
                                <button type="button" onclick="document.querySelectorAll('#swal-sign-list input[type=checkbox]').forEach(cb => cb.checked = false)" class="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition whitespace-nowrap">ล้าง</button>
                            </div>
                        </div>
                        <div id="swal-sign-list" class="max-h-[50vh] overflow-y-auto no-scrollbar pr-1 pb-1 grid grid-cols-1 sm:grid-cols-2 gap-3">${checkboxesHtml}</div>
                       </div>`,
                showCancelButton: true, confirmButtonText: 'ใช้รายการที่เลือก', cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#d97706', cancelButtonColor: '#64748b',
                customClass: { popup: 'settings-wide-modal' },
                preConfirm: () => Array.from(document.querySelectorAll('#swal-sign-list input[type=checkbox]:checked')).map(cb => cb.value)
            }).then(result => {
                if (!result.isConfirmed) return;
                userForm.signRoles = result.value || [];
                updateAccessSummary();
                toast('info', userForm.editingId ? 'กด "บันทึกข้อมูล" เพื่อยืนยันสิทธิ์' : 'สิทธิ์จะถูกบันทึกพร้อมข้อมูลผู้ใช้');
            });
        };
        function updateAccessSummary() {
            const r = document.getElementById('user-rooms-summary');
            const t = document.getElementById('user-tabs-summary');
            const g = document.getElementById('user-sign-summary');   // [ข้อ 5]
            if (r) r.innerText = roomNames(userForm.rooms);
            if (t) t.innerText = tabNames(userForm.tabs);
            if (g) g.innerText = signRoleNames(userForm.signRoles);
        }

        /* ============================================================================
           [ข้อ 1] ตารางผู้ใช้งาน : layout กระชับ + ตัวกรอง + แบ่งหน้า
           ============================================================================ */
        let usersPage = 1;

        window.resetUserFilters = function () {
            ['user-filter-group', 'user-filter-subject', 'user-filter-role', 'user-filter-active'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
            const q = document.getElementById('user-search'); if (q) q.value = '';
            renderUsersTable(1);
        };

        /** เติมตัวเลือกในกล่องกรอง โดยรักษาค่าที่ผู้ใช้เลือกไว้ */
        function fillUserFilterOptions(list) {
            const gEl = document.getElementById('user-filter-group');
            const sEl = document.getElementById('user-filter-subject');
            const groups = {}, subjects = {};
            list.forEach(u => {
                (Array.isArray(u.groups) && u.groups.length ? u.groups : (u.group ? [u.group] : []))
                    .forEach(g => { if (g) groups[g] = true; });
                if (u.subjectGroup) subjects[u.subjectGroup] = true;
            });
            const build = (el, map, allLabel) => {
                if (!el) return;
                const cur = el.value;
                const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, 'th'));
                el.innerHTML = `<option value="">${allLabel}</option>` + keys.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
                if (keys.includes(cur)) el.value = cur;
            };
            build(gEl, groups, 'ทุกกลุ่มงานหลัก');
            build(sEl, subjects, 'ทุกกลุ่มสาระฯ');
        }

        window.renderUsersTable = function (page) {
            const body = document.getElementById('users-table-body');
            if (!body) return;
            if (typeof page === 'number' && page > 0) usersPage = page;

            const all = PC.users || [];
            fillUserFilterOptions(all);

            const q = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
            const fGroup = document.getElementById('user-filter-group')?.value || '';
            const fSubject = document.getElementById('user-filter-subject')?.value || '';
            const fRole = document.getElementById('user-filter-role')?.value || '';
            const fActive = document.getElementById('user-filter-active')?.value || '';
            const size = Number(document.getElementById('user-page-size')?.value) || 15;

            const list = all.filter(u => {
                if (q && ![u.id, u.name, u.position, u.group, u.role, u.email, u.phone, u.subjectGroup]
                    .join(' ').toLowerCase().includes(q)) return false;
                if (fGroup) {
                    const gs = (Array.isArray(u.groups) && u.groups.length) ? u.groups : (u.group ? [u.group] : []);
                    if (!gs.includes(fGroup)) return false;
                }
                if (fSubject && u.subjectGroup !== fSubject) return false;
                if (fRole && u.role !== fRole) return false;
                if (fActive === '1' && u.active === false) return false;
                if (fActive === '0' && u.active !== false) return false;
                return true;
            });

            const count = document.getElementById('users-count');
            if (count) count.innerText = list.length + ' คน' + (list.length !== all.length ? ' / ' + all.length : '');

            const pages = Math.max(1, Math.ceil(list.length / size));
            if (usersPage > pages) usersPage = pages;
            const startIdx = (usersPage - 1) * size;
            const view = list.slice(startIdx, startIdx + size);

            const info = document.getElementById('users-page-info');
            if (info) info.innerText = list.length
                ? `แสดง ${startIdx + 1} ถึง ${Math.min(startIdx + size, list.length)} จาก ${list.length} รายการ`
                : 'ไม่มีรายการ';

            const pag = document.getElementById('users-pagination');
            if (pag) {
                const btn = (p, label, active, disabled) => `<button type="button" ${disabled ? 'disabled' : `onclick="renderUsersTable(${p})"`} class="w-7 h-7 rounded-md ${active ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-600'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} font-bold flex items-center justify-center shadow-xs text-xs transition">${label}</button>`;
                let html = btn(usersPage - 1, '<i class="fa-solid fa-chevron-left text-[10px]"></i>', false, usersPage <= 1);
                const from = Math.max(1, Math.min(usersPage - 2, pages - 4));
                for (let p = from; p <= Math.min(pages, from + 4); p++) html += btn(p, p, p === usersPage, false);
                html += btn(usersPage + 1, '<i class="fa-solid fa-chevron-right text-[10px]"></i>', false, usersPage >= pages);
                pag.innerHTML = html;
            }

            if (!view.length) {
                body.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">ไม่พบข้อมูลผู้ใช้งานตามเงื่อนไขที่เลือก</td></tr>';
                return;
            }

            // [ข้อ 1] แถวกระชับ : ลด padding, รวมข้อมูลในบรรทัดเดียวเมื่อทำได้, ไม่เว้นที่ว่างเกินจำเป็น
            body.innerHTML = view.map(u => {
                const gs = (Array.isArray(u.groups) && u.groups.length) ? u.groups : (u.group ? [u.group] : []);
                return `
                <tr class="border-b border-slate-100 hover:bg-blue-50/50 transition cursor-pointer ${u.active === false ? 'opacity-60' : ''}" onclick="editUser('${jsq(u.id)}')">
                    <td class="px-3 py-1.5">
                        <div class="flex items-center gap-2">
                            <img loading="lazy" decoding="async" src="${esc(u.image || DEFAULT_AVATAR)}" onerror="this.src='${DEFAULT_AVATAR}'" class="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0">
                            <div class="min-w-0 leading-tight">
                                <div class="font-bold text-slate-800 text-[12px] truncate">${esc(u.name || u.id)}</div>
                                <div class="text-[10px] text-slate-500 truncate">${esc(u.position || '-')}${gs.length ? ' · ' + esc(gs.join(', ')) : ''}</div>
                                <div class="text-[10px] text-slate-400 truncate">${esc(u.email || '-')}${u.phone ? ' · ' + esc(u.phone) : ''}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-3 py-1.5 whitespace-nowrap leading-tight">
                        <div class="font-bold text-slate-700 text-[12px]">${esc(u.id)}</div>
                        <div class="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded inline-block">${esc(ROLE_LABEL[u.role] || u.role)}</div>
                        ${u.subjectGroup ? `<div class="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 rounded inline-block ml-0.5">${esc(u.subjectGroup)}</div>` : ''}
                        <div class="text-[9px] mt-0.5 ${u.active === false ? 'text-rose-600 font-bold' : 'text-slate-400'}">${u.active === false ? 'ปิดใช้งาน' : (u.lastLogin ? 'เข้าล่าสุด ' + esc(u.lastLogin) : 'ยังไม่เคยเข้าระบบ')}</div>
                    </td>
                    <td class="px-3 py-1.5 text-[10px] text-slate-600 leading-tight whitespace-nowrap">
                        <div><i class="fa-solid fa-folder-tree text-blue-400 w-3"></i> ${esc(roomNames(u.rooms))}</div>
                        <div><i class="fa-solid fa-list-check text-purple-400 w-3"></i> ${esc(tabNames(u.tabs))}</div>
                        <div><i class="fa-solid fa-file-signature text-amber-500 w-3"></i> ${esc(signRoleNames(u.signRoles))}</div>
                        <div><i class="fa-solid fa-pen-nib ${u.signatureId ? 'text-emerald-500' : 'text-slate-300'} w-3"></i> ${u.signatureId ? 'มีลายเซ็น' : 'ยังไม่มีลายเซ็น'}</div>
                    </td>
                    <td class="px-2 py-1.5 text-center whitespace-nowrap">
                        <button type="button" onclick="event.stopPropagation(); editUser('${jsq(u.id)}')" class="bg-amber-100 text-amber-600 hover:bg-amber-200 p-1.5 rounded-lg transition" title="แก้ไข"><i class="fa-solid fa-pen text-[11px]"></i></button>
                        <button type="button" onclick="event.stopPropagation(); deleteUser(this, '${jsq(u.id)}')" class="bg-rose-100 text-rose-600 hover:bg-rose-200 p-1.5 rounded-lg transition" title="ลบออกจากระบบและชีต"><i class="fa-solid fa-trash text-[11px]"></i></button>
                    </td>
                </tr>`;
            }).join('');
        };

        function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v === undefined || v === null ? '' : v; }

        window.resetUserForm = function () {
            const form = document.getElementById('user-form-container');
            if (form) form.reset();
            Object.assign(userForm, { editingId: null, rooms: [], tabs: [], groups: [], signRoles: [], imageData: '', image: '', imageId: '', signatureId: '', signatureData: '' });
            setVal('user-phone', '');          // [ข้อ 16]
            setVal('user-subject-group', '');  // [ข้อ 11]
            renderUserGroupChips();            // [ข้อ 12]
            const pwEl = document.getElementById('user-password');
            const pwIcon = document.getElementById('eyeIconUserPassword');
            if (pwEl) pwEl.type = 'password';  // [ข้อ 10] กลับเป็นซ่อนรหัสผ่านเสมอเมื่อรีเซ็ตฟอร์ม
            if (pwIcon) { pwIcon.classList.remove('fa-eye-slash'); pwIcon.classList.add('fa-eye'); }
            const idEl = document.getElementById('user-id');
            if (idEl) { idEl.readOnly = false; idEl.classList.remove('bg-slate-200'); }
            const img = document.getElementById('preview-user-profile');
            if (img) img.src = DEFAULT_AVATAR;
            const active = document.getElementById('user-active');
            if (active) active.checked = true;
            const mode = document.getElementById('user-form-mode');
            if (mode) mode.innerText = 'เพิ่มผู้ใช้งานใหม่';
            const pwHint = document.getElementById('user-password-hint');
            if (pwHint) pwHint.innerText = 'ถ้าไม่กรอก ระบบจะสุ่มรหัสผ่านให้';
            showSignaturePreview('');
            updateAccessSummary();
        };

        window.editUser = function (idOrFirst, lname, position, group, legacyId, role, email) {
            if (arguments.length > 1) {
                // รองรับรูปแบบเดิม editUser(fname, lname, position, group, id, role, email)
                const found = (PC.users || []).find(u => u.id === legacyId);
                if (found) return window.editUser(found.id);
                resetUserForm();
                setVal('user-firstname', idOrFirst); setVal('user-lastname', lname); setVal('user-position', position);
                setVal('user-group', group); setVal('user-id', legacyId); setVal('user-role', role); setVal('user-email', email);
                userForm.groups = group ? [group] : [];
                renderUserGroupChips();
                return;
            }
            const u = (PC.users || []).find(x => x.id === idOrFirst);
            if (!u) return;
            resetUserForm();
            Object.assign(userForm, {
                editingId: u.id,
                rooms: (u.rooms || []).slice(),
                tabs: (u.tabs || []).slice(),
                groups: Array.isArray(u.groups) && u.groups.length ? u.groups.slice() : (u.group ? [u.group] : []),  // [ข้อ 12]
                signRoles: Array.isArray(u.signRoles) ? u.signRoles.slice() : [],                                   // [ข้อ 5]
                image: u.imageRaw || u.image || '', imageId: u.imageId || '', signatureId: u.signatureId || ''
            });
            setVal('user-firstname', u.firstname || (u.name || '').split(' ')[0]);
            setVal('user-lastname', u.lastname || (u.name || '').split(' ').slice(1).join(' '));
            setVal('user-position', u.position);
            setVal('user-group', u.group);
            setVal('user-id', u.id);
            setVal('user-role', u.role);
            setVal('user-email', u.email);
            setVal('user-phone', u.phone);                 // [ข้อ 16]
            setVal('user-subject-group', u.subjectGroup);  // [ข้อ 11]
            renderUserGroupChips();                        // [ข้อ 12]
            const idEl = document.getElementById('user-id');
            if (idEl) { idEl.readOnly = true; idEl.classList.add('bg-slate-200'); }
            const active = document.getElementById('user-active');
            if (active) active.checked = u.active !== false;
            const img = document.getElementById('preview-user-profile');
            if (img) img.src = u.image || DEFAULT_AVATAR;
            const mode = document.getElementById('user-form-mode');
            if (mode) mode.innerText = 'แก้ไขข้อมูล: ' + u.id;
            const pwHint = document.getElementById('user-password-hint');
            if (pwHint) pwHint.innerText = 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยนรหัสผ่าน';
            updateAccessSummary();
            showSignaturePreview('');
            if (u.signatureId) resolveToken(ASSET + u.signatureId).then(v => { if (userForm.editingId === u.id) showSignaturePreview(v); }).catch(() => {});
            const formContainer = document.getElementById('user-form-container');
            if (formContainer) {
                formContainer.classList.add('bg-blue-50', 'ring-2', 'ring-blue-300');
                formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => formContainer.classList.remove('bg-blue-50', 'ring-2', 'ring-blue-300'), 1500);
            }
        };

        function showSignaturePreview(src) {
            const img = document.getElementById('user-signature-preview');
            if (!img) return;
            if (src) { img.src = src; img.classList.remove('hidden'); } else { img.removeAttribute('src'); img.classList.add('hidden'); }
        }

        /* [v46 ข้อ 8] ย่อรูปถ่ายเป็น JPEG (พื้นขาว) ใช้กับรูปโปรไฟล์ ; ลายเซ็นยังใช้ resizeImage (PNG โปร่งใส) */
        function resizePhoto(dataUrl, max) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const scale = Math.min(1, max / Math.max(img.width, img.height));
                        const c = document.createElement('canvas');
                        c.width = Math.max(1, Math.round(img.width * scale));
                        c.height = Math.max(1, Math.round(img.height * scale));
                        const cx = c.getContext('2d');
                        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height);
                        cx.drawImage(img, 0, 0, c.width, c.height);
                        const out = c.toDataURL('image/jpeg', 0.85);
                        resolve(out.length < dataUrl.length ? out : dataUrl);
                    } catch (e) { resolve(dataUrl); }
                };
                img.onerror = () => resolve(dataUrl);
                img.src = dataUrl;
            });
        }

        function resizeImage(dataUrl, max) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * scale);
                    c.height = Math.round(img.height * scale);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/png'));
                };
                img.onerror = () => resolve(dataUrl);
                img.src = dataUrl;
            });
        }

        window.previewUserProfile = async function (input) {
            const file = input.files && input.files[0];
            if (!file) return;
            const data = await readFileAsDataURL(file);
            userForm.imageData = await resizePhoto(data, 320);
            document.getElementById('preview-user-profile').src = userForm.imageData;
        };

        window.uploadUserSignature = async function (input) {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const data = await resizeImage(await readFileAsDataURL(file), 800);
            showSignaturePreview(data);
            if (!userForm.editingId) {
                userForm.signatureData = data;
                toast('info', 'ลายเซ็นจะถูกบันทึกพร้อมข้อมูลผู้ใช้');
                return;
            }
            try {
                status.show('กำลังบันทึกลายเซ็น…', 'busy');
                const res = await api('saveSignature', { userId: userForm.editingId, data: data }, { timeout: 120000 });
                userForm.signatureId = res.signatureId;
                assetIds.set(data, res.signatureId);
                assetCache.put(res.signatureId, data);
                if (PC.store && PC.store.users[userForm.editingId]) PC.store.users[userForm.editingId].signatureId = res.signatureId;
                if (userForm.editingId === state.user.id) applySignatureToPads(data);
                buildUsers();
                renderUsersTable();
                status.show('บันทึกลายเซ็นแล้ว', 'ok', 1500);
            } catch (err) {
                status.hide();
                Swal.fire('บันทึกลายเซ็นไม่สำเร็จ', err.message, 'error');
            }
        };

        window.deleteUserSignature = async function () {
            if (!userForm.editingId) { userForm.signatureData = ''; showSignaturePreview(''); return; }
            const r = await Swal.fire({ icon: 'warning', title: 'ลบลายเซ็นของผู้ใช้นี้?', showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#e11d48' });
            if (!r.isConfirmed) return;
            try {
                await api('saveSignature', { userId: userForm.editingId, data: '' });
                userForm.signatureId = '';
                if (PC.store && PC.store.users[userForm.editingId]) PC.store.users[userForm.editingId].signatureId = '';
                showSignaturePreview('');
                buildUsers();
                renderUsersTable();
                toast('success', 'ลบลายเซ็นแล้ว');
            } catch (err) {
                Swal.fire('ลบลายเซ็นไม่สำเร็จ', err.message, 'error');
            }
        };

        /* [ข้อ 12] รวมกลุ่มงานที่จะบันทึก : chip ที่เลือกไว้ + ค่าที่พิมพ์ในช่อง "กลุ่มงานหลัก"
           ให้กลุ่มงานหลักอยู่ลำดับแรกเสมอ (ใช้คำนวณตำแหน่งและสิทธิ์เข้าห้อง) */
        function buildGroupsForSave() {
            const primary = (document.getElementById('user-group')?.value || '').trim();
            const list = userForm.groups.slice();
            if (primary) {
                const i = list.indexOf(primary);
                if (i > 0) list.splice(i, 1);
                if (i !== 0) list.unshift(primary);
            }
            return list.filter((g, i, a) => g && a.indexOf(g) === i);
        }
        PC.buildGroupsForSave = buildGroupsForSave;

        window.saveUserForm = async function (e) {
            if (e) e.preventDefault();
            const isNew = !userForm.editingId;
            const user = {
                id: (document.getElementById('user-id').value || '').trim(),
                firstname: document.getElementById('user-firstname').value.trim(),
                lastname: document.getElementById('user-lastname').value.trim(),
                position: document.getElementById('user-position').value.trim(),
                group: document.getElementById('user-group').value.trim(),
                groups: buildGroupsForSave(),                                            // [ข้อ 12] กลุ่มงานทั้งหมด
                subjectGroup: (document.getElementById('user-subject-group')?.value || '').trim(),  // [ข้อ 11]
                role: document.getElementById('user-role').value,
                email: document.getElementById('user-email').value.trim(),
                phone: (document.getElementById('user-phone')?.value || '').trim(),       // [ข้อ 16]
                password: (document.getElementById('user-password')?.value || '').trim(),
                active: document.getElementById('user-active') ? document.getElementById('user-active').checked : true,
                rooms: userForm.rooms.slice(),
                tabs: userForm.tabs.slice(),
                signRoles: userForm.signRoles.slice()    // [ข้อ 5]
            };
            if (!user.id) { Swal.fire('แจ้งเตือน', 'กรุณาระบุรหัสใช้งาน (ID)', 'warning'); return; }
            if (!user.password) delete user.password;
            prog('กำลังบันทึกข้อมูลผู้ใช้…', user.name || user.id);   // [ข้อ 13]
            try {
                if (userForm.imageData) {
                    const up = await api('uploadAssets', { files: [{ key: '0', data: userForm.imageData, name: 'profile_' + user.id, route: { main: 'ระบบผู้ใช้งาน', sub: 'รูปโปรไฟล์' }, date: null, public: true }] }, { timeout: 120000, retries: 1 });
                    user.image = up[0].url;
                    user.imageId = up[0].id;
                }
                const res = await api('saveUser', { user: user, isNew: isNew });
                let saved = res.user;
                if (userForm.signatureData) {
                    const sg = await api('saveSignature', { userId: saved.id, data: userForm.signatureData }, { timeout: 120000 });
                    saved.signatureId = sg.signatureId;
                }
                if (PC.store) PC.store.users[saved.id] = saved;
                buildUsers();
                if (saved.id === state.user.id) { mergeMe(saved); enterAvatar(); }
                renderUsersTable();
                resetUserForm();
                if (res.tempPassword) {
                    Swal.fire({ icon: 'success', title: 'เพิ่มผู้ใช้งานเรียบร้อย', html: 'รหัสผ่านเริ่มต้นของ <b>' + esc(saved.id) + '</b> คือ<br><span class="text-2xl font-black tracking-widest text-blue-700">' + esc(res.tempPassword) + '</span><br><span class="text-xs text-slate-500">กรุณาแจ้งผู้ใช้งาน</span>' });
                } else {
                    Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลบุคคลเรียบร้อย', showConfirmButton: false, timer: 1500 });
                }
            } catch (err) {
                Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
            }
        };

        function enterAvatar() {
            const avatar = document.getElementById('nav-user-avatar');
            if (avatar) avatar.src = state.user.image || DEFAULT_AVATAR;
            const navName = document.getElementById('nav-user-name');
            if (navName) navName.innerText = state.user.name;
        }

        window.deleteUser = function (btnElement, userId) {
            const id = userId || (typeof btnElement === 'string' ? btnElement : '');
            if (!id) return;
            const u = (PC.users || []).find(x => x.id === id);
            Swal.fire({
                title: 'ยืนยันการลบผู้ใช้งาน?',
                html: `<div class="text-sm text-left">ลบผู้ใช้ <b>${esc(u ? (u.name || id) : id)}</b> (รหัส ${esc(id)})<br>
                       <span class="text-rose-600 font-bold">แถวข้อมูลใน Google Sheet จะถูกลบออกจริง</span><br>
                       <span class="text-xs text-slate-500">การลบนี้กู้คืนไม่ได้ ควร Export ข้อมูลเก็บไว้ก่อน</span></div>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> ใช่, ลบออกจากชีต',
                cancelButtonText: 'ยกเลิก'
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                try {
                    prog('กำลังลบผู้ใช้งาน…', 'ลบแถวออกจาก Google Sheet');
                    // [ข้อ 4] backend ลบแถวออกจากชีตจริง แล้วบันทึก tombstone ให้เครื่องอื่นซิงก์ตาม
                    const res = await api('deleteUser', { id: id }, { retries: 0 });
                    if (PC.store) delete PC.store.users[id];
                    buildUsers();
                    renderUsersTable();
                    if (userForm.editingId === id) resetUserForm();
                    progEnd();
                    Swal.fire({
                        icon: 'success', title: 'ลบผู้ใช้งานเรียบร้อย',
                        text: (res && res.deleted) ? `ลบออกจากชีตแล้ว ${res.deleted} แถว` : 'ลบออกจากระบบแล้ว',
                        showConfirmButton: false, timer: 1800
                    });
                } catch (err) {
                    progEnd();
                    Swal.fire('ลบไม่สำเร็จ', err.message, 'error');
                }
            });
        };

        window.resetUserPassword = async function () {
            const id = userForm.editingId;
            if (!id) { Swal.fire('แจ้งเตือน', 'กรุณาเลือกผู้ใช้งานจากตารางก่อน', 'warning'); return; }
            const r = await Swal.fire({ icon: 'question', title: 'รีเซ็ตรหัสผ่านของ ' + id + '?', text: 'ระบบจะสุ่มรหัสผ่านใหม่และส่งไปยังอีเมลของผู้ใช้', showCancelButton: true, confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก' });
            if (!r.isConfirmed) return;
            try {
                const res = await api('resetPassword', { id: id }, { retries: 0 });
                /* [ต.ค. 2569] อีเมลไม่มีรหัสผ่านแล้ว (บอกให้เข้าด้วย Google หรือ "ลืมรหัสผ่าน?") ; รหัสเริ่มต้นแสดงเฉพาะในหน้าจอนี้ */
                Swal.fire({ icon: 'success', title: 'รีเซ็ตรหัสผ่านแล้ว', width: 'min(440px, 94vw)', confirmButtonText: 'เรียบร้อย',
                    html: '<div class="text-sm text-left">' + (res.mailed ? 'ส่งอีเมลแจ้งผู้ใช้แล้ว (บอกวิธีเข้าด้วย Google หรือกด "ลืมรหัสผ่าน?" — ไม่มีรหัสผ่านในอีเมล)'
                        : '<span class="text-amber-600">ส่งอีเมลแจ้งผู้ใช้ไม่ได้ (ไม่มีอีเมลหรือโควตาหมด) — แจ้งผู้ใช้เอง</span>') +
                        '<div class="mt-3">รหัสผ่านเริ่มต้น (แจ้งผู้ใช้เองถ้าจำเป็น) : <b class="text-xl tracking-widest">' + esc(res.tempPassword) + '</b></div>' +
                        '<div class="mt-1 text-xs text-slate-500">ผู้ใช้จะถูกบังคับให้ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก</div></div>' });
            } catch (err) {
                Swal.fire('รีเซ็ตไม่สำเร็จ', err.message, 'error');
            }
        };

        window.exportUsersExcel = function () {
            // [ข้อ 11/12/16] ส่งออกกลุ่มงานทุกกลุ่ม + กลุ่มสาระ + เบอร์โทร (คอลัมน์ตรงกับฟอร์มนำเข้า)
            const header = ['รหัสใช้งาน (ID)', 'ชื่อ', 'นามสกุล', 'ตำแหน่ง', 'กลุ่มงาน (หลายกลุ่มคั่นด้วย ,)', 'กลุ่มสาระการเรียนรู้', 'ประเภท (Role)', 'อีเมล', 'เบอร์โทรศัพท์', 'ลิงก์รูปโปรไฟล์ (URL)', 'สถานะการใช้งาน (เปิด/ปิด)', 'สิทธิ์ห้อง', 'สิทธิ์ Tab', 'สิทธิ์ลงนาม', 'เข้าใช้ล่าสุด'];
            const rows = (PC.users || []).map(u => [
                u.id,
                u.firstname || (u.name || '').split(' ')[0] || '',
                u.lastname || (u.name || '').split(' ').slice(1).join(' ') || '',
                u.position,
                (Array.isArray(u.groups) && u.groups.length ? u.groups : (u.group ? [u.group] : [])).join(', '),
                u.subjectGroup || '',
                u.role,
                u.email,
                u.phone || '',
                u.imageRaw || u.image || '',                  // [ข้อ 3] ลิงก์รูปโปรไฟล์ (ลิงก์เต็ม ไม่ใช่รูปย่อ)
                u.active === false ? 'ปิด' : 'เปิด',           // [ข้อ 3] สถานะการใช้งาน
                roomNames(u.rooms), tabNames(u.tabs), signRoleNames(u.signRoles),
                u.lastLogin || ''
            ]);
            const csv = '\uFEFF' + [header].concat(rows).map(r => r.map(c => `"${String(c === undefined ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
            link.download = 'รายชื่อผู้ใช้งาน.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
        };

        window.openRoomAccessModal = function () {
            const checkboxesHtml = defaultRooms.map(r => `
                <label class="flex items-center p-3 border border-slate-200 rounded-xl hover:bg-blue-50 cursor-pointer transition shadow-sm">
                    <input type="checkbox" value="${esc(r.id)}" ${userForm.rooms.includes(r.id) ? 'checked' : ''} class="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer">
                    <span class="ml-3 text-sm font-bold text-slate-700">${esc(r.name)}</span>
                </label>`).join('');
            Swal.fire({
                title: '<div class="flex items-center justify-center gap-2"><i class="fa-solid fa-folder-tree text-blue-500"></i> ตั้งค่าสิทธิ์เข้าห้อง</div>',
                html: `<div class="text-left mt-4">
                        <div class="flex justify-between items-center mb-4 px-1 gap-2">
                            <span class="text-sm font-bold text-slate-500">เลือกห้องที่อนุญาต (ไม่เลือกเลย = ใช้สิทธิ์ตามตำแหน่ง)</span>
                            <div class="flex gap-2 shrink-0">
                                <button type="button" onclick="document.querySelectorAll('#swal-room-list input[type=checkbox]').forEach(cb => cb.checked = true)" class="text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-lg transition whitespace-nowrap">เลือกทั้งหมด</button>
                                <button type="button" onclick="document.querySelectorAll('#swal-room-list input[type=checkbox]').forEach(cb => cb.checked = false)" class="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition whitespace-nowrap">ล้าง</button>
                            </div>
                        </div>
                        <div id="swal-room-list" class="max-h-[50vh] overflow-y-auto no-scrollbar pr-1 pb-1 grid grid-cols-1 sm:grid-cols-2 gap-3">${checkboxesHtml}</div>
                    </div>`,
                showCancelButton: true,
                confirmButtonText: 'ใช้ห้องที่เลือก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#64748b',
                customClass: { popup: 'settings-wide-modal' },
                preConfirm: () => Array.from(document.querySelectorAll('#swal-room-list input[type=checkbox]:checked')).map(cb => cb.value)
            }).then((result) => {
                if (!result.isConfirmed) return;
                userForm.rooms = result.value || [];
                updateAccessSummary();
                toast('info', userForm.editingId ? 'กด "บันทึกข้อมูล" เพื่อยืนยันสิทธิ์' : 'สิทธิ์จะถูกบันทึกพร้อมข้อมูลผู้ใช้');
            });
        };

        window.openTabAccessModal = function () {
            const checkboxesHtml = ALL_TABS.map(t => `
                <label class="flex items-center p-3 border border-slate-200 rounded-xl hover:bg-purple-50 cursor-pointer transition shadow-sm">
                    <input type="checkbox" value="${t.id}" ${userForm.tabs.includes(t.id) ? 'checked' : ''} class="w-5 h-5 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer">
                    <span class="ml-3 text-sm font-bold text-slate-700 flex items-center gap-2"><i class="fa-solid ${t.icon} text-slate-400 w-4 text-center"></i> ${t.name}</span>
                </label>`).join('');
            Swal.fire({
                title: '<div class="flex items-center justify-center gap-2"><i class="fa-solid fa-list-check text-purple-500"></i> ตั้งค่าการมองเห็น Tab</div>',
                html: `<div class="text-left mt-4">
                        <div class="flex justify-between items-center mb-4 px-1 gap-2">
                            <span class="text-sm font-bold text-slate-500">เลือก Tab ที่อนุญาต (ไม่เลือกเลย = ตามบทบาท)</span>
                            <div class="flex gap-2 shrink-0">
                                <button type="button" onclick="document.querySelectorAll('#swal-tab-list input[type=checkbox]').forEach(cb => cb.checked = true)" class="text-xs font-bold bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-2 rounded-lg transition whitespace-nowrap">เลือกทั้งหมด</button>
                                <button type="button" onclick="document.querySelectorAll('#swal-tab-list input[type=checkbox]').forEach(cb => cb.checked = false)" class="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition whitespace-nowrap">ล้าง</button>
                            </div>
                        </div>
                        <div id="swal-tab-list" class="max-h-[50vh] overflow-y-auto no-scrollbar pr-1 pb-1 grid grid-cols-1 sm:grid-cols-2 gap-3">${checkboxesHtml}</div>
                    </div>`,
                showCancelButton: true,
                confirmButtonText: 'ใช้แท็บที่เลือก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#9333ea',
                cancelButtonColor: '#64748b',
                customClass: { popup: 'settings-wide-modal' },
                preConfirm: () => Array.from(document.querySelectorAll('#swal-tab-list input[type=checkbox]:checked')).map(cb => cb.value)
            }).then((result) => {
                if (!result.isConfirmed) return;
                userForm.tabs = result.value || [];
                updateAccessSummary();
                toast('info', userForm.editingId ? 'กด "บันทึกข้อมูล" เพื่อยืนยันสิทธิ์' : 'สิทธิ์จะถูกบันทึกพร้อมข้อมูลผู้ใช้');
            });
        };

        // ---------------------------------------------------------------
        // 13) ตั้งค่าระบบ : Flow / เลขทะเบียน / ข้อสั่งการ / เสียง (localStorage bridge)
        // ---------------------------------------------------------------
        window.saveFlowSettings = async function () {
            try {
                prog('กำลังบันทึก…', 'อัปเดตการตั้งค่า Flow หนังสือ');   // [ข้อ 13]
                await api('saveSettings', { items: [{ name: 'flowSteps', scope: 'global', value: currentFlowSteps }] });
                Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'อัปเดต Flow เข้าระบบเรียบร้อย' });
            } catch (err) {
                Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
            }
        };

        const bridge = {
            mute: false, queue: new Map(), timer: null,
            rule(k) {
                if (/^start-no-/.test(k)) return 'global';
                if (k === 'assistantCmds' || k === 'directorCmds' || k === 'subdirectorCmds') return 'global';   // [v25 ข้อ 6]
                if (k === 'bellSettings' || k === 'calSettings') return 'user';
                return null;
            },
            push(k, v, remove) {
                const scope = this.rule(k);
                if (!scope || this.mute || !PC.token) return;
                if (scope === 'global' && k.indexOf('start-no-') === 0 && realRole() !== 'ADMIN') return;
                this.queue.set(k, { name: 'ls:' + k, scope: scope, value: remove ? null : v, remove: !!remove });
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.send(), 400);
            },
            async send() {
                const items = Array.from(this.queue.values());
                this.queue.clear();
                if (!items.length) return;
                try {
                    await api('saveSettings', { items: items });
                } catch (err) {
                    status.show('บันทึกการตั้งค่าไม่สำเร็จ: ' + err.message, 'error', 5000);
                }
            }
        };
        (function () {
            const origSet = Storage.prototype.setItem;
            const origRemove = Storage.prototype.removeItem;
            Storage.prototype.setItem = function (k, v) {
                origSet.call(this, k, v);
                try { if (this === window.localStorage) bridge.push(String(k), String(v), false); } catch (e) { /* ข้าม */ }
            };
            Storage.prototype.removeItem = function (k) {
                origRemove.call(this, k);
                try { if (this === window.localStorage) bridge.push(String(k), null, true); } catch (e) { /* ข้าม */ }
            };
        })();

        // ---------------------------------------------------------------
        // 14) ลายเซ็นส่วนตัว (บันทึกขึ้น Drive อัตโนมัติ)
        // ---------------------------------------------------------------
        const sigTarget = {};
        let sigTimer = null;
        storedSignatures = new Proxy(sigTarget, {
            set(t, k, v) {
                t[k] = v;
                if (!PC.muteSig && PC.token && typeof v === 'string' && v.indexOf('data:') === 0) {
                    applySignatureToPads(v, k);
                    clearTimeout(sigTimer);
                    sigTimer = setTimeout(async () => {
                        if (assetIds.has(v)) return;
                        try {
                            const res = await api('saveSignature', { data: v }, { timeout: 120000 });
                            assetIds.set(v, res.signatureId);
                            assetCache.put(res.signatureId, v);
                            if (PC.user) PC.user.signatureId = res.signatureId;
                            setMySignature(v);                // [แก้ลายเซ็นผิดคน]
                            status.show('บันทึกลายเซ็นไว้ในระบบแล้ว', 'ok', 1500);
                        } catch (err) {
                            status.show('บันทึกลายเซ็นขึ้นระบบไม่สำเร็จ', 'error', 4000);
                        }
                    }, 1000);
                }
                return true;
            }
        });

        function applySignatureToPads(data, except) {
            PC.muteSig = true;
            SIG_ROLES.forEach(r => { if (r !== except) sigTarget[r] = data; });
            PC.muteSig = false;
        }

        /* [แก้ลายเซ็นผิดคน] เดิม PC.mySignatureData (ลายเซ็นของผู้ที่เข้าระบบ) ไม่ถูกล้างตอนออกจากระบบ
           และ loadMySignature() ข้ามไปเลยถ้าผู้ใช้คนใหม่ยังไม่มีลายเซ็น
           -> เครื่องเดียวกัน คนถัดไปเห็นลายเซ็นของคนก่อนในหน้าตั้งค่าข้อมูลผู้ใช้ และถูกเติมลายเซ็นของคนก่อนตอนลงนาม
           แก้ใหม่ : ผูกลายเซ็นในหน่วยความจำกับรหัสผู้ใช้ (PC.mySignatureOwner) ใช้ได้เฉพาะเจ้าของเท่านั้น */
        function setMySignature(data) {
            PC.mySignatureData = data || '';
            PC.mySignatureOwner = (data && PC.user) ? PC.user.id : '';
        }
        function mySignature() {
            return (PC.user && PC.mySignatureData && PC.mySignatureOwner === PC.user.id) ? PC.mySignatureData : '';
        }
        PC.mySignature = mySignature;
        PC.setMySignature = setMySignature;

        /** ล้างลายเซ็นทุกช่องบนหน้าจอ (ใช้ตอนออกจากระบบ / เปลี่ยนผู้ใช้) */
        function clearAllSignaturePads() {
            setMySignature('');
            PC.muteSig = true;
            Object.keys(sigTarget).forEach(k => delete sigTarget[k]);
            PC.muteSig = false;
            try {
                Object.keys(sigPads || {}).forEach(k => { const pad = sigPads[k]; if (pad && typeof pad.clear === 'function') pad.clear(); });
            } catch (e) { /* ข้าม */ }
        }
        PC.clearAllSignaturePads = clearAllSignaturePads;

        async function loadMySignature() {
            const uid = PC.user ? PC.user.id : '';
            setMySignature('');                   // เริ่มจากว่างเสมอ (ไม่ใช้ของผู้ใช้คนก่อน)
            if (!uid || !PC.user.signatureId) return;
            try {
                const data = await resolveToken(ASSET + PC.user.signatureId);
                if (!PC.user || PC.user.id !== uid) return;   // ระหว่างโหลดมีการเปลี่ยนผู้ใช้ -> ทิ้ง
                setMySignature(data);             // [ข้อ 22] เก็บไว้ใช้ตอนประทับตราอัตโนมัติ
                applySignatureToPads(data);
            } catch (e) { console.warn('[PC] signature', e.message); }
        }

        /* ============================================================================
           [ข้อ 15] โมดอลตั้งค่าข้อมูลผู้ใช้งานของตัวเอง (เปิดจากรูปโปรไฟล์บน navbar)
           - เปลี่ยนรูปโปรไฟล์ / ชื่อ-สกุล / ตำแหน่ง / อีเมล / เบอร์โทร / กลุ่มสาระ
           - จัดการลายเซ็นส่วนตัว
           - เปลี่ยนรหัสผ่าน
           ============================================================================ */
        let myProfileImageData = '';

        window.openMyProfileModal = async function () {
            if (!PC.user) { Swal.fire('ยังไม่ได้เข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบก่อน', 'warning'); return; }
            myProfileImageData = '';
            const me = PC.user;
            const groups = (Array.isArray(me.groups) && me.groups.length ? me.groups : (me.group ? [me.group] : []));
            // [แก้ลายเซ็นผิดคน] ใช้ลายเซ็นในหน่วยความจำเฉพาะเมื่อเป็นของผู้ใช้คนนี้ , ไม่มี signatureId = ไม่มีลายเซ็น
            let sigSrc = me.signatureId ? mySignature() : '';
            if (!sigSrc && me.signatureId) {
                try { sigSrc = await resolveToken(ASSET + me.signatureId); } catch (e) { sigSrc = ''; }
            }

            await Swal.fire({
                title: '<i class="fa-solid fa-id-badge"></i> ตั้งค่าข้อมูลผู้ใช้งาน',
                showCloseButton: true,                                           // [v32 ข้อ 1] ปุ่มปิดบนส่วนหัวสีม่วง
                width: 620,
                html: `
                <div class="text-left text-sm space-y-3">
                    <div class="flex flex-col items-center">
                        <div class="relative w-24 h-24">
                            <img id="myprof-img" src="${esc(window.pcThumb(me.image, 192) || DEFAULT_AVATAR)}" onerror="this.src='${DEFAULT_AVATAR}'" class="w-24 h-24 rounded-full border-2 border-slate-200 object-cover shadow-sm bg-white">
                            <label class="absolute bottom-0 right-0 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-xs hover:bg-blue-700 shadow-md" title="เปลี่ยนรูปโปรไฟล์">
                                <i class="fa-solid fa-camera"></i>
                                <input type="file" id="myprof-file" accept="image/\*" class="hidden">
                            </label>
                        </div>
                        <div class="text-[11px] text-slate-400 mt-2">คลิกไอคอนกล้องเพื่อเปลี่ยนรูปโปรไฟล์</div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div><label class="text-[11px] font-bold text-slate-600">ชื่อ</label>
                            <input id="myprof-firstname" class="w-full p-2 text-xs border rounded-lg bg-slate-50" value="${esc(me.firstname || (me.name || '').split(' ')[0] || '')}"></div>
                        <div><label class="text-[11px] font-bold text-slate-600">นามสกุล</label>
                            <input id="myprof-lastname" class="w-full p-2 text-xs border rounded-lg bg-slate-50" value="${esc(me.lastname || (me.name || '').split(' ').slice(1).join(' ') || '')}"></div>
                    </div>
                    <div><label class="text-[11px] font-bold text-slate-600">ตำแหน่ง</label>
                        <input id="myprof-position" class="w-full p-2 text-xs border rounded-lg bg-slate-50" value="${esc(me.position || '')}"></div>
                    <div class="grid grid-cols-2 gap-2">
                        <div><label class="text-[11px] font-bold text-slate-600">อีเมล (ใช้รีเซ็ตรหัสผ่าน)</label>
                            <input id="myprof-email" type="email" class="w-full p-2 text-xs border rounded-lg bg-slate-50" value="${esc(me.email || '')}"></div>
                        <div><label class="text-[11px] font-bold text-slate-600">เบอร์โทรศัพท์</label>
                            <input id="myprof-phone" type="tel" maxlength="20" class="w-full p-2 text-xs border rounded-lg bg-slate-50" value="${esc(me.phone || '')}"></div>
                    </div>
                    <div><label class="text-[11px] font-bold text-slate-600">กลุ่มสาระการเรียนรู้</label>
                        <input id="myprof-subject" list="subject-groups" class="w-full p-2 text-xs border rounded-lg bg-slate-50" value="${esc(me.subjectGroup || '')}"></div>

                    <div class="p-2.5 bg-slate-50 border rounded-xl text-[11px] text-slate-500">
                        <!-- [v33 ข้อ 3] รหัสผู้ใช้งานซ่อนเป็น ***** กดรูปดวงตาเพื่อเปิดดู -->
                        <div class="flex items-center flex-wrap gap-x-1"><b>รหัสผู้ใช้งาน:</b>
                            <span id="myprof-uid" data-uid="${esc(me.id)}" class="font-mono tracking-wider">*****</span>
                            <button type="button" onclick="(function(b){const s=document.getElementById('myprof-uid');const show=s.textContent==='*****';s.textContent=show?s.dataset.uid:'*****';b.querySelector('i').className='fa-solid '+(show?'fa-eye-slash':'fa-eye');b.title=show?'ซ่อนรหัสผู้ใช้งาน':'แสดงรหัสผู้ใช้งาน';})(this)" class="w-6 h-6 rounded-md text-slate-500 hover:text-blue-600 hover:bg-white transition" title="แสดงรหัสผู้ใช้งาน"><i class="fa-solid fa-eye"></i></button>
                            &nbsp;·&nbsp; <b>บทบาท:</b> ${esc(ROLE_LABEL[me.role] || me.role || '-')}</div>
                        <div class="mt-0.5"><b>กลุ่มงานที่สังกัด:</b> ${esc(groups.join(', ') || '-')}</div>
                        <div class="mt-1 text-[10px] text-amber-700"><i class="fa-solid fa-lock"></i> บทบาท/กลุ่มงาน/สิทธิ์เข้าห้อง แก้ไขได้โดยผู้ดูแลระบบเท่านั้น</div>
                    </div>

                    ${window.PC_FIT ? window.PC_FIT.panelHtml() : ''}

                    <div>
                        <label class="text-[11px] font-bold text-slate-600">ลายเซ็นส่วนตัว</label>
                        <img id="myprof-sig" src="${esc(sigSrc)}" class="${sigSrc ? '' : 'hidden'} w-full h-16 object-contain border border-dashed border-emerald-300 rounded-lg bg-white mb-1">
                        <div class="flex gap-2">
                            <label class="flex-1 p-1.5 text-[11px] border border-emerald-200 rounded-lg bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 text-center cursor-pointer transition">
                                <i class="fa-solid fa-pen-nib"></i> อัปโหลดลายเซ็น
                                <input type="file" id="myprof-sigfile" accept="image/png,image/jpeg" class="hidden">
                            </label>
                            <button type="button" id="myprof-changepw" class="flex-1 p-1.5 text-[11px] border border-blue-200 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition"><i class="fa-solid fa-key"></i> เปลี่ยนรหัสผ่าน</button>
                        </div>
                        <!-- [v63] ตั้งค่าการแจ้งเตือนผ่าน Telegram / LINE / อีเมล -->
                        <div class="flex gap-2 mt-2">
                            <button type="button" id="myprof-notify" class="flex-1 p-1.5 text-[11px] border border-emerald-200 rounded-lg bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 transition"><i class="fa-solid fa-bell"></i> ตั้งค่าการแจ้งเตือน</button>
                            ${me.role === 'ADMIN' ? '<button type="button" id="myprof-notify-admin" class="flex-1 p-1.5 text-[11px] border border-blue-200 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition"><i class="fa-solid fa-bell"></i> ตั้งค่าแจ้งเตือน (ผู้ดูแล)</button>' : ''}
                        </div>
                    </div>
                </div>`,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> บันทึก',
                cancelButtonText: 'ปิด',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#64748b',
                customClass: { popup: 'settings-wide-modal pc-head-modal' },   // [v32 ข้อ 1] ส่วนหัวสีม่วง
                didOpen: () => {
                    if (window.PC_FIT) window.PC_FIT.paintPanel();
                    document.getElementById('myprof-file').addEventListener('change', async (ev) => {
                        const f = ev.target.files && ev.target.files[0];
                        if (!f) return;
                        myProfileImageData = await resizePhoto(await readFileAsDataURL(f), 320);
                        document.getElementById('myprof-img').src = myProfileImageData;
                    });
                    document.getElementById('myprof-sigfile').addEventListener('change', async (ev) => {
                        const f = ev.target.files && ev.target.files[0];
                        ev.target.value = '';
                        if (!f) return;
                        const data = await resizeImage(await readFileAsDataURL(f), 1200);   // [ข้อ 29] ความละเอียดสูงขึ้น
                        const img = document.getElementById('myprof-sig');
                        img.src = data; img.classList.remove('hidden');
                        try {
                            prog('กำลังบันทึกลายเซ็น…', '');
                            const res = await api('saveSignature', { data: data }, { timeout: 120000 });
                            PC.user.signatureId = res.signatureId;
                            setMySignature(data);
                            assetIds.set(data, res.signatureId);
                            assetCache.put(res.signatureId, data);
                            if (PC.store && PC.store.users[PC.user.id]) PC.store.users[PC.user.id].signatureId = res.signatureId;
                            applySignatureToPads(data);
                            progEnd();
                            toast('success', 'บันทึกลายเซ็นแล้ว');
                        } catch (err) { progEnd(); Swal.showValidationMessage('บันทึกลายเซ็นไม่สำเร็จ: ' + err.message); }
                    });
                    const nfBtn = document.getElementById('myprof-notify');
                    if (PC.prefetchNotifyPrefs) PC.prefetchNotifyPrefs();   // [v95] โหลดค่าตั้งแจ้งเตือนไว้ล่วงหน้า -> กดเปิดแล้วเห็นทันที
                    if (nfBtn) nfBtn.addEventListener('click', () => { if (PC.openNotifyPrefs) PC.openNotifyPrefs(); });
                    const nfAdm = document.getElementById('myprof-notify-admin');
                    if (nfAdm) nfAdm.addEventListener('click', () => { if (PC.openNotifyAdmin) PC.openNotifyAdmin(); });
                    document.getElementById('myprof-changepw').addEventListener('click', () => {
                        Swal.close();
                        setTimeout(openChangePasswordModal, 120);
                    });
                },
                preConfirm: () => ({
                    firstname: document.getElementById('myprof-firstname').value.trim(),
                    lastname: document.getElementById('myprof-lastname').value.trim(),
                    position: document.getElementById('myprof-position').value.trim(),
                    email: document.getElementById('myprof-email').value.trim(),
                    phone: document.getElementById('myprof-phone').value.trim(),
                    subjectGroup: document.getElementById('myprof-subject').value.trim()
                })
            }).then(async (r) => {
                if (!r.isConfirmed || !r.value) return;
                const payload = r.value;
                try {
                    prog('กำลังบันทึกข้อมูลส่วนตัว…', '');
                    if (myProfileImageData) {
                        progSet(40, 'อัปโหลดรูปโปรไฟล์…');
                        const up = await api('uploadAssets', { files: [{ key: '0', data: myProfileImageData, name: 'profile_' + PC.user.id, route: { main: 'ระบบผู้ใช้งาน', sub: 'รูปโปรไฟล์' }, date: null, public: true }] }, { timeout: 120000, retries: 1 });
                        payload.image = up[0].url;
                        payload.imageId = up[0].id;
                    }
                    progSet(75, 'บันทึกข้อมูล…');
                    const res = await api('saveProfile', { user: payload });
                    if (PC.store) PC.store.users[res.user.id] = res.user;
                    mergeMe(res.user);
                    buildUsers();
                    enterAvatar();
                    const navRole = document.getElementById('nav-user-role');
                    if (navRole) navRole.innerText = state.user.title;
                    if (isVisible('tab-settings')) renderUsersTable();
                    progEnd();
                    toast('success', 'บันทึกข้อมูลส่วนตัวเรียบร้อย');
                } catch (err) {
                    progEnd();
                    Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
                }
            });
        };

        /** [ข้อ 15] เปลี่ยนรหัสผ่านของตัวเอง */
        window.openChangePasswordModal = function () {
            Swal.fire({
                title: '<i class="fa-solid fa-key"></i> เปลี่ยนรหัสผ่าน',
                customClass: { popup: 'pc-head-modal pc-mid-modal' }, showCloseButton: true,   // [v32 ข้อ 3] ส่วนหัวสีม่วง
                html: `
                <div class="text-left text-sm space-y-2">
                    <div><label class="text-[11px] font-bold text-slate-600">รหัสผ่านเดิม</label>
                        <div class="relative"><input id="cpw-old" type="password" class="w-full p-2 pr-8 text-xs border rounded-lg bg-slate-50">
                        <button type="button" onclick="togglePasswordVisibility('cpw-old','eyeCpwOld')" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><i class="fa-solid fa-eye text-xs" id="eyeCpwOld"></i></button></div></div>
                    <div><label class="text-[11px] font-bold text-slate-600">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว มีตัวอักษรผสม)</label>
                        <div class="relative"><input id="cpw-new" type="password" class="w-full p-2 pr-8 text-xs border rounded-lg bg-slate-50">
                        <button type="button" onclick="togglePasswordVisibility('cpw-new','eyeCpwNew')" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><i class="fa-solid fa-eye text-xs" id="eyeCpwNew"></i></button></div>${window.pcPwUI ? window.pcPwUI.block('cpw-new') : ''}</div>
                    <div><label class="text-[11px] font-bold text-slate-600">ยืนยันรหัสผ่านใหม่</label>
                        <div class="relative"><input id="cpw-new2" type="password" class="w-full p-2 pr-8 text-xs border rounded-lg bg-slate-50">
                        <button type="button" onclick="togglePasswordVisibility('cpw-new2','eyeCpwNew2')" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><i class="fa-solid fa-eye text-xs" id="eyeCpwNew2"></i></button></div></div>
                </div>`,
                showCancelButton: true, confirmButtonText: 'เปลี่ยนรหัสผ่าน', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2563eb',
                width: 'min(460px, 94vw)',
                didOpen: () => { if (window.pcPwUI) window.pcPwUI.bind('cpw-new'); },   // [ต.ค. 2569] แถบความแข็งแรง + กติกา
                preConfirm: async () => {
                    const o = document.getElementById('cpw-old').value;
                    const n = document.getElementById('cpw-new').value;
                    const n2 = document.getElementById('cpw-new2').value;
                    if (!o || !n) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ'); return false; }
                    const nBad = window.pcPwRule(n, PC.user && PC.user.id); if (nBad) { Swal.showValidationMessage(nBad); return false; }
                    if (n !== n2) { Swal.showValidationMessage('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); return false; }
                    try {
                        // [รอบ 5 ข้อ 1] เครื่องนี้จดจำการเข้าสู่ระบบอยู่ -> ขอ token ใหม่มาด้วย (token เดิมใช้ไม่ได้หลังเปลี่ยนรหัสผ่าน)
                        const out = await api('changePassword', { oldPassword: o, newPassword: n, remember: !!loadRemember() }, { retries: 0 });
                        if (PC.user) saveLocalPw(PC.user.id, n);   // [v100] เข้าทันทีครั้งหน้าด้วยรหัสผ่านใหม่ (รหัสเดิมใช้ไม่ได้แล้ว)
                        return (out && typeof out === 'object') ? out : { ok: true };
                    } catch (err) { Swal.showValidationMessage(err.message); return false; }
                }
            }).then(r => {
                if (r.isConfirmed) {
                    // [ข้อ 19] เปลี่ยนรหัสผ่านแล้ว การจดจำของเครื่องอื่น ๆ ใช้ไม่ได้ทันที , เครื่องนี้ได้ token ใหม่ (ถ้าจดจำไว้)
                    if (r.value && r.value.rt && PC.user) saveRemember(PC.user.id, r.value.rt, r.value.rtExp);
                    else clearRemember();
                    Swal.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านเรียบร้อย', text: 'ครั้งถัดไปกรุณาใช้รหัสผ่านใหม่ (เครื่องอื่นที่เคยจดจำไว้ต้องเข้าสู่ระบบใหม่)' });
                }
            });
        };

        // ---------------------------------------------------------------
        // 15) ประวัติและสถิติ
        // ---------------------------------------------------------------
        let logsPage = 1;
        window.renderSettingsStats = async function (page) {
            logsPage = page || logsPage || 1;
            const groups = {};
            state.documentQueue.forEach(d => { const k = d.rootDocId || d.id; (groups[k] = groups[k] || []).push(d); });
            const roots = Object.values(groups);
            const total = roots.length;
            const done = roots.filter(g => g.every(d => Number(d.stage) === 99)).length;
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = Number(v).toLocaleString('th-TH'); };
            setTxt('stat-total', total);
            setTxt('stat-done', done);
            setTxt('stat-pending', total - done);
            const pct = document.getElementById('stat-done-pct');
            if (pct) pct.innerText = total ? Math.round(done * 100 / total) + '%' : '0%';

            const body = document.getElementById('logs-table-body');
            if (!body || realRole() !== 'ADMIN') return;
            const userSel = document.getElementById('logs-user-filter');
            const dateEl = document.getElementById('logs-date-filter');
            const groupSel = document.getElementById('logs-group-filter');
            const subjSel = document.getElementById('logs-subject-filter');
            const qEl = document.getElementById('logs-q');
            body.innerHTML = PC.skel ? PC.skel.rows(8, 7) : '<tr><td colspan="7" class="p-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังโหลด...</td></tr>';   // [v83]
            try {
                const res = await api('getLogs', {
                    page: logsPage, pageSize: 10,
                    userId: userSel ? userSel.value : '',
                    date: dateEl ? dateEl.value : '',
                    group: groupSel ? groupSel.value : '',          // [ข้อ 7]
                    subjectGroup: subjSel ? subjSel.value : '',     // [ข้อ 7]
                    q: qEl ? qEl.value.trim() : ''                  // [ข้อ 7]
                });
                const fillSel = (el, items, allLabel, render) => {
                    if (!el) return;
                    const cur = el.value;
                    el.innerHTML = `<option value="">${allLabel}</option>` + (items || []).map(render).join('');
                    el.value = cur;
                    if (el.value !== cur) el.value = '';
                };
                fillSel(userSel, res.users, 'ดูผู้ใช้ทั้งหมด', u => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`);
                fillSel(groupSel, res.groups, 'ทุกกลุ่มงานหลัก', g => `<option value="${esc(g)}">${esc(g)}</option>`);
                fillSel(subjSel, res.subjects, 'ทุกกลุ่มสาระฯ', g => `<option value="${esc(g)}">${esc(g)}</option>`);

                const color = (a) => /ลบ/.test(a) ? 'bg-rose-100 text-rose-700' : (/เข้าสู่ระบบ/.test(a) ? 'bg-emerald-100 text-emerald-700' : (/ออกจากระบบ/.test(a) ? 'bg-slate-200 text-slate-700' : (/ดึงเรื่อง/.test(a) ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')));
                body.innerHTML = res.items.length ? res.items.map(l => `
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="px-3 py-2 text-slate-500 whitespace-nowrap">${esc(thaiLogTime(l.timeText))}</td>
                        <td class="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">${esc(l.userName || l.userId)}
                            <div class="text-[10px] text-slate-400 font-normal">${esc(l.userId)} · ${esc(ROLE_LABEL[l.role] || l.role || '-')}</div></td>
                        <td class="px-3 py-2 whitespace-nowrap text-[11px] leading-tight">
                            <div class="text-slate-600">${esc(l.userGroup || '-')}</div>
                            ${l.subjectGroup ? `<div class="text-emerald-700 bg-emerald-50 px-1.5 rounded inline-block mt-0.5">${esc(l.subjectGroup)}</div>` : ''}
                        </td>
                        <td class="px-3 py-2 whitespace-nowrap"><span class="${color(l.action)} px-2.5 py-1 rounded-md font-bold">${esc(l.action)}</span></td>
                        <td class="px-3 py-2 text-slate-500">${esc(l.detail)}</td>
                        <td class="px-3 py-2 text-center whitespace-nowrap text-slate-600">${esc(formatSessionMs(l.sessionMs))}</td>
                        <td class="px-3 py-2 whitespace-nowrap text-[11px] leading-tight">
                            <div class="text-slate-600">${esc(l.ip || '-')}</div>
                            <div class="text-slate-400">${deviceIcon(l.device)} ${esc(l.device || '-')}</div>
                        </td>
                    </tr>`).join('') : '<tr><td colspan="7" class="p-6 text-center text-slate-400">ไม่พบประวัติการใช้งาน</td></tr>';
                const size = 10;
                const pages = Math.max(1, Math.ceil(res.total / size));
                const info = document.getElementById('logs-page-info');
                if (info) info.innerText = res.total ? `แสดง ${(logsPage - 1) * size + 1} ถึง ${Math.min(logsPage * size, res.total)} จาก ${res.total} รายการ` : 'ไม่มีรายการ';
                const pag = document.getElementById('logs-pagination');
                if (pag) {
                    const btn = (p, label, active, disabled) => `<button type="button" ${disabled ? 'disabled' : `onclick="renderSettingsStats(${p})"`} class="w-7 h-7 rounded-md ${active ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-600'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} font-bold flex items-center justify-center shadow-xs text-xs transition">${label}</button>`;
                    let html = btn(logsPage - 1, '<i class="fa-solid fa-chevron-left text-[10px]"></i>', false, logsPage <= 1);
                    const from = Math.max(1, Math.min(logsPage - 2, pages - 4));
                    for (let p = from; p <= Math.min(pages, from + 4); p++) html += btn(p, p, p === logsPage, false);
                    html += btn(logsPage + 1, '<i class="fa-solid fa-chevron-right text-[10px]"></i>', false, logsPage >= pages);
                    pag.innerHTML = html;
                }
            } catch (err) {
                body.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">โหลดประวัติไม่สำเร็จ: ${esc(err.message)}</td></tr>`;
            }
        };

        window.resetLogFilters = function () {
            ['logs-user-filter', 'logs-group-filter', 'logs-subject-filter', 'logs-date-filter', 'logs-q']
                .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            renderSettingsStats(1);
        };

        /* [ข้อ 8] วันที่แบบไทย : "2569-09-18 21:30:05" -> "18 ก.ย. 2569 เวลา 21.30 น." */
        const TH_MON_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        function thaiLogTime(timeText) {
            const t = String(timeText || '').trim();
            const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
            if (!m) return t || '-';
            const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
            // ปีที่บันทึกเป็น ค.ศ. -> แปลงเป็น พ.ศ. (ถ้าเป็น พ.ศ. อยู่แล้วก็ไม่บวกซ้ำ)
            const thYear = y < 2200 ? y + 543 : y;
            return `${d} ${TH_MON_SHORT[mo] || ''} ${thYear} เวลา ${m[4]}.${m[5]} น.`;
        }
        PC.thaiLogTime = thaiLogTime;

        /* [ข้อ 6] เวลาที่อยู่ในระบบ (มิลลิวินาที) -> ข้อความอ่านง่าย */
        function formatSessionMs(ms) {
            const n = Number(ms);
            if (!n || n < 0) return '-';
            const sec = Math.floor(n / 1000);
            const h = Math.floor(sec / 3600), mi = Math.floor((sec % 3600) / 60), sx = sec % 60;
            if (h) return h + ' ชม. ' + mi + ' น.';
            if (mi) return mi + ' นาที';
            return sx + ' วิ.';
        }
        function deviceIcon(dev) {
            const d = String(dev || '');
            if (/มือถือ|Mobile|Phone/i.test(d)) return '<i class="fa-solid fa-mobile-screen"></i>';
            if (/แท็บเล็ต|Tablet|iPad/i.test(d)) return '<i class="fa-solid fa-tablet-screen-button"></i>';
            if (!d) return '';
            return '<i class="fa-solid fa-desktop"></i>';
        }

        // ---------------------------------------------------------------
        // 17) ซิงก์เบื้องหลัง / Snapshot / เริ่มระบบ
        // ---------------------------------------------------------------
        let snapTimer = null;
        function saveSnapshotSoon(delay) {
            clearTimeout(snapTimer);
            snapTimer = setTimeout(() => {
                if (!PC.store || !PC.user || PC.partialLoad) return;      // [v35] ข้อมูลยังมาไม่ครบ -> ยังไม่บันทึกสำเนา
                const st = PC.store;
                idb.set('kv', 'snap:' + PC.user.id, {
                    v: SNAP_VER, url: PC.url, savedAt: Date.now(), serverTime: PC.serverTime,
                    data: {
                        me: st.me, docs: Object.values(st.docs), rooms: Object.values(st.rooms),
                        announcements: Object.values(st.announcements), comments: Object.values(st.comments),
                        events: Object.values(st.events), tasks: Object.values(st.tasks || {}), reads: Object.values(st.reads || {}),
                        users: Object.values(st.users), settings: Object.values(st.settings),
                        epoch: PC.docsEpoch || '', archiveYears: PC.archiveYears || []      // [ชุด 3 ข้อ 4]
                    }
                });
            }, delay === undefined ? 3000 : delay);
        }

        let syncing = false;
        async function syncNow() {
            if (syncing || !PC.token || !PC.store) return;
            syncing = true;
            try {
                await docSync.run();
                const since = Math.max(0, PC.serverTime - 15000);
                const data = await api('sync', { since: since }, { retries: 0, timeout: 120000 });
                if (!PC.store) return;
                applyChanges(data);
                PC.serverTime = data.serverTime;
                saveSnapshotSoon();
                /* [ชุด 3 ข้อ 4] เซิร์ฟเวอร์ย้ายหนังสือเก่าไปคลังรายปีแล้ว -> โหลดข้อมูลหนังสือใหม่ทั้งก้อน
                   (รอจนกว่าจะไม่ได้เปิดหน้าลงนาม/ลงรับค้างไว้ เพื่อไม่ให้งานที่ทำอยู่หาย) */
                if (typeof data.epoch === 'string' && data.epoch !== (PC.docsEpoch || '')) {
                    const busy = ['admin', 'director', 'admingroup', 'subdirectorgroup', 'subgroupadmin', 'assistantgroup', 'assignee']
                        .some(t => { const el = document.getElementById('tab-' + t); return el && el.classList.contains('fixed'); });
                    if (!busy && !docSync.hasPending()) {
                        PC.docsEpoch = data.epoch;
                        setTimeout(() => loadAllData(true, { quiet: true })
                            .then(() => rerenderAll({ docs: true, rooms: true, ann: true, events: true, users: true, tasks: true }))
                            .catch(e => console.warn('[PC] epoch reload', e.message)), 0);
                    }
                }
            } catch (e) {
                if (e.code !== 'AUTH') console.warn('[PC] sync', e.message);
            } finally {
                syncing = false;
            }
        }
        PC.syncNow = syncNow;
        // [ข้อ 20] เปิดฟังก์ชันภายใน IIFE ให้สคริปต์ส่วนอื่นเรียกใช้ได้ (แก้ ReferenceError: GAS_URL is not defined)
        PC.api = api;
        PC.apiWrite = apiWrite;
        PC.toast = toast;
        PC.esc = esc;

        let pollTimer = null, autosaveTimer = null, pollGap = POLL_MS, pollGen = 0;
        function startBackground() {
            stopBackground();
            /* [v42] ทุกเครื่องเคยซิงก์ตรงจังหวะ 30 วินาทีเดียวกัน -> เซิร์ฟเวอร์ถูกยิงพร้อมกันเป็นระลอก
               ใหม่ : สุ่มเวลา 0-5 วินาทีต่อรอบ และถ้ารอบล่าสุดช้ากว่า 8 วินาที ห่างออกไปเรื่อย ๆ (สูงสุด 90 วินาที) จนกว่าจะกลับมาเร็ว */
            pollGap = POLL_MS;
            const gen = ++pollGen;
            const loop = () => {
                pollTimer = setTimeout(async () => {
                    if (document.visibilityState === 'visible') {
                        const a = Date.now();
                        try { await syncNow(); } catch (e) { /* ข้าม */ }
                        const took = Date.now() - a;
                        pollGap = took > 8000 ? Math.min(90000, Math.round(pollGap * 1.5)) : Math.max(POLL_MS, Math.round(pollGap * 0.8));
                    }
                    if (gen === pollGen && pollTimer !== null) loop();
                }, pollGap + Math.random() * 5000);
            };
            loop();
            autosaveTimer = setInterval(() => docSync.run(), AUTOSAVE_MS);
            fetchThaiHolidays(new Date().getFullYear());
        }
        function stopBackground() {
            pollGen++;
            clearTimeout(pollTimer);
            clearInterval(autosaveTimer);
            pollTimer = autosaveTimer = null;
        }

        document.addEventListener('visibilitychange', () => {
            if (!PC.token) return;
            if (document.visibilityState === 'visible') syncNow();
            else docSync.run();
        });

        window.addEventListener('beforeunload', (e) => {
            if (PC.token && PC.store && docSync.hasPending()) {
                docSync.run();
                e.preventDefault();
                e.returnValue = 'ระบบกำลังบันทึกข้อมูล กรุณารอสักครู่';
                return e.returnValue;
            }
        });

        // กลับเข้าสู่ระบบอัตโนมัติเมื่อรีเฟรชหน้า (ภายในแท็บเดิม)
        // [ข้อ 19] ถ้าไม่มี session ในแท็บ แต่ผู้ใช้เคยติ๊ก "จำการเข้าสู่ระบบ" -> เข้าระบบอัตโนมัติด้วย refresh token
        /* [รอบ 5 ข้อ 1] "ยังไม่ได้ออกจากระบบ แล้วเปิดใหม่ -> ช้า ค้างที่ 90% แล้วล่ม"
           สาเหตุ : 1) เซิร์ฟเวอร์ต้องเขียนชีตทุกครั้งที่เข้าระบบอัตโนมัติ (แก้ใน Code.gs แล้ว)
                    2) หน้าเว็บรอคำตอบได้นานถึง 90 วิ x 2 รอบ โดยตัวเลขค้างที่ 90% (ตัวเลขวิ่งเองสูงสุด 90%)
                    3) พอหมดเวลา ระบบ "ลบการจดจำทิ้งเงียบ ๆ" แล้วเด้งกลับหน้า login โดยไม่บอกอะไร = ดูเหมือนระบบล่ม
           แก้    : รอครั้งละไม่เกิน 20 วิ , เกิน 6 วิ บอกว่าเซิร์ฟเวอร์ช้า , ล้มเหลวเพราะเครือข่าย/เซิร์ฟเวอร์ = ไม่ลบการจดจำ
                    แสดงสาเหตุ + ปุ่ม "ลองใหม่" , ลบการจดจำเฉพาะกรณีเซิร์ฟเวอร์ปฏิเสธจริง (หมดอายุ/เปลี่ยนรหัสผ่าน/ถูกปิดบัญชี) */
        const RESTORE_TIMEOUT = 20000;
        function slowHint(msg) {
            return setTimeout(() => progSet(undefined, msg || 'เซิร์ฟเวอร์ตอบช้ากว่าปกติ กำลังรอ... (ไม่ต้องปิดหน้านี้)'), 6000);
        }
        async function restoreFailed(e, retry) {
            console.warn('[PC] restore session', e);
            const r = await Swal.fire({
                icon: 'warning',
                title: 'เข้าสู่ระบบอัตโนมัติไม่สำเร็จ',
                html: '<div class="text-sm">' + esc((e && e.message) || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ') + '</div>' + loginErrorDetail(e || {}) +
                    '<div class="mt-2 text-xs text-slate-500">การจดจำการเข้าสู่ระบบของเครื่องนี้ยังอยู่ กด "ลองใหม่" ได้ทันที</div>',
                showDenyButton: true, confirmButtonText: 'ลองใหม่', denyButtonText: 'กรอกรหัสผ่านเอง', allowOutsideClick: false
            });
            if (r && r.isConfirmed) return retry();
        }
        /** [v24 ข้อ 12] ข้อผิดพลาดชั่วคราว (หมดเวลา/เครือข่าย/เซิร์ฟเวอร์หนาแน่น) -> ลองใหม่อัตโนมัติได้ */
        const isTransientErr = (e) => !!e && (e.code === 'TIMEOUT' || e.code === 'BUSY' || e.code === 'BAD_RESPONSE' || (!e.server && !e.code));
        const AUTO_RETRY_MAX = 3;
        async function autoLoginFlow(rem, attempt) {
            attempt = attempt || 0;
            if (!attempt) { PC.perf = { t0: Date.now(), via: 'auto', sent: false }; PC.loadTiming = null; }   // [v43]
            prog('กำลังเข้าสู่ระบบอัตโนมัติ…', attempt ? 'เซิร์ฟเวอร์ตอบช้า กำลังลองใหม่อัตโนมัติ (ครั้งที่ ' + attempt + '/' + AUTO_RETRY_MAX + ')...' : 'ตรวจสอบการจดจำการเข้าสู่ระบบ');
            const hint = slowHint();
            let phase = 'auth';
            try {
                const res = await api('autoLogin', { userId: rem.userId, rt: rem.rt, boot: true }, { retries: 1, noAuthRedirect: true, timeout: RESTORE_TIMEOUT });
                clearTimeout(hint);
                if (PC.perf) PC.perf.login = Date.now() - PC.perf.t0;       // [v43]
                if (!res || !res.token || !res.user || !res.user.id) {
                    const e = new Error('เซิร์ฟเวอร์ตอบกลับข้อมูลไม่ครบ'); e.code = 'NO_USER'; throw e;
                }
                PC.token = res.token;
                if (res.rt) saveRemember(res.user.id, res.rt, res.rtExp);   // [แก้ login] ต่ออายุการจดจำ
                phase = 'load';
                progSet(35, 'เข้าสู่ระบบสำเร็จ กำลังเตรียมข้อมูล…');
                await startSession(res.user, undefined, undefined, { rooms: res.rooms, boot: res.boot });   // [ชุด 3 ข้อ 9]
                warnApiMismatch();
                // [ต.ค. 2569] เข้าอัตโนมัติ แต่รหัสผ่านของบัญชีเดาง่าย -> บังคับตั้งรหัสใหม่ (ไม่ต้องกรอกรหัสเดิม)
                if (res.mustChangePw && typeof PC.promptChangePassword === 'function') setTimeout(() => PC.promptChangePassword(''), 400);
                else if (typeof PC.offerCalendarSync === 'function') PC.offerCalendarSync(false);   // [รอบ 5 ข้อ 4]
            } catch (e) {
                clearTimeout(hint);
                PC.token = '';
                if (phase === 'load') { try { endSession(); showLoginView(); } catch (e2) { /* ข้าม */ } }
                progEnd();
                if (e && e.code === 'AUTH' && phase === 'auth') {
                    // เซิร์ฟเวอร์ปฏิเสธการจดจำจริง (หมดอายุ / เปลี่ยนรหัสผ่าน / ถูกปิดบัญชี) -> ลบ แล้วให้กรอกรหัสผ่าน
                    clearRemember();
                    toast('info', e.message || 'กรุณาเข้าสู่ระบบใหม่');
                    return;
                }
                if (phase === 'auth' && isTransientErr(e) && attempt < AUTO_RETRY_MAX) {
                    await sleep(1500 + attempt * 1500);
                    const r3 = loadRemember();
                    if (r3) return autoLoginFlow(r3, attempt + 1);
                }
                return restoreFailed(e, () => { const r2 = loadRemember(); return r2 ? autoLoginFlow(r2) : undefined; });
            }
        }
        /* ============================================================================
           [v44] เปิดแอปทันทีจากสำเนาในเครื่อง แล้วตรวจสิทธิ์กับเซิร์ฟเวอร์เบื้องหลัง
           เดิม : เปิดเว็บ/รีเฟรช -> ต้องรอเซิร์ฟเวอร์ตอบ (me / autoLogin) ก่อนจึงเห็นหน้าจอ (1-3 วินาทีขึ้นไป ถ้าเซิร์ฟเวอร์ตื่นช้านานกว่านั้น)
           ใหม่ : มีสำเนาข้อมูลของผู้ใช้คนนี้ในเครื่อง + มีบัตรผ่านหรือการจดจำอยู่ -> แสดงหน้าจอทันที
                  ระหว่างนั้นคำสั่งที่ต้องคุยกับเซิร์ฟเวอร์รอผลตรวจสิทธิ์ก่อน (PC.authPending) ไม่ถูกส่งออกไปล่วงหน้า
                  ตรวจไม่ผ่าน (บัตรผ่านหมดอายุ / ถูกปิดบัญชี / ยกเลิกการจดจำ) -> กลับหน้า login ทันที
           ไม่มีสำเนาในเครื่อง (ครั้งแรก/ล้างข้อมูล) -> ใช้ขั้นตอนเดิมทุกอย่าง
           ============================================================================ */
        /* [v45] ความปลอดภัย/ความเสถียรของการเปิดแอปจากสำเนาในเครื่อง
           - ใช้ได้เมื่อเซิร์ฟเวอร์ "ยืนยันบัญชีนี้" ล่าสุดไม่เกิน 3 วัน (ครอบคลุมวันหยุดสุดสัปดาห์) เกินกว่านั้นรอเซิร์ฟเวอร์ตรวจก่อนเหมือนเดิม
           - บัญชีที่ถูกปิด/ไม่มีอยู่แล้ว : ล้างสำเนาข้อมูลและไฟล์ที่เก็บในเครื่องของบัญชีนั้นทิ้ง + ยกเลิกการจดจำ (เปิดซ้ำจะไม่เห็นข้อมูลเดิมอีก)
           - ระหว่างรอผลตรวจ มีแถบเตือนบาง ๆ ด้านบน (ขึ้นเมื่อรอเกิน 0.4 วินาที)
           - ออกจากระบบ/เปลี่ยนผู้ใช้ระหว่างรอ -> ผลตรวจที่มาช้าจะถูกทิ้ง ไม่ตั้งบัตรผ่านให้ผู้ใช้เดิมกลับมา */
        const OPT_MAX_AGE = 3 * 86400000;
        const VERIFIED_KEY = 'pc_verified_v1';
        function markVerified() {
            const now = Date.now();
            if (!PC.user || now - (PC._verAt || 0) < 60000) return;
            PC._verAt = now;
            try { localStorage.setItem(VERIFIED_KEY, JSON.stringify({ uid: PC.user.id, at: now })); } catch (e) { /* ข้าม */ }
        }
        function lastVerified(uid) {
            try { const v = JSON.parse(localStorage.getItem(VERIFIED_KEY) || 'null'); return v && String(v.uid) === String(uid) ? (Number(v.at) || 0) : 0; } catch (e) { return 0; }
        }
        async function wipeLocal(uid) {
            try {
                await idb.del('kv', 'snap:' + uid);
                await idb.del('kv', 'assetIndex');
                await idb.run('assets', 'readwrite', st => st.clear());
                assetCache.index = null;
                localStorage.removeItem(VERIFIED_KEY);
            } catch (e) { /* ข้าม */ }
        }
        function verifyBar(show, msg) {
            let el = document.getElementById('pc-verify-bar');
            if (!show) { if (el) el.remove(); return; }
            if (!el) {
                el = document.createElement('div');
                el.id = 'pc-verify-bar';
                el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:4500;padding:4px 12px;background:#fef3c7;color:#92400e;font:600 12px Sarabun,sans-serif;text-align:center;border-bottom:1px solid #fcd34d;pointer-events:none';
                document.body.appendChild(el);
            }
            el.innerHTML = '<i class="fa-solid fa-shield-halved"></i> ' + esc(msg || 'กำลังตรวจสอบสิทธิ์การใช้งานกับเซิร์ฟเวอร์…');   // [v100] ข้อความกำหนดเองได้
        }
        async function peekSnapshot(uid) {
            if (!uid) return null;
            const snap = await idb.get('kv', 'snap:' + uid);
            if (!snap || snap.v !== SNAP_VER || snap.url !== PC.url || !snap.serverTime) return null;
            if ((Date.now() - snap.savedAt) >= 30 * 86400000) return null;
            const d = snap.data;
            if (!d || !d.me || String(d.me.id) !== String(uid) || !Array.isArray(d.rooms) || !d.rooms.length) return null;
            return snap;
        }
        async function optimisticRestore() {
            const s = loadSession(), rem = loadRemember();
            const uid = (s && s.token && s.uid) || (rem && rem.userId) || '';
            if (!uid) return false;
            if (Date.now() - lastVerified(uid) > OPT_MAX_AGE) return false;      // นานเกินไปที่เซิร์ฟเวอร์ไม่ได้ยืนยันบัญชีนี้ -> รอตรวจก่อนตามเดิม
            const snap = await peekSnapshot(uid);
            if (!snap) return false;
            const haveTok = !!(s && s.token && s.uid === uid);
            if (!haveTok && !(rem && rem.userId === uid)) return false;
            PC.perf = { t0: Date.now(), via: 'resume', sent: false }; PC.loadTiming = null;
            let done;
            PC.authPending = new Promise(r => { done = r; });
            PC.token = haveTok ? s.token : '';
            try {
                await startSession(Object.assign({}, snap.data.me));
            } catch (e) {
                PC.authPending = null; done(false); PC.token = '';
                try { endSession(); showLoginView(); } catch (e2) { /* ข้าม */ }
                return false;
            }
            const same = () => !!PC.user && String(PC.user.id) === String(uid);
            const barT = setTimeout(() => { if (PC.authPending) verifyBar(true); }, 400);
            const finish = (ok) => { clearTimeout(barT); verifyBar(false); PC.authPending = null; done(ok); };
            const gone = /ปิดการใช้งาน|ไม่พบบัญชี|ถูกปิด/;
            const fresh = (me) => {
                if (!me || !me.id || !same() || String(PC.user.id) !== String(me.id)) return;
                PC.freshMe = Object.assign({}, me); mergeMe(me); saveSession(); markVerified();
                if (PC.perf && !PC.perf.login) PC.perf.login = Date.now() - PC.perf.t0;
                try { rerenderAll({ rooms: true, perm: true, docs: true, users: true }); } catch (e) { /* ข้าม */ }
            };
            const kick = (msg, wipe) => {
                PC.token = ''; clearSession(); finish(false);
                if (wipe) { clearRemember(); wipeLocal(uid); }
                try { if (same()) { endSession(); showLoginView(); } } catch (e) { /* ข้าม */ }
                if (msg) toast('info', msg);
            };
            (async () => {
                if (haveTok) {
                    try {
                        const me = await api('me', {}, { retries: 1, noAuthRedirect: true, timeout: RESTORE_TIMEOUT });
                        if (!same()) return finish(false);                       // ออกจากระบบไประหว่างรอ
                        fresh(me); finish(true); if (PC.syncNow) PC.syncNow();
                        return;
                    } catch (e) {
                        if (!same()) return finish(false);
                        if (isTransientErr(e)) { status.show('เซิร์ฟเวอร์ตอบช้า กำลังใช้ข้อมูลที่บันทึกไว้ในเครื่องไปก่อน', 'warn', 6000); finish(true); return; }
                        if (e && e.code === 'AUTH' && gone.test(String(e.message))) return kick(e.message, true);
                        if (!(e && e.code === 'AUTH') || !rem) return kick(e && e.code === 'AUTH' ? 'หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่' : ((e && e.message) || 'เข้าสู่ระบบไม่สำเร็จ'));
                        // บัตรผ่านหมดอายุแต่ยังจดจำไว้ -> ต่อด้วยการเข้าระบบอัตโนมัติ
                    }
                }
                for (let attempt = 0; attempt <= AUTO_RETRY_MAX; attempt++) {
                    if (!same()) return finish(false);
                    try {
                        const res = await api('autoLogin', { userId: rem.userId, rt: rem.rt }, { retries: 0, noAuthRedirect: true, timeout: RESTORE_TIMEOUT });
                        if (!same()) return finish(false);                       // ออกจากระบบไปแล้ว : ทิ้งผลตรวจ ไม่ตั้งบัตรผ่านกลับ
                        if (!res || !res.token || !res.user || !res.user.id) { const e1 = new Error('เซิร์ฟเวอร์ตอบกลับข้อมูลไม่ครบ'); e1.code = 'NO_USER'; throw e1; }
                        PC.token = res.token;
                        if (res.rt) saveRemember(res.user.id, res.rt, res.rtExp);
                        fresh(res.user); finish(true);
                        if (PC.syncNow) PC.syncNow();
                        warnApiMismatch();
                        return;
                    } catch (e) {
                        if (!same()) return finish(false);
                        if (e && e.code === 'AUTH') { clearRemember(); return kick((e && e.message) || 'กรุณาเข้าสู่ระบบใหม่', gone.test(String(e.message))); }
                        if (!isTransientErr(e) || attempt >= AUTO_RETRY_MAX) return kick('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
                        await sleep(1500 + attempt * 1500 + Math.random() * 1000);
                    }
                }
            })();
            return true;
        }
        async function restoreSession(attempt) {
            attempt = Number(attempt) || 0;
            if (!attempt && !PC.optTried) {
                PC.optTried = true;
                try { if (await optimisticRestore()) return; } catch (e) { console.warn('[PC] optimisticRestore', e && e.message); }
            }
            const s = loadSession();
            const rem = loadRemember();
            if (!s || !s.token) {
                if (!rem) return;
                return autoLoginFlow(rem);
            }
            PC.token = s.token;
            prog('กำลังกลับเข้าสู่ระบบ…', 'ตรวจสอบสิทธิ์การใช้งาน');
            const hint = slowHint();
            let phase = 'auth';
            try {
                const me = await api('me', {}, { retries: 1, noAuthRedirect: true, timeout: RESTORE_TIMEOUT });
                clearTimeout(hint);
                phase = 'load';
                await startSession(me);
                warnApiMismatch();                                     // [แก้ login]
            } catch (e) {
                clearTimeout(hint);
                PC.token = '';
                if (phase === 'load') {
                    try { endSession(); showLoginView(); } catch (e2) { /* ข้าม */ }
                    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e3) { /* ข้าม */ }   // เก็บบัตรผ่านไว้ให้กด "ลองใหม่" ได้
                }
                progEnd();
                if (e && e.code === 'AUTH' && phase === 'auth') {
                    clearSession();
                    if (rem) return autoLoginFlow(rem);   // token หมดอายุ -> ลองเข้าระบบอัตโนมัติด้วยการจดจำ
                    return;
                }
                if (phase === 'auth' && isTransientErr(e) && attempt < AUTO_RETRY_MAX) {   // [v24 ข้อ 12]
                    progSet(undefined, 'เซิร์ฟเวอร์ตอบช้า กำลังลองใหม่อัตโนมัติ (ครั้งที่ ' + (attempt + 1) + '/' + AUTO_RETRY_MAX + ')...');
                    await sleep(1500 + attempt * 1500);
                    return restoreSession(attempt + 1);
                }
                return restoreFailed(e, () => restoreSession(0));
            }
        }
        PC.restoreSession = restoreSession;

        /* ============================================================================
           รอบ 4 : ระบบลายเซ็นและตราประทับ (ข้อ 22–29)
           ============================================================================ */

        // แผนผัง role ของช่องลายเซ็น -> stage ในไทม์ไลน์ (ใช้ร่วมกันทุกฟังก์ชันด้านล่าง)
        const SIG_STAGE = {
            admin: 1, assistant: 2, subdirector: 3, director: 4,
            admingroup: 5, subdirectorgroup: 6, subgroupadmin: 65, assistantgroup: 7, assignee: 8
        };

        /* ---------------------------------------------------------------
           [ข้อ 25] ลำดับที่ของขั้นตอนใน Flow (ใช้แสดงเป็นตัวเลขบนตราประทับ)
           --------------------------------------------------------------- */
        window.stampStepOrder = function (stage) {
            try {
                const active = (currentFlowSteps || []).filter(s => s.active !== false);
                const i = active.findIndex(s => Number(s.id) === Number(stage));
                if (i >= 0) return i + 1;
            } catch (e) { /* ข้าม */ }
            const fallback = { 1: 1, 4: 2, 5: 3, 6: 4, 65: 5, 7: 6, 8: 7 };
            return fallback[stage] || 1;
        };

        /* ---------------------------------------------------------------
           [ข้อ 24] ชื่อและ label บนตราประทับ = ชื่อ/ตำแหน่งของผู้ใช้ที่ประทับจริง
           --------------------------------------------------------------- */
        window.stampIdentity = function (sigPadKey) {
            const u = (typeof state !== 'undefined' && state.user) ? state.user : {};
            const roomName = (document.getElementById('banner-room-name')?.innerText || '').trim();
            const byStage = {
                admin: 'ธุรการกลาง',
                director: 'ผู้อำนวยการ',
                admingroup: roomName ? ('ธุรการ' + roomName) : 'ธุรการกลุ่มบริหาร',
                subdirectorgroup: roomName ? ('รอง ผอ. ' + roomName) : 'รอง ผอ. กลุ่มบริหาร',
                subgroupadmin: roomName ? ('ธุรการ' + roomName) : 'ธุรการกลุ่มงาน',
                assistantgroup: roomName ? ('ผช. ผอ. ' + roomName) : 'ผช. ผอ. กลุ่มงาน',
                assignee: 'ผู้รับผิดชอบ',
                assistant: 'ผู้ช่วยผู้อำนวยการ',
                subdirector: 'รองผู้อำนวยการสถานศึกษา'
            };
            return {
                name: u.name || u.id || 'ผู้ใช้งาน',
                position: byStage[sigPadKey] || u.title || u.position || '',
                order: window.stampStepOrder(SIG_STAGE[sigPadKey] || 1)
            };
        };

        /* ---------------------------------------------------------------
           [ข้อ 27] จำตำแหน่งที่ผู้ใช้ลากตราประทับไว้ครั้งล่าสุด (ต่อ 1 ขั้นตอน)
           ครั้งถัดไประบบจะวางตราที่ตำแหน่งเดิมทันที -> แทบไม่ต้องลากอีก
           เก็บเป็น "สัดส่วน" ของขนาดกระดาษ จึงใช้ได้แม้หนังสือคนละขนาด
           --------------------------------------------------------------- */
        const STAMP_POS_KEY = 'pc_stamp_pos_v1';
        function loadStampPos() {
            try { return JSON.parse(localStorage.getItem(STAMP_POS_KEY) || '{}'); } catch (e) { return {}; }
        }
        function saveStampPos(key, xRatio, yRatio) {
            try {
                const all = loadStampPos();
                all[key] = { x: xRatio, y: yRatio, at: Date.now() };
                localStorage.setItem(STAMP_POS_KEY, JSON.stringify(all));
            } catch (e) { /* ข้าม */ }
        }
        window.clearStampMemory = function () {
            try { localStorage.removeItem(STAMP_POS_KEY); } catch (e) { /* ข้าม */ }
            toast('success', 'ล้างตำแหน่งตราประทับที่จำไว้แล้ว');
        };

        /** ขนาดกระดาษจริงบน canvas */
        function paperSize(canvas) {
            const bg = canvas.backgroundImage;
            return {
                w: bg ? bg.width * bg.scaleX : canvas.width,
                h: bg ? bg.height * bg.scaleY : canvas.height
            };
        }

        /* ---------------------------------------------------------------
           [ข้อ 26 + 27] คำนวณตำแหน่งวางตราประทับอัตโนมัติ
             ลำดับความสำคัญ
               1) ตำแหน่งที่ผู้ใช้เคยลากไว้ (จำไว้ต่อขั้นตอน)
               2) ต่อจากตราสั่งการของ ผอ. ที่ตรวจพบบนหน้ากระดาษ (ข้อ 26)
               3) ค่าเริ่มต้นตามเดิม
           --------------------------------------------------------------- */
        window.computeStampPlacement = function (canvas, group, sigPadKey) {
            const paper = paperSize(canvas);
            const gw = group.width * (group.scaleX || 1);
            const gh = group.height * (group.scaleY || 1);
            const stage = SIG_STAGE[sigPadKey] || 1;

            // 1) ตำแหน่งที่จำไว้
            const mem = loadStampPos()[sigPadKey];
            if (mem && typeof mem.x === 'number' && typeof mem.y === 'number') {
                return {
                    left: Math.min(Math.max(mem.x * paper.w, gw / 2 + 8), paper.w - gw / 2 - 8),
                    top: Math.min(Math.max(mem.y * paper.h, gh / 2 + 8), paper.h - gh / 2 - 8),
                    from: 'memory'
                };
            }

            // 2) [ข้อ 26] ตรวจจับตราสั่งการของ ผอ. แล้ววางต่อจากตรานั้น
            if (stage !== 4) {
                const dirStamp = canvas.getObjects().find(o =>
                    o.stampName && /ผู้อำนวยการ|ผอ\./.test(String(o.stampName)) && o !== group);
                if (dirStamp) {
                    dirStamp.setCoords();
                    const r = dirStamp.getBoundingRect(true, true);
                    const gap = 10;
                    // วางไว้ "ใต้" ตรา ผอ. ถ้าที่เหลือพอ มิฉะนั้นวางไว้ "ข้าง ๆ" ทางซ้าย/ขวา
                    if (r.top + r.height + gap + gh <= paper.h - 6) {
                        return { left: r.left + r.width / 2, top: r.top + r.height + gap + gh / 2, from: 'below-director' };
                    }
                    if (r.left + r.width + gap + gw <= paper.w - 6) {
                        return { left: r.left + r.width + gap + gw / 2, top: r.top + gh / 2, from: 'right-of-director' };
                    }
                    if (r.left - gap - gw >= 6) {
                        return { left: r.left - gap - gw / 2, top: r.top + gh / 2, from: 'left-of-director' };
                    }
                }
            }

            // 3) ค่าเริ่มต้น
            const page1H = Math.min(paper.h, canvas.width * 1.414);
            if (stage === 4) {
                // [ข้อ 27] ตราสั่งการของ ผอ. : วางชิดมุมขวาล่างของหน้าแรก
                // (โซนที่หนังสือราชการมักมีลายเซ็นผู้ลงนามอยู่) ลดการลากให้น้อยที่สุด
                return {
                    left: Math.max(gw / 2 + 8, paper.w - gw / 2 - 30),
                    top: Math.max(gh / 2 + 20, page1H - gh / 2 - 40),
                    from: 'default-director'
                };
            }
            return {
                left: paper.w / 2,
                top: Math.max(gh / 2 + 20, page1H - gh / 2 - 45),
                from: 'default'
            };
        };

        /** ผูกการจำตำแหน่ง : เมื่อผู้ใช้ลากตราประทับ ระบบจะจำตำแหน่งใหม่ให้เอง */
        window.bindStampMemory = function (canvas, group, sigPadKey) {
            if (!canvas || !group) return;
            const remember = () => {
                const paper = paperSize(canvas);
                if (!paper.w || !paper.h) return;
                saveStampPos(sigPadKey, group.left / paper.w, group.top / paper.h);
            };
            group.on('modified', remember);
            group.__pcRemember = remember;
        };

        /* ---------------------------------------------------------------
           [ข้อ 22] เติมลายเซ็นที่บันทึกไว้ลงในช่องลายเซ็นให้อัตโนมัติ
           (ไม่ทับลายเซ็นที่ผู้ใช้เพิ่งวาดเอง และไม่มี popup รบกวน)
           --------------------------------------------------------------- */
        window.autoApplyStoredSignature = function (role) {
            try {
                const data = (typeof storedSignatures !== 'undefined' && storedSignatures[role]) || mySignature() || '';   // [แก้ลายเซ็นผิดคน]
                if (!data) return false;
                const pad = (typeof sigPads !== 'undefined') ? sigPads[role] : null;
                const canvas = document.getElementById('sig-' + role);
                if (!pad || !canvas) return false;
                if (!pad.isEmpty()) return false;   // ผู้ใช้ลงลายเซ็นเองแล้ว -> ไม่ทับ
                const img = new Image();
                img.onload = () => {
                    if (typeof pad.resize === 'function') pad.resize();   // ปรับขนาด backing store ก่อนวาด
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    const ratio = Math.min((canvas.height - 8) / img.height, (canvas.width - 16) / img.width);
                    ctx.drawImage(img, 0, 0, img.width, img.height,
                        (canvas.width - img.width * ratio) / 2,
                        (canvas.height - img.height * ratio) / 2,
                        img.width * ratio, img.height * ratio);
                    pad.setHasSignature(true);
                };
                img.src = data;
                return true;
            } catch (e) { return false; }
        };

        /** เติมลายเซ็นอัตโนมัติให้ทุกช่องที่เปิดอยู่ */
        window.autoApplyAllSignatures = function () {
            SIG_ROLES.forEach(r => { try { window.autoApplyStoredSignature(r); } catch (e) { /* ข้าม */ } });
        };

        // เติมลายเซ็นทันทีที่เปิดหน้าลงนาม
        (function () {
            const orig = window.openWorkspaceModal;
            window.openWorkspaceModal = function (tabName, docId) {
                const r = orig.apply(this, arguments);
                setTimeout(() => {
                    window.autoApplyStoredSignature(tabName);
                    window.renderSignPanelActions(tabName);   // [ข้อ 23]
                }, 260);
                return r;
            };
        })();
        (function () {
            const orig = window.goToSign;
            if (typeof orig !== 'function') return;
            window.goToSign = function () {
                const r = orig.apply(this, arguments);
                setTimeout(() => { window.autoApplyAllSignatures(); window.renderAllSignPanelActions(); }, 320);
                return r;
            };
        })();
        // เมื่อลายเซ็นถูกโหลดมาจากเซิร์ฟเวอร์ ให้เติมลงช่องที่เปิดอยู่ทันที
        (function () {
            const orig = window.applySignatureToPads;
            if (typeof orig !== 'function') return;
            window.applySignatureToPads = function (data, except) {
                const r = orig.apply(this, arguments);
                if (data) setMySignature(data);   // [แก้ลายเซ็นผิดคน] ผูกกับผู้ใช้ที่เข้าระบบอยู่
                setTimeout(() => window.autoApplyAllSignatures(), 120);
                return r;
            };
        })();

        /* ---------------------------------------------------------------
           [ข้อ 23] ปุ่มประทับตรา + ปุ่มส่งต่อ ใต้ส่วนแสดงลายเซ็นในหน้าลงนาม
           --------------------------------------------------------------- */
        const SIGN_PANEL_ACTIONS = {
            admin: {
                stage: 1,
                buttons: [
                    { fn: 'applyAdminStamp()', label: 'ประทับตรารับ', icon: 'fa-stamp', cls: 'bg-blue-600 hover:bg-blue-700' },
                    { fn: 'applyProposalStamp()', label: 'ประทับตราเสนอ', icon: 'fa-stamp', cls: 'bg-sky-600 hover:bg-sky-700' },
                    { fn: 'forwardDocToDirector(1)', label: 'บันทึกและส่งเสนอ ผอ.', icon: 'fa-paper-plane', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            },
            director: {
                stage: 4,
                buttons: [
                    { fn: 'applyDirectorStamp()', label: 'ประทับตราสั่งการ', icon: 'fa-stamp', cls: 'bg-indigo-600 hover:bg-indigo-700' },
                    { fn: 'forwardDoc(4)', label: 'บันทึกและส่งต่อ', icon: 'fa-paper-plane', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            },
            admingroup: {
                stage: 5,
                buttons: [
                    { fn: 'applyAdminGroupReceiveStamp()', label: 'ประทับตรารับ', icon: 'fa-stamp', cls: 'bg-slate-600 hover:bg-slate-700' },
                    { fn: 'applyAdminGroupProposalStamp()', label: 'ประทับตราเสนอ', icon: 'fa-stamp', cls: 'bg-blue-600 hover:bg-blue-700' },
                    { fn: 'forwardDoc(5)', label: 'เสนอ รองกลุ่ม', icon: 'fa-paper-plane', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            },
            subdirectorgroup: {
                stage: 6,
                buttons: [
                    { fn: 'applySubdirectorGroupStamp()', label: 'ประทับตรามอบหมาย', icon: 'fa-stamp', cls: 'bg-teal-600 hover:bg-teal-700' },
                    { fn: 'forwardDoc(6)', label: 'เสนอ ผช.กลุ่ม', icon: 'fa-paper-plane', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            },
            subgroupadmin: {
                stage: 65,
                buttons: [
                    { fn: 'applySubgroupAdminReceiveStamp()', label: 'ประทับตรารับ', icon: 'fa-stamp', cls: 'bg-slate-600 hover:bg-slate-700' },
                    { fn: 'applySubgroupAdminProposalStamp()', label: 'ประทับตราเสนอ', icon: 'fa-stamp', cls: 'bg-cyan-600 hover:bg-cyan-700' },
                    { fn: 'forwardDoc(65)', label: 'เสนอ ผช.กลุ่มงาน', icon: 'fa-paper-plane', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            },
            assistantgroup: {
                stage: 7,
                buttons: [
                    { fn: 'applyAssistantGroupStamp()', label: 'ประทับตรามอบหมาย', icon: 'fa-stamp', cls: 'bg-purple-600 hover:bg-purple-700' },
                    { fn: 'forwardDoc(7)', label: 'มอบผู้รับผิดชอบ', icon: 'fa-paper-plane', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            },
            assignee: {
                stage: 8,
                buttons: [
                    { fn: 'applyAssigneeStamp()', label: 'ประทับรับทราบ', icon: 'fa-stamp', cls: 'bg-rose-600 hover:bg-rose-700' },
                    { fn: 'forwardDoc(8)', label: 'บันทึกเสร็จสิ้น', icon: 'fa-check', cls: 'bg-emerald-600 hover:bg-emerald-700' }
                ]
            }
        };

        window.renderSignPanelActions = function (role) {
            const cfg = SIGN_PANEL_ACTIONS[role];
            if (!cfg) return;
            // ปกติวางต่อท้ายกล่องลายเซ็น; แผงที่ไม่มีช่องลายเซ็น (เช่น ธุรการกลาง) ให้ต่อท้ายแผงแทน
            const box = document.getElementById('sig-box-' + role);
            const anchor = (box && box.parentElement) ? box.parentElement : document.getElementById('panel-' + role);
            if (!anchor) return;
            const holderId = 'sign-actions-' + role;
            let holder = document.getElementById(holderId);
            if (!holder) {
                holder = document.createElement('div');
                holder.id = holderId;
                holder.className = 'mt-3 pt-3 border-t border-slate-200';
                anchor.appendChild(holder);   // ต่อท้ายส่วนลายเซ็น
            }
            const order = window.stampStepOrder(cfg.stage);
            holder.innerHTML =
                `<div class="flex items-center gap-1.5 mb-2">
                    <span class="bg-red-600 text-white text-[10px] font-black min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white shadow-sm leading-none">${order}</span>
                    <span class="text-[11px] font-bold text-slate-600">ขั้นตอนของท่าน — ประทับตราและส่งต่อ</span>
                 </div>
                 <div class="grid grid-cols-1 gap-1.5">
                    ${cfg.buttons.map(b => `<button type="button" onclick="${b.fn}" class="${b.cls} text-white w-full py-2 rounded-lg text-[11px] font-bold shadow-sm transition flex items-center justify-center gap-1.5"><i class="fa-solid ${b.icon}"></i> ${b.label}</button>`).join('')}
                 </div>`;
        };

        window.renderAllSignPanelActions = function () {
            Object.keys(SIGN_PANEL_ACTIONS).forEach(r => {
                try { window.renderSignPanelActions(r); } catch (e) { /* ข้าม */ }
            });
        };

        /* ---------------------------------------------------------------
           [ข้อ 28] รายชื่อผู้รับผิดชอบของ ผช.ผอ. เป็น list checkbox (เลือกได้หลายคน)
           แบ่งกลุ่มตาม "กลุ่มงาน" ของผู้ใช้ พร้อมช่องค้นหา
           --------------------------------------------------------------- */
        window.renderAssigneeCheckboxList = function (containerId, roomName) {
            const box = document.getElementById(containerId);
            if (!box) return;
            const users = (PC.users || []).filter(u => u.active !== false);
            const clean = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const room = clean(roomName || document.getElementById('banner-room-name')?.innerText || '');

            // จัดกลุ่ม : กลุ่มงานของผู้ใช้ (รองรับหลายกลุ่มตามข้อ 12)
            const groups = {};
            users.forEach(u => {
                const gs = (Array.isArray(u.groups) && u.groups.length) ? u.groups : (u.group ? [u.group] : ['ไม่ระบุกลุ่มงาน']);
                gs.forEach(g => {
                    const key = String(g || 'ไม่ระบุกลุ่มงาน').trim();
                    (groups[key] = groups[key] || []).push(u);
                });
            });

            // เรียงให้กลุ่มของห้องปัจจุบันอยู่บนสุด
            const keys = Object.keys(groups).sort((a, b) => {
                const am = clean(a) === room ? 0 : 1;
                const bm = clean(b) === room ? 0 : 1;
                return am - bm || a.localeCompare(b, 'th');
            });

            const totalSel = () => box.querySelectorAll('input[type=checkbox][data-uid]:checked').length;

            box.innerHTML =
                `<div class="flex items-center gap-2 mb-2">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]"></i>
                        <input type="text" id="${containerId}-search" oninput="filterAssigneeList('${containerId}')" placeholder="ค้นหาชื่อ/ตำแหน่ง..."
                               class="w-full pl-7 pr-2 py-1.5 text-[11px] border rounded-lg bg-slate-50 outline-none focus:ring-1 focus:ring-blue-500">
                    </div>
                    <span id="${containerId}-count" class="text-[10px] font-bold text-white bg-blue-600 px-2 py-1 rounded-full whitespace-nowrap">0 คน</span>
                 </div>
                 <div class="max-h-64 overflow-y-auto no-scrollbar border rounded-lg divide-y divide-slate-100 bg-white">
                 ${keys.map((g, gi) => `
                    <div class="assignee-group" data-group="${esc(g)}">
                        <label class="flex items-center gap-2 px-2.5 py-2 bg-slate-100 sticky top-0 cursor-pointer">
                            <input type="checkbox" class="w-4 h-4 text-blue-600" onchange="toggleAssigneeGroup(this, '${containerId}')">
                            <i class="fa-solid fa-people-group text-slate-500 text-[11px]"></i>
                            <span class="text-[11px] font-bold text-slate-700">${esc(g)}</span>
                            <span class="text-[10px] text-slate-400 ml-auto">(${groups[g].length})</span>
                        </label>
                        <div class="assignee-group-items">
                        ${groups[g].map(u => `
                            <label class="assignee-row flex items-start gap-2 px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition"
                                   data-search="${esc(((u.name || '') + ' ' + (u.position || '') + ' ' + (u.id || '') + ' ' + (u.subjectGroup || '')).toLowerCase())}">
                                <input type="checkbox" data-uid="${esc(u.id)}" data-name="${esc(u.name || u.id)}" class="w-4 h-4 text-blue-600 mt-0.5 shrink-0" onchange="updateAssigneeCount('${containerId}')">
                                <span class="text-[11px] leading-tight">
                                    <span class="font-bold text-slate-800">${esc(u.name || u.id)}</span>
                                    <span class="text-slate-500">${u.position ? ' (' + esc(u.position) : ''}${u.subjectGroup ? ' / ' + esc(u.subjectGroup) : ''}${u.position ? ')' : ''}</span>
                                </span>
                            </label>`).join('')}
                        </div>
                    </div>`).join('')}
                 </div>
                 <div class="flex gap-1.5 mt-2">
                    <button type="button" onclick="selectAllAssignees('${containerId}', true)" class="flex-1 py-1.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition">เลือกทั้งหมด</button>
                    <button type="button" onclick="selectAllAssignees('${containerId}', false)" class="flex-1 py-1.5 text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition">ล้างการเลือก</button>
                 </div>`;
            updateAssigneeCount(containerId);
            return totalSel;
        };

        window.filterAssigneeList = function (containerId) {
            const q = (document.getElementById(containerId + '-search')?.value || '').trim().toLowerCase();
            const box = document.getElementById(containerId);
            if (!box) return;
            box.querySelectorAll('.assignee-group').forEach(g => {
                let shown = 0;
                g.querySelectorAll('.assignee-row').forEach(row => {
                    const hit = !q || (row.dataset.search || '').includes(q);
                    row.classList.toggle('hidden', !hit);
                    if (hit) shown++;
                });
                g.classList.toggle('hidden', shown === 0);
            });
        };

        window.toggleAssigneeGroup = function (cb, containerId) {
            const group = cb.closest('.assignee-group');
            if (!group) return;
            group.querySelectorAll('.assignee-row:not(.hidden) input[type=checkbox][data-uid]').forEach(x => { x.checked = cb.checked; });
            updateAssigneeCount(containerId);
        };

        window.selectAllAssignees = function (containerId, on) {
            const box = document.getElementById(containerId);
            if (!box) return;
            box.querySelectorAll('.assignee-row:not(.hidden) input[type=checkbox][data-uid]').forEach(x => { x.checked = !!on; });
            box.querySelectorAll('.assignee-group > label input[type=checkbox]').forEach(x => { x.checked = !!on; });
            updateAssigneeCount(containerId);
        };

        window.updateAssigneeCount = function (containerId) {
            const box = document.getElementById(containerId);
            if (!box) return;
            const n = box.querySelectorAll('input[type=checkbox][data-uid]:checked').length;
            const el = document.getElementById(containerId + '-count');
            if (el) el.innerText = n + ' คน';
        };

        /** รายชื่อผู้รับผิดชอบที่ถูกติ๊กไว้ */
        window.getSelectedAssignees = function (containerId) {
            const box = document.getElementById(containerId);
            if (!box) return [];
            return Array.from(box.querySelectorAll('input[type=checkbox][data-uid]:checked'))
                .map(x => ({ id: x.dataset.uid, name: x.dataset.name }));
        };


        /* ============================================================================
           [ข้อ 13/14] ชั้นความลับหนังสือ
           ค่าที่เก็บในเอกสาร : doc.secrecy = 'normal' | 'confidential' | 'secret' | 'topsecret'
           ค่าเริ่มต้นคือ 'normal' (ทั่วไป)
           ============================================================================ */
        const SECRECY_LEVELS = [
            { id: 'normal', name: 'ทั่วไป', short: 'ทั่วไป', cls: 'bg-slate-50 text-slate-600 border-slate-200', on: 'peer-checked:bg-slate-500 peer-checked:text-white', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
            { id: 'confidential', name: 'ลับ', short: 'ลับ', cls: 'bg-amber-50 text-amber-700 border-amber-200', on: 'peer-checked:bg-amber-500 peer-checked:text-white', chip: 'bg-amber-100 text-amber-700 border-amber-300' },
            { id: 'secret', name: 'ลับมาก', short: 'ลับมาก', cls: 'bg-orange-50 text-orange-700 border-orange-200', on: 'peer-checked:bg-orange-600 peer-checked:text-white', chip: 'bg-orange-100 text-orange-700 border-orange-300' },
            { id: 'topsecret', name: 'ลับที่สุด', short: 'ลับที่สุด', cls: 'bg-rose-50 text-rose-700 border-rose-200', on: 'peer-checked:bg-rose-600 peer-checked:text-white', chip: 'bg-rose-100 text-rose-700 border-rose-300' }
        ];
        PC.SECRECY_LEVELS = SECRECY_LEVELS;

        /** [ข้อ 14] แผงที่มีสิทธิ์เห็นและแก้ไขชั้นความลับ -> stage ของแผงนั้น */
        const SECRECY_PANELS = { admin: 1, director: 4, subdirectorgroup: 6, assistantgroup: 7 };

        function secrecyOf(doc) {
            const v = String((doc && doc.secrecy) || 'normal');
            return SECRECY_LEVELS.some(x => x.id === v) ? v : 'normal';
        }
        PC.secrecyOf = secrecyOf;

        function secrecyLabel(doc) {
            const lv = SECRECY_LEVELS.find(x => x.id === secrecyOf(doc)) || SECRECY_LEVELS[0];
            return lv;
        }
        PC.secrecyLabel = secrecyLabel;

        /** ป้ายชั้นความลับสำหรับแปะในรายการหนังสือ (ซ่อนถ้าเป็น "ทั่วไป" เพื่อไม่ให้รก) */
        window.secrecyBadge = function (doc, always) {
            const lv = secrecyLabel(doc);
            if (lv.id === 'normal' && !always) return '';
            return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${lv.chip} whitespace-nowrap"><i class="fa-solid fa-user-secret mr-1"></i>${lv.name}</span>`;
        };

        /** [ข้อ 13/14] วาดปุ่มเลือกชั้นความลับในแผงที่กำหนด */
        window.renderSecrecyPicker = function (panelKey) {
            const stage = SECRECY_PANELS[panelKey];
            const box = document.getElementById('secrecy-container-' + panelKey);
            if (!box || !stage) return;
            const doc = state.documentQueue.find(d => d.id === state.activeDocIds[stage]);
            const cur = secrecyOf(doc);
            const disabled = !doc;
            /* [ข้อ 8] ใช้โครงสร้างปุ่มชุดเดียวกับ "7. ความเร่งด่วน" ทุกคลาส
               (label = cursor-pointer flex-1 text-center , div = py-1.5 rounded-lg text-[11px] font-bold border …)
               จึงได้ปุ่มขนาดเท่ากัน ยืดเต็มแถวเหมือนกันเป๊ะ */
            box.innerHTML = SECRECY_LEVELS.map(lv => `
                <label class="cursor-pointer flex-1 text-center ${disabled ? 'opacity-50 pointer-events-none' : ''}">
                    <input type="radio" name="secrecy-${panelKey}" value="${lv.id}" class="peer hidden" ${cur === lv.id ? 'checked' : ''} onchange="setDocSecrecy('${panelKey}', this.value)">
                    <div class="py-1.5 rounded-lg text-[11px] font-bold border peer-checked:ring-2 peer-checked:ring-offset-1 ${lv.cls} ${lv.on} transition shadow-sm">${lv.short}</div>
                </label>`).join('');
        };

        window.renderAllSecrecyPickers = function () {
            Object.keys(SECRECY_PANELS).forEach(k => { try { window.renderSecrecyPicker(k); } catch (e) { /* ข้าม */ } });
        };

        window.setDocSecrecy = function (panelKey, value) {
            const stage = SECRECY_PANELS[panelKey];
            const doc = state.documentQueue.find(d => d.id === state.activeDocIds[stage]);
            if (!doc) return;
            doc.secrecy = SECRECY_LEVELS.some(x => x.id === value) ? value : 'normal';
            // ให้แผงอื่นที่เปิดอยู่เห็นค่าตรงกันทันที
            window.renderAllSecrecyPickers();
            renderAllQueues();
            if (typeof docSync !== 'undefined' && docSync.schedule) docSync.schedule(1200);
            toast('info', 'ตั้งชั้นความลับเป็น "' + (SECRECY_LEVELS.find(x => x.id === doc.secrecy) || {}).name + '"');
        };

        // วาดปุ่มชั้นความลับใหม่ทุกครั้งที่เลือกหนังสือหรือเปิดแผงทำงาน
        (function () {
            const orig = window.selectDoc;
            if (typeof orig !== 'function') return;
            window.selectDoc = function () {
                const r = orig.apply(this, arguments);
                setTimeout(() => {
                    window.renderAllSecrecyPickers();
                    window.syncNoForwardUI();
                }, 80);
                return r;
            };
        })();
        (function () {
            const orig = window.openWorkspaceModal;
            window.openWorkspaceModal = function () {
                const r = orig.apply(this, arguments);
                setTimeout(() => {
                    window.renderAllSecrecyPickers();
                    window.syncNoForwardUI();
                }, 280);
                return r;
            };
        })();

        /* ============================================================================
           [ข้อ 15] ตัวเลือก "ไม่ส่งต่อ" ของ ผช.กลุ่ม
           ============================================================================ */
        window.toggleNoForward = function (checked) {
            const doc = state.documentQueue.find(d => d.id === state.activeDocIds[7]);
            const wrap = document.getElementById('assignee-picker-wrap');
            if (wrap) wrap.classList.toggle('opacity-40', !!checked);
            if (wrap) wrap.classList.toggle('pointer-events-none', !!checked);
            if (doc) {
                doc.noForward = !!checked;
                if (typeof docSync !== 'undefined' && docSync.schedule) docSync.schedule(1200);
            }
            const ta = document.getElementById('assistantgroup-comment');
            if (ta && checked) {
                const base = ta.value.split('\n').filter(l => l.indexOf('- มอบหมาย: ') !== 0).join('\n').trim();
                ta.value = (base ? base + '\n' : '') + '- ดำเนินการแล้วเสร็จในระดับกลุ่มงาน (ไม่ส่งต่อ)';
            }
        };

        window.syncNoForwardUI = function () {
            const cb = document.getElementById('assistantgroup-no-forward');
            if (!cb) return;
            const doc = state.documentQueue.find(d => d.id === state.activeDocIds[7]);
            cb.checked = !!(doc && doc.noForward);
            const wrap = document.getElementById('assignee-picker-wrap');
            if (wrap) {
                wrap.classList.toggle('opacity-40', cb.checked);
                wrap.classList.toggle('pointer-events-none', cb.checked);
            }
        };

        /* [ข้อ 15] ถ้าเลือก "ไม่ส่งต่อ" -> ปิดเรื่องที่ขั้นตอน 7 เลย (stage 99)
           [ข้อ 16] และถ้าชั้นความลับเป็น "ทั่วไป" -> ประชาสัมพันธ์ในหน้างานและกิจกรรมของห้องอัตโนมัติ */
        (function () {
            const orig = window.forwardDoc;
            if (typeof orig !== 'function') return;
            window.forwardDoc = async function (currentStage) {
                if (Number(currentStage) === 7) {
                    const doc = state.documentQueue.find(d => d.id === state.activeDocIds[7]);
                    const cb = document.getElementById('assistantgroup-no-forward');
                    if (doc && cb && cb.checked) {
                        const ok = await Swal.fire({
                            icon: 'question', title: 'ปิดเรื่องโดยไม่ส่งต่อ?',
                            html: '<div class="text-sm">ระบบจะบันทึกสถานะเป็น <b>เสร็จสิ้น</b> ทันที<br>และจะไม่ส่งหนังสือฉบับนี้ไปยังผู้รับผิดชอบ</div>',
                            showCancelButton: true, confirmButtonText: 'ยืนยัน ปิดเรื่อง', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#d97706'
                        });
                        if (!ok.isConfirmed) return;

                        const timeStr = (typeof getThaiDate === 'function') ? getThaiDate() : new Date().toLocaleString('th-TH');
                        doc.noForward = true;
                        doc.stage = 99;
                        doc.stepTimes = doc.stepTimes || {};
                        doc.stepTimes[7] = timeStr;
                        doc.stepTimes[99] = timeStr;
                        doc.actionStatus = document.getElementById('assistantgroup-comment')?.value || 'ดำเนินการแล้วเสร็จในระดับกลุ่มงาน (ไม่ส่งต่อ)';
                        doc.assigneeName = doc.assigneeName || '— ไม่ส่งต่อ (จบที่ ผช.กลุ่มงาน) —';
                        state.activeDocIds[7] = null;

                        try { await window.autoAnnounceDoc(doc); } catch (e) { /* ข้าม */ }

                        renderAllQueues();
                        if (typeof docSync !== 'undefined' && docSync.schedule) docSync.schedule(300);
                        Swal.fire({ icon: 'success', title: 'ปิดเรื่องเรียบร้อย', text: 'บันทึกสถานะเสร็จสิ้นแล้ว', timer: 1800, showConfirmButton: false });
                        return;
                    }
                    // ส่งต่อตามปกติ : ถ้าชั้นความลับเป็น "ทั่วไป" ให้ประชาสัมพันธ์ด้วย [ข้อ 16]
                    if (doc) { try { await window.autoAnnounceDoc(doc); } catch (e) { /* ข้าม */ } }
                }
                return orig.apply(this, arguments);
            };
        })();

        /* ============================================================================
           [ข้อ 16] ชั้นความลับ = ทั่วไป -> สร้างประกาศในหน้างานและกิจกรรมของห้อง
                    พร้อมความคิดเห็นแรกเป็น @all ประชาสัมพันธ์เพื่อทราบโดยทั่วกัน
           ============================================================================ */
        window.autoAnnounceDoc = async function (doc) {
            if (!doc) return;
            if (secrecyOf(doc) !== 'normal') return;        // ลับ/ลับมาก/ลับที่สุด ไม่ประชาสัมพันธ์
            if (doc.announced) return;                      // ประกาศไปแล้ว ไม่ทำซ้ำ

            const roomName = document.getElementById('banner-room-name')?.innerText || '';
            const annId = 'ANN_DOC_' + doc.id;
            if ((state.assignments || []).some(a => a.AssignmentID === annId)) { doc.announced = true; return; }

            const title = (doc.subject || doc.title || 'หนังสือราชการ');
            const recNo = doc.subgroupReceiveNo || doc.groupReceiveNo || doc.receiveNo || '-';
            const mediaData = {
                desc: `เรื่อง : ${title}\nเลขรับ : ${recNo}\nจาก : ${doc.sender || '-'}\nกำหนดส่ง : ${doc.deadline || '-'}\nผู้รับผิดชอบ : ${doc.assigneeName || '-'}`,
                imgUrl: '', videoUrl: '', fileUrl: '', linkUrl: '',
                group: roomName,
                reporter: state.user.name || state.user.id,
                docId: doc.id
            };
            const item = {
                AssignmentID: annId,
                Category: '📢 ประชาสัมพันธ์หนังสือราชการ',
                Title: title,
                Instructions: JSON.stringify(mediaData),
                isNotified: true, isHidden: false, isPinned: false,
                room: roomName,
                Group: roomName,
                Reporter: state.user.name || state.user.id,
                CreatedAt: new Date().toISOString(),
                CreatedBy: state.user.id,
                CreatedByName: state.user.name || state.user.id
            };

            state.assignments.unshift(Object.assign({ comments: [] }, item));
            doc.announced = true;

            try {
                const res = await apiWrite('saveAnnouncement', { item: item });
                storePut('announcements', item.AssignmentID, item, res);

                // ความคิดเห็นแรก : @all ประชาสัมพันธ์เพื่อทราบโดยทั่วกัน
                const comment = {
                    CommentID: 'CMT_' + Date.now(),
                    AssignmentID: annId,
                    ParentCommentID: '',
                    UserId: state.user.id,
                    UserEmail: state.user.email || state.user.id,
                    UserName: state.user.name || state.user.id,
                    UserImage: state.user.image || DEFAULT_AVATAR,
                    Message: '@all ประชาสัมพันธ์เพื่อทราบโดยทั่วกัน',
                    CreatedAt: new Date().toISOString(),
                    Reactions: '{}'
                };
                const target = state.assignments.find(a => a.AssignmentID === annId);
                if (target) (target.comments = target.comments || []).push(comment);
                const cres = await apiWrite('saveComment', { item: comment });
                storePut('comments', comment.CommentID, comment, cres);
            } catch (e) {
                console.warn('[PC] autoAnnounceDoc', e.message);
            }
            safeRenderAssignments();
        };

        /* ============================================================================
           [ข้อ 12] หน้างานและกิจกรรม : จัดหมวดหมู่ตามกลุ่มบริหาร 4 กลุ่ม
           ============================================================================ */
        const ANN_CATEGORIES = [
            { id: 'pinned', name: '📌 ประกาศสำคัญ (ปักหมุด)', cls: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: 'fa-thumbtack' },
            { id: 'กลุ่มบริหารวิชาการ', name: 'กลุ่มบริหารวิชาการ', cls: 'bg-rose-50 border-rose-200', text: 'text-rose-800', icon: 'fa-book' },
            { id: 'กลุ่มบริหารงบประมาณ', name: 'กลุ่มบริหารงบประมาณ', cls: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', icon: 'fa-coins' },
            { id: 'กลุ่มบริหารงานบุคคล', name: 'กลุ่มบริหารงานบุคคล', cls: 'bg-blue-50 border-blue-200', text: 'text-blue-800', icon: 'fa-users-gear' },
            { id: 'กลุ่มบริหารทั่วไป', name: 'กลุ่มบริหารทั่วไป', cls: 'bg-purple-50 border-purple-200', text: 'text-purple-800', icon: 'fa-building-shield' },
            { id: 'other', name: 'ทั่วไป / ส่วนกลาง', cls: 'bg-slate-50 border-slate-200', text: 'text-slate-700', icon: 'fa-layer-group' }
        ];

        /** หากลุ่มบริหารของประกาศ : จากกลุ่มงานผู้แจ้ง หรือห้องที่ประกาศ */
        function annCategoryOf(a) {
            if (a.isPinned) return 'pinned';
            let g = String(a.Group || a.room || '');
            if (!g && (a.Instructions || '').trim().startsWith('{')) {
                try { g = JSON.parse((a.Instructions || '').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")).group || ''; } catch (e) { /* ข้าม */ }
            }
            const clean = String(g).replace(/ฯ/g, '').trim();
            const main = ANN_CATEGORIES.slice(1, 5).find(c => clean === c.id || clean.includes(c.id));
            if (main) return main.id;
            // ห้องกลุ่มงานย่อย -> เทียบกับ parent ของห้องนั้น
            const room = (defaultRooms || []).find(r => String(r.name).replace(/ฯ/g, '').trim() === clean);
            if (room && room.parent) {
                const p = ANN_CATEGORIES.slice(1, 5).find(c => String(room.parent).includes(c.id));
                if (p) return p.id;
            }
            return 'other';
        }
        PC.annCategoryOf = annCategoryOf;

        /** สถานะเปิด/ปิดของแต่ละหมวด (จำไว้ต่อผู้ใช้) */
        function annOpenState() {
            try { return JSON.parse(localStorage.getItem('pc_ann_open') || '{"pinned":true}'); } catch (e) { return { pinned: true }; }
        }
        window.toggleAnnCategory = function (catId) {
            const st = annOpenState();
            st[catId] = !st[catId];
            try { localStorage.setItem('pc_ann_open', JSON.stringify(st)); } catch (e) { /* ข้าม */ }
            const body = document.getElementById('anncat-body-' + catId);
            const chev = document.getElementById('anncat-chev-' + catId);
            if (body) body.classList.toggle('hidden', !st[catId]);
            if (chev) chev.style.transform = st[catId] ? 'rotate(180deg)' : '';
        };

        /* ห่อ renderAssignmentsList เดิม : ปล่อยให้วาดการ์ดตามปกติ แล้วค่อยจัดการ์ดเข้าหมวด
           วิธีนี้ไม่ต้องรื้อโค้ดวาดการ์ดเดิม (ซึ่งยาวมากและมีระบบคอมเมนต์ผูกอยู่) */
        (function () {
            const orig = window.renderAssignmentsList;
            if (typeof orig !== 'function') return;
            window.renderAssignmentsList = function () {
                const r = orig.apply(this, arguments);
                try { groupAssignmentsIntoCategories(); } catch (e) { console.warn('[PC] groupAnn', e.message); }
                return r;
            };
        })();

        function groupAssignmentsIntoCategories() {
            const list = document.getElementById('assignments-list');
            if (!list) return;
            const cards = Array.from(list.children).filter(el => el.tagName === 'DIV' && el.className.indexOf('rounded-2xl') !== -1);
            if (!cards.length) return;                       // หน้าต้อนรับ/ว่างเปล่า -> ไม่ต้องจัดหมวด

            // จับคู่การ์ดกับประกาศตามลำดับที่ renderAssignmentsList วาด
            const visible = (state.assignments || []).filter(a => !(a.isHidden && !state.showHiddenAnnouncements))
                .sort((a, b) => {
                    if (a.isPinned && !b.isPinned) return -1;
                    if (!a.isPinned && b.isPinned) return 1;
                    return new Date(b.CreatedAt) < new Date(a.CreatedAt) ? 1 : -1;
                });
            if (visible.length !== cards.length) return;     // โครงสร้างไม่ตรง -> ปล่อยไว้แบบเดิมเพื่อความปลอดภัย

            const buckets = {};
            ANN_CATEGORIES.forEach(c => { buckets[c.id] = []; });
            visible.forEach((a, i) => { buckets[annCategoryOf(a)].push(cards[i]); });

            const openSt = annOpenState();
            const frag = document.createDocumentFragment();
            ANN_CATEGORIES.forEach(c => {
                const items = buckets[c.id];
                if (!items.length) return;
                const open = c.id === 'pinned' ? (openSt[c.id] !== false) : !!openSt[c.id];
                const sec = document.createElement('div');
                sec.className = 'mb-3';
                sec.innerHTML = `
                    <button type="button" onclick="toggleAnnCategory('${c.id}')"
                        class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border ${c.cls} hover:brightness-95 transition text-left">
                        <i class="fa-solid ${c.icon} ${c.text}"></i>
                        <span class="font-bold text-sm ${c.text}">${c.name}</span>
                        <span class="ml-auto text-[11px] font-bold bg-white/80 border border-white px-2.5 py-1 rounded-full ${c.text}">${items.length} รายการ</span>
                        <i id="anncat-chev-${c.id}" class="fa-solid fa-chevron-down ${c.text} text-xs transition-transform" style="${open ? 'transform:rotate(180deg);' : ''}"></i>
                    </button>
                    <div id="anncat-body-${c.id}" class="${open ? '' : 'hidden'} mt-2 space-y-3"></div>`;
                frag.appendChild(sec);
            });

            list.innerHTML = '';
            list.appendChild(frag);
            ANN_CATEGORIES.forEach(c => {
                const body = document.getElementById('anncat-body-' + c.id);
                if (!body) return;
                buckets[c.id].forEach(card => body.appendChild(card));
            });
        }


        /* ============================================================================
           [ข้อ 18–23] ระบบกำหนดงาน (Tasks) — อ้างอิงรูปแบบจาก Google Calendar Tasks
             - แท็บย่อย : งานของฉัน / งานกลุ่มสาระ / งานโรงเรียน (จัดกลุ่มตาม 4 กลุ่มบริหาร)
             - แต่ละแท็บย่อยเพิ่มงานใหม่ได้ (ข้อ 22)
             - ตั้งวัน-เวลาครบกำหนด แล้วแจ้งเตือนพร้อมเสียงที่ปุ่มปฏิทินบน navbar (ข้อ 20)
             - ผู้ใช้เลือกได้ว่าจะให้คนอื่นเห็นงานของตนหรือไม่ (ข้อ 19)
           ============================================================================ */
        let taskListMode = 'mine';
        let taskFlatpickr = {};

        function buildTasks() {
            state.tasks = Object.values(PC.store.tasks || {}).map(r => clone(r.d));
        }
        PC.buildTasks = buildTasks;

        window.switchTaskList = function (mode) {
            taskListMode = mode;
            ['mine', 'subject', 'school', 'group'].forEach(m => {
                const b = document.getElementById('tasktab-' + m);
                if (!b) return;
                if (m === mode) {
                    b.className = 'task-subtab px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm';
                    b.setAttribute('style', 'background:#c7d2fe;color:#1e1b4b;');
                } else {
                    b.className = 'task-subtab px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm bg-white text-slate-600 border border-slate-200';
                    b.removeAttribute('style');
                }
            });
            renderTasks();
        };

        /** งานที่ผู้ใช้คนนี้ควรเห็นในแท็บย่อยที่เลือก */
        function tasksForMode(mode) {
            const me = state.user || {};
            const all = (state.tasks || []).filter(t => t && t.id);
            if (mode === 'mine') {
                return all.filter(t => String(t.ownerId) === String(me.id));
            }
            if (mode === 'subject') {
                const mySubject = String(me.subjectGroup || '').trim();
                return all.filter(t => {
                    if (t.listType !== 'subject') return false;
                    if (String(t.ownerId) === String(me.id)) return true;
                    if (t.visibility !== 'public') return false;
                    return !mySubject || String(t.subjectGroup || '') === mySubject;
                });
            }
            // school : เห็นงานที่เผยแพร่ + งานของตัวเอง
            return all.filter(t => t.listType === 'school' && (t.visibility === 'public' || String(t.ownerId) === String(me.id)));
        }

        /** [ข้อ 21] งานโรงเรียนจัดกลุ่มตาม 4 กลุ่มบริหาร */
        const ADMIN_GROUPS_4 = ['กลุ่มบริหารวิชาการ', 'กลุ่มบริหารงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารทั่วไป'];
        const GROUP_TONE = {
            'กลุ่มบริหารวิชาการ': { bg: '#ffe4e6', fg: '#9f1239', icon: 'fa-book' },
            'กลุ่มบริหารงบประมาณ': { bg: '#d1fae5', fg: '#065f46', icon: 'fa-coins' },
            'กลุ่มบริหารงานบุคคล': { bg: '#dbeafe', fg: '#1e40af', icon: 'fa-users-gear' },
            'กลุ่มบริหารทั่วไป': { bg: '#ede9fe', fg: '#5b21b6', icon: 'fa-building-shield' },
            'อื่น ๆ / ส่วนกลาง': { bg: '#e2e8f0', fg: '#334155', icon: 'fa-layer-group' }
        };
        function mainGroupOf(t) {
            const g = String(t.group || '').replace(/ฯ/g, '').trim();
            const direct = ADMIN_GROUPS_4.find(x => g === x || g.includes(x));
            if (direct) return direct;
            const room = (defaultRooms || []).find(r => String(r.name).replace(/ฯ/g, '').trim() === g);
            if (room && room.parent) {
                const p = ADMIN_GROUPS_4.find(x => String(room.parent).includes(x));
                if (p) return p;
            }
            return 'อื่น ๆ / ส่วนกลาง';
        }

        function taskDueInfo(t) {
            if (!t.dueDate) return { text: '', overdue: false, soon: false };
            const hasTime = !t.allDay && t.dueTime;
            const dt = new Date(t.dueDate + 'T' + (hasTime ? t.dueTime : '23:59') + ':00');
            const now = new Date();
            const today = pcDateStr(now);
            const tomorrow = pcDateStr(new Date(now.getTime() + 86400000));
            let day;
            if (t.dueDate === today) day = 'วันนี้';
            else if (t.dueDate === tomorrow) day = 'พรุ่งนี้';
            else {
                const d = new Date(t.dueDate + 'T00:00:00');
                day = d.getDate() + ' ' + ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()] + ' ' + (d.getFullYear() + 543);
            }
            return {
                text: day + (hasTime ? ' ' + t.dueTime : ''),
                overdue: t.status !== 'done' && dt.getTime() < now.getTime(),
                soon: t.status !== 'done' && dt.getTime() - now.getTime() < 86400000 && dt.getTime() >= now.getTime()
            };
        }

        function taskRowHtml(t) {
            const due = taskDueInfo(t);
            const done = t.status === 'done';
            const mine = String(t.ownerId) === String(state.user.id);
            return `
            <div class="group flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition ${done ? 'opacity-55' : ''}">
                <button type="button" onclick="toggleTaskDone('${jsq(t.id)}', ${done ? 'false' : 'true'})"
                        class="mt-0.5 w-5 h-5 rounded-full border-2 ${done ? 'bg-indigo-400 border-indigo-400 text-white' : 'border-slate-300 hover:border-indigo-400'} flex items-center justify-center shrink-0 transition"
                        title="${done ? 'ทำเครื่องหมายว่ายังไม่เสร็จ' : 'ทำเครื่องหมายว่าเสร็จแล้ว'}">
                    ${done ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                </button>
                <div class="flex-1 min-w-0 cursor-pointer" onclick="${mine ? `editTask('${jsq(t.id)}')` : `viewTask('${jsq(t.id)}')`}">
                    <div class="text-sm font-semibold text-slate-800 ${done ? 'line-through' : ''} truncate">${esc(t.title)}</div>
                    ${t.desc ? `<div class="text-[11px] text-slate-500 truncate">${esc(t.desc)}</div>` : ''}
                    <div class="flex flex-wrap items-center gap-1.5 mt-1">
                        ${due.text ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${due.overdue ? 'bg-rose-50 text-rose-700 border-rose-200' : (due.soon ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200')}"><i class="fa-regular fa-clock mr-1"></i>${esc(due.text)}${due.overdue ? ' (เลยกำหนด)' : ''}</span>` : ''}
                        ${t.repeat && t.repeat !== 'none' ? `<span class="text-[10px] text-slate-500"><i class="fa-solid fa-repeat"></i></span>` : ''}
                        ${!mine ? `<span class="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-user mr-1"></i>${esc(t.ownerName || t.ownerId)}</span>` : ''}
                        ${mine && t.visibility === 'public' ? `<span class="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-eye mr-1"></i>ผู้อื่นเห็นได้</span>` : ''}
                        ${t.subjectGroup ? `<span class="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">${esc(t.subjectGroup)}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    ${mine ? `<button type="button" onclick="event.stopPropagation(); editTask('${jsq(t.id)}')" class="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500" title="แก้ไข"><i class="fa-solid fa-pen text-[11px]"></i></button>
                    <button type="button" onclick="event.stopPropagation(); deleteTask('${jsq(t.id)}')" class="w-7 h-7 rounded-lg hover:bg-rose-100 text-rose-500" title="ลบ"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
                </div>
                <button type="button" onclick="event.stopPropagation(); toggleTaskStar('${jsq(t.id)}')" class="w-7 h-7 rounded-lg ${t.starred ? 'text-amber-400' : 'text-slate-300 opacity-0 group-hover:opacity-100'} hover:text-amber-500 transition shrink-0" title="ติดดาว">
                    <i class="fa-${t.starred ? 'solid' : 'regular'} fa-star text-[13px]"></i>
                </button>
            </div>`;
        }

        function taskSection(title, tone, items) {
            return `
            <div class="mb-3 rounded-2xl border overflow-hidden" style="border-color:${tone.bg};">
                <div class="px-4 py-2.5 flex items-center gap-2" style="background:${tone.bg};color:${tone.fg};">
                    <i class="fa-solid ${tone.icon}"></i>
                    <span class="font-bold text-sm">${esc(title)}</span>
                    <span class="ml-auto text-[11px] font-bold bg-white/70 px-2.5 py-0.5 rounded-full">${items.length} รายการ</span>
                </div>
                <div class="p-1.5 bg-white">
                    ${items.length ? items.map(taskRowHtml).join('') : '<div class="px-3 py-4 text-center text-xs text-slate-400">ยังไม่มีงานในกลุ่มนี้</div>'}
                </div>
            </div>`;
        }

        window.renderTasks = function () {
            const wrap = document.getElementById('tasks-wrapper');
            if (!wrap) return;
            const showDone = document.getElementById('tasks-show-done')?.checked;
            let items = tasksForMode(taskListMode);
            if (!showDone) items = items.filter(t => t.status !== 'done');

            // [v29 ข้อ 2] เรียง : ปักหมุด (ของผู้ใช้) ก่อน -> เรื่องล่าสุดไว้บนสุด
            if (typeof PC.sortTasksForMe === 'function') PC.sortTasksForMe(items);
            // เดิม : ติดดาวก่อน -> ครบกำหนดใกล้สุด -> ชื่อ
            else items.sort((a, b) => {
                if (!!b.starred !== !!a.starred) return b.starred ? 1 : -1;
                const ad = (a.dueDate || '9999-99-99') + (a.dueTime || '99:99');
                const bd = (b.dueDate || '9999-99-99') + (b.dueTime || '99:99');
                if (ad !== bd) return ad < bd ? -1 : 1;
                return String(a.title).localeCompare(String(b.title), 'th');
            });

            // [ข้อ 22] ปุ่มเพิ่มงานประจำแท็บย่อย
            const addBtn = `
                <button type="button" onclick="openTaskModal(null, '${taskListMode}')"
                        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-dashed transition mb-3 hover:brightness-95"
                        style="border-color:#c7d2fe;color:#4338ca;background:#f5f7ff;">
                    <i class="fa-solid fa-circle-plus text-lg"></i>
                    <span class="text-sm font-bold">เพิ่มงาน</span>
                </button>`;

            if (!items.length) {
                wrap.innerHTML = addBtn + `<div class="py-12 text-center text-slate-400">
                    <i class="fa-regular fa-square-check text-4xl mb-3 block"></i>
                    <div class="text-sm">ยังไม่มีงานในรายการนี้</div></div>`;
                updateTasksBadge();
                return;
            }

            if (taskListMode === 'school') {
                const buckets = {};
                items.forEach(t => { const g = mainGroupOf(t); (buckets[g] = buckets[g] || []).push(t); });
                const order = ADMIN_GROUPS_4.concat(['อื่น ๆ / ส่วนกลาง']);
                wrap.innerHTML = addBtn + order.filter(g => buckets[g] && buckets[g].length)
                    .map(g => taskSection(g, GROUP_TONE[g] || GROUP_TONE['อื่น ๆ / ส่วนกลาง'], buckets[g])).join('');
            } else if (taskListMode === 'group') {
                // [v31 ข้อ 4] งานกลุ่มงาน : จัดกลุ่มตามชื่อกลุ่มงาน
                const buckets = {};
                items.forEach(t => { const g = String(t.group || 'ไม่ระบุกลุ่มงาน').replace(/ฯ/g, '').trim(); (buckets[g] = buckets[g] || []).push(t); });
                wrap.innerHTML = addBtn + Object.keys(buckets).sort((a, b) => a.localeCompare(b, 'th'))
                    .map(g => taskSection(g, { bg: '#ffedd5', fg: '#9a3412', icon: 'fa-sitemap' }, buckets[g])).join('');
            } else if (taskListMode === 'subject') {
                const buckets = {};
                items.forEach(t => { const g = t.subjectGroup || 'ไม่ระบุกลุ่มสาระฯ'; (buckets[g] = buckets[g] || []).push(t); });
                wrap.innerHTML = addBtn + Object.keys(buckets).sort((a, b) => a.localeCompare(b, 'th'))
                    .map(g => taskSection(g, { bg: '#e0e7ff', fg: '#3730a3', icon: 'fa-book-open' }, buckets[g])).join('');
            } else {
                wrap.innerHTML = addBtn + `<div class="rounded-2xl border border-slate-100 p-1.5">${items.map(taskRowHtml).join('')}</div>`;
            }
            updateTasksBadge();
        };

        /* ---------------- โมดอลเพิ่ม/แก้ไขงาน ---------------- */
        function initTaskPickers() {
            if (typeof flatpickr !== 'function') return;
            taskFlatpickr.date = flatpickr('#task-due-date', { locale: 'th', dateFormat: 'Y-m-d', altInput: true, altFormat: 'j F Y', allowInput: false });
            taskFlatpickr.time = flatpickr('#task-due-time', { enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true });
        }

        window.onTaskAllDayChange = function () {
            const all = document.getElementById('task-allday')?.checked;
            const timeEl = document.getElementById('task-due-time');
            if (!timeEl) return;
            timeEl.disabled = !!all;
            timeEl.classList.toggle('opacity-40', !!all);
            if (all && taskFlatpickr.time) taskFlatpickr.time.clear();
        };

        window.openTaskModal = function (id, presetList) {
            if (!PC.user) { Swal.fire('ยังไม่ได้เข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบก่อน', 'warning'); return; }
            const modal = document.getElementById('modal-task');
            if (!modal) return;
            ['task-title', 'task-desc', 'task-due-date', 'task-due-time'].forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
            document.getElementById('task-id').value = '';
            document.getElementById('task-allday').checked = false;
            document.getElementById('task-starred').checked = false;
            document.getElementById('task-repeat').value = 'none';
            document.getElementById('task-list').value = presetList || taskListMode || 'mine';
            document.getElementById('task-visibility').value = (presetList || taskListMode) === 'mine' ? 'private' : 'public';
            document.getElementById('task-delete-btn').classList.add('hidden');
            initTaskPickers();
            onTaskAllDayChange();
            modal.classList.remove('hidden');
            setTimeout(() => document.getElementById('task-title')?.focus(), 80);
        };

        window.closeTaskModal = function () {
            document.getElementById('modal-task')?.classList.add('hidden');
        };

        window.editTask = function (id) {
            const t = (state.tasks || []).find(x => x.id === id);
            if (!t) return;
            if (String(t.ownerId) !== String(state.user.id) && realRole() !== 'ADMIN') return viewTask(id);
            openTaskModal();
            document.getElementById('task-id').value = t.id;
            document.getElementById('task-title').value = t.title || '';
            document.getElementById('task-desc').value = t.desc || '';
            document.getElementById('task-allday').checked = !!t.allDay;
            document.getElementById('task-starred').checked = !!t.starred;
            document.getElementById('task-repeat').value = t.repeat || 'none';
            document.getElementById('task-list').value = t.listType || 'mine';
            document.getElementById('task-visibility').value = t.visibility || 'private';
            if (taskFlatpickr.date && t.dueDate) taskFlatpickr.date.setDate(t.dueDate);
            if (taskFlatpickr.time && t.dueTime) taskFlatpickr.time.setDate(t.dueTime);
            document.getElementById('task-delete-btn').classList.remove('hidden');
            onTaskAllDayChange();
        };

        window.viewTask = function (id) {
            const t = (state.tasks || []).find(x => x.id === id);
            if (!t) return;
            const due = taskDueInfo(t);
            Swal.fire({
                title: esc(t.title),
                html: `<div class="text-left text-sm space-y-1.5">
                    ${t.desc ? `<div class="text-slate-600 whitespace-pre-wrap">${esc(t.desc)}</div>` : ''}
                    ${due.text ? `<div><i class="fa-regular fa-clock text-slate-400 w-4"></i> ${esc(due.text)}</div>` : ''}
                    <div><i class="fa-solid fa-user text-slate-400 w-4"></i> ${esc(t.ownerName || t.ownerId)}</div>
                    ${t.group ? `<div><i class="fa-solid fa-sitemap text-slate-400 w-4"></i> ${esc(t.group)}</div>` : ''}
                    ${t.subjectGroup ? `<div><i class="fa-solid fa-book text-slate-400 w-4"></i> ${esc(t.subjectGroup)}</div>` : ''}
                    <div><i class="fa-solid fa-flag text-slate-400 w-4"></i> ${t.status === 'done' ? 'เสร็จแล้ว' : 'ยังไม่เสร็จ'}</div>
                </div>`,
                confirmButtonText: 'ปิด', confirmButtonColor: '#6366f1'
            });
        };

        window.saveTask = async function () {
            const title = (document.getElementById('task-title')?.value || '').trim();
            if (!title) { toast('warning', 'กรุณาระบุชื่องาน'); document.getElementById('task-title')?.focus(); return; }
            const allDay = document.getElementById('task-allday').checked;
            const item = {
                id: document.getElementById('task-id').value || '',
                title: title,
                desc: (document.getElementById('task-desc')?.value || '').trim(),
                listType: document.getElementById('task-list').value,
                visibility: document.getElementById('task-visibility').value,
                dueDate: document.getElementById('task-due-date').value || '',
                dueTime: allDay ? '' : (document.getElementById('task-due-time').value || ''),
                allDay: allDay,
                repeat: document.getElementById('task-repeat').value,
                starred: document.getElementById('task-starred').checked,
                remind: Number(document.getElementById('task-remind')?.value || 0),     // [v31 ข้อ 3] แจ้งเตือนล่วงหน้า (นาที)
                group: (state.user.groups && state.user.groups[0]) || state.user.group || '',
                subjectGroup: state.user.subjectGroup || '',
                room: document.getElementById('banner-room-name')?.innerText || '',
                shareTo: typeof PC.getShareTo === 'function' ? PC.getShareTo('task') : []     // [v25 ข้อ 10] แชร์ให้กลุ่ม/บุคคล
            };
            const old = item.id ? (state.tasks || []).find(x => x.id === item.id) : null;
            if (old) item.status = old.status;

            closeTaskModal();
            // อัปเดตหน้าจอทันที แล้วค่อยบันทึกขึ้นเซิร์ฟเวอร์ (optimistic)
            const backup = (state.tasks || []).slice();
            const tempId = item.id || ('task_' + Date.now());
            const draft = Object.assign({}, item, { id: tempId, ownerId: state.user.id, ownerName: state.user.name || state.user.id, status: item.status || 'open' });
            state.tasks = old ? state.tasks.map(x => (x.id === tempId ? draft : x)) : (state.tasks || []).concat([draft]);
            renderTasks();
            try {
                const res = await apiWrite('saveTask', { item: item });
                if (res && res.item) {
                    state.tasks = state.tasks.filter(x => x.id !== tempId).concat([res.item]);
                    storePut('tasks', res.item.id, res.item, res.saved);
                }
                renderTasks();
                toast('success', 'บันทึกงานเรียบร้อย');
            } catch (err) {
                state.tasks = backup;
                renderTasks();
                Swal.fire('บันทึกงานไม่สำเร็จ', err.message, 'error');
            }
        };

        window.deleteTaskFromModal = function () {
            const id = document.getElementById('task-id').value;
            if (id) { closeTaskModal(); window.deleteTask(id); }
        };

        window.deleteTask = function (id) {
            Swal.fire({
                title: 'ลบงานนี้?', text: 'ลบแล้วไม่สามารถกู้คืนได้', icon: 'warning',
                showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#e11d48'
            }).then(async r => {
                if (!r.isConfirmed) return;
                const backup = (state.tasks || []).slice();
                state.tasks = (state.tasks || []).filter(x => x.id !== id);
                renderTasks();
                try {
                    await apiWrite('deleteTask', { id: id });
                    if (PC.store) delete PC.store.tasks[id];
                    toast('success', 'ลบงานแล้ว');
                } catch (err) {
                    state.tasks = backup;
                    renderTasks();
                    Swal.fire('ลบไม่สำเร็จ', err.message, 'error');
                }
            });
        };

        window.toggleTaskDone = async function (id, done) {
            const t = (state.tasks || []).find(x => x.id === id);
            if (!t) return;
            const prev = t.status;
            t.status = (done === true || done === 'true') ? 'done' : 'open';
            t.completedAt = t.status === 'done' ? Date.now() : '';
            renderTasks();
            try {
                await apiWrite('toggleTask', { id: id, done: t.status === 'done' });
                if (PC.store && PC.store.tasks[id]) PC.store.tasks[id].d.status = t.status;
            } catch (err) {
                t.status = prev;
                renderTasks();
                toast('error', 'อัปเดตสถานะไม่สำเร็จ');
            }
        };

        window.toggleTaskStar = async function (id) {
            const t = (state.tasks || []).find(x => x.id === id);
            if (!t) return;
            if (String(t.ownerId) !== String(state.user.id) && realRole() !== 'ADMIN') { toast('warning', 'ติดดาวได้เฉพาะงานของตนเอง'); return; }
            t.starred = !t.starred;
            renderTasks();
            try { await apiWrite('saveTask', { item: t }); } catch (e) { /* ข้าม */ }
        };

        /* ---------------- [ข้อ 20] แจ้งเตือนเมื่อถึงเวลาครบกำหนด ---------------- */
        const notifiedTasks = {};
        function dueTaskCount() {
            const now = Date.now();
            return (state.tasks || []).filter(t => {
                if (!t || t.status === 'done' || !t.dueDate) return false;
                const dt = new Date(t.dueDate + 'T' + ((!t.allDay && t.dueTime) ? t.dueTime : '23:59') + ':00').getTime();
                return dt <= now;              // ถึงเวลาแล้ว หรือเลยกำหนด
            }).length;
        }

        window.updateTasksBadge = function () {
            const n = dueTaskCount();
            const b = document.getElementById('tasks-tab-badge');
            if (b) { b.innerText = n; b.classList.toggle('hidden', n === 0); }
            return n;
        };

        function checkTaskReminders() {
            if (!PC.token || !state.tasks) return;
            const now = Date.now();
            let fired = 0;
            state.tasks.forEach(t => {
                if (!t || t.status === 'done' || !t.dueDate) return;
                const dt = new Date(t.dueDate + 'T' + ((!t.allDay && t.dueTime) ? t.dueTime : '09:00') + ':00').getTime();
                if (dt > now || now - dt > 12 * 3600000) return;     // ถึงเวลาแล้วภายใน 12 ชม.
                if (notifiedTasks[t.id]) return;
                notifiedTasks[t.id] = true;
                fired++;
                toast('warning', 'ถึงกำหนดงาน: ' + t.title);
            });
            const n = updateTasksBadge();
            // ใช้ระบบแจ้งเตือนของปุ่มปฏิทินบน navbar (มีเสียงในตัว)
            if (fired > 0) {
                try {
                    if (typeof updateCalendarBadges === 'function') updateCalendarBadges(n + (PC.todayEventCount || 0));
                    else if (typeof playCalendarAlert === 'function') playCalendarAlert();
                } catch (e) { /* ข้าม */ }
            }
        }
        PC.checkTaskReminders = checkTaskReminders;
        setInterval(checkTaskReminders, 60000);

        // วาดรายการงานเมื่อเปิดแท็บ
        (function () {
            const orig = window.switchTab;
            window.switchTab = function (tabName) {
                const r = orig.apply(this, arguments);
                if (tabName === 'tasks') { try { renderTasks(); } catch (e) { console.warn('[PC] tasks', e.message); } }
                return r;
            };
        })();

        /* [ข้อ 19] แท็บกำหนดงานต้องแสดงกับผู้ใช้ทุกคน */
        (function () {
            const orig = window.applyRolePermissions;
            window.applyRolePermissions = function () {
                const r = orig.apply(this, arguments);
                const b = document.getElementById('tab-btn-tasks');
                if (b && (typeof PC.tabAllowed !== 'function' || PC.tabAllowed('tasks'))) b.classList.remove('hidden');
                try { updateTasksBadge(); } catch (e) { /* ข้าม */ }
                return r;
            };
        })();


        /* ============================================================================
           ชุด 3 : ลงนามผ่านปุ่ม / รหัสผ่านเริ่มต้น / ทะเบียน+คลังรายปี / Gmail + LINE / Google Calendar
           ============================================================================ */

        // ---------------------------------------------------------------
        // [ชุด 3 ข้อ 7] ปุ่ม "ลงนาม" ในกล่องหนังสือเข้า เปิดหน้าลงนามได้ทันที
        //   ไม่ต้องมีแท็บลงนามของตัวเองแสดงอยู่ (ข้อ 1) — ตรวจสิทธิ์จากขั้นตอนหนังสือ + กลุ่ม + สิทธิ์ลงนามรายบุคคล
        // ---------------------------------------------------------------
        const STAGE_SIGN_TAB = { 1: 'admin', 4: 'director', 5: 'admingroup', 6: 'subdirectorgroup', 65: 'subgroupadmin', 7: 'assistantgroup', 8: 'assignee' };
        const ROLE_SIGN_TABS = {
            Administrative: ['admin'], Director: ['director'], ActingDirector: ['director'],
            AdminGroup: ['admingroup', 'subgroupadmin'], SubdirectorGroup: ['subdirectorgroup'],
            AssistantGroup: ['assistantgroup'], Assignee: ['assignee']
        };
        /** แท็บลงนามที่ผู้ใช้คนนี้เปิดได้สำหรับหนังสือฉบับนี้ ('' = ไม่มีสิทธิ์) */
        function signTabForDoc(doc) {
            if (!doc || Number(doc.stage) === 99) return '';
            const tab = STAGE_SIGN_TAB[Number(doc.stage)];
            if (!tab) return '';
            const role = realRole() || (state.user && state.user.role) || '';
            if (role === 'ADMIN') return tab;
            const own = (PC.user && Array.isArray(PC.user.signRoles) && PC.user.signRoles.length) ? PC.user.signRoles : (ROLE_SIGN_TABS[role] || []);
            if (!own.includes(tab)) return '';
            const title = (typeof userTitleForMatch === 'function') ? userTitleForMatch() : String((state.user && state.user.title) || '');
            const hit = (list) => Array.isArray(list) && list.some(g => title.includes(String(g).replace(/ฯ/g, '').trim()));
            if ((tab === 'admingroup' || tab === 'subdirectorgroup') && !hit(doc.assignedGroups)) return '';
            if ((tab === 'subgroupadmin' || tab === 'assistantgroup') && !hit(doc.subGroups)) return '';
            return tab;
        }
        PC.signTabForDoc = signTabForDoc;

        (function () {
            const orig = window.goToSign;
            window.goToSign = function (docId) {
                const doc = state.documentQueue.find(d => d.id === docId);
                const tab = signTabForDoc(doc);
                if (!tab) return typeof orig === 'function' ? orig.apply(this, arguments) : undefined;   // ข้อความแจ้งเตือนเดิม
                PC.signBypass = tab;
                try { window.openWorkspaceModal(tab, docId); } finally { PC.signBypass = ''; }
                setTimeout(() => {
                    try { if (typeof window.autoApplyAllSignatures === 'function') window.autoApplyAllSignatures(); } catch (e) { /* ข้าม */ }
                    try { if (typeof window.renderAllSignPanelActions === 'function') window.renderAllSignPanelActions(); } catch (e) { /* ข้าม */ }
                }, 320);
            };
        })();

        // [ชุด 3 ข้อ 9] ระหว่างโหลดข้อมูลเบื้องหลัง ยังไม่ให้เปิดหน้าลงรับ/ลงนาม (กันงานที่ทำไว้ถูกข้อมูลที่โหลดเสร็จทีหลังทับ)
        (function () {
            const orig = window.openWorkspaceModal;
            window.openWorkspaceModal = function () {
                if (PC.bgLoading || !PC.store) {
                    toast('info', 'กำลังโหลดข้อมูลหนังสือ กรุณารอสักครู่…');
                    return;
                }
                return orig.apply(this, arguments);
            };
        })();

        // ---------------------------------------------------------------
        // [ชุด 3 ข้อ 3] ถามเปลี่ยนรหัสผ่านเมื่อยังใช้รหัสเริ่มต้น (= รหัสผู้ใช้)
        // ---------------------------------------------------------------
        PC.promptChangePassword = async function (currentPw) {
            if (!PC.user) return;
            /* [ความปลอดภัย ต.ค. 2569] รหัสเริ่มต้น หรือรหัสที่ไม่ผ่านกติกา -> ต้องเปลี่ยนก่อนใช้งาน (ข้ามไม่ได้ ทางออกเดียวคือออกจากระบบ)
               เซิร์ฟเวอร์ก็ปิดคำสั่งบันทึกไว้จนกว่าจะเปลี่ยน (MUST_CHANGE_PW) */
            const isDefault = String(currentPw || '') === String(PC.user.id);
            /* [ต.ค. 2569] เข้าด้วย Google/LINE/Telegram (ไม่ได้พิมพ์รหัส) แต่รหัสผ่านของบัญชีเดาง่าย -> เซิร์ฟเวอร์ไม่ต้องการรหัสเดิม */
            const why = !currentPw ? 'รหัสผ่านของบัญชีนี้<b>เดาง่ายเกินไป</b> (หรือยังเป็นรหัสเริ่มต้น)<br>แม้ท่านจะเข้าด้วย Google เป็นหลัก ผู้อื่นยังเดารหัสนี้เข้าบัญชีของท่านได้'
                : isDefault ? 'ท่านกำลังใช้ <b>รหัสผ่านเริ่มต้น</b> (เหมือนรหัสผู้ใช้งาน)'
                : 'รหัสผ่านที่ท่านใช้อยู่<b>เดาง่ายเกินไป</b> : ' + esc((window.pcPwRule && window.pcPwRule(currentPw, PC.user.id)) || 'ไม่ผ่านกติกาความปลอดภัย');
            const r = await Swal.fire({
                title: '<i class="fa-solid fa-key"></i> กรุณาเปลี่ยนรหัสผ่าน',   // [v32 ข้อ 3] ส่วนหัวสีม่วง
                html: `<div class="text-sm text-slate-600 mb-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left"><i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i><div>${why}<br>เพื่อความปลอดภัยของบัญชี กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน<br><span class="text-xs text-slate-500">อย่างน้อย 8 ตัว มีตัวอักษรผสม ไม่ใช่รหัสที่ใช้กันทั่วไป</span></div></div>
                    <div class="text-left" style="margin-top:12px"><label for="cpw-new" style="display:block;margin-bottom:6px;font-size:14px;font-weight:600;color:#334155">รหัสผ่านใหม่</label>
                    <div class="pcf-pw"><input id="cpw-new" type="password" autocomplete="new-password" maxlength="72" class="pcf-in" aria-describedby="cpw-newRules">
                    <button type="button" class="pcf-eye" data-for="cpw-new" aria-label="แสดงรหัสผ่าน" aria-pressed="false"><i class="fa-solid fa-eye"></i></button></div>
                    ${window.pcPwUI ? window.pcPwUI.block('cpw-new') : ''}</div>`,
                width: 'min(460px, 94vw)',
                didOpen: () => { if (window.pcPwUI) window.pcPwUI.bind('cpw-new'); const i = document.getElementById('cpw-new'); if (i) i.focus(); },
                showCancelButton: true,
                confirmButtonText: 'บันทึกรหัสผ่านใหม่',
                cancelButtonText: 'ออกจากระบบ',
                customClass: { popup: 'pc-mid-modal pc-head-modal' },   // [v24 ข้อ 2] กว้างพอดีข้อความ + [v32 ข้อ 3] ส่วนหัวสีม่วง
                allowOutsideClick: false,
                allowEscapeKey: false,
                preConfirm: async () => {
                    const a = (document.getElementById('cpw-new') || {}).value || '';
                    /* [ต.ค. 2569] ไม่ต้องพิมพ์ซ้ำ : มีปุ่มตาให้ดูสิ่งที่พิมพ์แทน (pcschool-pro-ui) */
                    const aBad = window.pcPwRule(a, PC.user.id); if (aBad) { Swal.showValidationMessage(aBad); return false; }
                    try {
                        const out = await api('changePassword', { oldPassword: currentPw, newPassword: a, remember: !!loadRemember() }, { retries: 0 });
                        if (PC.user) saveLocalPw(PC.user.id, a);   // [v100]
                        // [รอบ 5 ข้อ 1] เดิม : เปลี่ยนรหัสผ่านแล้วการจดจำของเครื่องนี้ใช้ไม่ได้ -> เปิดครั้งหน้าเข้าอัตโนมัติไม่ได้
                        if (out && out.rt && PC.user) saveRemember(PC.user.id, out.rt, out.rtExp);
                        return true;
                    } catch (e) {
                        Swal.showValidationMessage(e.message);
                        return false;
                    }
                }
            });
            if (r && r.isConfirmed) { toast('success', 'เปลี่ยนรหัสผ่านเรียบร้อย'); return; }
            // ไม่เปลี่ยน = ออกจากระบบ ; กดยกเลิกที่หน้ายืนยันออกจากระบบ -> กลับมาหน้าเปลี่ยนรหัสอีกครั้ง
            if (typeof window.logout === 'function') await window.logout();
            setTimeout(() => { if (PC.user) PC.promptChangePassword(currentPw); }, 800);
        };

        // ---------------------------------------------------------------
        // [ชุด 3 ข้อ 4] ทะเบียนหนังสือรับ : วันนี้ / เดือนนี้ / ปีนี้ / ทั้งหมด / ย้อนหลัง (คลังรายปี) + ค้นหา
        // ---------------------------------------------------------------
        const REG = { period: 'year', status: 'all', q: '', archiveYear: '', cache: {}, loading: false, counts: {} };
        PC.registry = REG;
        PC.archiveMap = new Map();

        /** วันลงรับ = เวลาที่สร้างรายการในฐานข้อมูล (createdAt) */
        function recvTime(doc) {
            if (!doc) return 0;
            if (doc._c) return Number(doc._c);
            const rec = PC.store && PC.store.docs && PC.store.docs[doc.id];
            return rec && rec.c ? Number(rec.c) : 0;
        }
        const normQ = (v) => String(v === undefined || v === null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
        function docHaystack(doc) {
            return normQ([doc.receiveNo, doc.groupReceiveNo, doc.subgroupReceiveNo, doc.docNo, doc.docDate, doc.subject, doc.title,
                doc.sender, doc.recipient, doc.assigneeName, Array.isArray(doc.category) ? doc.category.join(' ') : doc.category].join(' | '));
        }

        window.registrySource = function () {
            return REG.archiveYear ? (REG.cache[REG.archiveYear] || []) : state.documentQueue;
        };

        window.registryPostFilter = function (items) {
            const q = normQ(REG.q);
            const base = items.filter(doc => {
                const done = Number(doc.stage) === 99;
                if (REG.status === 'open' && done) return false;
                if (REG.status === 'done' && !done) return false;
                return !q || docHaystack(doc).includes(q);
            });
            if (REG.archiveYear) { REG.counts = { all: base.length }; return base; }
            const now = new Date();
            const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
            const c = { today: 0, month: 0, year: 0, all: base.length };
            const tag = new Map();
            base.forEach(doc => {
                const dt = new Date(recvTime(doc) || Date.now());
                const inY = dt.getFullYear() === y, inM = inY && dt.getMonth() === m, inD = inM && dt.getDate() === d;
                if (inY) c.year++;
                if (inM) c.month++;
                if (inD) c.today++;
                tag.set(doc, { inY, inM, inD });
            });
            REG.counts = c;
            if (REG.period === 'all') return base;
            return base.filter(doc => {
                const t = tag.get(doc);
                return REG.period === 'today' ? t.inD : (REG.period === 'month' ? t.inM : t.inY);
            });
        };

        let regSearchTimer = null;
        window.registrySearch = function (v) {
            clearTimeout(regSearchTimer);
            regSearchTimer = setTimeout(() => { REG.q = v || ''; alldocsCurrentPage = 1; renderAllDocsList(); }, 220);
        };
        window.registrySetStatus = function (v) { REG.status = v || 'all'; alldocsCurrentPage = 1; renderAllDocsList(); };
        window.registryPeriod = function (p) {
            REG.period = p || 'year';
            REG.archiveYear = '';
            alldocsCurrentPage = 1;
            renderAllDocsList();
        };
        window.registryOpenArchive = async function (year) {
            year = String(year || '');
            if (!year) { window.registryPeriod(REG.period); return; }
            REG.archiveYear = year;
            alldocsCurrentPage = 1;
            if (!REG.cache[year]) {
                REG.loading = true;
                renderRegistryBar();
                const list = document.getElementById('alldocs-list');
                if (list) list.innerHTML = '<div class="p-10 text-center text-slate-500 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังเปิดคลังหนังสือปี พ.ศ. ' + esc(year) + '...</div>';
                try {
                    const res = await api('getArchive', { year: year }, { timeout: 120000 });
                    REG.cache[year] = (res.docs || []).map(x => Object.assign({}, x.d, { _c: x.c, _archived: true }));
                } catch (e) {
                    REG.archiveYear = '';
                    Swal.fire({ icon: 'error', title: 'เปิดคลังหนังสือไม่สำเร็จ', text: e.message });
                } finally {
                    REG.loading = false;
                }
            }
            PC.archiveMap = new Map((REG.cache[REG.archiveYear] || []).map(d => [d.id, d]));
            renderAllDocsList();
        };

        function renderRegistryBar() {
            const box = document.getElementById('alldocs-periods');
            const sum = document.getElementById('alldocs-summary');
            if (!box) return;
            const c = REG.counts || {};
            const chip = (id, label, n) => {
                const on = !REG.archiveYear && REG.period === id;
                return `<button type="button" onclick="registryPeriod('${id}')" aria-pressed="${on}"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold transition border ${on ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}">
                    ${label}${(n !== undefined && !REG.archiveYear) ? `<span class="ml-1 px-1.5 rounded-full text-[10px] ${on ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}">${n}</span>` : ''}</button>`;
            };
            const years = (PC.archiveYears || []).map(String);
            const arch = years.length
                ? `<select onchange="registryOpenArchive(this.value)" title="เปิดคลังหนังสือของปีที่ผ่านมา"
                        class="px-2 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer ${REG.archiveYear ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300'}">
                        <option value="">ย้อนหลัง (คลังรายปี)…</option>
                        ${years.map(y => `<option value="${esc(y)}" ${REG.archiveYear === y ? 'selected' : ''}>คลังปี พ.ศ. ${esc(y)}</option>`).join('')}
                   </select>`
                : `<span class="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-300 text-slate-400"
                        title="หนังสือที่ลงนามครบของปีก่อน ๆ จะถูกย้ายไปคลังรายปีอัตโนมัติ แล้วเปิดดูได้จากปุ่มนี้">ย้อนหลัง : ยังไม่มีคลัง</span>`;
            box.innerHTML = '<span class="text-xs font-bold text-slate-500 mr-1"><i class="fa-regular fa-calendar"></i> ลงรับ</span>' +
                chip('today', 'วันนี้', c.today) + chip('month', 'เดือนนี้', c.month) + chip('year', 'ปีนี้', c.year) + chip('all', 'ทั้งหมดในระบบ', c.all) + arch;
            const st = document.getElementById('alldocs-status');
            if (st && st.value !== REG.status) st.value = REG.status;
            if (sum) {
                const shown = (window.currentAllDocsFiltered || []).length;
                const label = REG.archiveYear ? ('คลังปี พ.ศ. ' + REG.archiveYear + ' (ดูได้อย่างเดียว)')
                    : ({ today: 'ลงรับวันนี้', month: 'ลงรับเดือนนี้', year: 'ลงรับปีนี้', all: 'ทั้งหมดในระบบ' }[REG.period]);
                sum.innerHTML = REG.loading ? '' : `พบ <b>${shown.toLocaleString('th-TH')}</b> รายการ : ${esc(label)}${REG.q ? ` · ค้นหา "<b>${esc(REG.q)}</b>"` : ''}`;
            }
        }
        PC.renderRegistryBar = renderRegistryBar;

        /** การ์ดในคลัง : เปลี่ยนปุ่มเปิดไฟล์ให้ดึงจากคลัง และซ่อนปุ่มที่แก้ไขสถานะหนังสือ */
        function patchArchiveCards() {
            const list = document.getElementById('alldocs-list');
            if (!list) return;
            list.querySelectorAll('button[onclick]').forEach(b => {
                const oc = b.getAttribute('onclick') || '';
                let m;
                if ((m = oc.match(/^(?:viewFinalDocument|viewMainDocument)\('([^']+)'\)/))) b.setAttribute('onclick', `PC.viewArchived('${m[1]}', 'image')`);
                else if ((m = oc.match(/^previewAttachments\('([^']+)'\)/))) b.setAttribute('onclick', `PC.viewArchived('${m[1]}', 'attach')`);
                else if (/^(recallDocument|goToSign|deleteDoc)\(/.test(oc)) b.remove();
            });
        }

        (function () {
            const orig = window.renderAllDocsList;
            if (typeof orig !== 'function') return;
            window.renderAllDocsList = function () {
                const r = orig.apply(this, arguments);
                try {
                    const list = document.getElementById('alldocs-list');
                    const filtered = (REG.q || REG.status !== 'all' || REG.archiveYear || REG.period !== 'all');
                    if (list && !(window.currentAllDocsFiltered || []).length && filtered) {
                        list.innerHTML = `<div class="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-10 text-center">
                            <i class="fa-solid fa-magnifying-glass text-3xl text-slate-300 mb-3"></i>
                            <h4 class="font-bold text-slate-500">ไม่พบหนังสือตามเงื่อนไขที่เลือก</h4>
                            <p class="text-xs text-slate-400 mt-1">ลองเลือก "ปีนี้" / "ทั้งหมดในระบบ" หรือเปิด "ย้อนหลัง (คลังรายปี)"</p></div>`;
                    }
                    if (REG.archiveYear) patchArchiveCards();
                    renderRegistryBar();
                } catch (e) { console.warn('[PC] registry bar', e.message); }
                return r;
            };
        })();

        /** เปิดไฟล์ของหนังสือในคลังรายปี (ดึงไฟล์จาก Google Drive ตามตัวอ้างอิงที่เก็บไว้) */
        PC.viewArchived = async function (id, what) {
            const doc = PC.archiveMap && PC.archiveMap.get(id);
            if (!doc) return;
            const val = async (v) => { const r = (typeof v === 'string' && (v.indexOf(ASSET) === 0 || v.indexOf(JSONTOK) === 0)) ? await resolveToken(v) : v; loadProg.step(); return r; };
            const atts = Array.isArray(doc.attachments) ? doc.attachments.length : 0;
            loadProg.begin('กำลังโหลดไฟล์จากคลัง', what === 'attach' ? atts : 2 + (doc.originalFile && typeof doc.originalFile === 'object' ? 1 : 0));   // [v39]
            try {
                if (what === 'attach') {
                    const files = [];
                    for (const f of (Array.isArray(doc.attachments) ? doc.attachments : [])) {
                        const url = await val(f.content || f.data || f.url || '');
                        if (url) files.push({ name: f.name || 'ไฟล์แนบ', url: url });
                    }
                    loadProg.end(true);
                    return Swal.fire({
                        title: 'ไฟล์แนบ : เลขรับ ' + esc(doc.receiveNo || '-'),
                        html: files.length ? files.map(f => `<a href="${esc(f.url)}" download="${esc(f.name)}" class="flex items-center gap-2 p-2.5 mb-2 rounded-lg border hover:bg-slate-50 text-left text-sm"><i class="fa-solid fa-paperclip text-purple-500"></i><span class="truncate">${esc(f.name)}</span><i class="fa-solid fa-download ml-auto text-slate-400"></i></a>`).join('')
                            : '<div class="text-sm text-slate-500">ไม่มีไฟล์แนบ</div>',
                        showConfirmButton: false, showCloseButton: true
                    });
                }
                let img = await val(doc.currentImage || '');
                // [v27] หนังสือในคลังที่มีข้อมูลตรา : สร้างภาพพร้อมตราจาก canvasState
                const cs = await val(doc.canvasState || '').catch(() => '');
                if (typeof cs === 'string' && cs.charAt(0) === '{' && window.pcDocImage) {
                    try { img = await window.pcDocImage({ id: 'arc:' + id, canvasState: cs, currentImage: img }); } catch (e) { /* ใช้ภาพเดิม */ }
                }
                const of = doc.originalFile && typeof doc.originalFile === 'object' ? doc.originalFile : null;
                const orig = of ? { name: of.name || 'ไฟล์ต้นฉบับ', url: await val(of.content || of.data || '') } : null;
                loadProg.end(true);
                const btn = (href, name, cls, icon, label) => `<a href="${esc(href)}" download="${esc(name)}" class="flex-1 ${cls} text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow transition flex items-center justify-center gap-1.5"><i class="fa-solid ${icon}"></i> ${label}</a>`;
                Swal.fire({
                    title: '<span class="text-lg font-bold">เอกสารเลขรับ: ' + esc(doc.receiveNo || '-') + '</span> <span class="text-xs font-bold text-amber-600">(คลังรายปี)</span>',
                    html: (img ? `<div class="max-h-[55vh] overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-100 mb-4"><img src="${esc(img)}" class="w-full"></div>`
                                : '<div class="p-6 text-sm text-slate-500">ไม่พบไฟล์หนังสือ</div>') +
                        `<div class="flex flex-wrap sm:flex-nowrap justify-center gap-2">
                            ${img ? btn(img, 'หนังสือ-' + String(doc.receiveNo || id).replace(/[\\/]/g, '-') + (/^data:image\/jpe?g/.test(img) ? '.jpg' : '.png'), 'bg-blue-500 hover:bg-blue-600', 'fa-download', 'รูปภาพ') : ''}
                            ${orig && orig.url ? btn(orig.url, orig.name, 'bg-slate-700 hover:bg-slate-800', 'fa-file-pdf', 'ไฟล์ต้นฉบับ') : ''}
                            ${Array.isArray(doc.attachments) && doc.attachments.length ? `<button onclick="PC.viewArchived('${jsq(id)}', 'attach')" class="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1.5"><i class="fa-solid fa-paperclip"></i> ไฟล์แนบ</button>` : ''}
                        </div>`,
                    width: '800px', showConfirmButton: false, showCloseButton: true, customClass: { popup: 'doc-viewer-modal' }
                });
            } catch (e) {
                loadProg.end(false);
                Swal.fire({ icon: 'error', title: 'โหลดไฟล์จากคลังไม่สำเร็จ', text: e.message });
            }
        };

        // ---------------------------------------------------------------
        // [ชุด 3 ข้อ 6] เข้าสู่ระบบด้วย Gmail / LINE
        // ---------------------------------------------------------------
        const AUTHCFG_KEY = 'pc_authcfg_v1';
        /* ค่าสาธารณะ (ไม่ใช่ความลับ) ใส่ไว้ในหน้าเว็บ เพื่อให้ปุ่มพร้อมใช้ทันทีและโหลดบริการ Google ล่วงหน้าได้
           ต้องตรงกับ CONFIG.GOOGLE_CLIENT_ID / CONFIG.LINE_CHANNEL_ID ใน Code.gs (เซิร์ฟเวอร์เป็นตัวตัดสินสุดท้าย) */
        const OAUTH_DEFAULT = {
            google: '910746697530-2j0td4glnei83nlaapl3fito6hgeelui.apps.googleusercontent.com',
            line: '2004227342'
        };
        let authCfg = null, authCfgAt = 0;
        try {
            const c = JSON.parse(localStorage.getItem(AUTHCFG_KEY) || 'null');
            /* [v54] ค่าที่จำไว้ใช้ได้ก็ต่อเมื่อมาจากหน้าเว็บรุ่นเดียวกัน (ตรง Client ID ตั้งต้น + รุ่น API) : เปลี่ยน Client ID แล้วไม่ต้องรอ 24 ชม. / ไม่ต้องล้างแคชเอง
               (เดิมจำ Client ID เก่าไว้ -> ได้โทเคนของ Client ID เก่า -> เซิร์ฟเวอร์ตอบ "สิทธิ์นี้ไม่ได้ออกให้ระบบ") */
            if (c && c.url === PC.url && Date.now() - c.at < 86400000 && c.def === OAUTH_DEFAULT.google && c.ver === EXPECTED_API && c.cfg && (c.cfg.google || c.cfg.line)) { authCfg = c.cfg; authCfgAt = c.at; }
        } catch (e) { /* ข้าม */ }
        if (!authCfg && (OAUTH_DEFAULT.google || OAUTH_DEFAULT.line)) authCfg = Object.assign({}, OAUTH_DEFAULT);   // authCfgAt = 0 -> ถามเซิร์ฟเวอร์ยืนยันเบื้องหลัง

        /** ที่อยู่ที่ต้องลงทะเบียนใน Google Cloud / LINE Developers (คำนวณจากหน้าเว็บที่เปิดอยู่จริง) */
        function oauthSetupHtml(which) {
            const origin = location.origin, cb = location.origin + location.pathname;
            const row = (label, v) => `<div class="mt-1"><span class="text-slate-500">${label}</span><br><code class="select-all bg-white border rounded px-1.5 py-0.5 text-[11px] break-all">${esc(v)}</code></div>`;
            if (!/^https:$/.test(location.protocol) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(origin)) {
                return '<div class="mt-3 text-[11px] text-left bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">' +
                    'ตอนนี้เปิดหน้าเว็บแบบ <b>' + esc(location.protocol.replace(':', '')) + '</b> ซึ่ง Google / LINE ไม่รองรับ ' +
                    'ต้องเปิดผ่านลิงก์ <b>https:/\/</b> ที่ลงทะเบียนไว้ (เช่น GitHub Pages) เท่านั้น</div>';
            }
            return '<div class="mt-3 text-[11px] text-left bg-slate-50 border rounded-lg p-2 leading-relaxed">' +
                (which !== 'line' ? '<b>Google Cloud</b> › Credentials › OAuth client › Authorized JavaScript origins' + row('ใส่ค่า :', origin) : '') +
                (which !== 'google' ? '<div class="' + (which === 'line' ? '' : 'mt-2') + '"><b>LINE Developers</b> › channel ' + esc((authCfg && authCfg.line) || OAUTH_DEFAULT.line) + ' › LINE Login › Callback URL</div>' + row('ใส่ค่า :', cb) : '') +
                '</div>';
        }
        PC.oauthSetupHtml = oauthSetupHtml;
        const GWRAP_URL = 'https:/\/pcschool-dev.github.io/doct/';   // [หน้าครอบ] หน้าที่มีปุ่ม Google จริงของระบบนี้
        const secureOrigin = () => location.protocol === 'https:' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.origin);

        /* [รอบ 5 ข้อ 4] สาเหตุที่ Google แจ้ง "Error 400: invalid_request … doesn't comply with Google's OAuth 2.0 policy"
           ที่ตรวจได้จากหน้าเว็บเอง -> แจ้งวิธีแก้ก่อนเปิดหน้าต่าง Google (แทนที่จะให้ผู้ใช้เจอหน้า error ของ Google)
           - เปิดในแอป LINE / Facebook / Instagram (in-app browser) : Google ไม่อนุญาตให้เข้าสู่ระบบในแอปเหล่านี้
           - หน้าเว็บถูกฝังใน iframe (เช่น Google Sites / หน้าเว็บอื่น) หรือ origin เป็น null (iframe แบบ sandbox) */
        function googleEnvProblem() {
            const ua = navigator.userAgent || '';
            let framed = false;
            try { framed = window.top !== window.self; } catch (e) { framed = true; }
            if (String(window.origin) === 'null' || location.origin === 'null') return { code: 'null-origin', text: 'หน้าเว็บถูกเปิดแบบไม่มีที่อยู่ (origin = null) เช่น ถูกฝังใน Google Sites หรือเปิดจากไฟล์' };
            if (framed) return { code: 'iframe', text: 'หน้าเว็บถูกฝังอยู่ในหน้าเว็บอื่น (iframe) ซึ่ง Google ไม่อนุญาตให้เข้าสู่ระบบ' };
            if (/\bLine\//i.test(ua)) return { code: 'line-app', text: 'ท่านเปิดหน้านี้ในแอป LINE ซึ่ง Google ไม่อนุญาตให้เข้าสู่ระบบ' };
            if (/FBAN|FBAV|FB_IAB|FBIOS|Instagram|MicroMessenger|; wv\)/i.test(ua)) return { code: 'in-app', text: 'ท่านเปิดหน้านี้ในเบราว์เซอร์ของแอป (Facebook / Instagram ฯลฯ) ซึ่ง Google ไม่อนุญาตให้เข้าสู่ระบบ' };
            return null;
        }
        PC.googleEnvProblem = googleEnvProblem;
        function externalUrl(code) {
            if (code === 'iframe') return GWRAP_URL;   // [หน้าครอบ] เปิดผ่าน /exec (ในกรอบของ Apps Script) -> ไปหน้าครอบที่มีปุ่ม Google จริง
            const u = location.href.split('#')[0];
            return code === 'line-app' ? u + (u.indexOf('?') > -1 ? '&' : '?') + 'openExternalBrowser=1' : u;
        }
        function showGoogleEnvHelp(p) {
            const url = externalUrl(p.code);
            Swal.fire({
                icon: 'warning',
                title: 'เปิดหน้านี้ใน Chrome / Safari ก่อน',
                html: '<div class="text-sm text-slate-600">' + esc(p.text) + '<br>กดปุ่มด้านล่างเพื่อเปิดระบบในเบราว์เซอร์ แล้วกดปุ่ม Gmail อีกครั้ง</div>' +
                    '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">' +
                    '<i class="fa-solid fa-up-right-from-square"></i> เปิดในเบราว์เซอร์</a>' +
                    '<div class="mt-3 text-[11px] text-slate-400 break-all">' + esc(url) + '</div>',
                showConfirmButton: false, showCloseButton: true
            });
        }
        /* ความช่วยเหลือเมื่อหน้าต่าง Google แสดง Error 400 (ผู้ใช้ปิดหน้าต่างเอง หน้าเว็บจึงไม่รู้สาเหตุ) */
        function googleErrorHelpHtml() {
            /* [v51] ข้อมูลที่ใช้ตรวจ "Error 401: invalid_client" / "Error 400" : Client ID ที่หน้าเว็บส่งให้ Google จริง + ที่อยู่หน้าเว็บ */
            const cid = (authCfg && authCfg.google) || '-';
            const diag = '<div class="mt-1 p-2 bg-white border rounded-lg"><b>ข้อมูลที่หน้าเว็บส่งให้ Google</b> (เทียบกับ Google Cloud Console › Credentials)' +
                '<div class="mt-1">Client ID :<br><code class="select-all break-all">' + esc(cid) + '</code></div>' +
                '<div class="mt-1">ที่อยู่หน้าเว็บ (origin) :<br><code class="select-all break-all">' + esc(location.origin) + '</code></div>' +
                '<div class="mt-1 text-slate-500">ถ้า Google แจ้ง <b>401 invalid_client</b> : Client ID ด้านบนไม่มีใน Google Cloud (หรืออยู่คนละโปรเจกต์/บัญชีกับที่เปิดอยู่) ' +
                'ให้เปิด Credentials ของโปรเจกต์ที่ถูกต้อง คัดลอก Client ID ของ OAuth client ประเภท Web application มาแทนค่า GOOGLE_CLIENT_ID ใน Code.gs แล้ว Deploy ใหม่</div></div>';
            return '<details open class="mt-3 text-left text-[11px] text-slate-600 bg-slate-50 border rounded-lg p-2 leading-relaxed"><summary class="cursor-pointer font-bold">หน้าต่าง Google แจ้ง "Error 401 invalid_client" / "Error 400" / "การเข้าถึงถูกบล็อก" ?</summary>' + diag +
                '<div class="mt-1">1) ในหน้าต่าง Google กด <b>ดูรายละเอียดข้อผิดพลาด</b> แล้วส่งภาพให้ผู้ดูแลระบบ (มีค่า origin / redirect_uri)<br>' +
                '2) เปิดระบบด้วย Chrome / Safari โดยตรง ไม่เปิดผ่านแอป LINE / Facebook และไม่ฝังใน Google Sites<br>' +
                '3) ผู้ดูแลระบบ : OAuth client ต้องเป็นประเภท <b>Web application</b> และมีที่อยู่ด้านล่างใน Authorized JavaScript origins</div>' +
                oauthSetupHtml('google') + '</details>';
        }
        let authCfgPromise = null;
        function loadAuthConfig() {
            if (authCfgPromise) return authCfgPromise;
            authCfgPromise = api('authConfig', {}, { retries: 1, noAuthRedirect: true, timeout: 20000 }).then(cfg => {
                authCfg = cfg || { google: '', line: '' };
                try { localStorage.setItem(AUTHCFG_KEY, JSON.stringify({ url: PC.url, at: Date.now(), cfg: authCfg, def: OAUTH_DEFAULT.google, ver: EXPECTED_API })); } catch (e) { /* ข้าม */ }
                applyOauthButtons();
                if (authCfg.google) loadGis().catch(() => {});
                return authCfg;
            }).catch(e => { authCfgPromise = null; throw e; });
            return authCfgPromise;
        }
        function pclAltSync() {
            const alt = document.getElementById('pclAlt');
            if (alt) alt.style.display = ['btn-login-google', 'btn-login-line', 'btn-login-telegram'].some(i => { const b = document.getElementById(i); return b && b.style.display !== 'none'; }) ? '' : 'none';
            if (PC.gwReport) PC.gwReport();   // แถวนี้อยู่ใต้ช่องปุ่ม Google : ความสูงการ์ดเปลี่ยน -> ส่งพิกัดใหม่
        }
        PC.pclAltSync = pclAltSync;
        function applyOauthButtons() {
            /* [ต.ค. 2569] หน้า login ใหม่ : ปุ่มที่ยังไม่เปิดใช้ซ่อนไปเลย (เดิมจางไว้ ดูเหมือนระบบเสีย) ; ไม่มีสักปุ่ม = ซ่อนทั้งแถว "หรือเข้าสู่ระบบด้วย" */
            const set = (id, on, off) => {
                const b = document.getElementById(id);
                if (!b) return;
                let hideG = false;
                try { hideG = id === 'btn-login-google' && GW.wrap; } catch (e) { hideG = false; }   // อยู่ในหน้าครอบ : ใช้ปุ่ม Google จริงด้านบนแทน
                b.style.display = on && !hideG ? '' : 'none';
                if (!on) b.title = off;
            };
            if (!authCfg) return;
            set('btn-login-google', !!authCfg.google, 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วย Gmail (ผู้ดูแลระบบต้องตั้งค่าก่อน)');
            set('btn-login-line', !!authCfg.line, 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วย LINE (ผู้ดูแลระบบต้องตั้งค่าก่อน)');
            setTimeout(pclAltSync, 0);
            set('btn-login-telegram', !!authCfg.telegram, 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วย Telegram (ผู้ดูแลระบบต้องตั้งค่าก่อน)');   // [v25 ข้อ 16]
        }
        PC.getAuthCfg = () => authCfg;
        PC.loadAuthConfig = () => loadAuthConfig();
        PC.linkAccountFlow = (route, res, remember) => linkAccountFlow(route, res, remember);
        PC.completeLogin = (res, opt) => completeLogin(res, opt);
        PC.oauthFail = (err, provider) => oauthFail(err, provider);

        let gisPromise = null;
        function loadGis() {
            if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
            if (gisPromise) return gisPromise;
            gisPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https:/\/accounts.google.com/gsi/client';
                s.async = true; s.defer = true;
                s.onload = () => resolve();
                s.onerror = () => { gisPromise = null; reject(new Error('โหลดบริการของ Google ไม่สำเร็จ')); };
                document.head.appendChild(s);
            });
            return gisPromise;
        }
        const GOOGLE_SCOPE = 'openid email profile https:/\/www.googleapis.com/auth/calendar.events';
        /* [รอบ 5 ข้อ 4] บัญชี Google ที่ใช้ล่าสุดบนเครื่องนี้ (ใช้เป็น hint ให้ Google เลือกบัญชีให้เอง ไม่ต้องกดเลือกซ้ำ)
           ออกจากระบบ = ลบทิ้ง (เครื่องส่วนกลาง คนถัดไปต้องเลือกบัญชีของตัวเอง) */
        const G_HINT_KEY = 'pc_g_hint';
        const gHint = () => { try { return localStorage.getItem(G_HINT_KEY) || ''; } catch (e) { return ''; } };
        const setGHint = (v) => { try { if (v) localStorage.setItem(G_HINT_KEY, String(v).toLowerCase()); else localStorage.removeItem(G_HINT_KEY); } catch (e) { /* ข้าม */ } };
        PC.clearGoogleHint = () => setGHint('');

        /** ต้องเรียกจากการกดปุ่มโดยตรง (ไม่มี await ก่อนหน้า) เพื่อไม่ให้เบราว์เซอร์บล็อกหน้าต่างของ Google
         *  [รอบ 5 ข้อ 4] hint = อีเมล Google ที่คาดว่าจะใช้ -> ผู้ที่ login Gmail ค้างไว้และเคยอนุญาตแล้ว หน้าต่างจะปิดเองทันที */
        function requestGoogleToken(prompt, hint) {
            return new Promise((resolve, reject) => {
                try {
                    const cfg = {
                        client_id: authCfg.google,
                        scope: GOOGLE_SCOPE,
                        callback: (resp) => {
                            if (!resp || resp.error) return reject(new Error('Google ไม่อนุญาต : ' + ((resp && (resp.error_description || resp.error)) || 'ไม่ทราบสาเหตุ')));
                            // [รอบ 5 ข้อ 4] ผูกสิทธิ์ Google กับผู้ใช้ที่เข้าระบบอยู่ (คนอื่นที่เข้าระบบต่อในแท็บนี้ใช้ไม่ได้)
                            PC.gToken = { access: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000, scope: resp.scope || '', owner: PC.user ? PC.user.id : '' };
                            resolve(resp);
                        },
                        error_callback: (err) => {
                            const t = err && err.type;
                            const e = new Error(t === 'popup_closed' ? 'ปิดหน้าต่าง Google ก่อนเข้าสู่ระบบ' :
                                (t === 'popup_failed_to_open' ? 'เบราว์เซอร์บล็อกหน้าต่างของ Google กรุณาอนุญาต Pop-up แล้วลองใหม่' : 'เชื่อมต่อ Google ไม่สำเร็จ (' + (t || 'unknown') + ')'));
                            e.code = t === 'popup_closed' ? 'CANCELLED' : 'GOOGLE';
                            e.setup = 'google';
                            reject(e);
                        }
                    };
                    if (hint) cfg.hint = hint;
                    const client = google.accounts.oauth2.initTokenClient(cfg);
                    const over = { prompt: prompt === undefined ? '' : prompt };
                    if (hint) over.hint = hint;
                    client.requestAccessToken(over);
                } catch (e) { reject(e); }
            });
        }

        /** ขั้นผูกบัญชีครั้งแรก : กรอกหมายเลขโทรศัพท์ที่ลงทะเบียนไว้ในระบบ (ตรวจกับชีต Users คอลัมน์ phone)
         *  [v60] ถ้าเซิร์ฟเวอร์ขอ (บทบาทสำคัญ / ผูกไว้แล้ว) จึงแสดงช่องรหัสผ่านเพิ่ม ; เบอร์ซ้ำหรือยังไม่มีเบอร์ -> สลับเป็นรหัสผู้ใช้ + รหัสผ่าน */
        async function linkAccountFlow(route, res, remember) {
            const key = res.provider === 'line' ? 'line' : (res.provider === 'telegram' ? 'telegram' : 'gmail');
            const provider = { line: 'LINE', telegram: 'Telegram', gmail: 'Gmail' }[key];
            const icon = { line: 'fa-brands fa-line', telegram: 'fa-brands fa-telegram', gmail: 'fa-brands fa-google' }[key];
            let mode = 'phone';
            const r = await Swal.fire({
                title: `<div class="lk-head">
                            <span class="lk-ico"><i class="${icon}"></i></span>
                            <span class="lk-ttl"><span class="lk-h1">ผูกบัญชี ${provider} กับระบบ</span><span class="lk-h2">ทำครั้งเดียว ครั้งต่อไปกดเข้าได้ทันที</span></span>
                        </div>`,
                html: `<div class="lk-body">
                        <div class="lk-acc"><i class="${icon}"></i><span>บัญชี ${provider}</span><b>${esc(res.account || '-')}</b></div>
                        <p class="lk-p" id="lk-intro">บัญชีนี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ กรุณากรอก <b>หมายเลขโทรศัพท์</b> ที่ลงทะเบียนไว้ในระบบ เพื่อยืนยันว่าเป็นผู้ที่มีสิทธิ์ใช้งาน</p>
                        <div id="lk-phone-box"><label class="lk-field"><i class="fa-solid fa-phone"></i><input id="lk-phone" type="tel" inputmode="tel" placeholder="หมายเลขโทรศัพท์ เช่น 0812345678" autocomplete="tel" maxlength="20"></label></div>
                        <div id="lk-id-box" style="display:none"><label class="lk-field"><i class="fa-solid fa-user"></i><input id="lk-id" placeholder="รหัสผู้ใช้งาน" autocomplete="username" autocapitalize="off" spellcheck="false"></label></div>
                        <div id="lk-warn" class="lk-warn" style="display:none"><i class="fa-solid fa-circle-exclamation"></i> <span id="lk-pw-why">บัญชีนี้ต้องยืนยันด้วยรหัสผ่านเพิ่ม</span></div>
                        <div id="lk-pw-wrap" style="display:none">
                            <label class="lk-field"><i class="fa-solid fa-lock"></i><input id="lk-pw" type="password" placeholder="รหัสผ่าน" autocomplete="current-password">
                                <button type="button" class="lk-eye" tabindex="-1" title="แสดง/ซ่อนรหัสผ่าน" onclick="(function(b){const i=document.getElementById('lk-pw');const s=i.type==='password';i.type=s?'text':'password';b.querySelector('i').className='fa-solid '+(s?'fa-eye-slash':'fa-eye');})(this)"><i class="fa-solid fa-eye"></i></button></label>
                        </div>
                        <button type="button" class="lk-alt" id="lk-alt">ไม่มีเบอร์ในระบบ? ใช้รหัสผู้ใช้งานและรหัสผ่านแทน</button>
                        <div class="lk-note"><i class="fa-solid fa-address-card"></i> ระบบจะบันทึกรหัสผู้ใช้ ชื่อ และรูปโปรไฟล์ของบัญชี ${provider} นี้ ไว้ใช้ส่งข้อความแจ้งเตือนถึงท่านโดยตรง</div>
                    </div>`,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-link"></i> ผูกบัญชีและเข้าสู่ระบบ',
                cancelButtonText: 'ยกเลิก',
                allowOutsideClick: false,
                buttonsStyling: false,
                customClass: { popup: 'pc-link-modal lk-' + key, confirmButton: 'lk-ok', cancelButton: 'lk-cancel', actions: 'lk-actions' },
                didOpen: () => {
                    const $ = (i) => document.getElementById(i);
                    const show = (i, on) => { const el = $(i); if (el) el.style.display = on ? '' : 'none'; };
                    // สลับโหมด : phone = เบอร์โทร (+ รหัสผ่านเมื่อระบบขอ) , id = รหัสผู้ใช้ + รหัสผ่าน
                    window.__lkSetMode = (m, needPw) => {
                        mode = m;
                        show('lk-phone-box', m === 'phone'); show('lk-id-box', m === 'id');
                        show('lk-pw-wrap', m === 'id' || !!needPw); show('lk-warn', m === 'phone' && !!needPw);
                        $('lk-alt').textContent = m === 'phone' ? 'ไม่มีเบอร์ในระบบ? ใช้รหัสผู้ใช้งานและรหัสผ่านแทน' : '← กลับไปใช้หมายเลขโทรศัพท์';
                        $('lk-intro').innerHTML = m === 'phone'
                            ? 'บัญชีนี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ กรุณากรอก <b>หมายเลขโทรศัพท์</b> ที่ลงทะเบียนไว้ในระบบ เพื่อยืนยันว่าเป็นผู้ที่มีสิทธิ์ใช้งาน'
                            : 'กรอก <b>รหัสผู้ใช้งาน</b> และ <b>รหัสผ่าน</b> ของท่าน (ครั้งเดียว)';
                        Swal.resetValidationMessage();
                        setTimeout(() => { const f = $(m === 'id' ? 'lk-id' : (needPw ? 'lk-pw' : 'lk-phone')); if (f) f.focus(); }, 40);
                    };
                    $('lk-alt').addEventListener('click', () => window.__lkSetMode(mode === 'phone' ? 'id' : 'phone', false));
                    ['lk-phone', 'lk-id', 'lk-pw'].forEach((i) => { const el = $(i); if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); Swal.clickConfirm(); } }); });
                    setTimeout(() => { const f = $('lk-phone'); if (f) f.focus(); }, 60);
                },
                preConfirm: async () => {
                    const v = (i) => ((document.getElementById(i) || {}).value || '').trim();
                    const needPw = mode === 'phone' && document.getElementById('lk-pw-wrap').style.display !== 'none';
                    const pwRaw = (document.getElementById('lk-pw') || {}).value || '';
                    const payload = { ticket: res.ticket, remember: remember };
                    if (mode === 'phone') {
                        if (!v('lk-phone')) { Swal.showValidationMessage('กรุณากรอกหมายเลขโทรศัพท์'); return false; }
                        if (needPw && !pwRaw) { Swal.showValidationMessage('กรุณากรอกรหัสผ่านเพื่อยืนยันตัวตน'); return false; }
                        payload.phone = v('lk-phone');
                        if (needPw) payload.password = pwRaw;
                    } else {
                        if (!v('lk-id') || !pwRaw) { Swal.showValidationMessage('กรุณากรอกรหัสผู้ใช้งานและรหัสผ่าน'); return false; }
                        payload.userId = v('lk-id'); payload.password = pwRaw;
                    }
                    try {
                        const out = await api(route, payload, { retries: 0, noAuthRedirect: true });
                        if (payload.password) out.__typedPw = payload.password;
                        return out;
                    } catch (e) {
                        if (mode === 'phone' && e.code === 'NEED_PASSWORD') {
                            // บทบาทสำคัญ / ผูกบัญชีนี้ไว้แล้ว -> ขอรหัสผ่านเพิ่ม (เบอร์โทรเดิมยังใช้ระบุตัวผู้ใช้)
                            window.__lkSetMode('phone', true);
                            const why = document.getElementById('lk-pw-why'); if (why) why.textContent = e.message;
                            return false;
                        }
                        if (mode === 'phone' && e.code === 'AMBIGUOUS') { window.__lkSetMode('id', false); Swal.showValidationMessage(e.message); return false; }
                        Swal.showValidationMessage(e.message);
                        return false;
                    }
                }
            });
            return (r && r.isConfirmed && r.value) ? r.value : null;
        }

        /** เข้าระบบต่อจากคำตอบ login (ใช้ร่วมกันทั้ง Gmail / LINE) */
        async function completeLogin(res, opt) {
            opt = opt || {};
            if (!res || !res.token) { const e = new Error('เซิร์ฟเวอร์ไม่ได้ส่งบัตรผ่าน (token) กลับมา'); e.code = 'NO_TOKEN'; throw e; }
            PC.token = res.token;
            let user = res.user;
            if (!user || !user.id) user = await api('me', {}, { retries: 1, noAuthRedirect: true });
            if (!user || !user.id) { const e = new Error('เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลผู้ใช้กลับมา'); e.code = 'NO_USER'; throw e; }
            if (opt.remember && res.rt) saveRemember(user.id, res.rt, res.rtExp);
            progSet(35, 'เข้าสู่ระบบสำเร็จ กำลังเตรียมข้อมูล…');
            try {
                await startSession(user, undefined, undefined, { rooms: res.rooms, boot: res.boot });
            } catch (e) {
                try { endSession(); showLoginView(); } catch (e2) { /* ข้าม */ }
                e.loaded = true;
                throw e;
            }
            warnApiMismatch();
            // [v59] ผูก LINE แล้วแต่ยังไม่ได้เป็นเพื่อนกับ LINE OA -> จะไม่ได้รับข้อความแจ้งเตือน
            if (res.lineFriend === false) setTimeout(() => toast('info', 'ผูก LINE แล้ว แต่ยังไม่ได้เพิ่ม LINE Official Account ของโรงเรียนเป็นเพื่อน จะยังไม่ได้รับข้อความแจ้งเตือน'), 1500);
            const typed = res.__typedPw;
            if (res.mustChangePw || (typed && typed === String(user.id))) setTimeout(() => PC.promptChangePassword(typed), 400);
        }
        function oauthFail(err, provider) {
            PC.token = '';
            progEnd();
            if (err && err.code === 'CANCELLED') {
                // [รอบ 5 ข้อ 4] ปิดหน้าต่าง Google เอง : อาจเป็นเพราะ Google แสดง Error 400 -> แนบวิธีตรวจสอบไว้ด้วย
                // [v58] ผู้ใช้ปิดหน้าต่างเอง ไม่ใช่ข้อผิดพลาด -> แจ้งสั้น ๆ ไม่เปิดโมดอลวิธีแก้ปัญหา
                toast('info', err.message);
                return;
            }
            console.error('[PC] ' + provider + ' login', err);
            const setupIssue = err && (err.setup || err.code === 'NOT_CONFIGURED' || /redirect_uri|origin|invalid_client|ยืนยันตัวตนกับ LINE ไม่สำเร็จ/i.test(String(err.message || '')));
            Swal.fire({
                icon: 'error',
                title: err && err.loaded ? 'เข้าสู่ระบบแล้ว แต่โหลดข้อมูลไม่สำเร็จ' : 'เข้าสู่ระบบด้วย ' + provider + ' ไม่สำเร็จ',
                html: '<div class="text-sm">' + esc((err && err.message) || err) + '</div>' + loginErrorDetail(err || {}) +
                    (setupIssue ? '<div class="mt-2 text-[11px] text-slate-500 text-left">ถ้าเป็นปัญหาการตั้งค่า ให้ผู้ดูแลระบบตรวจค่าต่อไปนี้ :</div>' + oauthSetupHtml(provider === 'LINE' ? 'line' : 'google') : '')
            });
        }
        const rememberChecked = () => !!(document.getElementById('rememberMe') || {}).checked;

        /** [รอบ 5 ข้อ 4] อีเมลใน ID token ของ Google (ใช้เป็น hint เท่านั้น เซิร์ฟเวอร์ตรวจลายมือชื่อจริงกับ Google เอง) */
        function jwtEmail(cred) {
            try {
                const b = String(cred).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                const j = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
                return String(j.email || '');
            } catch (e) { return ''; }
        }

        /** เข้าระบบด้วยผลยืนยันตัวตนจาก Google (access token จากหน้าต่างเลือกบัญชี หรือ ID token จาก One Tap) */
        async function googleSignIn(payload, remember, how, hintEmail) {
            prog('กำลังเข้าสู่ระบบด้วย Gmail...', 'ตรวจสอบบัญชี Google');
            let res = await api('googleLogin', Object.assign({ remember: remember }, payload), { retries: 1, noAuthRedirect: true, timeout: 25000 });
            if (res && res.linkRequired) {
                progEnd();
                res = await linkAccountFlow('googleLogin', res, remember);
                if (!res) { PC.gToken = null; return false; }
                prog('กำลังเข้าสู่ระบบด้วย Gmail...', 'ผูกบัญชีเรียบร้อย');
            }
            await completeLogin(res, { remember: remember });
            if (PC.user) {
                if (PC.gToken && !PC.gToken.owner) PC.gToken.owner = PC.user.id;   // สิทธิ์ปฏิทินที่ได้มาพร้อมการเข้าสู่ระบบ = ของผู้ใช้คนนี้
                // จำบัญชี Google ไว้เฉพาะผู้ที่ติ๊ก "จำการเข้าสู่ระบบ" (ไม่ติ๊ก = อาจเป็นเครื่องส่วนกลาง คนถัดไปต้องเลือกบัญชีเอง)
                setGHint(remember ? (hintEmail || PC.user.googleEmail || PC.user.email || '') : '');
            }
            return true;
        }

        /* [หน้าครอบ ต.ค. 2569] ปุ่มเข้าสู่ระบบด้วย Google อยู่ที่หน้าครอบ GWRAP_URL (Google รับปุ่มเฉพาะโดเมนที่ลงทะเบียน กรอบ Apps Script ลงทะเบียนไม่ได้)
           แอป -> หน้าครอบ { tes:'auth', state:'login'|'in'|'logout' } / { tes:'gslot', rect } (พิกัดช่อง #gSlot, null = ซ่อน)
           หน้าครอบ -> แอป { tes:'gwrap' } (มีปุ่มจริง -> โชว์ช่อง) / { tes:'gcred', credential } (ID token จาก Google)
           รับข้อความเฉพาะจากหน้าครอบของโรงเรียนที่เป็นหน้าต่างบนสุด (กันเว็บอื่นยัดบัญชีของตัวเองให้ : login CSRF)
           rect มี vw/vh ด้วย : หน้าครอบใช้คำนวณระยะแถบแจ้งเตือนของ Google ที่อยู่เหนือกรอบ */
        const GWRAP_ORIGIN = 'https:/\/pcschool-dev.github.io';
        const GW = { wrap: false, busy: false, state: '' };
        const gwFramed = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
        function gwTell(msg) { if (gwFramed) { try { window.top.postMessage(msg, GWRAP_ORIGIN); } catch (e) { /* ข้าม */ } } }
        function gwLoginVisible() { const v = document.getElementById('view-login'); return !!v && !v.classList.contains('hidden') && !PC.user; }
        function gwReport() {
            if (!GW.wrap) return;
            const sl = document.getElementById('gSlot');
            let r = null, why = '';
            if (!sl) why = 'noslot';
            else if (!gwLoginVisible()) why = 'hidden';
            else if (GW.busy) why = 'busy';
            else if (document.querySelector('.swal2-container')) why = 'swal';
            else if (document.querySelector('.pcf-back:not([hidden])')) why = 'dialog';   // [ต.ค. 2569] หน้าต่างตั้งรหัสผ่านใหม่ (ไม่ใช่ SweetAlert) เปิดอยู่
            else {
                const b = sl.getBoundingClientRect();
                if (b.width > 0 && b.height > 0) r = { x: b.left, y: b.top, w: b.width, h: b.height, vw: window.innerWidth, vh: window.innerHeight };
                else why = 'zero';
            }
            gwTell({ tes: 'gslot', rect: r, why: why });
        }
        /* สถานะหน้า : เข้าระบบ -> 'in' (ซ่อนปุ่ม) ; กลับมาหน้าเข้าสู่ระบบหลังเข้าแล้ว -> 'logout' (หน้าครอบปิดเข้าอัตโนมัติ ไม่งั้นเด้งกลับเข้าเอง) แล้ว 'login' */
        function gwSync() {
            const st = gwLoginVisible() ? 'login' : 'in';
            if (st !== GW.state) {
                if (st === 'login' && GW.state === 'in') gwTell({ tes: 'auth', state: 'logout' });
                GW.state = st;
                gwTell({ tes: 'auth', state: st });
            } else if (st === 'login' && !GW.wrap) gwTell({ tes: 'auth', state: 'login' });   // หน้าครอบยังไม่ตอบ (โหลดช้ากว่า) -> บอกซ้ำ
            gwReport();
        }
        /* [ต.ค. 2569] ส่วนรหัสผู้ใช้/รหัสผ่านพับได้ (Google เป็นทางหลัก)
           พับเมื่อหน้าครอบยืนยันว่ามีปุ่ม Google จริง ; กางเองเมื่อ : เครื่องนี้เข้าด้วยรหัสผ่านครั้งล่าสุด / เปิดในแอป LINE-Facebook
           (Google ไม่ยอมแสดงปุ่มในแอปพวกนี้) / เข้าด้วย Google ไม่สำเร็จ ; ไม่ได้อยู่ในหน้าครอบ = กางตลอด ไม่มีปุ่มพับ */
        const LOGIN_MODE_KEY = 'pc_login_mode';
        function loginModeGet() { try { return localStorage.getItem(LOGIN_MODE_KEY) || ''; } catch (e) { return ''; } }
        function loginModeSet(m) { try { localStorage.setItem(LOGIN_MODE_KEY, m); } catch (e) { /* ข้าม */ } }
        function gwPwSection(open, focus) {
            const sec = document.getElementById('pwSection'), t = document.getElementById('pwToggle'), ic = document.getElementById('pwToggleIcon');
            if (!sec) return;
            sec.style.display = open ? '' : 'none';
            if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (ic) ic.style.transform = open ? 'rotate(180deg)' : '';
            const fq = document.getElementById('pwForgotQuick'); if (fq) fq.style.display = open ? 'none' : '';
            if (open && focus) setTimeout(() => { const i = document.getElementById('login-userid'); if (i && !i.value) i.focus(); }, 50);
            gwReport();   // ตำแหน่งช่องปุ่ม Google อาจเลื่อน -> ส่งพิกัดใหม่ทันที
        }
        window.pcTogglePwSection = function () {
            const sec = document.getElementById('pwSection');
            gwPwSection(!!sec && sec.style.display === 'none', true);
        };
        PC.openPwSection = () => gwPwSection(true, false);
        PC.gwReport = () => gwReport();   // ให้หน้าต่างที่ไม่ใช่ SweetAlert (pcForgot) สั่งซ่อน/วางปุ่ม Google ใหม่ทันที
        async function gwCredential(cred) {
            if (PC.user || GW.busy) return;   // เข้าอยู่แล้ว / กำลังตรวจ (หน้าครอบส่งซ้ำจากการเข้าอัตโนมัติ)
            GW.busy = true;
            gwReport();
            try {
                await googleSignIn({ credential: cred }, rememberChecked(), 'wrap', jwtEmail(cred));
                if (PC.user) loginModeSet('google');
                else gwPwSection(true, false);   // ยกเลิกการผูกบัญชี ฯลฯ -> เปิดทางรหัสผ่านไว้ให้
            }
            catch (e) { gwPwSection(true, false); oauthFail(e, 'Gmail'); }
            finally { GW.busy = false; gwSync(); }
        }
        if (gwFramed) {
            window.addEventListener('message', (ev) => {
                const d = ev.data;
                if (!d || ev.origin !== GWRAP_ORIGIN || ev.source !== window.top) return;
                if (d.tes === 'gwrap') {
                    if (!GW.wrap) {
                        GW.wrap = true;
                        const box = document.getElementById('gSlotBox'); if (box) box.style.display = '';
                        const old = document.getElementById('btn-login-google'); if (old) old.style.display = 'none';   // ปุ่มเดิมใช้ในกรอบไม่ได้
                        if (PC.pclAltSync) PC.pclAltSync();
                        const tg = document.getElementById('pwToggle'); if (tg) tg.style.display = '';
                        const inApp = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent || '');
                        gwPwSection(loginModeGet() === 'pw' || inApp, false);
                    }
                    gwReport();
                } else if (d.tes === 'gcred' && d.credential) {
                    gwCredential(String(d.credential));
                }
            });
            ['scroll', 'resize'].forEach(t => window.addEventListener(t, gwReport, { passive: true, capture: true }));
            window.addEventListener('load', () => { gwSync(); setTimeout(gwReport, 800); });
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(gwReport);
            new MutationObserver(gwReport).observe(document.body, { childList: true });   // SweetAlert เปิด/ปิด -> ปุ่มลอยหลบ
            setInterval(gwSync, 1000);   // ไม่พึ่งเหตุการณ์อย่างเดียว (Safari พัก rAF ในกรอบข้ามโดเมนได้) พลาดอะไรก็ซ่อมเองในวินาทีถัดไป
            gwSync();
        }

        window.loginWithGoogle = function () {
            if (!authCfg) {
                loadAuthConfig().catch(() => {});
                toast('info', 'กำลังเตรียมการเชื่อมต่อ Google กรุณากดอีกครั้งในอีกสักครู่');
                return;
            }
            if (!authCfg.google) {
                Swal.fire({ icon: 'info', title: 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วย Gmail', text: 'ผู้ดูแลระบบต้องใส่ GOOGLE_CLIENT_ID ใน Code.gs ก่อน (ดูคู่มือ)' });
                return;
            }
            if (!secureOrigin()) {
                Swal.fire({ icon: 'warning', title: 'ต้องเปิดหน้าเว็บผ่าน https', html: '<div class="text-sm">การเข้าสู่ระบบด้วย Gmail ใช้ได้เมื่อเปิดหน้าเว็บจากลิงก์ https ที่ลงทะเบียนไว้กับ Google</div>' + oauthSetupHtml('google') });
                return;
            }
            const env = googleEnvProblem();                         // [รอบ 5 ข้อ 4] กันหน้า Error 400 ของ Google
            if (env) { showGoogleEnvHelp(env); return; }
            if (!(window.google && google.accounts && google.accounts.oauth2)) {
                loadGis().then(() => toast('info', 'พร้อมแล้ว กรุณากดปุ่ม Gmail อีกครั้ง'), e => Swal.fire({ icon: 'error', title: 'เชื่อมต่อ Google ไม่สำเร็จ', text: e.message }));
                toast('info', 'กำลังโหลดบริการของ Google...');
                return;
            }
            const remember = rememberChecked();
            /* [รอบ 5 ข้อ 4] เคยใช้ Gmail บนเครื่องนี้ -> ให้ Google เลือกบัญชีเดิมให้เลย (login Gmail ค้างอยู่ + เคยอนุญาตแล้ว = กดครั้งเดียวเข้าได้)
               ยังไม่เคย -> ให้เลือกบัญชีเอง (กันเลือกบัญชีของคนอื่นที่ค้างอยู่ในเครื่องส่วนกลาง) */
            const hint = gHint();
            requestGoogleToken(hint ? '' : 'select_account', hint).then(async (tok) => {
                const ok = await googleSignIn({ accessToken: tok.access_token }, remember, 'button');
                // ซิงก์ Google Calendar ของตัวเองอัตโนมัติหลังเข้าระบบด้วย Gmail
                if (ok) setTimeout(() => PC.syncGoogleCalendar({ silent: true }), 2500);
            }).catch(err => oauthFail(err, 'Gmail'));
        };

        /* ---------------------------------------------------------------
           [รอบ 5 ข้อ 4] ผู้ที่ login Gmail ค้างไว้ในเบราว์เซอร์ : แสดงกล่อง "ดำเนินการต่อในชื่อ …" ของ Google
           ที่มุมหน้าจอ login ทันที (One Tap / FedCM) กดครั้งเดียวเข้าสู่ระบบได้เลย ไม่ต้องกรอกรหัสผ่าน
           - แสดงเฉพาะตอนเปิดหน้าเว็บใหม่ที่ยังไม่ได้เข้าระบบ (ไม่แสดงซ้ำหลังกดออกจากระบบ ป้องกันคนถัดไปกดเข้าเป็นคนเดิม)
           - ได้เฉพาะตัวตน (ID token) : ซิงก์ปฏิทินต้องกดยืนยันอีกครั้ง (Google กำหนดให้ขอสิทธิ์ปฏิทินจากการกดของผู้ใช้)
           --------------------------------------------------------------- */
        let oneTapReady = false;
        function initOneTap() {
            if (oneTapReady) return true;
            if (!authCfg || !authCfg.google || !secureOrigin() || googleEnvProblem()) return false;
            if (!(window.google && google.accounts && google.accounts.id)) return false;
            try {
                google.accounts.id.initialize({
                    client_id: authCfg.google,
                    callback: onGoogleCredential,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                    context: 'signin',
                    itp_support: true,
                    use_fedcm_for_prompt: true
                });
                oneTapReady = true;
            } catch (e) { console.warn('[PC] one tap', e); }
            return oneTapReady;
        }
        function promptOneTap() {
            if (PC.token || PC.oneTapShown || !isVisible('view-login')) return;
            if (!initOneTap()) return;
            PC.oneTapShown = true;
            try { google.accounts.id.prompt(); } catch (e) { /* ข้าม */ }
        }
        PC.promptOneTap = promptOneTap;
        async function onGoogleCredential(resp) {
            if (!resp || !resp.credential || PC.token) return;
            const remember = rememberChecked();
            try {
                const ok = await googleSignIn({ credential: resp.credential }, remember, 'onetap', jwtEmail(resp.credential));
                if (ok) offerCalendarSync(true);
            } catch (err) { oauthFail(err, 'Gmail'); }
        }

        const LINE_STATE_KEY = 'pc_line_state';
        window.loginWithLine = function () {
            if (!authCfg) {
                loadAuthConfig().catch(() => {});
                toast('info', 'กำลังเตรียมการเชื่อมต่อ LINE กรุณากดอีกครั้งในอีกสักครู่');
                return;
            }
            if (!authCfg.line) {
                Swal.fire({ icon: 'info', title: 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วย LINE', text: 'ผู้ดูแลระบบต้องตั้งค่า LINE_CHANNEL_ID และ LINE_CHANNEL_SECRET ก่อน (ดูคู่มือ)' });
                return;
            }
            if (location.protocol !== 'https:') {
                Swal.fire({ icon: 'warning', title: 'ต้องเปิดหน้าเว็บผ่าน https', html: '<div class="text-sm">การเข้าสู่ระบบด้วย LINE ใช้ได้เมื่อเปิดหน้าเว็บจากลิงก์ https ที่ลงทะเบียนไว้กับ LINE เท่านั้น</div>' + oauthSetupHtml('line') });
                return;
            }
            const st = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
            /* [หน้าครอบ] เปิดผ่านหน้าครอบ : LINE ไม่ยอมเปิดในกรอบ และกรอบ Apps Script ลงทะเบียน Callback ไม่ได้
               -> พาทั้งแท็บไป LINE แล้วให้กลับมาที่หน้าครอบ (หน้าครอบส่ง code/state ต่อให้ /exec เอง) ; จด redirect ไว้ใช้ตอนแลกโทเคน */
            const redirect = gwFramed ? GWRAP_URL : location.origin + location.pathname;
            const stv = JSON.stringify({ s: st, remember: rememberChecked(), at: Date.now(), r: redirect });
            try { sessionStorage.setItem(LINE_STATE_KEY, stv); } catch (e) { /* ข้าม */ }
            try { localStorage.setItem(LINE_STATE_KEY, stv); } catch (e) { /* ข้าม */ }   // สำรอง : บางมือถือเปิดแอป LINE แล้วกลับมาคนละแท็บ
            const url = 'https:/\/access.line.me/oauth2/v2.1/authorize?response_type=code' +
                '&client_id=' + encodeURIComponent(authCfg.line) +
                '&redirect_uri=' + encodeURIComponent(redirect) +
                '&state=' + st + '&bot_prompt=normal&scope=' + encodeURIComponent('profile openid');
            gwGoTop(url);
        };
        /* [หน้าครอบ] ไปหน้าผู้ให้บริการ (LINE/Telegram) ทั้งแท็บเมื่ออยู่ในกรอบ ; ต้องเรียกตรงจากการกดปุ่ม (เบราว์เซอร์ยอมให้กรอบเปลี่ยนหน้าบนสุดเฉพาะตอนผู้ใช้กด) */
        function gwGoTop(url) {
            if (gwFramed) {
                try { window.top.location.href = url; return; } catch (e) { /* ลองวิธีถัดไป */ }
                if (window.open(url, '_top')) return;
            }
            location.href = url;
        }
        PC.gwGoTop = gwGoTop;
        PC.gwFramed = gwFramed;
        PC.GWRAP_URL = GWRAP_URL;
        PC.GWRAP_ORIGIN = GWRAP_ORIGIN;

        /** กลับมาจากหน้า LINE (?code=...&state=...) -> เข้าสู่ระบบต่อ  คืน true ถ้าจัดการแล้ว */
        function handleLineCallback() {
            let qs;
            try { qs = new URLSearchParams(location.search); } catch (e) { return false; }
            const code = qs.get('code'), st = qs.get('state'), err = qs.get('error');
            if (!st || (!code && !err)) return false;
            let saved = null;
            try { saved = JSON.parse(sessionStorage.getItem(LINE_STATE_KEY) || 'null'); } catch (e) { saved = null; }
            if (!saved || saved.s !== st) {
                try { saved = JSON.parse(localStorage.getItem(LINE_STATE_KEY) || 'null'); } catch (e) { saved = null; }
            }
            if (!saved || saved.s !== st || Date.now() - Number(saved.at || 0) > 15 * 60000) return false;
            try { sessionStorage.removeItem(LINE_STATE_KEY); } catch (e) { /* ข้าม */ }
            try { localStorage.removeItem(LINE_STATE_KEY); } catch (e) { /* ข้าม */ }
            try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ข้าม */ }
            if (err || !code) {
                if (err && err !== 'access_denied') {
                    Swal.fire({ icon: 'error', title: 'LINE แจ้งข้อผิดพลาด', html: '<div class="text-sm">' + esc(err + ' : ' + (qs.get('error_description') || '')) + '</div>' + oauthSetupHtml('line') });
                } else toast('info', 'ยกเลิกการเข้าสู่ระบบด้วย LINE');
                return false;
            }
            const remember = !!saved.remember;
            (async () => {
                prog('กำลังเข้าสู่ระบบด้วย LINE...', 'ตรวจสอบบัญชี LINE');
                try {
                    let res = await api('lineLogin', { code: code, redirectUri: saved.r || (location.origin + location.pathname), remember: remember },
                        { retries: 0, noAuthRedirect: true, timeout: 30000 });
                    if (res && res.linkRequired) {
                        progEnd();
                        res = await linkAccountFlow('lineLogin', res, remember);
                        if (!res) return;
                        prog('กำลังเข้าสู่ระบบด้วย LINE...', 'ผูกบัญชีเรียบร้อย');
                    }
                    await completeLogin(res, { remember: remember });
                } catch (e) { oauthFail(e, 'LINE'); }
            })();
            return true;
        }
        PC.handleLineCallback = handleLineCallback;

        // ---------------------------------------------------------------
        // [ชุด 3 ข้อ 6] ซิงก์ Google Calendar ของผู้ใช้ 2 ทาง
        //   ส่งออก : กิจกรรมในแท็บปฏิทินงาน + งานของตัวเองที่มีกำหนดส่ง -> ปฏิทินหลักของผู้ใช้ (ไม่ลงซ้ำ แก้ไข/ลบตาม)
        //   ดึงเข้า : นัดหมายส่วนตัวจาก Google Calendar -> แสดงในปฏิทินของระบบ (เห็นเฉพาะตัวเอง ไม่บันทึกลงชีต)
        // ---------------------------------------------------------------
        const GCAL_EVENTS = 'https:/\/www.googleapis.com/calendar/v3/calendars/primary/events';
        const GCAL_TAG = 'pakchong-doc';
        /* [รอบ 5 ข้อ 4] สิทธิ์ปฏิทินใช้ได้เฉพาะผู้ใช้ที่ขอสิทธิ์นั้น (ออกจากระบบ/เปลี่ยนคน = ใช้ไม่ได้) */
        const gTokenValid = () => !!(PC.gToken && PC.gToken.access && Date.now() < PC.gToken.exp && /calendar/.test(PC.gToken.scope || '') &&
            PC.user && PC.gToken.owner === PC.user.id);
        async function gFetch(url, opt) {
            opt = opt || {};
            const r = await fetch(url, Object.assign({}, opt, {
                headers: Object.assign({ Authorization: 'Bearer ' + PC.gToken.access, 'Content-Type': 'application/json' }, opt.headers || {})
            }));
            if (r.status === 401) { PC.gToken = null; const e = new Error('สิทธิ์เข้าถึง Google Calendar หมดอายุ กรุณากดซิงก์อีกครั้ง'); e.code = 'GAUTH'; throw e; }
            if (r.status === 403) throw new Error('Google Calendar ปฏิเสธ (403) : ตรวจว่าเปิดใช้ Google Calendar API ในโปรเจกต์ Google Cloud แล้ว');
            if (r.status === 204 || r.status === 410) return null;
            if (!r.ok) throw new Error('Google Calendar ตอบกลับ ' + r.status);
            return r.json();
        }
        const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
        const addHour = (t) => { const [h, m] = String(t).split(':').map(Number); return String(Math.min(23, (h || 0) + 1)).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0'); };

        function gcalBodyFor(kind, x) {
            const start = x.startDate || x.date || x.dueDate;
            if (!start) return null;
            const end = (x.endDate && x.endDate >= start) ? x.endDate : start;
            const st = x.startTime || x.dueTime || '';
            const body = {
                summary: (kind === 'task' ? '[งาน] ' : '[โรงเรียน] ') + (x.title || ''),
                description: (x.desc || '') + '\n\n— ซิงก์จากระบบรับหนังสือราชการ โรงเรียนปากช่อง',
                location: x.location || x.loc || '',
                extendedProperties: { private: { pcSource: GCAL_TAG, pcId: kind + ':' + x.id } },
                visibility: 'private'     // [รอบ 5 ข้อ 4] คนที่ท่านแชร์ปฏิทินให้ เห็นแค่ "ไม่ว่าง" ไม่เห็นรายละเอียดงาน
            };
            if (st && !x.allDay) {
                body.start = { dateTime: start + 'T' + st + ':00', timeZone: 'Asia/Bangkok' };
                body.end = { dateTime: end + 'T' + (x.endTime || addHour(st)) + ':00', timeZone: 'Asia/Bangkok' };
            } else {
                body.start = { date: start };
                body.end = { date: addDays(end, 1) };
            }
            body.extendedProperties.private.pcSig = ['v2', body.summary, body.location, JSON.stringify(body.start), JSON.stringify(body.end), x.desc || ''].join('|').slice(0, 900);
            return body;
        }
        function gcalItemsFrom(ev) {
            const out = [];
            const s = ev.start || {}, e = ev.end || {};
            const allDay = !!s.date;
            const first = allDay ? s.date : ymd(new Date(s.dateTime));
            const last = allDay ? addDays(e.date || s.date, -1) : ymd(new Date(e.dateTime || s.dateTime));
            const hm = (v) => { const d = new Date(v); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
            const time = allDay ? 'ทั้งวัน' : (hm(s.dateTime) + (e.dateTime ? ' - ' + hm(e.dateTime) : '') + ' น.');
            let d = first, guard = 0;
            while (d <= (last < first ? first : last) && guard < 62) {
                out.push({ date: d, title: '📅 ' + (ev.summary || '(ไม่มีชื่อ)'), location: ev.location || 'Google Calendar ส่วนตัว',
                    isHoliday: false, gcal: true, time: time, desc: ev.description || '' });
                d = addDays(d, 1); guard++;
            }
            return out;
        }

        /* [รอบ 5 ข้อ 4] นัดหมายส่วนตัวจาก Google : อยู่ในหน่วยความจำของแท็บนี้เท่านั้น ผูกกับเจ้าของ
           ไม่ส่งขึ้นเซิร์ฟเวอร์ -> ผู้ใช้อื่นไม่เห็น , ออกจากระบบ = ล้างทิ้ง (คนถัดไปในเครื่องเดียวกันไม่เห็น) */
        PC.gcalItems = [];
        PC.gcalOwner = '';
        PC.gcalVisible = () => (PC.user && PC.gcalOwner === PC.user.id && Array.isArray(PC.gcalItems)) ? PC.gcalItems : [];
        PC.clearGoogleData = function () {
            PC.gcalItems = [];
            PC.gcalOwner = '';
            PC.gToken = null;
            PC.gcalLastSync = 0;
            PC.gcalBusy = false;
            try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* ข้าม */ }
        };
        const gcalOkKey = () => 'pc_gcal_ok:' + (PC.user ? PC.user.id : '');

        /* [รอบ 5 ข้อ 4] ซิงก์ได้เฉพาะปฏิทิน Google "ของตัวเอง"
           ตรวจอีเมลของบัญชี Google ที่ให้สิทธิ์ กับบัญชีที่ผูกไว้ในระบบ (googleEmail หรือ email)
           กันกรณีเครื่องส่วนกลางที่ Gmail ของคนอื่นค้างอยู่ : ไม่ส่งงาน/กิจกรรมของเราไปลงปฏิทินของเขา และไม่ดึงนัดหมายของเขามาแสดง */
        async function ensureOwnGoogle(silent) {
            if (PC.gToken && PC.gToken.verified === PC.user.id) return true;
            const uid = PC.user.id, tok = PC.gToken;
            const still = () => {                                   // ออกจากระบบ/เปลี่ยนผู้ใช้ระหว่างรอ -> หยุด
                if (!PC.user || PC.user.id !== uid || PC.gToken !== tok) { const e = new Error('ยกเลิกการซิงก์ปฏิทิน'); e.code = 'CANCELLED'; throw e; }
            };
            const info = await gFetch('https:/\/www.googleapis.com/oauth2/v3/userinfo');
            still();
            const email = String((info && info.email) || '').trim().toLowerCase();
            if (!email) throw new Error('อ่านอีเมลของบัญชี Google ไม่ได้ กรุณาลองใหม่');
            const linked = String(PC.user.googleEmail || '').trim().toLowerCase();
            const own = String(PC.user.email || '').trim().toLowerCase();
            const drop = () => { PC.gToken = null; };
            if (linked ? email === linked : (own && email === own)) {
                PC.gToken.verified = PC.user.id; PC.gToken.email = email;
                // อีเมลตรงกับช่อง email แต่ยังไม่ผูก -> ผูกเงียบ ๆ ครั้งเดียว (ครั้งหน้า Google เลือกบัญชีนี้ให้เอง)
                if (!linked) api('linkGoogle', { accessToken: tok.access }, { retries: 0, timeout: 25000 }).then(out => {
                    if (out && out.googleEmail && PC.user && PC.user.id === uid) PC.user.googleEmail = out.googleEmail;
                }).catch(e => console.warn('[PC] linkGoogle', e.message));
                return true;
            }
            if (linked || silent) {
                drop();
                if (silent) return false;
                const e = new Error('บัญชี Google ที่เลือก (' + email + ') ไม่ใช่บัญชีที่ผูกกับผู้ใช้ของท่าน (' + (linked || own) + ') จึงไม่ซิงก์ปฏิทิน');
                e.code = 'GMISMATCH';
                throw e;
            }
            const r = await Swal.fire({
                icon: 'question',
                title: 'ใช้ปฏิทินของบัญชีนี้?',
                html: '<div class="text-sm text-slate-600">ซิงก์กับ Google Calendar ของ <b>' + esc(email) + '</b><br>ระบบจะผูกบัญชีนี้กับผู้ใช้ <b>' + esc(PC.user.id) + '</b> (ใช้เข้าสู่ระบบด้วย Gmail ได้ด้วย)</div>' +
                    '<div class="mt-2 text-xs text-rose-600">ถ้าไม่ใช่บัญชีของท่าน (เช่น เครื่องส่วนกลางที่มีคนอื่น login Gmail ค้างไว้) ให้กด "ไม่ใช่ของฉัน"</div>',
                showCancelButton: true, confirmButtonText: 'ใช่ บัญชีของฉัน', cancelButtonText: 'ไม่ใช่ของฉัน', allowOutsideClick: false
            });
            still();
            if (!r || !r.isConfirmed) { drop(); const e = new Error('ยกเลิกการซิงก์ปฏิทิน'); e.code = 'CANCELLED'; throw e; }
            const out = await api('linkGoogle', { accessToken: tok.access }, { retries: 0, timeout: 25000 });
            still();
            const ge = String((out && out.googleEmail) || email).toLowerCase();
            PC.user.googleEmail = ge;
            if (PC.store && PC.store.me && PC.store.me.id === PC.user.id) PC.store.me.googleEmail = ge;
            PC.gToken.verified = PC.user.id; PC.gToken.email = ge;
            if (loadRemember()) setGHint(ge);
            return true;
        }

        PC.syncGoogleCalendar = async function (opt) {
            opt = opt || {};
            if (PC.gcalBusy || !PC.user) return;
            if (!gTokenValid()) {
                if (opt.silent) return;
                if (!authCfg || !authCfg.google) { Swal.fire({ icon: 'info', title: 'ยังไม่เปิดใช้การเชื่อมต่อ Google', text: 'ผู้ดูแลระบบต้องใส่ GOOGLE_CLIENT_ID ใน Code.gs ก่อน' }); return; }
                const env = googleEnvProblem();                        // [รอบ 5 ข้อ 4]
                if (env) { showGoogleEnvHelp(env); return; }
                if (!(window.google && google.accounts && google.accounts.oauth2)) { loadGis().catch(() => {}); toast('info', 'กำลังโหลดบริการของ Google กรุณากดอีกครั้ง'); return; }
                const hint = PC.user.googleEmail || '';            // ใช้เฉพาะบัญชีที่ผูกกับผู้ใช้คนนี้ (ไม่ใช้บัญชีที่เครื่องจำไว้)
                try { await requestGoogleToken(hint ? '' : 'select_account', hint); } catch (e) {
                    if (e.code !== 'CANCELLED') Swal.fire({ icon: 'error', title: 'เชื่อมต่อ Google ไม่สำเร็จ', html: '<div class="text-sm">' + esc(e.message) + '</div>' + googleErrorHelpHtml() });
                    return;
                }
                if (PC.gToken) PC.gToken.owner = PC.user.id;
            }
            const who = PC.user.id;
            PC.gcalBusy = true;
            try {
                if (!(await ensureOwnGoogle(!!opt.silent))) { PC.gcalBusy = false; return; }
            } catch (e) {
                PC.gcalBusy = false;
                if (e.code === 'CANCELLED') { toast('info', e.message); return; }
                if (opt.silent) { console.warn('[PC] gcal verify', e); status.show('ไม่ได้ซิงก์ Google Calendar : ' + e.message, 'warn', 5000); return; }
                Swal.fire({ icon: e.code === 'GMISMATCH' ? 'warning' : 'error', title: 'ไม่ได้ซิงก์ปฏิทิน', text: e.message });
                return;
            }
            if (!opt.silent) status.show('กำลังซิงก์ Google Calendar...', 'busy');
            try {
                const now = Date.now();
                const tMin = new Date(now - 30 * 86400000), tMax = new Date(now + 180 * 86400000);
                const all = [];
                let pageToken = '';
                do {
                    const q = new URLSearchParams({ timeMin: tMin.toISOString(), timeMax: tMax.toISOString(), singleEvents: 'true', maxResults: '250', showDeleted: 'false' });
                    if (pageToken) q.set('pageToken', pageToken);
                    const j = await gFetch(GCAL_EVENTS + '?' + q.toString());
                    (j && j.items || []).forEach(ev => all.push(ev));
                    pageToken = (j && j.nextPageToken) || '';
                } while (pageToken && all.length < 2000);
                const tagOf = (ev) => (ev.extendedProperties && ev.extendedProperties.private) || {};
                // ---- ดึงเข้า : นัดหมายส่วนตัว (ไม่ใช่รายการที่ระบบส่งไป) ----
                const personal = all.filter(ev => tagOf(ev).pcSource !== GCAL_TAG && ev.status !== 'cancelled');
                const items = [];
                personal.forEach(ev => gcalItemsFrom(ev).forEach(x => items.push(x)));
                if (!PC.user || PC.user.id !== who) return;          // ออกจากระบบ/เปลี่ยนผู้ใช้ระหว่างซิงก์ -> ทิ้งผลลัพธ์
                PC.gcalItems = items;
                PC.gcalOwner = who;
                // ---- ส่งออก : กิจกรรมโรงเรียน + งานของฉันที่มีกำหนดส่ง ----
                const pushed = {};
                all.filter(ev => tagOf(ev).pcSource === GCAL_TAG).forEach(ev => { pushed[tagOf(ev).pcId] = ev; });
                const lo = ymd(tMin), hi = ymd(tMax);
                const want = [];
                (state.calendarEvents || []).forEach(evt => {
                    const s = evt.startDate || evt.date, e = evt.endDate || s;
                    if (s && e >= lo && s <= hi) { const b = gcalBodyFor('evt', evt); if (b) want.push(b); }
                });
                (state.tasks || []).forEach(t => {
                    if (String(t.ownerId) !== String(PC.user.id) || t.status === 'done' || !t.dueDate) return;
                    if (t.dueDate < lo || t.dueDate > hi) return;
                    const b = gcalBodyFor('task', t); if (b) want.push(b);
                });
                let added = 0, changed = 0, removed = 0;
                const jobs = [];
                want.forEach(b => {
                    const id = b.extendedProperties.private.pcId;
                    const ex = pushed[id];
                    delete pushed[id];
                    if (!ex) jobs.push(() => gFetch(GCAL_EVENTS, { method: 'POST', body: JSON.stringify(b) }).then(() => added++));
                    else if (tagOf(ex).pcSig !== b.extendedProperties.private.pcSig) jobs.push(() => gFetch(GCAL_EVENTS + '/' + encodeURIComponent(ex.id), { method: 'PATCH', body: JSON.stringify(b) }).then(() => changed++));
                });
                Object.values(pushed).forEach(ex => jobs.push(() => gFetch(GCAL_EVENTS + '/' + encodeURIComponent(ex.id), { method: 'DELETE' }).then(() => removed++)));
                if (!PC.user || PC.user.id !== who) return;
                await runPool(jobs, 4, (job) => job());
                PC.gcalLastSync = Date.now();
                try { localStorage.setItem(gcalOkKey(), '1'); } catch (e) { /* ข้าม */ }   // เคยซิงก์บนเครื่องนี้ -> ครั้งหน้าเสนอให้ซิงก์
                try { if (isVisible('tab-calendar')) renderCalendar(); } catch (e) { /* ข้าม */ }
                status.show('ซิงก์ Google Calendar แล้ว : รับนัดหมาย ' + personal.length + ' · ส่งใหม่ ' + added + ' · แก้ไข ' + changed + ' · ลบ ' + removed, 'ok', 4000);
            } catch (e) {
                console.warn('[PC] gcal', e);
                status.show('ซิงก์ Google Calendar ไม่สำเร็จ : ' + e.message, 'error', 6000);
            } finally {
                PC.gcalBusy = false;
            }
        };
        // ซิงก์ซ้ำทุก 15 นาทีระหว่างที่สิทธิ์ Google ยังไม่หมดอายุ
        setInterval(() => { if (gTokenValid() && document.visibilityState === 'visible') PC.syncGoogleCalendar({ silent: true }); }, 15 * 60000);

        /* [รอบ 5 ข้อ 4] หลังเข้าระบบ (One Tap / รหัสผ่าน ของผู้ที่เคยซิงก์บนเครื่องนี้) -> เสนอให้ซิงก์ปฏิทินของตัวเองด้วยการกด 1 ครั้ง
           (Google กำหนดให้การขอสิทธิ์ปฏิทินต้องเกิดจากการกดของผู้ใช้ จึงซิงก์เองเงียบ ๆ ไม่ได้) */
        function offerCalendarSync(force) {
            if (!PC.user || !authCfg || !authCfg.google || gTokenValid() || googleEnvProblem() || !secureOrigin()) return;
            let seen = false, offered = false;
            try { seen = localStorage.getItem(gcalOkKey()) === '1'; offered = sessionStorage.getItem('pc_gcal_offered') === PC.user.id; } catch (e) { /* ข้าม */ }
            if (!force && (!seen || offered)) return;                // เสนอไม่เกิน 1 ครั้งต่อแท็บ
            try { sessionStorage.setItem('pc_gcal_offered', PC.user.id); } catch (e) { /* ข้าม */ }
            loadGis().catch(() => {});
            const uid = PC.user.id;
            setTimeout(() => {
                if (!PC.user || PC.user.id !== uid || (window.Swal && Swal.isVisible())) return;
                Swal.fire({
                    toast: true, position: 'top-end', icon: 'info',
                    title: 'ซิงก์ Google Calendar ของท่าน?',
                    showConfirmButton: true, confirmButtonText: '<i class="fa-brands fa-google mr-1"></i>ซิงก์เลย',
                    showCancelButton: true, cancelButtonText: 'ไม่ตอนนี้', timer: 15000, timerProgressBar: true
                }).then(r => { if (r && r.isConfirmed && PC.user && PC.user.id === uid) PC.syncGoogleCalendar(); });
            }, 1800);
        }
        PC.offerCalendarSync = offerCalendarSync;

        // ปุ่ม "ซิงก์ Google" บนแถบปฏิทิน
        (function () {
            const orig = window.renderCalendar;
            if (typeof orig !== 'function') return;
            window.renderCalendar = function () {
                const r = orig.apply(this, arguments);
                try {
                    const wrap = document.getElementById('calendar-dynamic-wrapper');
                    if (wrap && authCfg && authCfg.google && !document.getElementById('btn-gcal-sync')) {
                        const holder = wrap.querySelector('.flex.items-center.gap-1\\.5.flex-wrap');
                        const last = PC.gcalLastSync ? ('ซิงก์ล่าสุด ' + new Date(PC.gcalLastSync).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.') : 'ยังไม่เคยซิงก์ในรอบนี้';
                        const html = `<button type="button" id="btn-gcal-sync" onclick="PC.syncGoogleCalendar()" title="ซิงก์กับ Google Calendar ของท่าน (${last})"
                            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 transition whitespace-nowrap shadow-sm">
                            <i class="fa-brands fa-google mr-1" style="color:#EA4335"></i>ซิงก์ Google</button>`;
                        if (holder) holder.insertAdjacentHTML('beforeend', html);
                        else wrap.insertAdjacentHTML('afterbegin', '<div class="flex justify-end p-2">' + html + '</div>');
                    }
                } catch (e) { /* ข้าม */ }
                return r;
            };
        })();

        /* ============================================================================
           v23 (25 ก.ย. 2569) : ชุดปรับปรุง 17 ข้อ
             1  ซิงก์/แสดงผลแต่ละแท็บเร็วขึ้น           10  ชื่อผู้รับในตรารับ = ชื่อธุรการจริง
             2  งานของฉัน วันนี้/เดือนนี้/ปีนี้/ย้อนหลัง    11–13 ข้อสั่งการด่วน + มอบหมายผู้รับผิดชอบ แบบ dropdown checkbox
             3  ลงรับแล้ว -> เข้ากำหนดงาน (งานของฉัน)      14  มอบหมายใคร -> เข้ากล่องหนังสือเข้า + งานของฉันของคนนั้น
             4  สิทธิ์แก้ไข/ลบ ประกาศ + ความคิดเห็น          15  เลขบนตราความเห็น : ผอ. = 1 แล้วเรียงต่อ
             5  tooltip รายชื่อผู้กด reaction               16  กด "ลงนามครบ" -> ความเห็นทุกคนตามลำดับเวลา
             6–7 ดูไฟล์ฉบับเต็ม/ต้นฉบับ แบบเต็มจอ           17  ประกาศที่มาจากหนังสือ : ปุ่มดูรายละเอียด/ไฟล์แนบ/ต้นฉบับ
             8–9 เลขรับรายปีจากเซิร์ฟเวอร์ (ชีต ปี_ธุรการ...) แก้เลขกระโดด
           ============================================================================ */
        (function v23() {
            const myId = () => (state.user && state.user.id) ? String(state.user.id) : '';
            const cleanG = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const roomNow = () => (document.getElementById('banner-room-name')?.innerText || '').trim();
            const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const pad2 = (n) => String(n).padStart(2, '0');
            function fmtTH(ms, withTime) {
                if (!ms) return '';
                const d = new Date(Number(ms));
                if (isNaN(d.getTime())) return '';
                return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543) + (withTime ? ' เวลา ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + ' น.' : '');
            }
            function fmtDeadline(v) {
                if (!v || !/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v || '');
                return fmtTH(new Date(String(v).substring(0, 10) + 'T00:00:00').getTime(), false);
            }
            const loadingBox = (text) => (PC.skel ? PC.skel.cards(4, text) : `<div class="p-8 text-center text-slate-500 text-sm border border-dashed border-slate-300 rounded-2xl bg-slate-50"><i class="fa-solid fa-spinner fa-spin mr-2 text-blue-500"></i>${esc(text)}</div>`);   // [v83] skeleton

            /* ---------------------------------------------------------------
               [ข้อ 14] ผู้รับผิดชอบรายบุคคล
               --------------------------------------------------------------- */
            const idsOf = (doc) => (Array.isArray(doc && doc.assigneeIds) ? doc.assigneeIds.map(String) : []);
            window.pcAssignedToMe = function (doc) {
                const me = myId();
                return !!(doc && me && idsOf(doc).includes(me));
            };
            window.pcAssignedToOthers = function (doc) {
                const ids = idsOf(doc);
                return ids.length > 0 && !ids.includes(myId());
            };
            /** คิวผู้รับผิดชอบ (ขั้นตอน 8) : หนังสือที่มอบให้ฉันแสดงทุกห้อง , ของคนอื่นไม่แสดง (ADMIN ดูตามห้อง) */
            window.pcStage8Visible = function (doc, normalizedRoom, roomName) {
                if (window.pcAssignedToMe(doc)) return true;
                const admin = realRole() === 'ADMIN';
                if (idsOf(doc).length && !admin) return false;
                if (roomName === CENTRAL) return true;
                return !!(doc.subGroups && doc.subGroups.some(g => { const ng = cleanG(g); return normalizedRoom.includes(ng) || ng.includes(normalizedRoom); }));
            };

            const origSignTab = signTabForDoc;
            signTabForDoc = function (doc) {
                if (doc && Number(doc.stage) === 8) {
                    if (window.pcAssignedToMe(doc)) return 'assignee';
                    if (realRole() !== 'ADMIN' && window.pcAssignedToOthers(doc)) return '';
                }
                return origSignTab(doc);
            };
            PC.signTabForDoc = signTabForDoc;

            const origCanSign = canSign;
            canSign = function (key) {
                if (key === 'assignee') {
                    const d = findDoc(state.activeDocIds[8]);
                    if (d && window.pcAssignedToMe(d)) return true;
                }
                return origCanSign(key);
            };
            PC.canSign = canSign;

            /* ---------------------------------------------------------------
               [ข้อ 1] แต่ละแท็บแสดงข้อมูลเร็วขึ้น
                 - วาดเฉพาะสิ่งที่มองเห็น (เดิมทุกการซิงก์วาดคิวทุกขั้นตอน + ทะเบียนทั้งหมด แม้ไม่ได้เปิดดู)
                 - แท็บที่ไม่ได้เปิดจะถูกวาดทันทีเมื่อผู้ใช้เปิด
                 - เปิดแท็บข้อมูล -> ซิงก์ข้อมูลล่าสุดจากเซิร์ฟเวอร์ทันที (ไม่ต้องรอรอบ 30 วินาที)
                 - ระหว่างโหลดครั้งแรกแสดง "กำลังโหลด" แทน "ไม่มีหนังสือ"
               --------------------------------------------------------------- */
            const viewDirty = { alldocs: true, mywork: true };
            const isOpenTab = (t) => { const el = document.getElementById('tab-' + t); return !!(el && !el.classList.contains('hidden')); };
            window.renderAllQueues = function () {
                [1, 4, 5, 6, 65, 7, 8].forEach(stage => {
                    if (isOpenTab(STAGE_SIGN_TAB[stage])) renderQueueList(stage, 'queue-list-' + stage);
                });
                if (typeof renderInboxList === 'function') renderInboxList();       // เบา และต้องอัปเดตตัวเลขแจ้งเตือนเสมอ
                if (isVisible('tab-alldocs')) { viewDirty.alldocs = false; renderAllDocsList(); } else viewDirty.alldocs = true;
                if (isVisible('tab-mywork')) { viewDirty.mywork = false; renderMyWork(); } else viewDirty.mywork = true;
                updateMyWorkBadge();
            };
            const stillLoading = () => !!(PC.token && (!PC.store || PC.bgLoading) && !state.documentQueue.length);
            (function () {
                const orig = window.renderInboxList;
                window.renderInboxList = function () {
                    if (stillLoading()) { const l = document.getElementById('inbox-list'); if (l) l.innerHTML = loadingBox('กำลังโหลดหนังสือล่าสุดจากเซิร์ฟเวอร์…'); return; }
                    return orig.apply(this, arguments);
                };
            })();
            (function () {
                const orig = window.renderAllDocsList;
                window.renderAllDocsList = function () {
                    if (stillLoading()) { const l = document.getElementById('alldocs-list'); if (l) l.innerHTML = loadingBox('กำลังโหลดทะเบียนหนังสือ…'); return; }
                    return orig.apply(this, arguments);
                };
            })();
            (function () {
                const orig = window.switchTab;
                let lastQuick = 0;
                window.switchTab = function (tabName) {
                    const r = orig.apply(this, arguments);
                    try {
                        if (tabName === 'alldocs' && viewDirty.alldocs) { viewDirty.alldocs = false; setTimeout(() => renderAllDocsList(), 0); }
                        if (tabName === 'mywork') { viewDirty.mywork = false; setTimeout(renderMyWork, 0); }
                        if (['inbox', 'alldocs', 'activities', 'mywork', 'tasks', 'calendar'].includes(tabName) && PC.token && PC.store && !PC.bgLoading) {
                            const now = Date.now();
                            if (now - lastQuick > 5000) { lastQuick = now; setTimeout(() => syncNow(), 30); }
                        }
                    } catch (e) { console.warn('[v23] switchTab', e.message); }
                    return r;
                };
            })();
            const origRerenderAll = rerenderAll;
            rerenderAll = function (what) {
                origRerenderAll(what);
                try {
                    if (what.users && CDD['assignee-picker-assistantgroup']) window.renderAssigneeCheckboxList('assignee-picker-assistantgroup');
                    if ((what.docs || what.tasks) && isVisible('tab-tasks')) renderTasks();
                    if (what.docs) updateMyWorkBadge();
                } catch (e) { console.warn('[v23] rerender', e.message); }
            };
            // แท็บงานของฉันแสดงกับทุกคน (ใครก็ได้รับมอบหมายได้) เว้นแต่ผู้ดูแลระบบจำกัดแท็บไว้
            (function () {
                const orig = window.applyRolePermissions;
                window.applyRolePermissions = function () {
                    const r = orig.apply(this, arguments);
                    const b = document.getElementById('tab-btn-mywork');
                    if (b && tabAllowed('mywork')) b.classList.remove('hidden');
                    updateMyWorkBadge();
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 2 + 14] แท็บ "งานของฉัน" : หนังสือที่ได้รับมอบหมาย (รอลงรับ + ลงรับแล้ว)
                 แยก วันนี้ / เดือนนี้ / ปีนี้ / ทั้งหมด / ย้อนหลัง (คลังรายปี) + ค้นหา + สถานะ
               --------------------------------------------------------------- */
            const MW = { period: 'year', status: 'all', q: '', page: 1, perPage: 10, archiveYear: '', counts: {} };
            function isMine(doc) {
                if (!doc || !doc.id) return false;
                const ids = idsOf(doc);
                if (ids.length) return ids.includes(myId());
                // หนังสือเก่าก่อนมีรายชื่อรายบุคคล : เทียบจากชื่อผู้รับผิดชอบ
                const nm = String((state.user && state.user.name) || '').trim();
                return !!nm && [8, 99].includes(Number(doc.stage)) && String(doc.assigneeName || '').split(/\s*,\s*/).includes(nm);
            }
            const mwPending = (doc) => Number(doc.stage) === 8;
            function mwTime(doc) {
                return Number(doc.doneAt) || Number(doc.assignedAt) || recvTime(doc) || 0;
            }
            function updateMyWorkBadge() {
                const b = document.getElementById('mywork-tab-badge');
                if (!b) return 0;
                const n = PC.user ? state.documentQueue.filter(d => mwPending(d) && window.pcAssignedToMe(d)).length : 0;
                b.innerText = n;
                b.classList.toggle('hidden', n === 0);
                return n;
            }
            PC.updateMyWorkBadge = updateMyWorkBadge;

            window.myworkSearch = (function () {
                let t = null;
                return function (v) { clearTimeout(t); t = setTimeout(() => { MW.q = v || ''; MW.page = 1; renderMyWork(); }, 220); };
            })();
            window.myworkSetStatus = function (v) { MW.status = v || 'all'; MW.page = 1; renderMyWork(); };
            window.myworkPeriod = function (p) { MW.period = p || 'year'; MW.archiveYear = ''; MW.page = 1; renderMyWork(); };
            window.myworkPage = function (p) { MW.page = Math.max(1, Number(p) || 1); renderMyWork(); document.getElementById('tab-mywork')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
            window.myworkOpenArchive = async function (year) {
                year = String(year || '');
                if (!year) { window.myworkPeriod(MW.period); return; }
                MW.archiveYear = year;
                MW.page = 1;
                if (!REG.cache[year]) {
                    const list = document.getElementById('mywork-list');
                    if (list) list.innerHTML = loadingBox('กำลังเปิดคลังหนังสือปี พ.ศ. ' + year + '...');
                    try {
                        const res = await api('getArchive', { year: year }, { timeout: 120000 });
                        REG.cache[year] = (res.docs || []).map(x => Object.assign({}, x.d, { _c: x.c, _archived: true }));
                    } catch (e) {
                        MW.archiveYear = '';
                        Swal.fire({ icon: 'error', title: 'เปิดคลังหนังสือไม่สำเร็จ', text: e.message });
                    }
                }
                if (MW.archiveYear) PC.archiveMap = new Map((REG.cache[MW.archiveYear] || []).map(d => [d.id, d]));
                renderMyWork();
            };

            function mwFilter() {
                const src = MW.archiveYear ? (REG.cache[MW.archiveYear] || []) : state.documentQueue;
                const q = normQ(MW.q);
                const base = src.filter(d => {
                    if (!isMine(d)) return false;
                    if (MW.status === 'pending' && !mwPending(d)) return false;
                    if (MW.status === 'done' && mwPending(d)) return false;
                    return !q || docHaystack(d).includes(q);
                });
                if (MW.archiveYear) { MW.counts = { all: base.length }; return base; }
                const now = new Date();
                const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate();
                const c = { today: 0, month: 0, year: 0, all: base.length };
                const tag = new Map();
                base.forEach(doc => {
                    const dt = new Date(mwTime(doc) || Date.now());
                    const inY = dt.getFullYear() === y, inM = inY && dt.getMonth() === m, inD = inM && dt.getDate() === dd;
                    if (inY) c.year++;
                    if (inM) c.month++;
                    if (inD) c.today++;
                    tag.set(doc, { inY, inM, inD });
                });
                MW.counts = c;
                if (MW.period === 'all') return base;
                return base.filter(doc => { const t = tag.get(doc); return MW.period === 'today' ? t.inD : (MW.period === 'month' ? t.inM : t.inY); });
            }

            function mwBar(shown) {
                const box = document.getElementById('mywork-periods');
                const sum = document.getElementById('mywork-summary');
                const c = MW.counts || {};
                const chip = (id, label, n) => {
                    const on = !MW.archiveYear && MW.period === id;
                    return `<button type="button" onclick="myworkPeriod('${id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition border ${on ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}">${label}${(n !== undefined && !MW.archiveYear) ? `<span class="ml-1 px-1.5 rounded-full text-[10px] ${on ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}">${n}</span>` : ''}</button>`;
                };
                const years = (PC.archiveYears || []).map(String);
                const arch = years.length
                    ? `<select onchange="myworkOpenArchive(this.value)" class="px-2 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer ${MW.archiveYear ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300'}">
                            <option value="">ย้อนหลัง (คลังรายปี)…</option>
                            ${years.map(y => `<option value="${esc(y)}" ${MW.archiveYear === y ? 'selected' : ''}>คลังปี พ.ศ. ${esc(y)}</option>`).join('')}
                       </select>`
                    : `<span class="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-300 text-slate-400" title="หนังสือของปีก่อน ๆ ที่ลงนามครบแล้วจะถูกย้ายไปคลังรายปีอัตโนมัติ">ย้อนหลัง : ยังไม่มีคลัง</span>`;
                if (box) box.innerHTML = '<span class="text-xs font-bold text-slate-500 mr-1"><i class="fa-regular fa-calendar"></i> ได้รับมอบหมาย</span>' +
                    chip('today', 'วันนี้', c.today) + chip('month', 'เดือนนี้', c.month) + chip('year', 'ปีนี้', c.year) + chip('all', 'ทั้งหมด', c.all) + arch;
                const st = document.getElementById('mywork-status');
                if (st && st.value !== MW.status) st.value = MW.status;
                if (sum) {
                    const label = MW.archiveYear ? ('คลังปี พ.ศ. ' + MW.archiveYear) : ({ today: 'วันนี้', month: 'เดือนนี้', year: 'ปีนี้', all: 'ทั้งหมด' }[MW.period]);
                    const pend = state.documentQueue.filter(d => mwPending(d) && window.pcAssignedToMe(d)).length;
                    sum.innerHTML = `พบ <b>${shown.toLocaleString('th-TH')}</b> รายการ : ${esc(label)}${MW.q ? ` · ค้นหา "<b>${esc(MW.q)}</b>"` : ''}` +
                        (pend ? ` · <span class="text-rose-600 font-bold"><i class="fa-solid fa-bell"></i> รอท่านลงรับ ${pend} ฉบับ</span>` : '');
                }
            }

            function mwCard(doc) {
                const archived = !!doc._archived;
                const pending = mwPending(doc);
                const recNo = String(doc.subgroupReceiveNo || doc.groupReceiveNo || doc.receiveNo || '-');
                const [rn, ry] = recNo.split('/');
                const idq = jsq(doc.id);
                const overdue = pending && /^\d{4}-\d{2}-\d{2}$/.test(String(doc.deadline || '')) && new Date(doc.deadline + 'T23:59:59').getTime() < Date.now();
                const btn = (fn, cls, icon, label) => `<button type="button" onclick="${fn}" class="${cls} px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold shadow-sm flex items-center gap-1 transition border"><i class="fa-solid ${icon}"></i> ${label}</button>`;
                const buttons = [
                    pending && !archived ? btn(`goToSign('${idq}')`, 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700', 'fa-pen-nib', 'ลงรับ / ลงนาม') : '',
                    btn(archived ? `PC.viewArchived('${idq}', 'image')` : `viewFinalDocument('${idq}')`, 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700', 'fa-file-invoice', 'ดูหนังสือ'),
                    !archived && doc.originalFile ? btn(`viewOriginalDocument('${idq}')`, 'bg-slate-700 hover:bg-slate-800 text-white border-slate-800', 'fa-file-pdf', 'ต้นฉบับ') : '',
                    Array.isArray(doc.attachments) && doc.attachments.length ? btn(archived ? `PC.viewArchived('${idq}', 'attach')` : `previewAttachments('${idq}')`, 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200', 'fa-paperclip', 'ไฟล์แนบ (' + doc.attachments.length + ')') : '',
                    !pending ? btn(`showSignatureTimeline('${idq}')`, 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200', 'fa-comments', 'ความเห็นทุกขั้นตอน') : ''
                ].join('');
                const statusChip = pending
                    ? `<span class="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"><i class="fa-solid fa-hourglass-half mr-1"></i>รอท่านลงรับ</span>`
                    : `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"><i class="fa-solid fa-circle-check mr-1"></i>ลงรับแล้ว ${esc(fmtTH(doc.doneAt, true) || (doc.stepTimes && doc.stepTimes[8] ? toArabicNum(doc.stepTimes[8]) : ''))}</span>`;
                const deadline = doc.deadline ? `<span class="${overdue ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-purple-50 text-purple-700 border-purple-200'} border px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"><i class="fa-regular fa-calendar-check mr-1"></i>กำหนดส่ง ${esc(fmtDeadline(doc.deadline))}${overdue ? ' (เลยกำหนด)' : ''}</span>` : '';
                const pr = Number(doc.priority);
                const prio = pr === 4 ? '<span class="bg-rose-600 text-white px-2 py-0.5 rounded-md text-[10px] font-bold">ด่วนที่สุด</span>'
                    : pr === 3 ? '<span class="bg-orange-500 text-white px-2 py-0.5 rounded-md text-[10px] font-bold">ด่วนมาก</span>'
                    : pr === 2 ? '<span class="bg-amber-400 text-white px-2 py-0.5 rounded-md text-[10px] font-bold">ด่วน</span>' : '';
                const assigner = (Array.isArray(doc.signLog) ? doc.signLog : []).filter(x => Number(x.stage) === 7).pop();
                return `
                <div class="flex flex-row bg-white border ${pending ? 'border-amber-300' : 'border-emerald-300'} rounded-2xl hover:shadow-md transition overflow-hidden">
                    <div class="w-[78px] sm:w-[92px] ${pending ? 'bg-amber-400' : 'bg-emerald-600'} flex flex-col shrink-0 text-center">
                        <div class="${pending ? 'bg-amber-500 text-amber-950' : 'bg-emerald-800 text-white'} py-1 text-[9px] font-bold px-1 truncate">เลขรับ</div>
                        <div class="flex-1 flex flex-col justify-center items-center p-1">
                            <span class="text-3xl sm:text-4xl font-extrabold leading-none ${pending ? 'text-amber-950' : 'text-white'}">${esc(rn || '-')}</span>
                            <span class="text-[11px] font-bold ${pending ? 'text-amber-900' : 'text-emerald-100'}">${esc(ry || '')}</span>
                        </div>
                    </div>
                    <div class="p-3 flex-1 min-w-0 ${pending ? 'bg-amber-50/40' : 'bg-emerald-50/30'}">
                        <div class="flex items-center gap-1.5 flex-wrap">${statusChip}${prio}${deadline}${typeof secrecyBadge === 'function' ? secrecyBadge(doc) : ''}
                            ${archived ? '<span class="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">คลังรายปี</span>' : ''}</div>
                        <div class="text-[14.5px] font-bold text-slate-800 mt-1.5 leading-snug">${esc(doc.subject || doc.title || '-')}</div>
                        <div class="text-[11px] text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span><i class="fa-regular fa-paper-plane text-sky-500 mr-1"></i><b>จาก:</b> ${esc(doc.sender || '-')}</span>
                            <span><b>ที่</b> ${esc(doc.docNo || '-')} <b>ลงวันที่</b> ${esc(doc.docDate || '-')}</span>
                            ${(doc.subGroups || [])[0] ? `<span><i class="fa-solid fa-sitemap text-slate-400 mr-1"></i>${esc(doc.subGroups[0])}</span>` : ''}
                            ${assigner ? `<span><i class="fa-solid fa-user-tag text-purple-500 mr-1"></i>มอบหมายโดย ${esc(assigner.name || '')}</span>` : ''}
                        </div>
                        <div class="flex items-center flex-wrap gap-1.5 mt-2">${buttons}</div>
                    </div>
                </div>`;
            }

            function renderMyWork() {
                const list = document.getElementById('mywork-list');
                if (!list) return;
                if (stillLoading()) { list.innerHTML = loadingBox('กำลังโหลดหนังสือที่ได้รับมอบหมาย…'); return; }
                let items = mwFilter();
                items.sort((a, b) => (mwPending(b) - mwPending(a)) || (mwTime(b) - mwTime(a)));
                PC.myworkLast = items;              // [v24 ข้อ 10] ใช้ส่งออก Excel/พิมพ์/คัดลอก
                mwBar(items.length);
                updateMyWorkBadge();
                const pages = Math.max(1, Math.ceil(items.length / MW.perPage));
                if (MW.page > pages) MW.page = 1;
                const shown = items.slice((MW.page - 1) * MW.perPage, MW.page * MW.perPage);
                list.innerHTML = shown.length ? shown.map(mwCard).join('') :
                    `<div class="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-10 text-center">
                        <i class="fa-solid fa-clipboard-check text-4xl text-slate-300 mb-3"></i>
                        <h4 class="font-bold text-slate-500">ยังไม่มีหนังสือที่มอบหมายให้ท่านในช่วงที่เลือก</h4>
                        <p class="text-xs text-slate-400 mt-1">ลองเลือก "ปีนี้" / "ทั้งหมด" หรือเปิด "ย้อนหลัง (คลังรายปี)"</p></div>`;
                const pager = document.getElementById('mywork-pager');
                if (pager) {
                    if (pages <= 1) pager.innerHTML = '';
                    else {
                        const b = (p, label, on, dis) => `<button type="button" ${dis ? 'disabled' : `onclick="myworkPage(${p})"`} class="min-w-[30px] h-7 px-2 rounded-md text-xs font-bold ${on ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'} ${dis ? 'opacity-40' : ''}">${label}</button>`;
                        let html = b(MW.page - 1, '‹', false, MW.page === 1);
                        for (let p = 1; p <= pages; p++) {
                            if (p === 1 || p === pages || Math.abs(p - MW.page) <= 1) html += b(p, p, p === MW.page, false);
                            else if (Math.abs(p - MW.page) === 2) html += '<span class="px-1 text-slate-400">…</span>';
                        }
                        html += b(MW.page + 1, '›', false, MW.page === pages);
                        pager.innerHTML = `<div class="flex items-center justify-center gap-1 flex-wrap">${html}</div>`;
                    }
                }
            }
            window.renderMyWork = renderMyWork;

            /* ---------------------------------------------------------------
               [ข้อ 3] ผู้รับผิดชอบลงรับหนังสือแล้ว -> สร้างงานใน "กำหนดงาน > งานของฉัน" ให้อัตโนมัติ
                 ชื่องาน = เรื่อง , ครบกำหนด = กำหนดส่งของหนังสือ , กดเปิดหนังสือจากงานได้
               --------------------------------------------------------------- */
            async function createDocTask(doc) {
                if (!doc || !PC.user) return;
                const id = 'taskdoc_' + doc.id;
                if ((state.tasks || []).some(t => t.id === id)) return;
                const recNo = doc.subgroupReceiveNo || doc.groupReceiveNo || doc.receiveNo || '-';
                const cmd = (Array.isArray(doc.signLog) ? doc.signLog : []).filter(x => Number(x.stage) === 7).map(x => x.comment).pop() || '';
                const item = {
                    id: id,
                    title: String(doc.subject || doc.title || 'หนังสือราชการ').substring(0, 190),
                    desc: ('หนังสือเลขรับ ' + recNo + (doc.docNo ? ' ที่ ' + doc.docNo : '') + '\nจาก ' + (doc.sender || '-') + (cmd ? '\nข้อสั่งการ: ' + cmd.replace(/\n+/g, ' ') : '')).substring(0, 1900),
                    listType: 'mine', visibility: 'private',
                    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(doc.deadline || '')) ? doc.deadline : '',
                    dueTime: '', allDay: true, repeat: 'none', starred: false, status: 'open',
                    group: (state.user.groups && state.user.groups[0]) || state.user.group || '',
                    subjectGroup: state.user.subjectGroup || '',
                    room: roomNow(), docId: doc.id
                };
                state.tasks = (state.tasks || []).concat([Object.assign({}, item, { ownerId: myId(), ownerName: state.user.name || myId() })]);
                try {
                    const res = await apiWrite('saveTask', { item: item });
                    if (res && res.item) {
                        state.tasks = state.tasks.filter(x => x.id !== id).concat([res.item]);
                        storePut('tasks', id, res.item, { saved: [res.saved] });
                    }
                    toast('success', 'เพิ่มหนังสือเข้า "กำหนดงาน > งานของฉัน" แล้ว');
                } catch (e) {
                    state.tasks = state.tasks.filter(x => x.id !== id);
                    console.warn('[v23] createDocTask', e.message);
                }
                try { if (isVisible('tab-tasks')) renderTasks(); else updateTasksBadge(); } catch (e) { /* ข้าม */ }
            }
            PC.createDocTask = createDocTask;

            PC.openDocFromTask = function (docId) {
                if (findDoc(docId)) return window.viewFinalDocument(docId);
                Swal.fire('ไม่พบหนังสือในระบบ', 'หนังสือฉบับนี้อาจถูกย้ายไปคลังรายปีแล้ว (เปิดได้จากแท็บงานของฉัน > ย้อนหลัง)', 'info');
            };
            const origTaskRow = taskRowHtml;
            taskRowHtml = function (t) {
                let html = origTaskRow(t);
                if (t && t.docId) {
                    const chip = `<button type="button" onclick="event.stopPropagation(); PC.openDocFromTask('${jsq(t.docId)}')" class="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-2 py-0.5 rounded-full"><i class="fa-solid fa-file-lines mr-1"></i>เปิดหนังสือ</button>`;
                    html = html.replace('<div class="flex flex-wrap items-center gap-1.5 mt-1">', '$&' + chip);
                }
                return html;
            };

            /* ---------------------------------------------------------------
               [ข้อ 16] บันทึกความเห็นของทุกขั้นตอนลงหนังสือ (doc.signLog) ตอนกดส่งต่อ
                 + [ข้อ 3] ผู้รับผิดชอบลงรับเสร็จ -> สร้างงานในกำหนดงาน
               --------------------------------------------------------------- */
            const STAGE_COMMENT = {
                1: ['admin-description', 'admin'], 4: ['director-comment', 'director'], 5: ['admingroup-comment', 'admingroup'],
                6: ['subdirectorgroup-comment', 'subdirectorgroup'], 65: ['subgroupadmin-comment', 'subgroupadmin'],
                7: ['assistantgroup-comment', 'assistantgroup'], 8: ['assignee-comment', 'assignee']
            };
            const CLERK_STAGES = [1, 5, 65];          // ธุรการ : ไม่แสดงในโมดอลความเห็น
            (function () {
                const orig = window.forwardDoc;
                window.forwardDoc = async function (currentStage) {
                    const stage = Number(currentStage);
                    const doc = findDoc(state.activeDocIds[stage]);
                    let entry = null, prevName = null;
                    if (doc) {
                        const cfg = STAGE_COMMENT[stage];
                        const el = cfg ? document.getElementById(cfg[0]) : null;
                        const who = (cfg && typeof window.stampIdentity === 'function') ? window.stampIdentity(cfg[1]) : {};
                        entry = {
                            stage: stage, userId: myId(), name: state.user.name || myId(),
                            position: who.position || state.user.title || '', comment: el ? String(el.value || '').trim() : '',
                            at: Date.now(), room: roomNow()
                        };
                        if (stage === 7) {
                            const picked = (typeof window.getSelectedAssignees === 'function') ? window.getSelectedAssignees('assignee-picker-assistantgroup') : [];
                            if (picked.length) {
                                entry.assignees = picked.map(p => p.name).join(', ');
                                prevName = doc.assigneeName;
                                doc.assigneeName = entry.assignees;      // ให้ประกาศประชาสัมพันธ์ (ข้อ 16 เดิม) แสดงรายชื่อครบทุกคน
                            }
                        }
                        doc.signLog = (Array.isArray(doc.signLog) ? doc.signLog : []).filter(x => !(Number(x.stage) === stage && String(x.userId) === myId()));
                        doc.signLog.push(entry);                        // ใส่ก่อนส่งต่อ -> ฉบับที่ถูกแยก (clone) ได้บันทึกนี้ไปด้วย
                    }
                    const before = doc ? Number(doc.stage) : null;
                    let r;
                    try {
                        r = await orig.apply(this, arguments);
                    } finally {
                        if (doc && entry && Number(doc.stage) === before) {       // ส่งต่อไม่สำเร็จ/ยกเลิก -> เอาบันทึกออก
                            doc.signLog = (doc.signLog || []).filter(x => x !== entry);
                            if (prevName !== null) doc.assigneeName = prevName;
                        }
                    }
                    if (doc && before === 8 && Number(doc.stage) === 99) createDocTask(doc);
                    if (doc && before !== Number(doc.stage)) { updateMyWorkBadge(); docSync.schedule(600); }
                    return r;
                };
            })();

            /** ความเห็นจากตราประทับบนหน้ากระดาษ (หนังสือเก่าที่ยังไม่มี signLog) */
            function stampsFromCanvas(doc) {
                const raw = doc && doc.canvasState;
                if (!raw || typeof raw !== 'string' || raw.charAt(0) !== '{') return [];
                let data;
                try { data = JSON.parse(raw); } catch (e) { return []; }
                const out = [];
                (data.objects || []).forEach(g => {
                    if (!g || g.type !== 'group' || !g.stampName) return;
                    const kids = g.objects || [];
                    const numObj = kids.find(k => (k.type === 'text' || k.type === 'i-text') && /^\d{1,2}$/.test(String(k.text || '').trim()));
                    const nameObj = kids.find(k => k.type === 'text' && /^\(/.test(String(k.text || '').trim()));
                    const lines = nameObj ? String(nameObj.text).split('\n') : [];
                    const name = (lines[0] || '').replace(/^\(\s*|\s*\)$/g, '').trim();
                    const position = (lines[1] || g.stampName || '').trim();
                    if (/ธุรการ|ลงรับ|ตรารับ|เจ้าหน้าที่/.test(String(g.stampName) + ' ' + position)) return;
                    const comment = kids.filter(k => k.type === 'textbox').map(k => String(k.text || '')).join('\n').trim();
                    if (!comment && !name) return;
                    out.push({ order: numObj ? Number(String(numObj.text).trim()) : 0, name: name, position: position, dateText: (lines[2] || '').trim(), comment: comment });
                });
                return out.sort((a, b) => (a.order || 99) - (b.order || 99));
            }

            function collectSignLog(doc) {
                const list = [], seen = new Set();
                const push = (x) => {
                    if (!x) return;
                    const k = x.stage + '|' + x.userId + '|' + x.at;
                    if (seen.has(k)) return;
                    seen.add(k);
                    list.push(x);
                };
                (Array.isArray(doc.signLog) ? doc.signLog : []).forEach(push);
                // ผู้รับผิดชอบคนอื่นในเรื่องเดียวกัน (ฉบับที่แยกให้แต่ละคน) -> รวมความเห็นมาแสดงด้วย
                if (doc.rootDocId) {
                    const sg = (doc.subGroups || [])[0] || '';
                    state.documentQueue.forEach(d => {
                        if (d === doc || d.rootDocId !== doc.rootDocId || ((d.subGroups || [])[0] || '') !== sg) return;
                        (Array.isArray(d.signLog) ? d.signLog : []).forEach(x => { if (Number(x.stage) === 8) push(x); });
                    });
                }
                return list.filter(x => !CLERK_STAGES.includes(Number(x.stage))).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
            }

            const STAGE_TONE = { 4: ['#e0e7ff', '#3730a3'], 6: ['#ccfbf1', '#115e59'], 7: ['#f3e8ff', '#6b21a8'], 8: ['#ffe4e6', '#9f1239'] };
            window.showSignatureTimeline = async function (docId) {
                const doc = findDoc(docId) || (PC.archiveMap && PC.archiveMap.get(docId));
                if (!doc) return;
                const timeOf = (ms) => { if (!ms) return ''; const d = new Date(Number(ms)); return isNaN(d.getTime()) ? '' : 'เวลา ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + ' น.'; };
                let rows = collectSignLog(doc).map(x => ({
                    stage: Number(x.stage), userId: x.userId || '', name: x.name, position: x.position, comment: x.comment,
                    when: fmtTH(x.at, false), time: timeOf(x.at), assignees: x.assignees || ''
                }));
                if (!rows.length && !doc._archived) {
                    try {
                        if (needsHydrate(doc, 'core')) { PC.loadProg.begin('กำลังโหลดข้อมูลตราประทับ', 1); const okH = await hydrateDoc(doc, 'core', { silent: true }); PC.loadProg.end(okH); }
                    } catch (e) { status.hide(); }
                    rows = stampsFromCanvas(doc).map(x => ({ stage: 0, name: x.name, position: x.position, comment: x.comment, when: x.dateText, assignees: '' }));
                }
                const recNo = doc.subgroupReceiveNo || doc.groupReceiveNo || doc.receiveNo || '-';
                // [v30 ข้อ 2] รูปโปรไฟล์ + ชื่อจริงบรรทัดบน / ตำแหน่งบรรทัดล่าง
                const users = PC.users || [];
                const userOf = (x) => (x.userId && users.find(u => String(u.id) === String(x.userId))) ||
                    users.find(u => u.name && x.name && String(u.name).trim() === String(x.name).trim()) || null;
                const body = rows.length ? rows.map((x, i) => {
                    const tone = STAGE_TONE[x.stage] || ['#f1f5f9', '#334155'];
                    const u = userOf(x);
                    const img = (u && u.image) || DEFAULT_AVATAR;
                    const pos = x.position || (u && u.position) || 'ผู้ลงนาม';
                    return `
                    <div class="relative pl-10 pb-4">
                        <div class="absolute left-0 top-3 w-7 h-7 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center border-2 border-white shadow">${i + 1}</div>
                        ${i < rows.length - 1 ? '<div class="absolute left-[13px] top-10 bottom-0 w-0.5 bg-slate-200"></div>' : ''}
                        <div class="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex gap-3 items-start">
                            <img src="${esc(img)}" onerror="this.src='${DEFAULT_AVATAR}'" class="w-12 h-12 rounded-full object-cover shrink-0 bg-slate-100" style="box-shadow:0 0 0 2px #fff,0 0 0 4px ${tone[0]}">
                            <div class="min-w-0 flex-1">
                                <div class="flex items-start gap-2">
                                    <div class="min-w-0 flex-1">
                                        <div class="text-[14px] font-extrabold text-slate-800 leading-tight">${esc(x.name || (u && u.name) || '-')}</div>
                                        <div class="text-[11.5px] font-semibold mt-0.5 leading-snug" style="color:${tone[1]}">${esc(pos)}</div>
                                    </div>
                                    ${x.when ? `<span class="text-[10px] text-slate-500 text-right leading-tight shrink-0"><i class="fa-regular fa-calendar mr-1"></i>${esc(x.when)}${x.time ? `<br><i class="fa-regular fa-clock mr-1"></i>${esc(x.time)}` : ''}</span>` : ''}
                                </div>
                                <div class="text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed mt-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">${esc(x.comment || '-')}</div>
                            </div>
                        </div>
                    </div>`;
                }).join('') : '<div class="p-6 text-center text-sm text-slate-500">ยังไม่พบความเห็นที่บันทึกไว้ของหนังสือฉบับนี้</div>';
                // [v30 ข้อ 2] สรุปสถานะหนังสือ (ตัวใหญ่ + สีตามสถานะ)
                const stg = Number(doc.stage);
                const main = String((doc.assignedGroups || [])[0] || '').replace(/ฯ/g, '').trim(), sub = String((doc.subGroups || [])[0] || '').replace(/ฯ/g, '').trim();
                const waitWho = ({ 1: 'ธุรการกลาง', 4: 'ผอ.', 5: 'ธุรการ' + (main || 'กลุ่มบริหาร'), 6: 'รอง ผอ.' + (main || 'กลุ่มบริหาร'),
                    65: 'ธุรการ' + (sub || 'กลุ่มงาน'), 7: 'ผช. ผอ.' + (sub || 'กลุ่มงาน'), 8: doc.assigneeName || 'ผู้รับผิดชอบ' })[stg] || '';
                const recvMs = (() => { const m = /doc_(\d{12,13})/.exec(String(doc.rootDocId || doc.id || '')); return m ? Number(m[1]) : (doc._c || 0); })();
                const days = recvMs ? Math.max(0, Math.floor((Date.now() - recvMs) / 86400000)) : null;
                const stt = stg === 99 || doc._archived
                    ? { t: 'ดำเนินการเสร็จสิ้นแล้ว', s: 'ลงนาม / ลงรับครบทุกขั้นตอน', c: '#166534', bg: '#dcfce7', bd: '#86efac', i: 'fa-circle-check' }
                    : (days !== null && days > 7
                        ? { t: 'ตกค้าง · รอ ' + waitWho, s: 'รับหนังสือมาแล้ว ' + days + ' วัน (เกิน 7 วัน)', c: '#991b1b', bg: '#fee2e2', bd: '#fca5a5', i: 'fa-triangle-exclamation' }
                        : { t: 'กำลังดำเนินการ · รอ ' + waitWho, s: days !== null ? 'รับหนังสือมาแล้ว ' + days + ' วัน' : 'อยู่ระหว่างดำเนินการ', c: '#92400e', bg: '#fef3c7', bd: '#fcd34d', i: 'fa-hourglass-half' });
                const statusBox = `<div class="mt-4 rounded-2xl border-2 px-4 py-3 flex items-center gap-3" style="background:${stt.bg};border-color:${stt.bd}">
                        <div class="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg shrink-0" style="background:${stt.c}"><i class="fa-solid ${stt.i}"></i></div>
                        <div class="min-w-0">
                            <div class="text-[11px] font-bold" style="color:${stt.c};opacity:.8">สถานะหนังสือ</div>
                            <div class="text-[19px] sm:text-[21px] font-extrabold leading-tight" style="color:${stt.c}">${esc(stt.t)}</div>
                            <div class="text-[12px] font-semibold" style="color:${stt.c};opacity:.85">${esc(stt.s)}</div>
                        </div>
                    </div>`;
                if (!document.getElementById('pc-tl-style')) {
                    const st = document.createElement('style');
                    st.id = 'pc-tl-style';
                    st.textContent = '.pc-tl-modal{padding:0 0 1.25em!important;overflow:hidden}.pc-tl-modal .swal2-html-container{margin:0!important;padding:0!important;text-align:left}';
                    document.head.appendChild(st);
                }
                Swal.fire({
                    html: `<div class="bg-purple-600 px-6 py-4 flex justify-between items-center">
                                <h3 class="text-lg font-bold text-white flex items-center gap-2"><i class="fa-solid fa-comments"></i> ความเห็นทุกขั้นตอน</h3>
                                <button type="button" onclick="Swal.close()" class="text-white/80 hover:text-white transition" title="ปิด"><i class="fa-solid fa-xmark text-xl"></i></button>
                           </div>
                           <div class="text-left px-4 sm:px-6 pt-4">
                              <div class="text-[12px] text-slate-600 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><b>เลขรับ ${esc(recNo)}</b> · ${esc(doc.subject || doc.title || '')}</div>
                              <div class="max-h-[52vh] overflow-y-auto pr-1">${body}</div>
                              <div class="text-[10px] text-slate-400 mt-1">เรียงตามลำดับเวลา (ไม่รวมความเห็นของธุรการ)</div>
                              ${statusBox}
                           </div>`,
                    width: 640, customClass: { popup: 'pc-wide-modal pc-tl-modal' },
                    showConfirmButton: true, confirmButtonText: 'ปิดหน้าต่าง', confirmButtonColor: '#7c3aed'
                });
            };

            /* ---------------------------------------------------------------
               [ข้อ 15] ตัวเลขบนตราประทับความเห็น : ผอ. = 1 ตราถัดไปเรียง 2, 3, ... ตามลำดับที่ประทับจริง
                 (ตรารับของธุรการ / ตราเสนอของธุรการกลาง ไม่มีตัวเลข จึงไม่ถูกนับ)
               --------------------------------------------------------------- */
            function isNumberedStamp(o) {
                const kids = (o && (typeof o.getObjects === 'function' ? o.getObjects() : o._objects)) || [];
                return kids.some(k => k && k.type === 'circle' && String(k.fill || '').toLowerCase() === '#dc2626');
            }
            window.stampStepOrder = function (stage) {
                stage = Number(stage);
                if (stage === 4) return 1;
                const canvas = state.canvases && state.canvases[getCanvasKey(stage)];
                let n = 0;
                if (canvas && typeof canvas.getObjects === 'function') {
                    canvas.getObjects().forEach(o => { if (o.stampName && !o.isCurrentStep && isNumberedStamp(o)) n++; });
                }
                return n + 1;
            };
            // ตัวเลขบนแผงลงนามอัปเดตตามหนังสือที่เลือก (หลังโหลดตราเดิมบนหน้ากระดาษเสร็จ)
            (function () {
                const orig = window.selectDoc;
                window.selectDoc = function (docId, stage) {
                    const r = orig.apply(this, arguments);
                    const tab = STAGE_SIGN_TAB[Number(stage)];
                    if (tab) setTimeout(() => { try { window.renderSignPanelActions(tab); } catch (e) { /* ข้าม */ } }, 700);
                    if (Number(stage) === 7) setTimeout(() => resetAssistantPickersForDoc(findDoc(docId)), 60);
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 8/9] เลขรับรายปีจากเซิร์ฟเวอร์
                 ธุรการกลาง / ธุรการกลุ่มบริหาร 4 กลุ่ม / ธุรการกลุ่มงาน 8 กลุ่ม : ขอเลขจากเซิร์ฟเวอร์ตอนกด "ประทับตรารับ"
                 เซิร์ฟเวอร์บันทึกลงชีต "ปี_สำนักงาน" (เช่น 2569_ธุรการกลุ่มบริหารวิชาการ) นับใหม่ทุก 1 มกราคม
               --------------------------------------------------------------- */
            const RECV = { central: null };                 // { last, year } เลขล่าสุดของธุรการกลางปีนี้ (ใช้แสดงเลขล่วงหน้าในคิว)
            PC.manualRecNo = new Set();                      // หนังสือที่ธุรการกลางพิมพ์เลขรับเอง
            const thaiYearNow = () => new Date().getFullYear() + 543;
            const recNum = (v, year) => {
                const s = String(v || '');
                if (s.indexOf('/' + year) === -1) return 0;
                const n = parseInt(s.split('/')[0], 10);
                return isNaN(n) ? 0 : n;
            };
            /** เลขรับกลางสูงสุดที่รู้ในเครื่อง (ใช้เป็นจุดตั้งต้นครั้งแรกของปี เมื่อชีตทะเบียนยังว่าง) */
            function localMaxCentral(exceptId) {
                const y = thaiYearNow();
                let max = 0;
                state.documentQueue.forEach(d => {
                    if (d.id === exceptId) return;
                    if (Number(d.stage) > 1 || d.receiveNoOk) max = Math.max(max, recNum(d.receiveNo, y));
                });
                return max;
            }
            /** จำนวนหนังสือที่กลุ่มนี้ลงรับไปแล้วในปีนี้ (นับเลขที่ไม่ซ้ำ) — ใช้ตั้งต้นครั้งแรกของปี ไม่พาเลขที่เคยกระโดดไปด้วย */
            function localCountGroup(groupName, field, groupsField, exceptId) {
                const y = thaiYearNow();
                const g = cleanG(groupName);
                const seen = new Set();
                state.documentQueue.forEach(d => {
                    if (d.id === exceptId) return;
                    const mine = Array.isArray(d[groupsField]) && d[groupsField].some(x => { const nx = cleanG(x); return nx === g || g.includes(nx) || nx.includes(g); });
                    if (mine && recNum(d[field], y)) seen.add(String(d[field]));
                });
                return seen.size;
            }

            async function recvPeekCentral() {
                try {
                    const r = await api('peekReceiveNo', { offices: ['central'] }, { retries: 0, timeout: 20000 });
                    const o = r && r.offices && r.offices.central;
                    if (o) RECV.central = { last: Number(o.last) || 0, year: Number(r.year) };
                    return true;
                } catch (e) { return false; }
            }
            PC.recvPeekCentral = recvPeekCentral;

            /** แสดงเลขรับล่วงหน้าให้คิวธุรการกลาง (เลขจริงออกตอนประทับตรารับ) */
            window.autoRunReceiveNumbers = function () {
                const y = thaiYearNow();
                let maxCount = localMaxCentral('');
                if (RECV.central && RECV.central.year === y) maxCount = Math.max(maxCount, RECV.central.last);
                const custom = localStorage.getItem('start-no-central') || '';
                if (custom.indexOf('/' + y) !== -1) {
                    const c = parseInt(custom.split('/')[0], 10);
                    if (!isNaN(c) && c > 0) maxCount = Math.max(maxCount, c - 1);
                }
                state.documentQueue.filter(d => Number(d.stage) === 1).forEach(item => {
                    if (item.receiveNoOk && recNum(item.receiveNo, y)) return;       // ออกเลขจริงแล้ว
                    if (PC.manualRecNo.has(item.id) && item.receiveNo) return;       // พิมพ์เลขเอง
                    maxCount++;
                    item.receiveNo = `${maxCount}/${y}`;
                });
                if (state.activeDocIds[1]) {
                    const cur = findDoc(state.activeDocIds[1]);
                    const inp = document.getElementById('admin-receive-no');
                    if (cur && inp && document.activeElement !== inp) inp.value = cur.receiveNo || '';
                }
                renderAllQueues();
                docSync.schedule(800);
            };

            (function () {
                const orig = window.updateActiveDocField;
                window.updateActiveDocField = function (field, value, stage) {
                    if (field === 'receiveNo' && (stage === undefined || Number(stage) === 1) && state.activeDocIds[1]) PC.manualRecNo.add(state.activeDocIds[1]);
                    return orig.apply(this, arguments);
                };
            })();

            (function () {
                const orig = window.applyAdminStamp;
                window.applyAdminStamp = async function () {
                    const doc = findDoc(state.activeDocIds[1]);
                    const inp = document.getElementById('admin-receive-no');
                    if (doc && inp) {
                        const typed = inp.value.trim();
                        const manual = PC.manualRecNo.has(doc.id);
                        const want = manual ? (parseInt(typed, 10) || 0) : 0;
                        const same = doc.receiveNoOk && typed === doc.receiveNo;
                        if (!same) {
                            status.show('กำลังออกเลขรับจากทะเบียนธุรการกลาง…', 'busy');
                            try {
                                if (doc.receiveNoOk && manual) {
                                    await api('releaseReceiveNo', { office: 'central', docId: doc.id }, { retries: 0, timeout: 20000 });
                                }
                                const res = await api('allocReceiveNo', {
                                    office: 'central', docId: doc.id, subject: doc.subject || doc.title || '', docNo: doc.docNo || '',
                                    sender: doc.sender || '', want: want, seed: localMaxCentral(doc.id)
                                }, { retries: 1, timeout: 30000 });
                                doc.receiveNo = res.receiveNo;
                                doc.receiveNoOk = true;
                                inp.value = res.receiveNo;
                                PC.manualRecNo.delete(doc.id);
                                RECV.central = { last: Math.max((RECV.central && RECV.central.year === res.year) ? RECV.central.last : 0, res.no), year: res.year };
                                status.show('เลขรับ ' + res.receiveNo + ' (บันทึกในทะเบียน ' + res.sheet + ')', 'ok', 2500);
                                window.autoRunReceiveNumbers();
                            } catch (e) {
                                status.show('ออกเลขรับจากเซิร์ฟเวอร์ไม่สำเร็จ ใช้เลขในหน้าจอไปก่อน : ' + e.message, 'warn', 5000);
                            }
                        }
                    }
                    return orig.apply(this, arguments);
                };
            })();

            (function () {
                const orig = window.deleteDoc;
                window.deleteDoc = function (id, stage) {
                    const doc = findDoc(id);
                    if (doc && Number(stage) === 1 && doc.receiveNoOk) {
                        api('releaseReceiveNo', { office: 'central', docId: id }, { retries: 0, timeout: 20000 })
                            .then(() => recvPeekCentral()).then(() => window.autoRunReceiveNumbers()).catch(() => {});
                    }
                    PC.manualRecNo.delete(id);
                    return orig.apply(this, arguments);
                };
            })();

            /* [v25 ข้อ 15] ออกเลขรับกลุ่มบริหาร/กลุ่มงาน "เบื้องหลัง"
               เดิม : กดประทับรับแล้วต้องรอเซิร์ฟเวอร์ตอบก่อน (ช้า/ค้าง/ล่มเมื่อมีคนใช้พร้อมกัน)
               ใหม่ : ประทับตราทันทีด้วยเลขชั่วคราว (คำนวณในเครื่อง) แล้วขอเลขจริงจากทะเบียนเบื้องหลัง
                      ได้เลขจริงแล้วแก้เลขบนตราให้อัตโนมัติ , กด "ส่งต่อ" ระบบจะรอเลขจริงก่อน (ลองใหม่อัตโนมัติถ้าล้มเหลว) */
            const RECV_JOBS = new Map();              // docId|field -> Promise
            PC.recvJobs = RECV_JOBS;
            function patchStampNumber(stage, doc, stampName, oldNo, newNo) {
                const re = /เลขรับ:\s*\S+/;
                const canvas = state.canvases[getCanvasKey(stage)];
                if (canvas && state.activeDocIds[stage] === doc.id) {
                    canvas.getObjects().forEach(g => {
                        if (g.stampName !== stampName || typeof g.getObjects !== 'function') return;
                        g.getObjects().forEach(t => { if (typeof t.text === 'string' && re.test(t.text)) { t.set('text', 'เลขรับ: ' + newNo); t.dirty = true; } });
                        g.dirty = true;
                    });
                    canvas.requestRenderAll();
                    try { saveCanvasState(canvas); } catch (e) { /* ข้าม */ }
                } else if (typeof doc.canvasState === 'string' && doc.canvasState.charAt(0) === '{' && oldNo) {
                    // หนังสือไม่ได้เปิดอยู่ : แก้ในข้อมูลตราที่บันทึกไว้ (จะแสดงเลขใหม่เมื่อเปิดอีกครั้ง)
                    doc.canvasState = doc.canvasState.split('เลขรับ: ' + oldNo).join('เลขรับ: ' + newNo);
                    doc.stampedImage = ''; doc.stampedCover = '';   // [v78] ภาพที่มีตราเดิมยังเป็นเลขเก่า -> ล้าง (สร้างใหม่เมื่อส่งต่อ/กดสร้างภาพในหน้ารายงานแจ้งเตือน)
                    (window.pcStaleImg = window.pcStaleImg || new Set()).add(doc.id);   // [v26] ภาพหน้ากระดาษยังเป็นเลขเก่า -> ถ่ายใหม่เมื่อเปิดครั้งต่อไป
                }
            }
            function startRecvJob(doc, stage, field, groupsField, stampName, label) {
                const key = doc.id + '|' + field;
                if (RECV_JOBS.has(key)) return RECV_JOBS.get(key);
                const group = (Array.isArray(doc[groupsField]) && doc[groupsField][0]) || roomNow();
                const task = PC.bgTask ? PC.bgTask('recv:' + key, 'ออกเลขรับ' + label + ' : ' + String(doc.subject || doc.title || '').substring(0, 40)) : null;
                const p = api('allocReceiveNo', {
                    office: group, docId: doc.id, rootDocId: doc.rootDocId || '', subject: doc.subject || doc.title || '',
                    docNo: doc.docNo || '', sender: doc.sender || '', seed: localCountGroup(group, field, groupsField, doc.id)
                }, { retries: 3, timeout: 45000 }).then(res => {
                    const old = doc[field];
                    doc[field] = res.receiveNo;
                    doc[field + 'Ok'] = true;
                    if (old !== res.receiveNo) {
                        patchStampNumber(stage, doc, stampName, old, res.receiveNo);
                        toast('info', 'เลขรับ' + label + 'จากทะเบียน : ' + res.receiveNo + (old ? ' (แทนเลขชั่วคราว ' + old + ')' : ''));
                    }
                    if (task) task.done('เลขรับ' + label + ' ' + res.receiveNo);
                    renderAllQueues();
                    docSync.schedule(500);
                    return res;
                }).catch(e => {
                    if (task) task.fail('ออกเลขรับไม่สำเร็จ : ' + e.message);
                    throw e;
                }).finally(() => { setTimeout(() => RECV_JOBS.delete(key), 0); });
                RECV_JOBS.set(key, p);
                p.catch(() => {});
                return p;
            }
            PC.startRecvJob = startRecvJob;
            const RECV_SPEC = {
                5: { field: 'groupReceiveNo', groupsField: 'assignedGroups', stampName: 'ตรารับกลุ่มบริหาร', label: 'กลุ่มบริหาร' },
                65: { field: 'subgroupReceiveNo', groupsField: 'subGroups', stampName: 'ตรารับกลุ่มงาน', label: 'กลุ่มงาน' }
            };
            PC.RECV_SPEC = RECV_SPEC;
            function wrapGroupReceive(fnName, stage) {
                const orig = window[fnName];
                if (typeof orig !== 'function') return;
                const s = RECV_SPEC[stage];
                window[fnName] = function () {
                    const canvas = state.canvases[getCanvasKey(stage)];
                    const doc = findDoc(state.activeDocIds[stage]);
                    const hasStamp = !!(canvas && canvas.getObjects().some(o => o.stampName === s.stampName));
                    if (doc && !hasStamp && !doc[s.field + 'Ok']) {
                        const group = (Array.isArray(doc[s.groupsField]) && doc[s.groupsField][0]) || roomNow();
                        if (!doc[s.field]) doc[s.field] = pcLocalNextReceiveNo(group, s.field, s.groupsField);   // เลขชั่วคราว -> ประทับได้ทันที
                        startRecvJob(doc, stage, s.field, s.groupsField, s.stampName, s.label);
                    }
                    return orig.apply(this, arguments);
                };
            }
            wrapGroupReceive('applyAdminGroupReceiveStamp', 5);
            wrapGroupReceive('applySubgroupAdminReceiveStamp', 65);

            // เปิดหน้าลงรับของธุรการกลาง -> ถามเลขล่าสุดจากทะเบียน แล้วแสดงเลขล่วงหน้าในคิวให้ตรง
            (function () {
                const orig = window.openWorkspaceModal;
                window.openWorkspaceModal = function (tabName) {
                    const r = orig.apply(this, arguments);
                    if (tabName === 'admin') recvPeekCentral().then(ok => { if (ok && state.documentQueue.some(d => Number(d.stage) === 1)) window.autoRunReceiveNumbers(); });
                    if (tabName === 'assistantgroup') { setTimeout(() => { window.loadAssistantCommands(); if (!CDD['assignee-picker-assistantgroup']) window.renderAssigneeCheckboxList('assignee-picker-assistantgroup'); }, 120); }
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 4] ประกาศ : แก้ไข/ลบ/ปักหมุด/ซ่อน ได้เฉพาะ ADMIN และผู้แจ้ง
                        ความคิดเห็น : แก้ไข/ลบ ได้โดยเจ้าของความคิดเห็น , ADMIN และผู้แจ้งประกาศนั้น
               [ข้อ 5] ชี้/กดที่จำนวน reaction -> รายชื่อผู้กด
               [ข้อ 17] ประกาศที่มาจากหนังสือราชการ -> ปุ่มดูรายละเอียด / ไฟล์แนบ / ต้นฉบับ
               --------------------------------------------------------------- */
            const annById = (id) => (state.assignments || []).find(a => a.AssignmentID === id);
            const isAdminReal = () => realRole() === 'ADMIN';
            function annOwner(a) { return isAdminReal() || !!(a && String(a.CreatedBy || '') === myId()); }
            PC.annOwner = annOwner;
            function commentManageable(c, a) {
                if (!c) return false;
                if (isAdminReal() || annOwner(a)) return true;
                if (c.UserId) return String(c.UserId) === myId();
                return !!(c.UserEmail && state.user.email && String(c.UserEmail).toLowerCase() === String(state.user.email).toLowerCase());
            }
            function annDocId(a) {
                if (!a) return '';
                const ins = String(a.Instructions || '').trim();
                if (ins.charAt(0) === '{') {
                    try {
                        const m = JSON.parse(ins.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));
                        if (m && m.docId) return String(m.docId);
                    } catch (e) { /* ข้าม */ }
                }
                const id = String(a.AssignmentID || '');
                return id.indexOf('ANN_DOC_') === 0 ? id.substring(8) : '';
            }
            /** ฉบับที่ "ประทับสมบูรณ์" ที่สุดของเรื่องนี้ (ผู้รับผิดชอบลงรับครบแล้ว > ฉบับที่ประกาศ) */
            function bestDocFor(docId) {
                const doc = findDoc(docId);
                if (!doc) return null;
                const sg = (doc.subGroups || [])[0] || '';
                const fam = state.documentQueue.filter(d => d === doc || (doc.rootDocId && d.rootDocId === doc.rootDocId && ((d.subGroups || [])[0] || '') === sg));
                const done = fam.filter(d => Number(d.stage) === 99).sort((a, b) => (Number(b.doneAt) || 0) - (Number(a.doneAt) || 0));
                return done[0] || doc;
            }
            PC.viewAnnDoc = function (docId, what) {
                const doc = bestDocFor(docId);
                if (!doc) return Swal.fire('ไม่พบหนังสือ', 'หนังสือฉบับนี้อาจถูกลบ หรือย้ายไปคลังรายปีแล้ว', 'info');
                if (what === 'attach') return window.previewAttachments(doc.id);
                if (what === 'original') return window.viewOriginalDocument(doc.id);
                return window.viewFinalDocument(doc.id);
            };

            function patchAnnouncementCards() {
                const list = document.getElementById('assignments-list');
                if (!list) return;
                // 1) ปุ่มแก้ไข/ลบ/ปักหมุด/ซ่อน : เหลือเฉพาะเจ้าของประกาศและ ADMIN
                list.querySelectorAll('button[onclick]').forEach(b => {
                    const m = (b.getAttribute('onclick') || '').match(/^(editAnnouncement|deleteAnnouncement|togglePinAssignment|toggleHideAnnouncement)\('([^']+)'\)/);
                    if (m && !annOwner(annById(m[2]))) b.remove();
                });
                // 2) ปุ่มเปิดหนังสือของประกาศที่มาจากหนังสือราชการ
                list.querySelectorAll('form[onsubmit]').forEach(f => {
                    const m = (f.getAttribute('onsubmit') || '').match(/handleAddComment\(event,\s*'([^']+)'/);
                    if (!m) return;
                    const a = annById(m[1]);
                    const docId = annDocId(a);
                    if (!docId) return;
                    const card = f.closest('.rounded-2xl');
                    const desc = card ? card.querySelector('.whitespace-pre-wrap') : null;
                    const holder = desc ? desc.parentElement : null;
                    if (!holder || holder.querySelector('.pc-ann-docbtns')) return;
                    const doc = bestDocFor(docId);
                    const box = document.createElement('div');
                    box.className = 'pc-ann-docbtns mt-3 flex flex-wrap gap-2';
                    const idq = jsq(docId);
                    if (!doc) {
                        box.innerHTML = '<span class="text-[11px] text-slate-400"><i class="fa-solid fa-box-archive mr-1"></i>หนังสือฉบับนี้ถูกย้ายไปคลังรายปีแล้ว (เปิดได้จากทะเบียนหนังสือรับ > ย้อนหลัง)</span>';
                    } else {
                        const b = (what, cls, icon, label) => `<button type="button" onclick="PC.viewAnnDoc('${idq}', '${what}')" class="inline-flex items-center gap-1.5 ${cls} px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm border"><i class="fa-solid ${icon}"></i> ${label}</button>`;
                        box.innerHTML =
                            b('final', 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700', 'fa-file-circle-check', 'ดูรายละเอียด (หนังสือที่ประทับตราแล้ว)') +
                            (Array.isArray(doc.attachments) && doc.attachments.length ? b('attach', 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200', 'fa-paperclip', 'ดูไฟล์แนบ (' + doc.attachments.length + ')') : '') +
                            (doc.originalFile ? b('original', 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200', 'fa-file-pdf', 'ดูไฟล์หนังสือต้นฉบับ') : '');
                    }
                    holder.appendChild(box);
                });
            }
            (function () {
                const orig = window.renderAssignmentsList;
                window.renderAssignmentsList = function () {
                    const r = orig.apply(this, arguments);
                    try { patchAnnouncementCards(); } catch (e) { console.warn('[v23] ann', e.message); }
                    return r;
                };
            })();
            // ปุ่มแก้ไข/ลบ ถูกเรียกตรงจากคอนโซล/โค้ดอื่น -> ตรวจสิทธิ์อีกชั้น (เซิร์ฟเวอร์ตรวจซ้ำอยู่แล้ว)
            ['editAnnouncement', 'deleteAnnouncement', 'togglePinAssignment', 'toggleHideAnnouncement'].forEach(fn => {
                const orig = window[fn];
                if (typeof orig !== 'function') return;
                window[fn] = function (id) {
                    if (!annOwner(annById(id))) { Swal.fire('ไม่มีสิทธิ์', 'แก้ไข/ลบประกาศได้เฉพาะผู้ดูแลระบบและผู้แจ้งประกาศนี้เท่านั้น', 'warning'); return; }
                    return orig.apply(this, arguments);
                };
            });

            // ----- ชื่อผู้กด reaction -----
            function nameOfKey(key) {
                const k = String(key || '').toLowerCase();
                if (!k) return '';
                const u = (PC.users || []).find(x => String(x.id || '').toLowerCase() === k || String(x.email || '').toLowerCase() === k);
                if (u) return u.name || u.id;
                if (state.user && (String(state.user.email || '').toLowerCase() === k || String(state.user.id || '').toLowerCase() === k)) return state.user.name || state.user.id;
                return String(key);
            }
            let rxTip = null;
            function rxTipEl() {
                if (rxTip) return rxTip;
                rxTip = document.createElement('div');
                rxTip.className = 'pc-rx-tip';
                rxTip.style.position = 'fixed';
                rxTip.style.bottom = 'auto';
                rxTip.style.zIndex = '5000';
                rxTip.style.display = 'none';
                document.body.appendChild(rxTip);
                return rxTip;
            }
            window.pcRxShow = function (el, assignmentId, commentId) {
                const a = annById(assignmentId);
                const c = a && (a.comments || []).find(x => x.CommentID === commentId);
                if (!c) return;
                let rx = {};
                try { rx = typeof c.Reactions === 'string' ? JSON.parse(c.Reactions || '{}') : (c.Reactions || {}); } catch (e) { rx = {}; }
                const rows = Object.keys(rx).filter(k => Array.isArray(rx[k]) && rx[k].length).map(k =>
                    `<div class="py-0.5"><span class="text-[13px] mr-1">${REACTION_EMOJIS[k] || k}</span><b>${rx[k].length}</b> : ${rx[k].map(x => esc(nameOfKey(x))).join(', ')}</div>`).join('');
                if (!rows) return;
                const tip = rxTipEl();
                tip.innerHTML = rows;
                tip.style.display = 'block';
                const r = el.getBoundingClientRect();
                const h = tip.offsetHeight, w = tip.offsetWidth;
                let top = r.top - h - 8;
                if (top < 8) top = r.bottom + 8;
                tip.style.top = top + 'px';
                tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
            };
            window.pcRxHide = function () { if (rxTip) rxTip.style.display = 'none'; };
            window.pcRxToggle = function (ev, el, assignmentId, commentId) {
                ev.stopPropagation();
                if (rxTip && rxTip.style.display === 'block' && rxTip.__for === commentId) { window.pcRxHide(); return; }
                window.pcRxShow(el, assignmentId, commentId);
                if (rxTip) rxTip.__for = commentId;
            };
            document.addEventListener('click', () => window.pcRxHide());
            window.addEventListener('scroll', () => window.pcRxHide(), true);

            window.buildSingleComment = function (c, userEmail, assignmentId, isReply) {
                let rx = {};
                try { rx = typeof c.Reactions === 'string' ? JSON.parse(c.Reactions || '{}') : (c.Reactions || {}); } catch (e) { rx = {}; }
                let total = 0;
                const types = [];
                Object.keys(rx).forEach(k => { if (Array.isArray(rx[k]) && rx[k].length) { total += rx[k].length; types.push(k); } });
                const aq = jsq(assignmentId), cq = jsq(c.CommentID);
                const rxCount = total > 0
                    ? `<span class="pc-rx flex items-center ml-2 px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded-full text-[10px] border border-slate-200 transition"
                            onmouseenter="pcRxShow(this, '${aq}', '${cq}')" onmouseleave="pcRxHide()" onclick="pcRxToggle(event, this, '${aq}', '${cq}')" title="">
                            <span class="flex pl-1">${types.slice(0, 3).map(k => `<span class="-ml-1 text-[12px] drop-shadow-sm">${REACTION_EMOJIS[k] || ''}</span>`).join('')}</span>
                            <span class="text-slate-500 ml-1.5 font-bold">${total}</span></span>`
                    : '';
                const a = annById(assignmentId);
                const manage = commentManageable(c, a);
                const msg = esc(c.Message || '').replace(/(@All|@all|@\S+)/g, '<span class="text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-md">$1</span>');
                const edited = c.EditedAt ? `<span class="text-[10px] text-slate-400 italic" title="แก้ไขเมื่อ ${esc(formatThaiDate(c.EditedAt))}${c.EditedBy ? ' โดย ' + esc(c.EditedBy) : ''}">(แก้ไขแล้ว)</span>` : '';
                return `
                <div id="comment-box-${esc(c.CommentID)}" class="flex items-start gap-3 ${isReply ? 'reply-branch-line' : ''}">
                    <img src="${esc(c.UserImage || DEFAULT_AVATAR)}" class="w-8 h-8 rounded-full object-cover border border-slate-200 flex-shrink-0 z-10 mt-1 shadow-sm bg-white">
                    <div class="relative max-w-[85%] w-full">
                        <div class="bg-slate-100/80 px-4 py-3 rounded-2xl rounded-tl-none relative border border-slate-100">
                            <div class="flex items-baseline gap-2 mb-1 flex-wrap">
                                <span class="text-[12px] font-bold text-slate-800">${esc(c.UserName || '')}</span>
                                <span class="text-[10px] text-slate-400">${esc(formatThaiDate(c.CreatedAt))}</span>
                                ${edited}
                            </div>
                            <div class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">${msg}</div>
                        </div>
                        <div class="flex items-center mt-1.5 ml-1 text-[11px] font-bold text-slate-500 flex-wrap gap-y-1">
                            <div class="relative reaction-container group flex items-center gap-3">
                                <button onclick="handleReaction('${aq}', '${cq}', 'like')" class="hover:text-blue-600 transition">ถูกใจ</button>
                                <div class="reaction-menu absolute bg-white shadow-xl rounded-full px-2.5 py-1.5 flex gap-2 border border-slate-100 z-50">
                                    ${Object.keys(REACTION_EMOJIS).map(k => `<button type="button" onclick="handleReaction('${aq}', '${cq}', '${k}')" class="hover:-translate-y-1 hover:scale-125 transition-all text-lg" title="${k}">${REACTION_EMOJIS[k]}</button>`).join('')}
                                </div>
                            </div>
                            ${!isReply ? `<button onclick="setReplyTo('${aq}', '${cq}', '${jsq(c.UserName || '')}')" class="ml-3 hover:text-blue-600 transition">ตอบกลับ</button>` : ''}
                            ${manage ? `<button onclick="pcEditComment('${aq}', '${cq}')" class="ml-3 hover:text-amber-600 transition"><i class="fa-solid fa-pen text-[10px] mr-0.5"></i>แก้ไข</button>
                                        <button onclick="pcDeleteComment('${aq}', '${cq}')" class="ml-3 hover:text-rose-600 transition"><i class="fa-solid fa-trash text-[10px] mr-0.5"></i>ลบ</button>` : ''}
                            ${rxCount}
                        </div>
                    </div>
                </div>`;
            };

            window.pcEditComment = async function (assignmentId, commentId) {
                const a = annById(assignmentId);
                const c = a && (a.comments || []).find(x => x.CommentID === commentId);
                if (!c) return;
                if (!commentManageable(c, a)) { Swal.fire('ไม่มีสิทธิ์', 'แก้ไขได้เฉพาะเจ้าของความคิดเห็น ผู้แจ้งประกาศ และผู้ดูแลระบบ', 'warning'); return; }
                const r = await Swal.fire({
                    title: 'แก้ไขความคิดเห็น', input: 'textarea', inputValue: c.Message || '',
                    inputAttributes: { maxlength: 5000 }, showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
                    inputValidator: (v) => (!String(v || '').trim() ? 'กรุณาพิมพ์ข้อความ' : undefined)
                });
                if (!r.isConfirmed) return;
                const before = { Message: c.Message, EditedAt: c.EditedAt, EditedBy: c.EditedBy };
                c.Message = String(r.value).trim();
                c.EditedAt = new Date().toISOString();
                c.EditedBy = state.user.name || myId();
                renderAssignmentsList();
                try {
                    await apiWrite('saveComment', { item: { CommentID: c.CommentID, AssignmentID: c.AssignmentID, Message: c.Message } });
                    const rec = PC.store && PC.store.comments[c.CommentID];
                    if (rec) Object.assign(rec.d, { Message: c.Message, EditedAt: c.EditedAt, EditedBy: c.EditedBy });
                    toast('success', 'แก้ไขความคิดเห็นแล้ว');
                } catch (e) {
                    Object.assign(c, before);
                    renderAssignmentsList();
                    Swal.fire('แก้ไขไม่สำเร็จ', e.message, 'error');
                }
            };

            window.pcDeleteComment = async function (assignmentId, commentId) {
                const a = annById(assignmentId);
                const c = a && (a.comments || []).find(x => x.CommentID === commentId);
                if (!c) return;
                if (!commentManageable(c, a)) { Swal.fire('ไม่มีสิทธิ์', 'ลบได้เฉพาะเจ้าของความคิดเห็น ผู้แจ้งประกาศ และผู้ดูแลระบบ', 'warning'); return; }
                const replies = (a.comments || []).filter(x => x.ParentCommentID === commentId);
                const r = await Swal.fire({
                    icon: 'warning', title: 'ลบความคิดเห็นนี้?',
                    text: replies.length ? 'ความคิดเห็นตอบกลับ ' + replies.length + ' รายการจะถูกลบไปด้วย' : 'ลบแล้วไม่สามารถกู้คืนได้',
                    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#e11d48'
                });
                if (!r.isConfirmed) return;
                const backup = (a.comments || []).slice();
                const gone = new Set([commentId].concat(replies.map(x => x.CommentID)));
                a.comments = (a.comments || []).filter(x => !gone.has(x.CommentID));
                renderAssignmentsList();
                try {
                    await apiWrite('deleteComment', { id: commentId });
                    if (PC.store) gone.forEach(id => { delete PC.store.comments[id]; });
                    toast('success', 'ลบความคิดเห็นแล้ว');
                } catch (e) {
                    a.comments = backup;
                    renderAssignmentsList();
                    Swal.fire('ลบไม่สำเร็จ', e.message, 'error');
                }
            };

            /* ---------------------------------------------------------------
               [ข้อ 6/7] ดูไฟล์หนังสือฉบับเต็ม + ไฟล์ต้นฉบับ แบบเต็มจอ
               --------------------------------------------------------------- */
            const FV = { zoom: 100 };
            function fvApply() {
                const img = document.getElementById('pc-fv-img');
                if (img) { img.style.width = FV.zoom + '%'; img.style.maxWidth = FV.zoom > 100 ? 'none' : '100%'; }
                const z = document.getElementById('pc-fv-zoom');
                if (z) z.innerText = FV.zoom + '%';
            }
            window.pcFvZoom = function (d) { FV.zoom = d === 0 ? ((FV.zoom === 100 && window.pcIsDesktop()) ? 60 : 100) : Math.min(400, Math.max(30, FV.zoom + d)); fvApply(); };   // [v47] ปุ่ม % สลับ 100% <-> 60%
            const FULL_SWAL = { showConfirmButton: false, showCloseButton: true, width: '100%', padding: 0, customClass: { popup: 'pc-full-modal', container: 'pc-full-container' } };
            const fvBtn = (onclick, bg, icon, label) => `<button type="button" onclick="${onclick}" class="pc-fv-btn" style="background:${bg}"><i class="fa-solid ${icon}"></i><span class="hidden sm:inline">${label}</span></button>`;

            function renderFullDoc(doc, kind) {
                FV.zoom = window.pcIsDesktop() ? 60 : 100;   // [v47]
                const idq = jsq(doc.id);
                const recNo = doc.subgroupReceiveNo || doc.groupReceiveNo || doc.receiveNo || '-';
                const title = (kind === 'final' ? 'เอกสารเลขรับ: ' + recNo : 'ไฟล์หนังสือฉบับเต็ม') + ' — ' + (doc.subject || doc.title || '');
                const nAtt = Array.isArray(doc.attachments) ? doc.attachments.length : 0;
                const done = Number(doc.stage) === 99 || (Array.isArray(doc.signLog) && doc.signLog.length);
                Swal.fire(Object.assign({}, FULL_SWAL, {
                    html: `<div class="pc-fv-head">
                               <div class="font-bold text-slate-800 text-sm sm:text-base mr-auto min-w-0 truncate"><i class="fa-solid fa-file-image text-blue-500 mr-2"></i>${esc(title)}</div>
                               <div class="flex items-center gap-1 bg-slate-100 rounded-xl px-1 py-0.5">
                                   <button type="button" onclick="pcFvZoom(-20)" class="w-7 h-7 rounded-lg hover:bg-white text-slate-600" title="ย่อ"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                                   <button type="button" onclick="pcFvZoom(0)" id="pc-fv-zoom" class="px-1.5 h-7 rounded-lg hover:bg-white text-[11px] font-bold text-slate-600" title="สลับระหว่างพอดีความกว้าง (100%) กับ 60%">${FV.zoom}%</button>
                                   <button type="button" onclick="pcFvZoom(20)" class="w-7 h-7 rounded-lg hover:bg-white text-slate-600" title="ขยาย"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                               </div>
                               ${fvBtn(`shareFinalDoc('${idq}')`, '#f59e0b', 'fa-share-nodes', 'แชร์')}
                               ${fvBtn(`downloadFinalDoc('${idq}')`, '#3b82f6', 'fa-download', 'รูปภาพ')}
                               ${fvBtn(`printFinalDoc('${idq}')`, '#10b981', 'fa-print', 'พิมพ์')}
                               ${fvBtn(`exportFinalPdf('${idq}')`, '#f43f5e', 'fa-file-pdf', 'PDF')}
                               ${doc.originalFile ? fvBtn(`viewOriginalDocument('${idq}', true)`, '#334155', 'fa-file-lines', 'ไฟล์ต้นฉบับ') : ''}
                               ${nAtt ? fvBtn(`previewAttachments('${idq}')`, '#8b5cf6', 'fa-paperclip', 'ไฟล์แนบ (' + nAtt + ')') : ''}
                               ${done ? fvBtn(`showSignatureTimeline('${idq}')`, '#059669', 'fa-comments', 'ความเห็น') : ''}
                           </div>
                           <div class="pc-fv-body"><div class="p-2 sm:p-5"><img id="pc-fv-img" class="pc-fv-img" style="width:${FV.zoom}%" src="${esc(pcViewImg(doc))}" alt="หนังสือ"></div></div>`
                }));
            }
            function openFullDoc(docId, kind) {
                const doc = findDoc(docId);
                if (!doc || !doc.currentImage) return Swal.fire('แจ้งเตือน', 'ไม่พบไฟล์หนังสือหรือยังไม่ได้อัปโหลด', 'warning');
                const go = () => { renderFullDoc(doc, kind); warmViewer(doc); };
                if (needsHydrate(doc, 'image')) return hydrateDoc(doc, 'image').then(ok => (ok ? go() : undefined));
                return go();
            }
            window.viewMainDocument = function (docId) { return openFullDoc(docId, 'main'); };
            window.viewFinalDocument = function (docId) { return openFullDoc(docId, 'final'); };

            async function renderOriginalFull(doc, fromViewer) {
                pcVzReset();   // [v47] 60% บนคอมพิวเตอร์
                const file = doc.originalFile;
                const idq = jsq(doc.id);
                Swal.fire(Object.assign({}, FULL_SWAL, {
                    html: `<div class="pc-fv-head">
                               ${fromViewer ? fvBtn(`viewMainDocument('${idq}')`, '#64748b', 'fa-arrow-left', 'หนังสือฉบับเต็ม') : ''}
                               <div class="font-bold text-slate-800 text-sm sm:text-base mr-auto min-w-0 truncate"><i class="fa-solid fa-file-pdf text-rose-500 mr-2"></i>${esc(file.name || 'ไฟล์ต้นฉบับ')}</div>
                               ${pcVzControls()}
                               <a href="${esc(file.content)}" download="${esc(file.name || 'original')}" class="pc-fv-btn" style="background:#2563eb"><i class="fa-solid fa-download"></i><span class="hidden sm:inline">ดาวน์โหลด</span></a>
                               ${fvBtn(`printOriginalDocument('${idq}')`, '#10b981', 'fa-print', 'พิมพ์')}
                           </div>
                           <div id="pdf-scroll-container" class="pc-fv-body" style="display:flex;flex-direction:column;align-items:safe center;gap:14px;padding:14px;">
                               <div id="pdf-loading-text" class="text-sm font-bold text-slate-600 my-auto flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin-pulse"></i> กำลังโหลดหน้าเอกสาร...</div>
                           </div>`
                }));
                pcVzApply();
                const box = document.getElementById('pdf-scroll-container');
                if (!box) return;
                const type = String(file.type || '');
                if (type.indexOf('image') !== -1 || /^data:image\//.test(String(file.content || ''))) {
                    box.innerHTML = `<img src="${esc(file.content)}" class="pc-fv-img pc-vz">`;
                    return;
                }
                try {
                    const b64 = String(file.content || '').split(',')[1] || '';
                    const bin = atob(b64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    await PCLib.load('pdfjs'); const pdf = await pdfjsLib.getDocument(bytes).promise;
                    box.innerHTML = '';
                    const cssW = Math.min(1100, Math.max(320, box.clientWidth - 28));
                    for (let p = 1; p <= pdf.numPages; p++) {
                        const page = await pdf.getPage(p);
                        const v1 = page.getViewport({ scale: 1 });
                        const scale = Math.min(3, (cssW / v1.width) * Math.min(2, window.devicePixelRatio || 1.5));
                        const vp = page.getViewport({ scale: scale });
                        const cv = document.createElement('canvas');
                        cv.width = vp.width; cv.height = vp.height;
                        cv.className = 'bg-white rounded shadow-lg shrink-0 pc-vz';   // [v47] ความกว้างคุมด้วย --vz
                        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
                        if (!document.body.contains(box)) return;          // ผู้ใช้ปิดหน้าต่างไปแล้ว
                        box.appendChild(cv);
                    }
                } catch (e) {
                    box.innerHTML = `<div class="my-auto text-center p-4"><p class="text-rose-600 font-bold mb-2">ไม่สามารถแสดงไฟล์ PDF บนอุปกรณ์นี้ได้</p>
                        <a href="${esc(file.content)}" target="_blank" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold inline-block">เปิดในแท็บใหม่แทน</a></div>`;
                }
            }
            window.viewOriginalDocument = function (docId, fromViewer) {
                const doc = findDoc(docId);
                if (!doc || !doc.originalFile) return Swal.fire('แจ้งเตือน', 'ไม่พบไฟล์ต้นฉบับ', 'warning');
                const go = () => renderOriginalFull(doc, !!fromViewer);
                if (needsHydrate(doc, 'original')) return hydrateDoc(doc, 'original').then(ok => (ok ? go() : undefined));
                return go();
            };

            /* ---------------------------------------------------------------
               [ข้อ 11–13] dropdown checkbox + ค้นหา + สีตามกลุ่ม
                 ปิดอยู่ = ปุ่มเดียวแสดงชิปที่เลือก (ไม่ยืดยาว) , กดเปิด = ช่องค้นหา + รายการจัดกลุ่ม
               --------------------------------------------------------------- */
            const PALETTE = [
                { bg: '#ede9fe', fg: '#5b21b6', bd: '#ddd6fe' }, { bg: '#dbeafe', fg: '#1e40af', bd: '#bfdbfe' },
                { bg: '#dcfce7', fg: '#166534', bd: '#bbf7d0' }, { bg: '#fef3c7', fg: '#92400e', bd: '#fde68a' },
                { bg: '#ffe4e6', fg: '#9f1239', bd: '#fecdd3' }, { bg: '#cffafe', fg: '#155e75', bd: '#a5f3fc' },
                { bg: '#fae8ff', fg: '#86198f', bd: '#f5d0fe' }, { bg: '#e0e7ff', fg: '#3730a3', bd: '#c7d2fe' },
                { bg: '#ecfccb', fg: '#3f6212', bd: '#d9f99d' }, { bg: '#ffedd5', fg: '#9a3412', bd: '#fed7aa' }
            ];
            const GREY = { bg: '#f1f5f9', fg: '#334155', bd: '#e2e8f0' };
            const CDD = {};            // id -> { groups:[{key,label,tone,items:[{v,label,hint,s}]}], sel:Set, order:[], open, q, ...opts }
            PC.CDD = CDD;

            function cddChosen(id) {
                const s = CDD[id];
                if (!s) return [];
                const map = new Map();
                s.groups.forEach(g => g.items.forEach(it => { if (!map.has(it.v)) map.set(it.v, { it: it, g: g }); }));
                return s.order.filter(v => s.sel.has(v) && map.has(v)).map(v => map.get(v));
            }
            function cddButtonHtml(id) {
                const s = CDD[id];
                const chosen = cddChosen(id);
                const MAX = s.maxChips || 4;
                const chips = chosen.slice(0, MAX).map(({ it, g }) =>
                    `<span class="pc-cdd-chip" style="background:${g.tone.bg};color:${g.tone.fg};border-color:${g.tone.bd}" title="${esc(it.label)}">${esc(it.label)}</span>`).join('') +
                    (chosen.length > MAX ? `<span class="pc-cdd-chip" style="background:#f1f5f9;color:#475569;border-color:#e2e8f0">+${chosen.length - MAX}</span>` : '');
                return `<button type="button" class="pc-cdd-btn" onclick="pcCdd.toggle('${id}')">
                            <i class="fa-solid ${s.icon || 'fa-list-check'} text-slate-400 text-xs shrink-0"></i>
                            <div class="flex-1 min-w-0 flex flex-wrap gap-1">${chosen.length ? chips : `<span class="text-[11px] text-slate-400 py-0.5">${esc(s.placeholder || 'เลือก…')}</span>`}</div>
                            <span class="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shrink-0" style="background:${s.accent || '#7c3aed'}">${chosen.length}</span>
                            <i class="fa-solid fa-chevron-down text-slate-400 text-[10px] shrink-0 transition-transform" style="${s.open ? 'transform:rotate(180deg)' : ''}"></i>
                        </button>`;
            }
            function cddPanelHtml(id) {
                const s = CDD[id];
                const groupsHtml = s.groups.map((g, gi) => {
                    const all = g.items.length && g.items.every(it => s.sel.has(it.v));
                    return `<div class="pc-cdd-group" data-g="${gi}">
                        ${s.flat ? '' : `<label class="pc-cdd-ghead" style="background:${g.tone.bg};color:${g.tone.fg}">
                            <input type="checkbox" data-g="${gi}" ${all ? 'checked' : ''} onchange="pcCdd.group('${id}', ${gi}, this.checked)">
                            <span class="truncate">${esc(g.label)}</span><span class="ml-auto text-[10px] font-bold opacity-70">${g.items.length}</span></label>`}
                        ${g.items.map((it, ii) => `
                            <label class="pc-cdd-row" data-s="${esc(it.s)}">
                                <input type="checkbox" data-g="${gi}" data-i="${ii}" ${s.sel.has(it.v) ? 'checked' : ''} onchange="pcCdd.item('${id}', ${gi}, ${ii}, this.checked)">
                                <span class="flex-1 min-w-0 leading-tight"><span class="font-bold text-slate-800">${esc(it.label)}</span>${it.hint ? `<span class="block text-[10px] text-slate-500 truncate">${esc(it.hint)}</span>` : ''}</span>
                                ${s.removable ? `<button type="button" title="ลบข้อสั่งการนี้" onclick="event.preventDefault(); event.stopPropagation(); pcCdd.remove('${id}', ${gi}, ${ii})" class="w-6 h-6 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 shrink-0"><i class="fa-solid fa-xmark text-[11px]"></i></button>` : ''}
                            </label>`).join('')}
                    </div>`;
                }).join('');
                const empty = !s.groups.some(g => g.items.length);
                return `<div class="pc-cdd-panel">
                        <div class="p-2 border-b border-slate-100 flex items-center gap-1.5">
                            <div class="relative flex-1">
                                <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]"></i>
                                <input type="text" class="pc-cdd-q w-full pl-7 pr-2 py-1.5 text-[11px] border rounded-lg bg-slate-50 outline-none focus:ring-1 focus:ring-purple-500" placeholder="${esc(s.searchPlaceholder || 'ค้นหา…')}" value="${esc(s.q || '')}" oninput="pcCdd.search('${id}', this.value)">
                            </div>
                            <button type="button" onclick="pcCdd.all('${id}', true)" class="px-2 py-1.5 text-[10px] font-bold rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 whitespace-nowrap">เลือกที่เห็น</button>
                            <button type="button" onclick="pcCdd.all('${id}', false)" class="px-2 py-1.5 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200">ล้าง</button>
                        </div>
                        <div class="pc-cdd-list">${empty ? `<div class="p-4 text-center text-[11px] text-slate-400">${esc(s.emptyText || 'ไม่มีรายการ')}</div>` : groupsHtml}</div>
                        ${s.addable ? `<div class="p-2 border-t border-slate-100 flex gap-1.5">
                            <input type="text" class="pc-cdd-new flex-1 px-2 py-1.5 text-[11px] border rounded-lg outline-none focus:ring-1 focus:ring-purple-500" placeholder="${esc(s.addPlaceholder || 'เพิ่มรายการใหม่…')}" onkeydown="if(event.key==='Enter'){event.preventDefault();pcCdd.add('${id}', this.value)}">
                            <button type="button" onclick="pcCdd.add('${id}', this.previousElementSibling.value)" class="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-700"><i class="fa-solid fa-plus"></i> เพิ่ม</button>
                        </div>` : ''}
                        <div class="px-2.5 py-1.5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                            <span class="text-[10px] font-bold text-slate-500">เลือกแล้ว <span class="pc-cdd-n">${s.sel.size}</span> ${esc(s.unit || 'รายการ')}</span>
                            <button type="button" onclick="pcCdd.close('${id}')" class="px-3 py-1 text-[10px] font-bold rounded-lg text-white" style="background:${s.accent || '#7c3aed'}"><i class="fa-solid fa-check"></i> เสร็จสิ้น</button>
                        </div>
                    </div>`;
            }
            function cddRender(id, keepPanel) {
                const s = CDD[id];
                const box = document.getElementById(id);
                if (!s || !box) return;
                if (!box.querySelector(':scope > .pc-cdd')) box.innerHTML = `<div class="pc-cdd"><div class="pc-cdd-bw"></div><div class="pc-cdd-pw"></div></div>`;
                const root = box.querySelector(':scope > .pc-cdd');
                root.classList.toggle('open', !!s.open);
                root.querySelector('.pc-cdd-bw').innerHTML = cddButtonHtml(id);
                if (!keepPanel) {
                    root.querySelector('.pc-cdd-pw').innerHTML = s.open ? cddPanelHtml(id) : '';
                    if (s.open && s.q) cddApplySearch(id);
                } else {
                    const n = root.querySelector('.pc-cdd-n');
                    if (n) n.innerText = s.sel.size;
                    root.querySelectorAll('.pc-cdd-ghead input[data-g]').forEach(cb => {
                        const g = s.groups[Number(cb.dataset.g)];
                        cb.checked = !!(g && g.items.length && g.items.every(it => s.sel.has(it.v)));
                    });
                    root.querySelectorAll('.pc-cdd-row input[data-i]').forEach(cb => {
                        const g = s.groups[Number(cb.dataset.g)];
                        const it = g && g.items[Number(cb.dataset.i)];
                        if (it) cb.checked = s.sel.has(it.v);
                    });
                }
            }
            function cddApplySearch(id) {
                const s = CDD[id];
                const root = document.querySelector('#' + id + ' .pc-cdd');
                if (!s || !root) return;
                const q = normQ(s.q);
                root.querySelectorAll('.pc-cdd-group').forEach(g => {
                    let shown = 0;
                    g.querySelectorAll('.pc-cdd-row').forEach(r => {
                        const hit = !q || String(r.dataset.s || '').includes(q);
                        r.classList.toggle('hidden', !hit);
                        if (hit) shown++;
                    });
                    g.classList.toggle('hidden', shown === 0);
                });
            }
            function cddChanged(id) {
                const s = CDD[id];
                cddRender(id, true);
                if (s && typeof s.onChange === 'function') { try { s.onChange(); } catch (e) { console.warn('[v23] cdd', e.message); } }
            }
            function cddSet(id, v, on) {
                const s = CDD[id];
                if (on) { if (!s.sel.has(v)) { s.sel.add(v); s.order.push(v); } }
                else { s.sel.delete(v); s.order = s.order.filter(x => x !== v); }
            }
            window.pcCdd = {
                toggle(id) { const s = CDD[id]; if (!s) return; Object.keys(CDD).forEach(k => { if (k !== id && CDD[k].open) { CDD[k].open = false; cddRender(k); } }); s.open = !s.open; cddRender(id); if (s.open) setTimeout(() => document.querySelector('#' + id + ' .pc-cdd-q')?.focus(), 30); },
                close(id) { const s = CDD[id]; if (!s) return; s.open = false; cddRender(id); },
                search(id, v) { const s = CDD[id]; if (!s) return; s.q = v || ''; cddApplySearch(id); },
                item(id, gi, ii, on) { const s = CDD[id]; const it = s && s.groups[gi] && s.groups[gi].items[ii]; if (!it) return; cddSet(id, it.v, on); cddChanged(id); },
                group(id, gi, on) {
                    const s = CDD[id]; const g = s && s.groups[gi]; if (!g) return;
                    const root = document.querySelector('#' + id + ' .pc-cdd');
                    g.items.forEach((it, ii) => {
                        const row = root && root.querySelector(`.pc-cdd-row input[data-g="${gi}"][data-i="${ii}"]`);
                        if (row && row.closest('.pc-cdd-row').classList.contains('hidden')) return;   // เลือกเฉพาะที่ตรงคำค้น
                        cddSet(id, it.v, on);
                        if (row) row.checked = on;
                    });
                    cddChanged(id);
                },
                all(id, on) {
                    const s = CDD[id]; if (!s) return;
                    const root = document.querySelector('#' + id + ' .pc-cdd');
                    s.groups.forEach((g, gi) => g.items.forEach((it, ii) => {
                        const row = root && root.querySelector(`.pc-cdd-row input[data-g="${gi}"][data-i="${ii}"]`);
                        if (on && row && row.closest('.pc-cdd-row').classList.contains('hidden')) return;
                        cddSet(id, it.v, on);
                        if (row) row.checked = on;
                    }));
                    cddChanged(id);
                },
                add(id, v) { const s = CDD[id]; if (s && typeof s.onAdd === 'function') s.onAdd(String(v || '').trim()); },
                remove(id, gi, ii) { const s = CDD[id]; const it = s && s.groups[gi] && s.groups[gi].items[ii]; if (it && typeof s.onRemove === 'function') s.onRemove(it.v); }
            };
            // คลิกนอก dropdown -> พับเก็บ (เหลือชิปที่เลือก)
            document.addEventListener('mousedown', (e) => {
                Object.keys(CDD).forEach(id => {
                    const s = CDD[id];
                    if (!s.open) return;
                    const box = document.getElementById(id);
                    if (box && !box.contains(e.target)) { s.open = false; cddRender(id); }
                });
            });
            function cddMount(id, cfg, keepSelection) {
                const prev = CDD[id];
                const s = Object.assign({ open: false, q: '' }, cfg);
                s.sel = new Set(); s.order = [];
                const valid = new Set();
                s.groups.forEach(g => g.items.forEach(it => valid.add(it.v)));
                if (keepSelection && prev) prev.order.forEach(v => { if (prev.sel.has(v) && valid.has(v)) { s.sel.add(v); s.order.push(v); } });
                if (prev) { s.open = prev.open; s.q = prev.q; }
                CDD[id] = s;
                cddRender(id);
                return s;
            }

            // ----- มอบหมายผู้รับผิดชอบ : จัดกลุ่มตามกลุ่มสาระการเรียนรู้ (subjectGroup) -----
            window.renderAssigneeCheckboxList = function (containerId) {
                containerId = containerId || 'assignee-picker-assistantgroup';
                const users = (PC.users || []).filter(u => u && u.id && u.active !== false);
                const NONE = 'ไม่ระบุกลุ่มสาระการเรียนรู้';
                const by = {};
                users.forEach(u => { const k = String(u.subjectGroup || '').trim() || NONE; (by[k] = by[k] || []).push(u); });
                const keys = Object.keys(by).sort((a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b, 'th'));
                const groups = keys.map((k, i) => ({
                    key: k, label: k, tone: k === NONE ? GREY : PALETTE[i % PALETTE.length],
                    items: by[k].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'th')).map(u => {
                        const gs = (Array.isArray(u.groups) && u.groups.length) ? u.groups : (u.group ? [u.group] : []);
                        const hint = [u.position, gs.join(', ')].filter(Boolean).join(' · ');
                        return { v: String(u.id), label: u.name || u.id, hint: hint, s: normQ([u.name, u.id, u.position, u.subjectGroup, gs.join(' ')].join(' ')) };
                    })
                }));
                cddMount(containerId, {
                    groups: groups, icon: 'fa-users', accent: '#7c3aed', unit: 'คน',
                    placeholder: users.length ? 'แตะเพื่อเลือกผู้รับผิดชอบ (เลือกได้หลายคน)' : 'ยังไม่มีรายชื่อ — กด "โหลดรายชื่อ"',
                    searchPlaceholder: 'ค้นหาชื่อ / ตำแหน่ง / กลุ่มสาระ…', emptyText: 'ยังไม่มีรายชื่อผู้ใช้งาน',
                    onChange: () => window.updateAssistantComment()
                }, true);
            };
            window.getSelectedAssignees = function (containerId) {
                const id = containerId || 'assignee-picker-assistantgroup';
                if (CDD[id]) return cddChosen(id).map(({ it }) => ({ id: it.v, name: it.label }));
                const box = document.getElementById(id);
                if (!box) return [];
                return Array.from(box.querySelectorAll('input[type=checkbox][data-uid]:checked')).map(x => ({ id: x.dataset.uid, name: x.dataset.name }));
            };
            window.updateAssigneeCount = function () { /* แทนด้วยตัวนับใน dropdown */ };

            // ----- ข้อสั่งการด่วน -----
            const CMD_DEFAULT = ['ดำเนินการ', 'แจ้งผู้เกี่ยวข้องทราบ', 'ดำเนินการตามที่เสนอ', 'รายงานผลให้ทราบ', 'ประชาสัมพันธ์ให้ทราบโดยทั่วกัน'];
            const cmdList = () => {
                let cmds = [];
                try { cmds = JSON.parse(localStorage.getItem('assistantCmds') || '[]'); } catch (e) { cmds = []; }
                if (!Array.isArray(cmds) || !cmds.length) cmds = CMD_DEFAULT.slice();
                return cmds.map(c => String(c).trim()).filter((c, i, a) => c && a.indexOf(c) === i);
            };
            const saveCmds = (cmds) => { try { localStorage.setItem('assistantCmds', JSON.stringify(cmds)); } catch (e) { /* ข้าม */ } };
            window.loadAssistantCommands = function () {
                const cmds = cmdList();
                const dl = document.getElementById('assistant-cmd-datalist');
                if (dl) dl.innerHTML = cmds.map(c => `<option value="${esc(c)}">`).join('');
                if (!document.getElementById('assistant-cmd-picker')) return;
                cddMount('assistant-cmd-picker', {
                    flat: true, removable: true, addable: true, icon: 'fa-bolt', accent: '#d97706', unit: 'ข้อ',
                    groups: [{ key: 'cmd', label: 'ข้อสั่งการ', tone: { bg: '#fef3c7', fg: '#92400e', bd: '#fde68a' }, items: cmds.map(c => ({ v: c, label: c, hint: '', s: normQ(c) })) }],
                    placeholder: 'แตะเพื่อเลือกข้อสั่งการ (เลือกได้หลายข้อ)', searchPlaceholder: 'ค้นหาข้อสั่งการ…', addPlaceholder: 'พิมพ์ข้อสั่งการใหม่ แล้วกด Enter',
                    emptyText: 'ยังไม่มีข้อสั่งการ — เพิ่มได้ด้านล่าง', maxChips: 3,
                    onChange: () => window.updateAssistantComment(),
                    onAdd: (v) => {
                        if (!v) return;
                        const list = cmdList();
                        if (!list.includes(v)) { list.push(v); saveCmds(list); }
                        const s = CDD['assistant-cmd-picker'];
                        if (s) cddSet('assistant-cmd-picker', v, true);
                        window.loadAssistantCommands();
                        window.updateAssistantComment();
                    },
                    onRemove: (v) => {
                        Swal.fire({ icon: 'question', title: 'ลบข้อสั่งการนี้?', text: v, showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#e11d48' }).then(r => {
                            if (!r.isConfirmed) return;
                            saveCmds(cmdList().filter(c => c !== v));
                            window.loadAssistantCommands();
                            window.updateAssistantComment();
                        });
                    }
                }, true);
            };
            window.setAssistantCommand = function (cmd) {       // รองรับโค้ดเดิม
                if (!CDD['assistant-cmd-picker']) window.loadAssistantCommands();
                cddSet('assistant-cmd-picker', String(cmd), true);
                cddChanged('assistant-cmd-picker');
            };
            window.addCustomAssistantCommand = function () {
                const v = (document.getElementById('custom-assistant-cmd')?.value || '').trim();
                if (v && CDD['assistant-cmd-picker']) CDD['assistant-cmd-picker'].onAdd(v);
            };

            // ----- ความเห็นผู้ช่วยกลุ่ม = บรรทัดที่พิมพ์เอง + ข้อสั่งการที่เลือก + รายชื่อผู้รับผิดชอบ -----
            const ASG_BASE = 'ทราบ/ มอบ';
            window.updateAssistantComment = function () {
                const ta = document.getElementById('assistantgroup-comment');
                if (!ta) return;
                const allCmds = new Set(cmdList());
                const chosenCmds = CDD['assistant-cmd-picker'] ? cddChosen('assistant-cmd-picker').map(x => x.it.v) : [];
                chosenCmds.forEach(c => allCmds.add(c));
                const names = window.getSelectedAssignees('assignee-picker-assistantgroup').map(p => p.name);
                const keep = String(ta.value || '').split('\n').filter(l => {
                    const t = l.trim();
                    if (t.indexOf('- มอบหมาย:') === 0) return false;
                    if (t.indexOf('- ') === 0 && allCmds.has(t.substring(2).trim())) return false;
                    return true;
                });
                const base = keep.join('\n').trim() || ASG_BASE;
                ta.value = [base].concat(chosenCmds.map(c => '- ' + c)).concat(names.length ? ['- มอบหมาย: ' + names.join(', ')] : []).join('\n');
            };
            window.resetAssistantComment = function () {
                ['assistant-cmd-picker', 'assignee-picker-assistantgroup'].forEach(id => {
                    const s = CDD[id];
                    if (s) { s.sel.clear(); s.order = []; cddRender(id); }
                });
                const ta = document.getElementById('assistantgroup-comment');
                if (ta) ta.value = ASG_BASE;
            };
            /** เลือกหนังสือใหม่ในขั้นตอน ผช.กลุ่ม -> ล้างตัวเลือก (หรือคืนรายชื่อเดิมถ้าเคยมอบหมายไว้) */
            function resetAssistantPickersForDoc(doc) {
                if (!document.getElementById('assignee-picker-assistantgroup')) return;
                if (!CDD['assignee-picker-assistantgroup']) window.renderAssigneeCheckboxList('assignee-picker-assistantgroup');
                if (!CDD['assistant-cmd-picker']) window.loadAssistantCommands();
                ['assistant-cmd-picker', 'assignee-picker-assistantgroup'].forEach(id => { const s = CDD[id]; if (s) { s.sel.clear(); s.order = []; s.open = false; } });
                const ids = doc && Number(doc.stage) === 7 ? idsOf(doc) : [];
                ids.forEach(v => cddSet('assignee-picker-assistantgroup', v, true));
                cddRender('assistant-cmd-picker');
                cddRender('assignee-picker-assistantgroup');
                const ta = document.getElementById('assistantgroup-comment');
                if (ta) ta.value = ASG_BASE;
                window.updateAssistantComment();
            }

            // [v25] เปิดให้ส่วนอื่นใช้ dropdown checkbox ชุดเดียวกัน (ข้อสั่งการ ผอ./รอง , แจ้งถึง , แชร์ปฏิทิน/งาน)
            PC.cdd = { mount: cddMount, chosen: cddChosen, set: cddSet, render: cddRender, changed: cddChanged, PALETTE: PALETTE, GREY: GREY };
            try { window.loadAssistantCommands(); } catch (e) { /* ข้าม */ }
        })();



        /* ============================================================================
           v24 (25 ก.ย. 2569) : ชุดปรับปรุง 14 ข้อ
             1  ดูตัวอย่างเอกสารแนบ แบบเต็มจอ              8  กำหนดงาน : วันนี้/เดือนนี้/ปีนี้/ย้อนหลัง + ค้นหา
             2  โมดอลเปลี่ยนรหัสผ่าน กว้างพอดีข้อความ         9  ปฏิทิน : กดการ์ด -> รายละเอียดกิจกรรม/งานครบกำหนด
             3  กำหนดงาน : เพิ่ม/ลบ แท็บย่อยเองได้            10 ส่งออก Excel/Print/Copy : กำหนดงาน , กำหนดการ , งานของฉัน
             4  สีเมื่อชี้เมาส์ที่แท็บ                       11 พิมพ์ปฏิทินภาคเรียน PDF/Excel/CSV/Print
             5  เวลาใต้วันที่ในโมดอลความเห็น                 12 login หมดเวลา -> ลองใหม่อัตโนมัติ
             6  ชื่อธุรการที่ลงรับ บนการ์ดทะเบียน              13 ออกจากระบบแล้วเสียงแจ้งเตือนหยุด
             7  ส่วนหัวโมดอลเพิ่มงาน                        14 งานและกิจกรรม จัดกลุ่มตามกลุ่มบริหาร (เรื่องล่าสุด + ที่เหลือพับเก็บ)
           ============================================================================ */
        (function v24() {
            const myId = () => (state.user && state.user.id) ? String(state.user.id) : '';
            const clean = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const pad2 = (n) => String(n).padStart(2, '0');
            const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
            const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
            const thDate = (s, long) => { const d = parseYmd(s); return d ? d.getDate() + ' ' + (long ? TH_M : TH_MS)[d.getMonth()] + ' ' + (d.getFullYear() + 543) : String(s || ''); };
            const FULL_SWAL = { showConfirmButton: false, showCloseButton: true, width: '100%', padding: 0, customClass: { popup: 'pc-full-modal', container: 'pc-full-container' } };

            /* ---------------------------------------------------------------
               ตัวช่วยส่งออก : คัดลอก (วางใน Excel/Word ได้) / Excel / CSV / พิมพ์
               --------------------------------------------------------------- */
            function exportTable(kind, title, header, rows, opt) {
                opt = opt || {};
                const safe = String(title || 'รายงาน').replace(/[\\/:*?"<>|]/g, ' ').trim();
                if (!rows.length) { toast('info', 'ไม่มีข้อมูลสำหรับส่งออก'); return; }
                if (kind === 'copy') {
                    const text = [header].concat(rows).map(r => r.map(c => String(c === undefined || c === null ? '' : c).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
                    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
                        () => toast('success', 'คัดลอก ' + rows.length + ' รายการแล้ว (วางใน Excel/Word ได้ทันที)'),
                        () => Swal.fire('คัดลอกไม่สำเร็จ', 'เบราว์เซอร์ไม่อนุญาตให้คัดลอก กรุณาใช้ปุ่ม Excel แทน', 'warning'));
                    return;
                }
                if (kind === 'excel') {
                    if (typeof XLSX === 'undefined') { PCLib.load('xlsx').then(() => exportTable(kind, title, header, rows, opt), (e) => Swal.fire('ส่งออกไม่ได้', e.message, 'error')); return; }   // [v46] โหลดไลบรารี Excel เมื่อต้องใช้
                    const ws = XLSX.utils.aoa_to_sheet([[title], []].concat([header]).concat(rows));
                    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
                    ws['!cols'] = header.map((h, i) => ({ wch: (opt.widths && opt.widths[i]) || Math.max(10, String(h).length + 4) }));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูล');
                    XLSX.writeFile(wb, safe + '.xlsx');
                    return;
                }
                if (kind === 'csv') {
                    const csv = '﻿' + [header].concat(rows).map(r => r.map(c => '"' + String(c === undefined || c === null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                    a.download = safe + '.csv';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                    return;
                }
                // print
                const w = window.open('', '_blank');
                if (!w) { Swal.fire('แจ้งเตือน', 'กรุณาอนุญาต Pop-up ของเบราว์เซอร์เพื่อพิมพ์', 'warning'); return; }
                w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
                    <link href="https:/\/fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
                    <style>@page{size:A4 ${opt.landscape ? 'landscape' : 'portrait'};margin:12mm}body{font-family:Sarabun,sans-serif;font-size:12px;color:#000}
                    h2{text-align:center;margin:0 0 4px;font-size:16px}.sub{text-align:center;margin-bottom:10px;color:#333}
                    table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:4px 6px;vertical-align:top}th{background:#e2e8f0}
                    tr:nth-child(even) td{background:#f8fafc}</style></head><body>
                    <h2>${esc(title)}</h2><div class="sub">พิมพ์เมื่อ ${esc(new Date().toLocaleString('th-TH'))} · ${rows.length} รายการ</div>
                    <table><thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
                    <script>document.fonts&&document.fonts.ready?document.fonts.ready.then(function(){setTimeout(function(){window.print()},300)}):setTimeout(function(){window.print()},800)<\/script></body></html>`);
                w.document.close();
            }
            PC.exportTable = exportTable;

            /* [ข้อ 10] งานของฉัน */
            PC.exportMyWork = function (kind) {
                const items = PC.myworkLast || [];
                const header = ['ลำดับ', 'เลขรับ', 'ที่', 'ลงวันที่', 'เรื่อง', 'จาก', 'กลุ่มงาน', 'กำหนดส่ง', 'สถานะ', 'วันที่ลงรับ'];
                const rows = items.map((d, i) => [
                    i + 1, d.subgroupReceiveNo || d.groupReceiveNo || d.receiveNo || '-', d.docNo || '', d.docDate || '', d.subject || d.title || '',
                    d.sender || '', (d.subGroups || [])[0] || '', d.deadline ? thDate(d.deadline) : '',
                    Number(d.stage) === 8 ? 'รอลงรับ' : 'ลงรับแล้ว',
                    d.doneAt ? new Date(Number(d.doneAt)).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : ''
                ]);
                exportTable(kind, 'งานของฉัน — ' + (state.user.name || myId()), header, rows, { landscape: true, widths: [6, 10, 16, 14, 50, 30, 26, 14, 10, 20] });
            };

            /* ---------------------------------------------------------------
               [ข้อ 1] ดูตัวอย่างเอกสารแนบ แบบเต็มจอ
               --------------------------------------------------------------- */
            const blobUrls = [];
            function pdfBlobUrl(dataUrl) {
                try {
                    const bin = atob(String(dataUrl).split(',')[1] || '');
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
                    blobUrls.push(u);
                    return u;
                } catch (e) { return dataUrl; }
            }
            /* [v34] ไฟล์แนบโหลดทีละไฟล์เมื่อจะดู (เดิมต้องโหลดครบทุกไฟล์ก่อนจึงเปิดหน้าต่างได้) */
            function attSection(doc, a, i) {
                const idq = jsq(doc.id);
                const type = String(a.type || '');
                const loaded = !(typeof a.content === 'string' && a.content.indexOf('@@') === 0);
                const name = String(a.name || '');
                const isImg = type.indexOf('image') !== -1 || /^data:image\//.test(String(a.content || '')) || /\.(png|jpe?g|gif|webp)$/i.test(name);
                const isPdf = type.indexOf('pdf') !== -1 || /^data:application\/pdf/.test(String(a.content || '')) || /\.pdf$/i.test(name);
                const view = !loaded
                    ? `<button type="button" onclick="PC.loadAttachment('${idq}', ${i})" class="w-full max-w-[1100px] bg-white hover:bg-purple-50 border-2 border-dashed border-purple-200 rounded-xl p-8 text-center text-purple-700 font-bold text-sm transition">
                           <i class="fa-solid fa-cloud-arrow-down text-2xl mb-2 block"></i> แตะเพื่อโหลดและแสดงไฟล์นี้</button>`
                    : isImg ? `<img src="${esc(a.content)}" class="pc-fv-img pc-vz">`
                    : isPdf ? `<iframe src="${esc(pdfBlobUrl(a.content))}" class="w-full bg-white rounded shadow-lg pc-vz" style="height:calc(var(--pc-vh, 100vh) - 150px);border:0"></iframe>`
                    : `<div class="bg-white rounded-xl p-10 text-center text-slate-500 max-w-md"><i class="fa-solid fa-file-circle-xmark text-4xl mb-3"></i><p class="text-sm">ไม่สามารถแสดงตัวอย่างไฟล์ประเภทนี้ได้ กรุณาดาวน์โหลด</p></div>`;
                return `<section id="pc-att-${i}" class="w-full flex flex-col items-center gap-2 mb-6">
                    <div class="w-full max-w-[1100px] flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm">
                        <span class="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><i class="fa-solid ${isPdf ? 'fa-file-pdf' : (isImg ? 'fa-file-image' : 'fa-file')}"></i></span>
                        <span class="font-bold text-sm text-slate-700 truncate mr-auto" title="${esc(a.name)}">${i + 1}. ${esc(a.name || 'ไฟล์แนบ')}</span>
                        ${loaded ? `<button type="button" onclick="printAttachment('${i}', '${idq}')" class="pc-fv-btn" style="background:#10b981"><i class="fa-solid fa-print"></i><span class="hidden sm:inline">พิมพ์</span></button>
                        <a href="${esc(a.content)}" download="${esc(a.name || 'attachment')}" class="pc-fv-btn" style="background:#2563eb"><i class="fa-solid fa-download"></i><span class="hidden sm:inline">ดาวน์โหลด</span></a>`
                        : `<button type="button" onclick="PC.loadAttachment('${idq}', ${i})" class="pc-fv-btn" style="background:#7c3aed"><i class="fa-solid fa-cloud-arrow-down"></i><span class="hidden sm:inline">โหลดไฟล์</span></button>`}
                    </div>
                    ${view}
                </section>`;
            }
            PC.loadAttachment = async function (docId, i) {
                const doc = findDoc(docId);
                const a = doc && Array.isArray(doc.attachments) ? doc.attachments[i] : null;
                const sec = document.getElementById('pc-att-' + i);
                if (!a) return;
                const tok = a.content;
                if (typeof tok === 'string' && tok.indexOf('@@') === 0) {
                    if (sec) { const b = sec.querySelector('button.w-full'); if (b) b.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i> กำลังโหลดไฟล์จาก Google Drive...'; }
                    PC.loadProg.begin('กำลังโหลดไฟล์แนบจาก Google Drive', 1);   // [v39]
                    try {
                        const v = await resolveToken(tok);
                        if (a.content === tok) a.content = v;
                        PC.loadProg.end(true);
                    } catch (e) {
                        PC.loadProg.end(false);
                        if (sec) { const b = sec.querySelector('button.w-full'); if (b) b.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-2xl mb-2 block text-rose-500"></i> โหลดไม่สำเร็จ แตะเพื่อลองใหม่ (' + esc(e.message) + ')'; }
                        return;
                    }
                }
                const now = document.getElementById('pc-att-' + i);
                if (now) now.outerHTML = attSection(doc, a, i);
            };
            function renderAttachmentsFull(doc) {
                pcVzReset();   // [v47] 60% บนคอมพิวเตอร์
                blobUrls.splice(0).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* ข้าม */ } });
                const idq = jsq(doc.id);
                const list = doc.attachments || [];
                const body = list.map((a, i) => attSection(doc, a, i)).join('');
                Swal.fire(Object.assign({}, FULL_SWAL, {
                    html: `<div class="pc-fv-head">
                               <div class="font-bold text-slate-800 text-sm sm:text-base mr-auto min-w-0 truncate"><i class="fa-solid fa-paperclip text-purple-500 mr-2"></i>ไฟล์แนบ ${list.length} ไฟล์ — ${esc(doc.subject || doc.title || '')}</div>
                               ${pcVzControls()}
                               ${doc.currentImage ? `<button type="button" onclick="viewFinalDocument('${idq}')" class="pc-fv-btn" style="background:#059669"><i class="fa-solid fa-file-image"></i><span class="hidden sm:inline">หนังสือฉบับเต็ม</span></button>` : ''}
                           </div>
                           <div class="pc-fv-body" style="padding:14px">${body || '<div class="p-10 text-center text-slate-500">ไม่มีไฟล์แนบ</div>'}</div>`
                }));
            }
            window.previewAttachments = function (docId) {
                const doc = findDoc(docId);
                if (!doc || !Array.isArray(doc.attachments) || !doc.attachments.length) return Swal.fire('แจ้งเตือน', 'หนังสือฉบับนี้ไม่มีไฟล์แนบ', 'info');
                // [v34] เปิดหน้าต่างทันที แล้วโหลดไฟล์แรกให้อัตโนมัติ ไฟล์ที่เหลือโหลดเมื่อแตะ
                renderAttachmentsFull(doc);
                pcVzApply();
                const first = doc.attachments[0];
                if (first && typeof first.content === 'string' && first.content.indexOf('@@') === 0) PC.loadAttachment(doc.id, 0);
            };

            /* ---------------------------------------------------------------
               [ข้อ 6] ชื่อจริงของธุรการที่ลงรับ (หนังสือเก่าที่บันทึกเป็นตำแหน่ง -> หาชื่อจากรายชื่อผู้ใช้)
               --------------------------------------------------------------- */
            const looksLikePerson = (s) => /^(นาย|นาง|นางสาว|น\.ส\.|ว่าที่|ดร\.|ผศ\.|Mr|Mrs|Ms)/.test(String(s || '').trim()) ||
                (!!String(s || '').trim() && !/^(ธุรการ|ผู้ดูแล|เจ้าหน้าที่|ห้อง|กลุ่ม|รอง|ผช|ผอ)/.test(String(s).trim()) && /\s/.test(String(s).trim()));
            window.pcReceiverName = function (doc, kind) {
                const raw = String((kind === 'central' ? doc.adminReceiver : (kind === 'main' ? doc.groupReceiver : doc.subgroupReceiver)) || '').trim();
                if (raw && looksLikePerson(raw)) return raw;
                const users = (PC.users || []).filter(u => u && u.active !== false);
                let hit = null;
                if (kind === 'central') hit = users.find(u => u.role === 'Administrative');
                else {
                    const g = clean(kind === 'main' ? (doc.assignedGroups || [])[0] : (doc.subGroups || [])[0]);
                    if (g) hit = users.find(u => u.role === 'AdminGroup' && [].concat(u.groups || [], u.group ? [u.group] : []).some(x => clean(x) === g));
                }
                return hit ? (hit.name || hit.id) : raw;
            };
            window.pcReceiverChip = function (doc, kind) {
                const n = window.pcReceiverName(doc, kind);
                if (!n) return '';
                return `<span class="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 whitespace-nowrap" title="ธุรการผู้ลงรับ"><i class="fa-solid fa-user-pen"></i> ลงรับโดย ${esc(n)}</span>`;
            };

            /* ---------------------------------------------------------------
               [ข้อ 13] ออกจากระบบ -> หยุดเสียงแจ้งเตือนทุกชนิด + ล้างตัวเลขแจ้งเตือน
               --------------------------------------------------------------- */
            function silenceAll() {
                try { if (typeof stopNotificationSound === 'function') stopNotificationSound(); } catch (e) { /* ข้าม */ }
                try { if (typeof stopCalendarSound === 'function') stopCalendarSound(); } catch (e) { /* ข้าม */ }
                document.querySelectorAll('audio').forEach(a => { try { a.pause(); a.currentTime = 0; a.loop = false; } catch (e) { /* ข้าม */ } });
                ['nav-bell-badge', 'inbox-tab-badge', 'nav-calendar-badge', 'calendar-tab-badge', 'nav-message-badge', 'activities-tab-badge', 'tasks-tab-badge', 'mywork-tab-badge']
                    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
                try { lastInboxCount = 0; } catch (e) { /* ข้าม */ }
                try { lastCalCount = 0; } catch (e) { /* ข้าม */ }
            }
            PC.silenceAll = silenceAll;
            const origEndSession = endSession;
            endSession = function () {
                const r = origEndSession.apply(this, arguments);
                silenceAll();
                // คืนค่า loop ตามการตั้งค่าไว้ให้ผู้ใช้คนถัดไป
                setTimeout(() => { try { loadBellSettings(); loadCalendarSettings(); } catch (e) { /* ข้าม */ } }, 50);
                return r;
            };
            // ระหว่างยังไม่ได้เข้าสู่ระบบ ห้ามเสียงแจ้งเตือนดัง (กันเสียงค้างจากคำขอที่ยังวิ่งอยู่ตอนออกจากระบบ)
            (function () {
                const orig = window.updateNotificationBadges;
                if (typeof orig !== 'function') return;
                window.updateNotificationBadges = function () {
                    if (!PC.token) { silenceAll(); return; }
                    return orig.apply(this, arguments);
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 3] กำหนดงาน : แท็บย่อยที่ผู้ใช้เพิ่ม/ลบ/เปลี่ยนชื่อเองได้ (บันทึกเป็นค่าตั้งค่าส่วนตัว taskLists)
               --------------------------------------------------------------- */
            const FIXED_LISTS = [
                { id: 'mine', name: 'งานของฉัน', icon: 'fa-user' },
                { id: 'subject', name: 'งานกลุ่มสาระ', icon: 'fa-book-open' },
                { id: 'school', name: 'งานโรงเรียน', icon: 'fa-school' },
                { id: 'group', name: 'งานกลุ่มงาน', icon: 'fa-sitemap' }          // [v31 ข้อ 4]
            ];
            const TL_NAME = 'taskLists';
            const tlKey = () => 'u:' + myId() + ':' + TL_NAME;
            const isCustom = (m) => /^c_/.test(String(m || ''));
            function customLists() {
                const s = PC.store && PC.store.settings ? PC.store.settings[tlKey()] : null;
                const v = s && !s.x ? s.value : null;
                return Array.isArray(v) ? v.filter(x => x && isCustom(x.id) && String(x.name || '').trim()) : [];
            }
            async function saveCustomLists(list) {
                if (PC.store) PC.store.settings[tlKey()] = { key: tlKey(), name: TL_NAME, scope: 'user', value: list, x: 0, u: Date.now() };
                renderTaskSubtabs();
                try {
                    await apiWrite('saveSettings', { items: [{ name: TL_NAME, scope: 'user', value: list }] });
                    saveSnapshotSoon();
                } catch (e) { Swal.fire('บันทึกแท็บไม่สำเร็จ', e.message, 'error'); }
            }
            function subtabClass(on) {
                return on ? 'task-subtab relative px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm'
                    : 'task-subtab relative px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm bg-white text-slate-600 border border-slate-200';
            }
            function renderTaskSubtabs() {
                const box = document.getElementById('task-subtabs');
                if (!box) return;
                const lists = customLists();
                if (isCustom(taskListMode) && !lists.some(l => l.id === taskListMode)) taskListMode = 'mine';
                FIXED_LISTS.forEach(f => {
                    const b = document.getElementById('tasktab-' + f.id);
                    if (!b) return;
                    const on = taskListMode === f.id;
                    b.className = subtabClass(on);
                    if (on) b.setAttribute('style', 'background:#c7d2fe;color:#1e1b4b;'); else b.removeAttribute('style');
                });
                box.querySelectorAll('.pc-custom-tl, .pc-add-tl').forEach(el => el.remove());
                lists.forEach(l => {
                    const on = taskListMode === l.id;
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.id = 'tasktab-' + l.id;
                    b.className = subtabClass(on) + ' pc-custom-tl pr-12';
                    if (on) b.setAttribute('style', 'background:#c7d2fe;color:#1e1b4b;');
                    b.onclick = () => window.switchTaskList(l.id);
                    b.innerHTML = `<i class="fa-solid fa-folder mr-1"></i> ${esc(l.name)}
                        <span class="pc-tl-x absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                            <span role="button" title="เปลี่ยนชื่อแท็บ" onclick="event.stopPropagation(); pcRenameTaskList('${jsq(l.id)}')" class="w-5 h-5 rounded-md hover:bg-white/70 flex items-center justify-center text-slate-500"><i class="fa-solid fa-pen text-[9px]"></i></span>
                            <span role="button" title="ลบแท็บ" onclick="event.stopPropagation(); pcDeleteTaskList('${jsq(l.id)}')" class="w-5 h-5 rounded-md hover:bg-rose-100 flex items-center justify-center text-rose-500"><i class="fa-solid fa-xmark text-[10px]"></i></span>
                        </span>`;
                    box.appendChild(b);
                });
                const add = document.createElement('button');
                add.type = 'button';
                add.className = 'task-subtab pc-add-tl px-3 py-2 rounded-xl text-xs font-bold transition bg-white text-indigo-600 border-2 border-dashed border-indigo-200 hover:bg-indigo-50';
                add.innerHTML = '<i class="fa-solid fa-plus mr-1"></i> เพิ่มแท็บ';
                add.onclick = () => window.pcAddTaskList();
                box.appendChild(add);
            }
            PC.renderTaskSubtabs = renderTaskSubtabs;

            window.pcAddTaskList = async function () {
                const r = await Swal.fire({
                    title: 'เพิ่มแท็บย่อยใหม่', input: 'text', inputPlaceholder: 'เช่น งานโครงการ, งานประจำชั้น',
                    inputAttributes: { maxlength: 40 }, showCancelButton: true, confirmButtonText: 'เพิ่มแท็บ', cancelButtonText: 'ยกเลิก',
                    inputValidator: (v) => {
                        const n = String(v || '').trim();
                        if (!n) return 'กรุณาตั้งชื่อแท็บ';
                        if (FIXED_LISTS.concat(customLists()).some(x => x.name === n)) return 'มีแท็บชื่อนี้อยู่แล้ว';
                        return undefined;
                    }
                });
                if (!r.isConfirmed) return;
                const id = 'c_' + Date.now().toString(36);
                await saveCustomLists(customLists().concat([{ id: id, name: String(r.value).trim().substring(0, 40) }]));
                window.switchTaskList(id);
            };
            window.pcRenameTaskList = async function (id) {
                const cur = customLists().find(x => x.id === id);
                if (!cur) return;
                const r = await Swal.fire({ title: 'เปลี่ยนชื่อแท็บ', input: 'text', inputValue: cur.name, inputAttributes: { maxlength: 40 }, showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', inputValidator: (v) => (!String(v || '').trim() ? 'กรุณาตั้งชื่อแท็บ' : undefined) });
                if (!r.isConfirmed) return;
                await saveCustomLists(customLists().map(x => (x.id === id ? { id: id, name: String(r.value).trim().substring(0, 40) } : x)));
            };
            window.pcDeleteTaskList = async function (id) {
                const cur = customLists().find(x => x.id === id);
                if (!cur) return;
                const inList = (state.tasks || []).filter(t => t.listType === id && String(t.ownerId) === myId());
                const r = await Swal.fire({
                    icon: 'warning', title: 'ลบแท็บ "' + esc(cur.name) + '" ?',
                    html: inList.length ? `<div class="text-sm">งานในแท็บนี้ ${inList.length} รายการจะถูกย้ายไป <b>งานของฉัน</b></div>` : '<div class="text-sm">แท็บนี้ยังไม่มีงาน</div>',
                    showCancelButton: true, confirmButtonText: 'ลบแท็บ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#e11d48'
                });
                if (!r.isConfirmed) return;
                if (taskListMode === id) taskListMode = 'mine';
                await saveCustomLists(customLists().filter(x => x.id !== id));
                for (const t of inList) {
                    t.listType = 'mine';
                    try { await apiWrite('saveTask', { item: t }); } catch (e) { console.warn('[v24] move task', e.message); }
                }
                renderTasks();
            };

            window.switchTaskList = function (mode) {
                taskListMode = mode || 'mine';
                TF.page = 1;
                renderTaskSubtabs();
                renderTasks();
            };

            /* ---------------------------------------------------------------
               [ข้อ 8] กำหนดงาน : วันนี้ / เดือนนี้ / ปีนี้ / ทั้งหมด / ย้อนหลัง + ค้นหา
                 วันที่ของงาน = วันครบกำหนด (ไม่มีวันครบกำหนด = วันที่สร้างงาน)
               --------------------------------------------------------------- */
            const TF = { period: 'all', year: '', q: '', counts: {}, years: [], page: 1 };
            function taskTime(t) {
                if (t.dueDate) { const d = parseYmd(t.dueDate); if (d) return d.getTime(); }
                const r = PC.store && PC.store.tasks ? PC.store.tasks[t.id] : null;
                return Number(r && r.c) || Number(t.completedAt) || 0;
            }
            function applyTaskFilter(items) {
                const q = normQ(TF.q);
                const base = items.filter(t => !q || normQ([t.title, t.desc, t.ownerName, t.subjectGroup, t.group].join(' ')).includes(q));
                const now = new Date();
                const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate();
                const c = { today: 0, month: 0, year: 0, all: base.length };
                const years = new Set();
                const tag = new Map();
                base.forEach(t => {
                    const ms = taskTime(t);
                    const dt = new Date(ms || Date.now());
                    const inY = !!ms && dt.getFullYear() === y, inM = inY && dt.getMonth() === m, inD = inM && dt.getDate() === dd;
                    if (inY) c.year++;
                    if (inM) c.month++;
                    if (inD) c.today++;
                    if (ms && dt.getFullYear() !== y) years.add(dt.getFullYear());
                    tag.set(t, { inY, inM, inD, y: ms ? dt.getFullYear() : 0 });
                });
                TF.counts = c;
                TF.years = Array.from(years).sort((a, b) => b - a);
                if (TF.year) return base.filter(t => tag.get(t).y === Number(TF.year));
                if (TF.period === 'all') return base;
                return base.filter(t => { const g = tag.get(t); return TF.period === 'today' ? g.inD : (TF.period === 'month' ? g.inM : g.inY); });
            }
            const origTasksForMode = tasksForMode;
            tasksForMode = function (mode) {
                let items;
                if (isCustom(mode)) items = (state.tasks || []).filter(t => t && t.id && t.listType === mode && String(t.ownerId) === myId());
                else {
                    items = origTasksForMode(mode);
                    if (mode === 'mine') items = items.filter(t => !isCustom(t.listType));
                }
                return applyTaskFilter(items);
            };
            window.tasksPeriod = function (p) { TF.period = p || 'all'; TF.year = ''; renderTasks(); };
            window.tasksYear = function (y) { TF.year = String(y || ''); if (!TF.year) TF.period = 'all'; renderTasks(); };
            window.tasksSearch = (function () {
                let t = null;
                return function (v) { clearTimeout(t); t = setTimeout(() => { TF.q = v || ''; renderTasks(); }, 220); };
            })();

            function renderTaskFilterBar() {
                const bar = document.getElementById('tasks-filterbar');
                if (!bar) return;
                if (!bar.querySelector('#tf-chips')) {
                    bar.innerHTML = `<div class="flex flex-col xl:flex-row xl:items-center gap-2">
                        <div id="tf-chips" class="flex flex-wrap items-center gap-1.5"></div>
                        <div class="flex items-center gap-2 xl:ml-auto flex-wrap">
                            <div class="relative flex-1 min-w-[180px] xl:w-64">
                                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input id="tf-search" type="search" autocomplete="off" placeholder="ค้นหาชื่องาน / รายละเอียด / เจ้าของงาน" oninput="tasksSearch(this.value)"
                                       class="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-400">
                            </div>
                            <div class="flex items-center rounded-lg overflow-hidden shadow-sm font-medium text-xs shrink-0 border border-slate-200">
                                <button onclick="PC.exportTasks('copy')" class="bg-slate-500 hover:bg-slate-600 text-white px-2.5 py-1.5 flex items-center gap-1.5 transition border-r border-white/20"><i class="fa-regular fa-copy"></i> Copy</button>
                                <button onclick="PC.exportTasks('excel')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 flex items-center gap-1.5 transition border-r border-white/20"><i class="fa-regular fa-file-excel"></i> Excel</button>
                                <button onclick="PC.exportTasks('print')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 flex items-center gap-1.5 transition"><i class="fa-solid fa-print"></i> Print</button>
                            </div>
                        </div>
                    </div>`;
                }
                const c = TF.counts || {};
                const chip = (id, label, n) => {
                    const on = !TF.year && TF.period === id;
                    return `<button type="button" onclick="tasksPeriod('${id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition border ${on ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-indigo-50'}">${label}<span class="ml-1 px-1.5 rounded-full text-[10px] ${on ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}">${n || 0}</span></button>`;
                };
                const years = TF.years || [];
                const arch = years.length || TF.year
                    ? `<select onchange="tasksYear(this.value)" class="px-2 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer ${TF.year ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300'}">
                            <option value="">ย้อนหลัง…</option>
                            ${Array.from(new Set(years.concat(TF.year ? [Number(TF.year)] : []))).sort((a, b) => b - a).map(y => `<option value="${y}" ${String(TF.year) === String(y) ? 'selected' : ''}>ปี พ.ศ. ${y + 543}</option>`).join('')}
                       </select>`
                    : `<span class="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-300 text-slate-400">ย้อนหลัง : ยังไม่มีงานปีก่อน</span>`;
                const box = document.getElementById('tf-chips');
                if (box) box.innerHTML = '<span class="text-xs font-bold text-slate-500 mr-1"><i class="fa-regular fa-calendar"></i> ครบกำหนด</span>' +
                    chip('today', 'วันนี้', c.today) + chip('month', 'เดือนนี้', c.month) + chip('year', 'ปีนี้', c.year) + chip('all', 'ทั้งหมด', c.all) + arch;
            }
            (function () {
                const orig = window.renderTasks;
                window.renderTasks = function () {
                    const r = orig.apply(this, arguments);
                    try { renderTaskFilterBar(); renderTaskSubtabs(); } catch (e) { console.warn('[v24] tasks bar', e.message); }
                    return r;
                };
            })();

            /* [ข้อ 10] ส่งออกรายการงานที่แสดงอยู่ */
            PC.exportTasks = function (kind) {
                const showDone = document.getElementById('tasks-show-done')?.checked;
                let items = tasksForMode(taskListMode);
                if (!showDone) items = items.filter(t => t.status !== 'done');
                items = items.slice().sort((a, b) => ((a.dueDate || '9999') + (a.dueTime || '99')).localeCompare((b.dueDate || '9999') + (b.dueTime || '99')));
                const listName = (FIXED_LISTS.concat(customLists()).find(x => x.id === taskListMode) || {}).name || 'กำหนดงาน';
                const header = ['ลำดับ', 'ชื่องาน', 'รายละเอียด', 'วันครบกำหนด', 'เวลา', 'สถานะ', 'เจ้าของงาน', 'กลุ่มสาระ/กลุ่มงาน', 'การมองเห็น'];
                const rows = items.map((t, i) => [
                    i + 1, t.title || '', t.desc || '', t.dueDate ? thDate(t.dueDate) : '', t.allDay ? 'ตลอดวัน' : (t.dueTime || ''),
                    t.status === 'done' ? 'เสร็จแล้ว' : 'ยังไม่เสร็จ', t.ownerName || t.ownerId || '', t.subjectGroup || t.group || '',
                    t.visibility === 'public' ? 'ผู้อื่นเห็นได้' : 'เฉพาะเจ้าของ'
                ]);
                exportTable(kind, 'กำหนดงาน — ' + listName, header, rows, { landscape: true, widths: [6, 40, 50, 16, 10, 12, 26, 26, 14] });
            };

            /* [ข้อ 3/7] โมดอลงาน : หัวข้อ เพิ่ม/แก้ไข + ตัวเลือกแท็บย่อยของผู้ใช้ */
            function refreshTaskListOptions() {
                const sel = document.getElementById('task-list');
                if (!sel) return;
                const cur = sel.value;
                sel.innerHTML = FIXED_LISTS.concat(customLists()).map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
                if (Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
            }
            (function () {
                const orig = window.openTaskModal;
                window.openTaskModal = function (id, presetList) {
                    refreshTaskListOptions();
                    const r = orig.apply(this, arguments);
                    const h = document.getElementById('modal-task-title');
                    if (h) h.innerHTML = '<i class="fa-solid fa-list-check"></i> เพิ่มงานใหม่';
                    const list = presetList || taskListMode;
                    const sel = document.getElementById('task-list');
                    if (sel && Array.from(sel.options).some(o => o.value === list)) sel.value = list;
                    if (isCustom(list)) { const v = document.getElementById('task-visibility'); if (v) v.value = 'private'; }
                    return r;
                };
            })();
            (function () {
                const orig = window.editTask;
                window.editTask = function () {
                    const r = orig.apply(this, arguments);
                    const h = document.getElementById('modal-task-title');
                    if (h && document.getElementById('task-id')?.value) h.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขงาน';
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 9] ปฏิทินปฏิบัติงาน : กดการ์ดกิจกรรม -> รายละเอียดของกิจกรรมนั้น
                 งานครบกำหนดส่ง (จากหนังสือ) : เรื่อง / กลุ่มงาน / ผู้รับผิดชอบ / วันครบกำหนด
                 + ปุ่มดูไฟล์หนังสือที่ประทับตราแล้ว / ไฟล์แนบ เฉพาะ ADMIN, ธุรการกลาง, ผอ., รอง ผอ. และ ผช.ผอ. ของกลุ่มนั้น
               --------------------------------------------------------------- */
            // ลำดับรายการต้องตรงกับ renderCalendar เดิม (วันหยุด -> กำหนดส่ง -> กิจกรรม -> Google) เพื่อจับคู่การ์ดได้ถูกตัว
            buildCalendarEvents = function () {
                const events = (googleHolidays || []).map(h => ({ date: h.date, title: h.title, location: h.location || 'ประเทศไทย', isHoliday: true }));
                const seen = new Set();
                state.documentQueue.forEach(doc => {
                    if (!doc.deadline) return;
                    const k = (doc.rootDocId || doc.id) + '|' + doc.deadline;
                    if (seen.has(k)) return;
                    seen.add(k);
                    events.push({ date: doc.deadline, title: `กำหนดส่ง: ${doc.title} (เลขรับ: ${doc.receiveNo || '-'})`, location: 'ระบบรับหนังสือราชการ', isHoliday: false, docId: doc.id });
                });
                (state.calendarEvents || []).forEach(evt => PC.expandEvent(evt).forEach(x => events.push(x)));
                if (typeof PC.gcalVisible === 'function') PC.gcalVisible().forEach(x => events.push(x));
                return events;
            };
            const eventsOn = (date) => buildCalendarEvents().filter(e => e.date === date);

            function docFamily(doc) {
                if (!doc) return [];
                const root = doc.rootDocId || doc.id;
                return state.documentQueue.filter(d => d === doc || d.id === root || d.rootDocId === root);
            }
            function canSeeDocFiles(fam) {
                const role = realRole();
                if (['ADMIN', 'Administrative', 'Director', 'ActingDirector'].includes(role)) return true;
                const title = (typeof userTitleForMatch === 'function') ? userTitleForMatch() : String((state.user && state.user.title) || '');
                const hit = (list) => Array.isArray(list) && list.some(g => clean(g) && title.includes(clean(g)));
                if (role === 'SubdirectorGroup') return fam.some(d => hit(d.assignedGroups));
                if (role === 'AssistantGroup') return fam.some(d => hit(d.subGroups));
                return false;
            }
            const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
            const detailRow = (icon, label, value, cls) => value ? `<div class="flex gap-2 py-1.5 border-b border-slate-100 last:border-0"><i class="fa-solid ${icon} w-4 text-center mt-0.5 ${cls || 'text-slate-400'}"></i><div class="w-28 shrink-0 text-slate-500">${label}</div><div class="flex-1 font-semibold text-slate-800 whitespace-pre-wrap">${value}</div></div>` : '';

            PC.showCalDetail = function (e) {
                if (!e) return;
                let icon = 'fa-calendar-check', tone = '#7c3aed', head = 'รายละเอียดกิจกรรม', body = '', actions = '';
                if (e.isHoliday) {
                    icon = 'fa-calendar-day'; tone = '#dc2626'; head = 'วันหยุด';
                    body = detailRow('fa-calendar', 'วันที่', esc(thDate(e.date, true))) + detailRow('fa-flag', 'ชื่อวันหยุด', esc(e.title)) + detailRow('fa-location-dot', 'ประเภท', 'วันหยุดราชการ / นักขัตฤกษ์');
                } else if (e.docId) {
                    const doc = findDoc(e.docId);
                    const fam = docFamily(doc);
                    icon = 'fa-clipboard-check'; tone = '#0f766e'; head = 'งานครบกำหนดส่ง';
                    if (!doc) body = `<div class="p-4 text-center text-slate-500">ไม่พบหนังสือต้นเรื่อง (อาจย้ายไปคลังรายปีแล้ว)</div>`;
                    else {
                        const due = parseYmd(doc.deadline);
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const diff = due ? Math.round((due - today) / 86400000) : null;
                        const pending = fam.filter(d => Number(d.stage) !== 99).length;
                        const remain = diff === null ? '' : (diff > 0 ? `อีก ${diff} วัน` : (diff === 0 ? 'ครบกำหนดวันนี้' : `เลยกำหนด ${-diff} วัน`));
                        const people = fam.filter(d => Array.isArray(d.assigneeIds) && d.assigneeIds.length || d.assigneeName).map(d =>
                            `<span class="inline-flex items-center gap-1 mr-1 mb-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${Number(d.stage) === 99 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}"><i class="fa-solid ${Number(d.stage) === 99 ? 'fa-circle-check' : 'fa-hourglass-half'}"></i>${esc(d.assigneeName || '-')}</span>`).join('');
                        body = detailRow('fa-file-lines', 'เรื่อง', esc(doc.subject || doc.title || '-')) +
                            detailRow('fa-hashtag', 'เลขรับ', esc([doc.receiveNo && ('กลาง ' + doc.receiveNo), doc.groupReceiveNo && ('กลุ่มบริหาร ' + doc.groupReceiveNo), doc.subgroupReceiveNo && ('กลุ่มงาน ' + doc.subgroupReceiveNo)].filter(Boolean).join(' · ') || '-')) +
                            detailRow('fa-paper-plane', 'จาก', esc(doc.sender || '')) +
                            detailRow('fa-sitemap', 'กลุ่มบริหาร', esc(uniq([].concat(...fam.map(d => d.assignedGroups || []))).join(', '))) +
                            detailRow('fa-people-group', 'กลุ่มงาน', esc(uniq([].concat(...fam.map(d => d.subGroups || []))).join(', '))) +
                            detailRow('fa-user-check', 'ผู้รับผิดชอบ', people || '<span class="text-slate-400 font-normal">ยังไม่ได้มอบหมาย</span>') +
                            detailRow('fa-calendar-xmark', 'ครบกำหนดส่ง', esc(thDate(doc.deadline, true)) + (remain ? ` <span class="ml-1 text-[11px] px-2 py-0.5 rounded-full ${diff < 0 && pending ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}">${remain}</span>` : ''), 'text-rose-500') +
                            detailRow('fa-flag-checkered', 'สถานะ', pending ? `อยู่ระหว่างดำเนินการ (${fam.length - pending}/${fam.length} ฉบับเสร็จแล้ว)` : 'ดำเนินการเสร็จสิ้นทุกฉบับ');
                        if (canSeeDocFiles(fam)) {
                            const idq = jsq(doc.id);
                            const nAtt = Array.isArray(doc.attachments) ? doc.attachments.length : 0;
                            actions = `<div class="flex flex-wrap gap-2 mt-4">
                                <button type="button" onclick="Swal.close(); PC.viewAnnDoc('${idq}', 'final')" class="flex-1 min-w-[180px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1.5"><i class="fa-solid fa-file-circle-check"></i> ดูไฟล์หนังสือที่ประทับตราแล้ว</button>
                                ${nAtt ? `<button type="button" onclick="Swal.close(); PC.viewAnnDoc('${idq}', 'attach')" class="flex-1 min-w-[140px] bg-purple-600 hover:bg-purple-700 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1.5"><i class="fa-solid fa-paperclip"></i> ดูไฟล์แนบ (${nAtt})</button>` : ''}
                            </div>`;
                        }
                    }
                } else if (e.eventId) {
                    const evt = (state.calendarEvents || []).find(x => x.id === e.eventId) || {};
                    const recorder = (PC.users || []).find(u => u.id === evt.recorder);
                    const range = (evt.endDate && evt.endDate !== (evt.startDate || evt.date)) ? thDate(evt.startDate || evt.date, true) + ' – ' + thDate(evt.endDate, true) : thDate(evt.startDate || evt.date || e.date, true);
                    body = detailRow('fa-heading', 'กิจกรรม', esc(evt.title || e.title)) +
                        detailRow('fa-calendar', 'วันที่', esc(range)) +
                        detailRow('fa-clock', 'เวลา', esc(e.time || 'ไม่ระบุเวลา')) +
                        detailRow('fa-location-dot', 'สถานที่', esc(evt.location || evt.loc || e.location || ''), 'text-rose-500') +
                        detailRow('fa-sitemap', 'กลุ่มงาน/ฝ่าย', esc(evt.dept || '')) +
                        detailRow('fa-user-tie', 'ผู้รับผิดชอบ', esc(evt.responsible || ''), 'text-blue-500') +
                        detailRow('fa-align-left', 'รายละเอียด', esc(evt.desc || '')) +
                        detailRow('fa-user-pen', 'ผู้บันทึก', esc(recorder ? recorder.name : (evt.recorder || '')));
                    if (evt.id && typeof PC.canEditEvent === 'function' && PC.canEditEvent(evt)) {
                        const iq = jsq(evt.id);
                        actions = `<div class="flex gap-2 mt-4">
                            <button type="button" onclick="Swal.close(); editEvent('${iq}')" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow"><i class="fa-solid fa-pen mr-1"></i> แก้ไขกิจกรรม</button>
                            <button type="button" onclick="Swal.close(); deleteEvent('${iq}')" class="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow"><i class="fa-solid fa-trash mr-1"></i> ลบกิจกรรม</button>
                        </div>`;
                    }
                } else {
                    icon = e.gcal ? 'fa-user-clock' : 'fa-calendar'; head = e.gcal ? 'นัดหมายส่วนตัว (Google Calendar)' : 'รายละเอียด';
                    body = detailRow('fa-heading', 'เรื่อง', esc(e.title)) + detailRow('fa-calendar', 'วันที่', esc(thDate(e.date, true))) +
                        detailRow('fa-clock', 'เวลา', esc(e.time || '')) + detailRow('fa-location-dot', 'สถานที่', esc(e.location || ''));
                }
                Swal.fire({
                    title: `<div class="flex items-center justify-center gap-2 text-base font-bold" style="color:${tone}"><i class="fa-solid ${icon}"></i> ${esc(head)}</div>`,
                    html: `<div class="text-left text-[12.5px]">${body}${actions}</div>`,
                    customClass: { popup: 'pc-wide-modal' }, showConfirmButton: true, confirmButtonText: 'ปิด', confirmButtonColor: '#475569'
                });
            };
            PC.calDetailAt = function (date, k) { PC.showCalDetail(eventsOn(date)[Number(k) || 0]); };

            const markClickable = (el, fn) => { el.style.cursor = 'pointer'; el.title = 'กดเพื่อดูรายละเอียด'; el.onclick = fn; };
            (function () {
                const orig = window.renderCalEventListPagination;
                window.renderCalEventListPagination = function () {
                    const r = orig.apply(this, arguments);
                    try {
                        const listEl = document.getElementById('cal-event-list');
                        const start = (calCurrentPage - 1) * calItemsPerPage;
                        const shown = currentMonthlyEvents.slice(start, start + calItemsPerPage);
                        Array.from(listEl ? listEl.children : []).forEach((card, i) => {
                            const e = shown[i];
                            if (!e) return;
                            const k = currentMonthlyEvents.filter(x => x.date === e.date).indexOf(e);
                            markClickable(card, () => PC.calDetailAt(e.date, k));
                        });
                    } catch (err) { console.warn('[v24] cal list', err.message); }
                    return r;
                };
            })();
            (function () {
                const orig = window.openDayEventsModal;
                window.openDayEventsModal = function (dateStr) {
                    const r = orig.apply(this, arguments);
                    try {
                        const box = document.getElementById('day-events-content');
                        const cards = Array.from(box ? box.children : []).filter(el => el.tagName === 'DIV' && el.className.indexOf('rounded-xl') !== -1);
                        cards.forEach((card, k) => markClickable(card, () => { if (typeof closeDayEventsModal === 'function') closeDayEventsModal(); PC.calDetailAt(dateStr, k); }));
                    } catch (err) { console.warn('[v24] day modal', err.message); }
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 10] ส่งออกหน้า "กำหนดการ" ของปฏิทิน + [ข้อ 11] ปุ่มพิมพ์ปฏิทินภาคเรียน
               --------------------------------------------------------------- */
            PC.exportSchedule = function (kind) {
                const y = currentCalDate.getFullYear(), m = currentCalDate.getMonth();
                const items = buildCalendarEvents().filter(e => { const d = parseYmd(e.date); return d && d.getFullYear() === y && d.getMonth() === m; })
                    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
                const header = ['ลำดับ', 'วันที่', 'รายการ', 'ประเภท', 'เวลา', 'สถานที่', 'ผู้รับผิดชอบ'];
                const rows = items.map((e, i) => [i + 1, thDate(e.date, true), e.title, e.isHoliday ? 'วันหยุด' : (e.docId ? 'กำหนดส่งงาน' : (e.gcal ? 'นัดหมายส่วนตัว' : 'กิจกรรม')),
                    e.isHoliday ? 'ตลอดวัน' : (e.time || ''), e.location || '', e.responsible || '']);
                exportTable(kind, 'กำหนดการ ' + TH_M[m] + ' ' + (y + 543), header, rows, { landscape: true, widths: [6, 18, 60, 14, 16, 24, 26] });
            };
            (function () {
                const orig = window.renderCalendar;
                window.renderCalendar = function () {
                    const r = orig.apply(this, arguments);
                    try {
                        const wrap = document.getElementById('calendar-dynamic-wrapper');
                        if (!wrap) return r;
                        // การ์ดในมุมมอง สัปดาห์ / วัน / กำหนดการ -> เปิดรายละเอียดของการ์ดนั้น
                        const perDate = {};
                        wrap.querySelectorAll('[onclick*="openDayEventsModal("]').forEach(el => {
                            const m = (el.getAttribute('onclick') || '').match(/openDayEventsModal\('(\d{4}-\d{2}-\d{2})'\)/);
                            if (!m) return;
                            const k = perDate[m[1]] = (perDate[m[1]] === undefined ? 0 : perDate[m[1]] + 1);
                            el.removeAttribute('onclick');
                            markClickable(el, (ev) => { ev.stopPropagation(); PC.calDetailAt(m[1], k); });
                        });
                        const holder = wrap.querySelector('.flex.items-center.gap-1\\.5.flex-wrap');
                        if (holder && !holder.querySelector('#btn-term-print')) {
                            holder.insertAdjacentHTML('beforeend', `<button type="button" id="btn-term-print" onclick="PC.openTermPrint()" title="พิมพ์ปฏิทินภาคเรียน (PDF / Excel / CSV / พิมพ์)"
                                class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 transition whitespace-nowrap shadow-sm"><i class="fa-solid fa-print mr-1 text-rose-600"></i>พิมพ์ปฏิทิน</button>`);
                        }
                        if (calendarViewMode === 'schedule') {
                            const sched = wrap.querySelector('.p-5.overflow-y-auto');
                            if (sched && !sched.querySelector('.pc-sched-export')) {
                                sched.insertAdjacentHTML('afterbegin', `<div class="pc-sched-export flex justify-end mb-2">
                                    <div class="flex items-center rounded-lg overflow-hidden shadow-sm font-medium text-xs border border-slate-200">
                                        <button onclick="PC.exportSchedule('copy')" class="bg-slate-500 hover:bg-slate-600 text-white px-2.5 py-1.5 flex items-center gap-1.5 border-r border-white/20"><i class="fa-regular fa-copy"></i> Copy</button>
                                        <button onclick="PC.exportSchedule('excel')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 flex items-center gap-1.5 border-r border-white/20"><i class="fa-regular fa-file-excel"></i> Excel</button>
                                        <button onclick="PC.exportSchedule('print')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 flex items-center gap-1.5"><i class="fa-solid fa-print"></i> Print</button>
                                    </div></div>`);
                            }
                        }
                    } catch (err) { console.warn('[v24] calendar', err.message); }
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 11] ปฏิทินภาคเรียน (รูปแบบตามไฟล์ตัวอย่าง) : เดือน | สัปดาห์ที่ | อา–ส | หมายเหตุ
               --------------------------------------------------------------- */
            /* [v31 ข้อ 5] ช่วงวันที่ตามภาคเรียน : ภาคเรียนที่ 1 = 1 พ.ค. – 31 ต.ค. , ภาคเรียนที่ 2 = 1 พ.ย. – 31 มี.ค. (ปีถัดไป)
               ปีการศึกษา (พ.ศ.) ของภาคเรียนที่ 2 = ปีเดียวกับภาคเรียนที่ 1 เช่น 2/2569 = พ.ย. 2569 – มี.ค. 2570 */
            function termRange(semNo, beYear) {
                const y = Number(beYear) - 543;
                return Number(semNo) === 2 ? { start: y + '-11-01', end: (y + 1) + '-03-31' } : { start: y + '-05-01', end: y + '-10-31' };
            }
            function defaultTerm() {
                const now = new Date(), y = now.getFullYear(), m = now.getMonth();
                const pick = (m >= 4 && m <= 9) ? [1, y + 543] : (m >= 10 ? [2, y + 543] : [2, y - 1 + 543]);
                const r = termRange(pick[0], pick[1]);
                return { semNo: pick[0], year: pick[1], sem: pick[0] + '/' + pick[1], start: r.start, end: r.end };
            }
            const DAY_MS = 86400000;
            const dayNo = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

            async function termData(o) {
                const start = parseYmd(o.start), end = parseYmd(o.end), open = parseYmd(o.open) || start;
                if (!start || !end || end < start) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
                if (dayNo(end) - dayNo(start) > 400) throw new Error('ช่วงวันที่ยาวเกิน 1 ปี');
                if (o.holidays) {
                    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
                        try { await window.fetchThaiHolidays(y); } catch (e) { /* ข้าม */ }
                    }
                }
                const inRange = (d) => d && d >= start && d <= end;
                const notes = [];            // { s:Date, e:Date, text, holiday }
                const holidayDays = new Set();
                if (o.holidays) {
                    const seen = new Set();
                    (googleHolidays || []).forEach(h => {
                        const d = parseYmd(h.date);
                        if (!inRange(d) || seen.has(h.date + h.title)) return;
                        seen.add(h.date + h.title);
                        holidayDays.add(h.date);
                        notes.push({ s: d, e: d, text: h.title, holiday: true });
                    });
                }
                // [v25 ข้อ 5] พิมพ์เฉพาะกลุ่มบริหาร : กิจกรรมของฝ่ายนั้น (+ ส่วนกลาง) / กำหนดส่งของหนังสือที่มอบกลุ่มนั้น
                const grpKey = o.group ? clean(o.group).replace(/^กลุ่ม/, '') : '';          // เช่น "บริหารวิชาการ"
                const evtInGroup = (ev) => !grpKey || !ev.dept || clean(ev.dept).indexOf(grpKey) !== -1 || /ส่วนกลาง/.test(ev.dept);
                const docInGroup = (doc) => !grpKey || (doc.assignedGroups || []).some(g => clean(g).indexOf(grpKey) !== -1);
                if (o.events) (state.calendarEvents || []).forEach(ev => {
                    const s = parseYmd(ev.startDate || ev.date), e = parseYmd(ev.endDate) || s;
                    if (!s || e < start || s > end || !evtInGroup(ev)) return;
                    notes.push({ s: s < start ? start : s, e: e > end ? end : e, text: ev.title || '' });
                });
                if (o.deadlines) {
                    const seen = new Set();
                    state.documentQueue.forEach(doc => {
                        const d = parseYmd(doc.deadline);
                        const k = (doc.rootDocId || doc.id);
                        if (!inRange(d) || seen.has(k) || !docInGroup(doc)) return;
                        seen.add(k);
                        notes.push({ s: d, e: d, text: 'กำหนดส่ง ' + (doc.subject || doc.title || '') });
                    });
                }
                notes.sort((a, b) => a.s - b.s || (b.holiday ? 1 : 0) - (a.holiday ? 1 : 0));
                const ws0 = dayNo(open) - open.getDay();         // วันอาทิตย์ของสัปดาห์ที่ 1
                const months = [];
                let cur = new Date(start.getFullYear(), start.getMonth(), 1);
                while (cur <= end) {
                    const m = cur.getMonth(), y = cur.getFullYear();
                    const mStart = new Date(Math.max(start, new Date(y, m, 1)));
                    const mEnd = new Date(Math.min(end, new Date(y, m + 1, 0)));
                    const rows = [];
                    let ws = new Date(mStart); ws.setDate(ws.getDate() - ws.getDay());
                    while (ws <= mEnd) {
                        const days = [];
                        let here = 0, other = 0;
                        for (let i = 0; i < 7; i++) {
                            const d = new Date(ws); d.setDate(ws.getDate() + i);
                            const show = d.getMonth() === m && d >= mStart && d <= mEnd;
                            if (show) here++; else if (inRange(d)) other++;
                            days.push(show ? { d: d.getDate(), holiday: holidayDays.has(ymd(d)), dow: i } : null);
                        }
                        const idx = Math.floor((dayNo(ws) - ws0) / 7) + 1;
                        // สัปดาห์คร่อม 2 เดือน : แสดงเลขในเดือนที่มีวันมากกว่า (เท่ากัน -> เดือนแรก)
                        const showWeek = idx >= 1 && idx <= o.maxWeeks && (here > other || (here === other && ws.getMonth() === m));
                        const rowEnd = new Date(ws); rowEnd.setDate(ws.getDate() + 6);
                        const txt = notes.filter(n => n.s >= ws && n.s <= rowEnd && n.s.getMonth() === m && n.s >= mStart && n.s <= mEnd).map(n => {
                            const same = n.e.getMonth() === n.s.getMonth() && n.e.getFullYear() === n.s.getFullYear();
                            const span = dayNo(n.e) > dayNo(n.s) ? (same ? n.s.getDate() + '-' + n.e.getDate() : n.s.getDate() + ' ' + TH_MS[n.s.getMonth()] + '-' + n.e.getDate() + ' ' + TH_MS[n.e.getMonth()]) : String(n.s.getDate());
                            return span + ' ' + n.text;
                        });
                        rows.push({ week: showWeek ? String(idx) : '', days: days, remark: txt.join(' /') });
                        ws = new Date(ws); ws.setDate(ws.getDate() + 7);
                    }
                    months.push({ name: TH_M[m], year: y + 543, rows: rows });
                    cur = new Date(y, m + 1, 1);
                }
                const now = new Date();
                const printed = 'พิมพ์เมื่อ วันที่ ' + now.getDate() + ' ' + TH_M[now.getMonth()] + ' พ.ศ.' + (now.getFullYear() + 543) +
                    ' เวลา ' + pad2(now.getHours()) + '.' + pad2(now.getMinutes()) + ' น.';                      // [v25 ข้อ 9]
                return { title: o.title, footer: o.footer, months: months, printed: printed };
            }

            const MARK = '☺';
            function termHtml(t, forPdf) {
                const heads = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
                const body = t.months.map(mo => mo.rows.map((r, i) => `<tr class="${i === 0 ? 'mstart' : ''}">
                        ${i === 0 ? `<td class="mon" rowspan="${mo.rows.length}">${esc(mo.name)}</td>` : ''}
                        <td class="wk">${esc(r.week)}</td>
                        ${r.days.map((d, k) => `<td class="day${k === 0 || k === 6 ? ' we' : ''}">${d ? `<div class="dc"><span class="${d.holiday ? 'hd' : 'dn'}">${d.d}</span></div>` : ''}</td>`).join('')}
                        <td class="rem">${esc(r.remark)}</td></tr>`).join('')).join('');
                return `<div class="term" style="${forPdf ? 'width:794px;padding:28px 26px;background:#fff;' : ''}">
                    <div class="thead"><img src="https:/\/lh5.googleusercontent.com/d/1BJtbFIOceoeaCmymH9sTHnligfmYfWU6" ${forPdf ? 'crossorigin="anonymous"' : ''} alt=""><span>${esc(t.title)}</span></div>
                    <table class="tt"><colgroup><col style="width:10%"><col style="width:7%">${heads.map(() => '<col style="width:4.6%">').join('')}<col></colgroup>
                    <thead><tr><th>เดือน</th><th>สัปดาห์ที่</th>${heads.map(h => `<th>${h}</th>`).join('')}<th>หมายเหตุ</th></tr></thead>
                    <tbody>${body}</tbody></table>
                    <div class="tfoot"><span class="pt">${esc(t.printed || '')}</span><span>${esc(t.footer)}</span></div></div>`;
            }
            const TERM_CSS = `.term{font-family:Sarabun,sans-serif;color:#000}
                .term .thead{display:flex;align-items:center;justify-content:center;gap:10px;font-weight:700;font-size:15px;margin-bottom:8px}
                .term .thead img{height:40px}
                .term .tt{width:100%;border-collapse:collapse;border:2px solid #000;font-size:11.5px}
                .term th{border:1px solid #000;border-bottom:2px solid #000;padding:4px 2px;font-weight:700;text-align:center}
                .term td{border:1px solid #000;padding:3px 3px;text-align:center;vertical-align:middle;height:22px}
                .term td.day{padding:1px 0;height:24px}
                .term td.day .dc{display:flex;align-items:center;justify-content:center;width:100%;height:22px}
                .term td.day .dn,.term td.day .hd{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;line-height:20px;border-radius:50%}
                .term td.day .hd{background:#dc2626;color:#fff;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
                .term tr.mstart td{border-top:2px solid #000}
                .term td.mon{font-weight:700;border-right:2px solid #000}
                .term td.wk{font-weight:700}
                .term td.we{font-weight:700}
                .term td.rem{text-align:left;border-left:2px solid #000;font-size:11px;line-height:1.35}
                .term .mk{font-size:10px;margin-left:1px}
                .term .tfoot{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-top:6px;font-size:12px}
                .term .tfoot .pt{font-weight:400;font-size:10.5px;color:#333}`;

            function termToAoa(t) {
                const head = ['เดือน', 'สัปดาห์ที่', 'อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'หมายเหตุ'];
                const rows = [];
                const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
                let r = 3;
                t.months.forEach(mo => {
                    if (mo.rows.length > 1) merges.push({ s: { r: r, c: 0 }, e: { r: r + mo.rows.length - 1, c: 0 } });
                    mo.rows.forEach((row, i) => {
                        rows.push([i === 0 ? mo.name : '', row.week].concat(row.days.map(d => (d ? d.d + (d.holiday ? ' ' + MARK : '') : ''))).concat([row.remark]));
                        r++;
                    });
                });
                return { aoa: [[t.title], [], head].concat(rows).concat([[], [t.printed || '', '', '', '', '', '', '', '', '', t.footer]]), merges: merges };
            }
            function loadScript(src) {
                return new Promise((res, rej) => {
                    if (document.querySelector('script[data-pc-src="' + src + '"]')) return res();
                    const s = document.createElement('script');
                    s.src = src; s.async = true; s.dataset.pcSrc = src;
                    s.onload = () => res(); s.onerror = () => rej(new Error('โหลดไลบรารีไม่สำเร็จ'));
                    document.head.appendChild(s);
                });
            }

            /* [v27] วาดปฏิทินภาคเรียนลง canvas เอง (แทน html2canvas ที่วางตัวอักษรไทยต่ำกว่าจริง -> ตัวเลขไม่อยู่กลางแถว/วงกลมเลื่อน)
               ขนาด/เส้น/ตัวอักษรเท่ากับหน้าพิมพ์ (TERM_CSS) กว้าง 794px (A4) วาดละเอียด 2 เท่า */
            function loadImg(src) {
                return new Promise((res) => {
                    const im = new Image();
                    im.crossOrigin = 'anonymous';
                    im.onload = () => res(im);
                    im.onerror = () => res(null);
                    im.src = src;
                    setTimeout(() => res(null), 12000);
                });
            }
            const THAI_MARK = /[ัิ-ฺ็-๎]/;
            function splitUnits(text) {
                if (window.Intl && Intl.Segmenter) {
                    try { return Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), s => s.segment); } catch (e) { /* ข้าม */ }
                }
                const out = [];
                for (const ch of text) { if (out.length && THAI_MARK.test(ch)) out[out.length - 1] += ch; else out.push(ch); }
                return out;
            }
            function wrapText(ctx, text, maxW) {
                const lines = [];
                let line = '';
                splitUnits(String(text || '')).forEach(u => {
                    const test = line + u;
                    if (line && ctx.measureText(test).width > maxW) {
                        lines.push(line.replace(/\s+$/, ''));
                        line = u.replace(/^\s+/, '');
                        // คำเดียวยาวเกินช่อง : ตัดเป็นตัวอักษร
                        while (ctx.measureText(line).width > maxW && line.length > 1) {
                            let k = line.length - 1;
                            while (k > 1 && ctx.measureText(line.substring(0, k)).width > maxW) k--;
                            while (k > 1 && THAI_MARK.test(line.charAt(k))) k--;
                            lines.push(line.substring(0, k));
                            line = line.substring(k);
                        }
                    } else line = test;
                });
                if (line) lines.push(line);
                return lines.length ? lines : [''];
            }
            async function drawTermCanvas(t) {
                const FONT = 'Sarabun, sans-serif';
                if (document.fonts && document.fonts.load) {
                    try { await Promise.all(['400 12px Sarabun', '700 12px Sarabun'].map(f => document.fonts.load(f, 'กขค 0123'))); } catch (e) { /* ข้าม */ }
                }
                const logo = await loadImg('https:/\/lh5.googleusercontent.com/d/1BJtbFIOceoeaCmymH9sTHnligfmYfWU6');
                const S = 2, PW = 794, PADX = 26, PADY = 28, W = PW - PADX * 2;
                const colW = [0.10, 0.07].concat(new Array(7).fill(0.046)).map(f => W * f);
                colW.push(W - colW.reduce((a, b) => a + b, 0));
                const colX = [PADX];
                colW.forEach((w, i) => colX.push(colX[i] + w));
                const meas = document.createElement('canvas').getContext('2d');
                meas.font = '400 11px ' + FONT;
                const REM_LH = 15, HEAD_H = 26, TITLE_H = 48;
                // ความสูงแต่ละแถว (หมายเหตุยาวขึ้นบรรทัดใหม่)
                const layout = t.months.map(mo => mo.rows.map(r => {
                    const lines = wrapText(meas, r.remark, colW[9] - 8);
                    return { r: r, lines: lines, h: Math.max(24, lines.length * REM_LH + 8) };
                }));
                const bodyH = layout.reduce((s, rows) => s + rows.reduce((a, x) => a + x.h, 0), 0);
                const H = PADY + TITLE_H + HEAD_H + bodyH + 34 + PADY;
                const cv = document.createElement('canvas');
                cv.width = PW * S; cv.height = Math.ceil(H * S);
                const ctx = cv.getContext('2d');
                ctx.scale(S, S);
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, H);
                ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
                // ข้อความกึ่งกลางแนวตั้งแม่นยำ (วัดจากขอบบน-ล่างจริงของตัวอักษร)
                const text = (s, x, y, o) => {
                    o = o || {};
                    ctx.font = (o.bold ? '700 ' : '400 ') + (o.size || 11.5) + 'px ' + FONT;
                    ctx.fillStyle = o.color || '#000';
                    ctx.textAlign = o.align || 'center';
                    ctx.textBaseline = 'alphabetic';
                    const m = ctx.measureText(o.ref || s);
                    const asc = m.actualBoundingBoxAscent || (o.size || 11.5) * 0.72;
                    const desc = m.actualBoundingBoxDescent || 0;
                    ctx.fillText(s, x, y + (asc - desc) / 2);
                };
                const line = (x1, y1, x2, y2, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

                // หัวกระดาษ : ตรา + ชื่อปฏิทิน
                ctx.font = '700 15px ' + FONT;
                const tw = ctx.measureText(t.title).width, lw = logo ? 40 * logo.width / logo.height : 0;
                const gx = PW / 2 - (tw + (logo ? lw + 10 : 0)) / 2;
                if (logo) { try { ctx.drawImage(logo, gx, PADY, lw, 40); } catch (e) { /* ข้าม */ } }
                text(t.title, gx + (logo ? lw + 10 : 0), PADY + 20, { bold: true, size: 15, align: 'left', ref: 'ปฏิทินโรงเรียน' });

                const top = PADY + TITLE_H;
                const heads = ['เดือน', 'สัปดาห์ที่', 'อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'หมายเหตุ'];
                heads.forEach((h, i) => text(h, colX[i] + colW[i] / 2, top + HEAD_H / 2, { bold: true, ref: 'เดือนสัปดาห์' }));
                let y = top + HEAD_H;
                const rowLines = [];     // เส้นแบ่งแถว (วาดหลังสุด)
                layout.forEach((rows, mi) => {
                    const mo = t.months[mi];
                    const mTop = y;
                    rows.forEach((x, ri) => {
                        const r = x.r, cy = y + x.h / 2;
                        text(r.week, colX[1] + colW[1] / 2, cy, { bold: true, ref: '0123456789' });
                        r.days.forEach((d, k) => {
                            if (!d) return;
                            const cx = colX[2 + k] + colW[2 + k] / 2;
                            if (d.holiday) {
                                ctx.fillStyle = '#dc2626';
                                ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
                                text(String(d.d), cx, cy, { bold: true, color: '#fff', ref: '0123456789' });
                            } else {
                                text(String(d.d), cx, cy, { bold: k === 0 || k === 6, ref: '0123456789' });
                            }
                        });
                        const remTop = y + (x.h - x.lines.length * REM_LH) / 2;
                        x.lines.forEach((ln, li) => text(ln, colX[9] + 4, remTop + REM_LH * li + REM_LH / 2, { size: 11, align: 'left', ref: 'กขคงสิ่' }));
                        if (ri > 0) rowLines.push([colX[1], y, colX[10], y, 1]);
                        y += x.h;
                    });
                    text(mo.name, colX[0] + colW[0] / 2, (mTop + y) / 2, { bold: true, ref: 'กรกฎาคม' });
                    rowLines.push([colX[0], mTop, colX[10], mTop, 2]);      // เส้นขึ้นเดือนใหม่ (หนา)
                });
                // เส้นตาราง
                rowLines.forEach(a => line(a[0], a[1], a[2], a[3], a[4]));
                line(colX[0], top + HEAD_H, colX[10], top + HEAD_H, 2);
                for (let i = 1; i < 10; i++) line(colX[i], top, colX[i], y, (i === 1 || i === 9) ? 2 : 1);
                ctx.lineWidth = 2; ctx.strokeRect(colX[0], top, W, y - top);
                // ท้ายกระดาษ
                text(t.printed || '', PADX, y + 18, { size: 10.5, color: '#333', align: 'left', ref: 'พิมพ์เมื่อ 0' });
                text(t.footer || '', PADX + W, y + 18, { bold: true, size: 12, align: 'right', ref: 'กลุ่มบริหาร' });
                return cv;
            }
            PC.drawTermCanvas = drawTermCanvas;

            async function runTerm(kind, o) {
                const t = await termData(o);
                const fname = ('ปฏิทินภาคเรียน ' + o.sem).replace(/[\\/:*?"<>|]/g, '-');
                if (kind === 'excel' || kind === 'csv') {
                    const x = termToAoa(t);
                    if (kind === 'csv') {
                        // CSV ไม่มีการรวมเซลล์ -> ใส่ชื่อเดือนทุกแถว เพื่อกรอง/เรียงต่อใน Excel ได้
                        const flat = [['เดือน', 'สัปดาห์ที่', 'อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'หมายเหตุ']];
                        t.months.forEach(mo => mo.rows.forEach(row => flat.push([mo.name + ' ' + mo.year, row.week]
                            .concat(row.days.map(d => (d ? d.d + (d.holiday ? ' ' + MARK : '') : ''))).concat([row.remark]))));
                        const csv = '﻿' + [[t.title], []].concat(flat).concat([[], [t.printed || ''], [t.footer]]).map(r => r.map(c => '"' + String(c === undefined ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                        a.download = fname + '.csv'; a.click();
                        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                        return;
                    }
                    await PCLib.load('xlsx');   // [v46]
                    const ws = XLSX.utils.aoa_to_sheet(x.aoa);
                    ws['!merges'] = x.merges;
                    ws['!cols'] = [{ wch: 11 }, { wch: 9 }].concat(new Array(7).fill({ wch: 5 })).concat([{ wch: 80 }]);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'ปฏิทิน');
                    XLSX.writeFile(wb, fname + '.xlsx');
                    return;
                }
                if (kind === 'print') {
                    const w = window.open('', '_blank');
                    if (!w) { Swal.fire('แจ้งเตือน', 'กรุณาอนุญาต Pop-up ของเบราว์เซอร์เพื่อพิมพ์', 'warning'); return; }
                    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fname)}</title>
                        <link href="https:/\/fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
                        <style>@page{size:A4 portrait;margin:6mm 4mm 4mm 4mm}body{margin:0}${TERM_CSS}</style></head><body>${termHtml(t, false)}
                        <script>
                        /\* [v31 ข้อ 1/2] กระดาษ A4 ขอบ บน 6 ล่าง 4 ซ้าย 4 ขวา 4 มม. , พิมพ์เสร็จ/กดยกเลิก -> ปิดหน้านี้อัตโนมัติ *\/
                        (function(){
                            var closed = false;
                            function done(){ if (closed) return; closed = true; setTimeout(function(){ window.close(); }, 150); }
                            window.addEventListener('afterprint', done);
                            (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function(){
                                setTimeout(function(){
                                    var t0 = Date.now();
                                    window.print();
                                    /\/ Chrome / Edge / Firefox : print() รอจนปิดหน้าต่างพิมพ์ -> ปิดได้ทันที
                                    if (Date.now() - t0 > 400) done();
                                }, 400);
                            });
                        })();
                        <\/script></body></html>`);
                    w.document.close();
                    return;
                }
                // pdf : วาดตารางเป็นภาพความละเอียดสูง แล้วใส่ลงกระดาษ A4 (รองรับภาษาไทยครบ)
                status.show('กำลังสร้างไฟล์ PDF...', 'busy');
                try {
                    const canvas = await drawTermCanvas(t);      // [v27] ตัวเลขกึ่งกลางแถวแม่นยำ
                    await PCLib.load('jspdf');   // [v46]
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
                    const img = canvas.toDataURL('image/jpeg', 0.95);
                    // [v31 ข้อ 1] ขอบกระดาษ บน 6 ล่าง 4 ซ้าย 4 ขวา 4 มม. (เหมือนการพิมพ์)
                    const MT = 6, MB = 4, ML = 4, MR = 4, aw = pw - ML - MR, ah = ph - MT - MB;
                    let w = aw, h = canvas.height * aw / canvas.width;
                    if (h <= ah) pdf.addImage(img, 'JPEG', ML, MT, w, h);
                    else if (h <= ah * 1.35) { const s = ah / h; pdf.addImage(img, 'JPEG', ML + (aw - w * s) / 2, MT, w * s, ah); }   // ย่อให้พอดี 1 หน้า
                    else { let y = 0; while (y < h) { if (y) pdf.addPage(); pdf.addImage(img, 'JPEG', ML, MT - y, w, h); y += ah; } }
                    pdf.save(fname + '.pdf');
                    status.show('สร้างไฟล์ PDF เรียบร้อย', 'ok', 1800);
                } catch (e) {
                    status.hide();
                    Swal.fire('สร้าง PDF ไม่สำเร็จ', e.message + ' — ลองใช้ปุ่ม "พิมพ์" แล้วเลือก "บันทึกเป็น PDF" แทน', 'error');
                }
            }

            PC.openTermPrint = function () {
                const d = defaultTerm();
                const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500';
                Swal.fire({
                    title: '<div class="text-base font-bold text-slate-800"><i class="fa-solid fa-print text-rose-600 mr-2"></i> พิมพ์ปฏิทินภาคเรียน</div>',
                    customClass: { popup: 'pc-wide-modal' }, showConfirmButton: false, showCloseButton: true,
                    html: `<div class="text-left text-xs space-y-3">
                        <div class="grid grid-cols-2 gap-3">
                            <!-- [v31 ข้อ 5] เลือกภาคเรียน + ปีการศึกษา -> กำหนดช่วงวันที่ให้อัตโนมัติ (แก้เองได้) -->
                            <label class="block"><span class="font-bold text-slate-600">ภาคเรียนที่</span>
                                <select id="tp-sem-no" class="${inp}">
                                    <option value="1" ${d.semNo === 1 ? 'selected' : ''}>ภาคเรียนที่ 1 (1 พ.ค. – 31 ต.ค.)</option>
                                    <option value="2" ${d.semNo === 2 ? 'selected' : ''}>ภาคเรียนที่ 2 (1 พ.ย. – 31 มี.ค.)</option>
                                </select></label>
                            <label class="block"><span class="font-bold text-slate-600">ปีการศึกษา (พ.ศ.)</span>
                                <select id="tp-sem-year" class="${inp}">${[d.year - 1, d.year, d.year + 1].map(y => `<option value="${y}" ${y === d.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
                            <input id="tp-sem" type="hidden" value="${esc(d.sem)}">
                            <label class="block"><span class="font-bold text-slate-600">ตั้งแต่วันที่</span><input id="tp-start" type="text" class="${inp}" value="${d.start}"></label>
                            <label class="block"><span class="font-bold text-slate-600">ถึงวันที่</span><input id="tp-end" type="text" class="${inp}" value="${d.end}"></label>
                            <label class="block"><span class="font-bold text-slate-600">วันเปิดภาคเรียน (นับเป็นสัปดาห์ที่ 1)</span><input id="tp-open" type="text" class="${inp}" value="${d.start}"></label>
                            <label class="block"><span class="font-bold text-slate-600">จำนวนสัปดาห์ (นับจากวันเปิดภาคเรียน)</span><input id="tp-weeks" type="number" min="1" max="40" class="${inp}" value="20"></label>
                        </div>
                        <label class="block"><span class="font-bold text-slate-600">หัวกระดาษ</span><input id="tp-title" class="${inp}" value="ปฏิทินโรงเรียนปากช่อง   อำเภอปากช่อง   จังหวัดนครราชสีมา   ภาคเรียนที่ ${esc(d.sem)}"></label>
                        <label class="block"><span class="font-bold text-slate-600">ท้ายกระดาษ</span><input id="tp-footer" class="${inp}" value="กลุ่มบริหารวิชาการ โรงเรียนปากช่อง"></label>
                        <label class="block"><span class="font-bold text-slate-600">พิมพ์กิจกรรมของ</span>
                            <select id="tp-group" class="${inp}">
                                <option value="">ทั้งหมด (ทุกกลุ่มบริหาร)</option>
                                <option value="กลุ่มบริหารวิชาการ">กลุ่มบริหารวิชาการ</option>
                                <option value="กลุ่มบริหารงบประมาณ">กลุ่มบริหารงบประมาณ</option>
                                <option value="กลุ่มบริหารงานบุคคล">กลุ่มบริหารงานบุคคล</option>
                                <option value="กลุ่มบริหารทั่วไป">กลุ่มบริหารทั่วไป</option>
                            </select>
                        </label>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            <label class="flex items-center gap-1.5"><input id="tp-hol" type="checkbox" checked> วันหยุดราชการ (วงกลมสีแดง)</label>
                            <label class="flex items-center gap-1.5"><input id="tp-evt" type="checkbox" checked> กิจกรรมในปฏิทิน</label>
                            <label class="flex items-center gap-1.5"><input id="tp-dl" type="checkbox"> กำหนดส่งงานจากหนังสือ</label>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                            <button type="button" onclick="PC.termRun('pdf')" class="bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl font-bold shadow"><i class="fa-solid fa-file-pdf mr-1"></i> PDF</button>
                            <button type="button" onclick="PC.termRun('excel')" class="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold shadow"><i class="fa-solid fa-file-excel mr-1"></i> Excel</button>
                            <button type="button" onclick="PC.termRun('csv')" class="bg-sky-600 hover:bg-sky-700 text-white py-2.5 rounded-xl font-bold shadow"><i class="fa-solid fa-file-csv mr-1"></i> CSV</button>
                            <button type="button" onclick="PC.termRun('print')" class="bg-slate-700 hover:bg-slate-800 text-white py-2.5 rounded-xl font-bold shadow"><i class="fa-solid fa-print mr-1"></i> พิมพ์</button>
                        </div>
                        <p class="text-[10.5px] text-slate-400">เลขสัปดาห์ที่คร่อม 2 เดือน จะแสดงในเดือนที่มีจำนวนวันของสัปดาห์นั้นมากกว่า</p>
                    </div>`,
                    didOpen: () => {
                        // [v31 ข้อ 4] วันที่แสดงแบบไทย เช่น 6 พฤษภาคม 2569 (ค่าที่ใช้คำนวณยังเป็น ปปปป-ดด-วว)
                        const TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
                        const fps = {};
                        const mk = (id, onChange) => {
                            if (typeof flatpickr !== 'function') return null;
                            fps[id] = flatpickr('#' + id, {
                                locale: 'th', dateFormat: 'Y-m-d', altInput: true, altFormat: 'THAI', altInputClass: inp + ' bg-white cursor-pointer',
                                formatDate: (date, format, locale) => (format === 'THAI'
                                    ? date.getDate() + ' ' + TH_MF[date.getMonth()] + ' ' + (date.getFullYear() + 543)
                                    : flatpickr.formatDate(date, format, locale)),
                                onChange: onChange || null
                            });
                            return fps[id];
                        };
                        PC._tpFps = fps;
                        const setDate = (id, ymd) => { if (fps[id]) fps[id].setDate(ymd, false); else { const el = document.getElementById(id); if (el) el.value = ymd; } };
                        let openLinked = true;             // วันเปิดภาคเรียน = วันเริ่มต้น จนกว่าผู้ใช้จะแก้เอง
                        mk('tp-start', (sel, ymd) => { if (openLinked) setDate('tp-open', ymd); });
                        mk('tp-end');
                        mk('tp-open', () => { openLinked = document.getElementById('tp-open').value === document.getElementById('tp-start').value; });
                        // [v31 ข้อ 5] เลือกภาคเรียน / ปีการศึกษา -> ช่วงวันที่ + หัวกระดาษ
                        const semNo = document.getElementById('tp-sem-no'), semYear = document.getElementById('tp-sem-year');
                        const applySem = () => {
                            const sem = semNo.value + '/' + semYear.value;
                            document.getElementById('tp-sem').value = sem;
                            const r = termRange(semNo.value, semYear.value);
                            setDate('tp-start', r.start);
                            setDate('tp-end', r.end);
                            setDate('tp-open', r.start);
                            openLinked = true;
                            document.getElementById('tp-weeks').value = 20;
                            const t = document.getElementById('tp-title');
                            t.value = t.value.replace(/ภาคเรียนที่\s*\S+/, 'ภาคเรียนที่ ' + sem);
                        };
                        semNo.addEventListener('change', applySem);
                        semYear.addEventListener('change', applySem);
                        // [v31 ข้อ 3] ท้ายกระดาษ = กลุ่มที่เลือกใน "พิมพ์กิจกรรมของ"
                        const grp = document.getElementById('tp-group');
                        grp.addEventListener('change', () => {
                            document.getElementById('tp-footer').value = (grp.value || 'กลุ่มบริหารวิชาการ') + ' โรงเรียนปากช่อง';
                        });
                    },
                    willClose: () => {
                        Object.values(PC._tpFps || {}).forEach(f => { try { f && f.destroy(); } catch (e) { /* ข้าม */ } });
                        PC._tpFps = null;
                    }
                });
            };
            /** ดูตัวอย่างตารางปฏิทินภาคเรียนเป็น HTML (ใช้ตรวจรูปแบบ) */
            PC.termPreview = async function (o) { return '<style>' + TERM_CSS + '</style>' + termHtml(await termData(o), false); };
            PC.termRun = function (kind) {
                const v = (id) => (document.getElementById(id) || {}).value || '';
                const c = (id) => !!(document.getElementById(id) || {}).checked;
                const o = {
                    sem: v('tp-sem').trim() || 'ภาคเรียน', start: v('tp-start'), end: v('tp-end'), open: v('tp-open') || v('tp-start'),
                    maxWeeks: Math.max(1, Math.min(40, Number(v('tp-weeks')) || 20)), title: v('tp-title'), footer: v('tp-footer'),
                    holidays: c('tp-hol'), events: c('tp-evt'), deadlines: c('tp-dl'),
                    group: v('tp-group')                                               // [v25 ข้อ 5]
                };
                if (o.group && o.title.indexOf(o.group) === -1) o.title += '   (' + o.group + ')';
                runTerm(kind, o).catch(e => Swal.fire('พิมพ์ปฏิทินไม่สำเร็จ', e.message, 'error'));
            };

            /* ---------------------------------------------------------------
               [ข้อ 14] งานและกิจกรรม : จัดกลุ่มตามกลุ่มบริหาร (สีต่างกัน)
                 แต่ละกลุ่มแสดง "เรื่องล่าสุด" 1 เรื่อง ที่เหลือพับเก็บในปุ่ม "ดูเรื่องอื่น ๆ"
                 (ตัวจัดกลุ่มเดิมทำงานไม่ได้ เพราะการ์ดถูกห่อใน <details> ไม่ได้อยู่ชั้นบนสุดของรายการ)
               --------------------------------------------------------------- */
            const ANN_GROUPS = [
                { id: 'pinned', name: 'ประกาศสำคัญ (ปักหมุด)', icon: 'fa-thumbtack', bg: '#fffbeb', bd: '#fcd34d', fg: '#92400e', dot: '#f59e0b' },
                { id: 'กลุ่มบริหารวิชาการ', name: 'กลุ่มบริหารวิชาการ', icon: 'fa-book', bg: '#fff1f2', bd: '#fda4af', fg: '#9f1239', dot: '#e11d48' },
                { id: 'กลุ่มบริหารงบประมาณ', name: 'กลุ่มบริหารงบประมาณ', icon: 'fa-coins', bg: '#ecfdf5', bd: '#6ee7b7', fg: '#065f46', dot: '#059669' },
                { id: 'กลุ่มบริหารงานบุคคล', name: 'กลุ่มบริหารงานบุคคล', icon: 'fa-users-gear', bg: '#eff6ff', bd: '#93c5fd', fg: '#1e40af', dot: '#2563eb' },
                { id: 'กลุ่มบริหารทั่วไป', name: 'กลุ่มบริหารทั่วไป', icon: 'fa-building-shield', bg: '#f5f3ff', bd: '#c4b5fd', fg: '#5b21b6', dot: '#7c3aed' },
                { id: 'other', name: 'ทั่วไป / ส่วนกลาง', icon: 'fa-layer-group', bg: '#f8fafc', bd: '#cbd5e1', fg: '#334155', dot: '#64748b' }
            ];
            const ANN_CLOSED_KEY = 'pc_ann_closed_v24';
            const annMoreOpen = new Set();
            const annClosed = () => { try { return new Set(JSON.parse(localStorage.getItem(ANN_CLOSED_KEY) || '[]')); } catch (e) { return new Set(); } };
            window.pcToggleAnnGroup = function (id) {
                const s = annClosed();
                if (s.has(id)) s.delete(id); else s.add(id);
                try { localStorage.setItem(ANN_CLOSED_KEY, JSON.stringify(Array.from(s))); } catch (e) { /* ข้าม */ }
                const body = document.getElementById('anng-body-' + id);
                const chev = document.getElementById('anng-chev-' + id);
                if (body) body.classList.toggle('hidden', s.has(id));
                if (chev) chev.style.transform = s.has(id) ? '' : 'rotate(180deg)';
            };
            window.pcToggleAnnMore = function (id, el) { if (el.open) annMoreOpen.add(id); else annMoreOpen.delete(id); };

            function groupAnnouncements() {
                const list = document.getElementById('assignments-list');
                if (!list) return;
                const byId = {};
                (state.assignments || []).forEach(a => { byId[a.AssignmentID] = a; });
                const items = [];
                list.querySelectorAll('form[onsubmit*="handleAddComment"]').forEach(f => {
                    const m = (f.getAttribute('onsubmit') || '').match(/handleAddComment\(event,\s*'([^']+)'/);
                    const a = m && byId[m[1]];
                    const card = f.closest('.rounded-2xl');
                    if (a && card && !items.some(x => x.card === card)) items.push({ a: a, card: card });
                });
                if (!items.length) return;                       // หน้าต้อนรับ / ยังไม่มีประกาศ
                const hiddenBtn = list.querySelector('button[onclick*="showHiddenAnnouncements"]');
                const buckets = {};
                ANN_GROUPS.forEach(g => { buckets[g.id] = []; });
                items.forEach(x => {
                    // [v29] ปักหมุดส่วนตัว / งาน-กิจกรรมที่แชร์ถึงผู้ใช้ -> ประกาศสำคัญ (ปักหมุด)
                    let k = (x.a.isPinned || (typeof PC.annPinnedForMe === 'function' && PC.annPinnedForMe(x.a))) ? 'pinned' : (typeof PC.annCategoryOf === 'function' ? PC.annCategoryOf(x.a) : 'other');
                    if (!buckets[k]) k = 'other';
                    buckets[k].push(x);
                });
                const closed = annClosed();
                const frag = document.createDocumentFragment();
                const top = document.createElement('div');
                top.className = 'flex items-center justify-between gap-2 mb-3 px-1';
                top.innerHTML = `<span class="text-xs font-bold text-slate-500"><i class="fa-solid fa-bullhorn text-amber-500 mr-1"></i>ทั้งหมด ${items.length} เรื่อง · จัดกลุ่มตามกลุ่มบริหาร</span>`;
                if (hiddenBtn) top.appendChild(hiddenBtn);
                frag.appendChild(top);
                ANN_GROUPS.forEach(g => {
                    const arr = buckets[g.id].sort((p, q) => String(q.a.CreatedAt || '').localeCompare(String(p.a.CreatedAt || '')));
                    if (!arr.length) return;
                    const fixed = g.id === 'pinned';              // [v30 ข้อ 1] ตรึงไว้บนสุด + [v31 ข้อ 1] เปิดไว้เป็นค่าเริ่มต้น พับเก็บได้
                    const isClosed = closed.has(g.id);
                    const sec = document.createElement('section');
                    sec.className = 'mb-4 rounded-2xl border overflow-hidden shadow-sm' + (fixed ? ' pc-ann-fixed' : '');
                    sec.style.borderColor = g.bd;
                    if (fixed) sec.style.boxShadow = '0 8px 22px rgba(245,158,11,.18)';
                    sec.innerHTML = `
                        <button type="button" onclick="pcToggleAnnGroup('${g.id}')" class="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:brightness-95" style="background:${g.bg};border-left:5px solid ${g.dot};">
                            <span class="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0" style="background:${g.dot}"><i class="fa-solid ${g.icon} text-sm"></i></span>
                            <span class="min-w-0 flex-1">
                                <span class="block font-bold text-sm" style="color:${g.fg}">${esc(g.name)}</span>
                                <span class="block text-[11px] truncate" style="color:${g.fg};opacity:.75">ล่าสุด : ${esc(arr[0].a.Title || '')}</span>
                            </span>
                            <span class="text-[11px] font-bold bg-white/90 border px-2.5 py-1 rounded-full shrink-0" style="color:${g.fg};border-color:${g.bd}">${arr.length} เรื่อง</span>
                            ${fixed ? `<span class="text-[10.5px] font-bold px-2.5 py-1 rounded-full shrink-0 text-white flex items-center gap-1" style="background:${g.dot}"><i class="fa-solid fa-thumbtack text-[9px]"></i><span class="hidden sm:inline">ตรึงไว้บนสุด</span></span>` : ''}
                            <i id="anng-chev-${g.id}" class="fa-solid fa-chevron-down text-xs transition-transform shrink-0" style="color:${g.fg};${isClosed ? '' : 'transform:rotate(180deg);'}"></i>
                        </button>
                        <div id="anng-body-${g.id}" class="${isClosed ? 'hidden' : ''} p-2 sm:p-3 bg-white space-y-3">
                            <div class="anng-latest ${g.id === 'pinned' ? 'space-y-3' : ''}"></div>
                            ${arr.length > 1 && g.id !== 'pinned' ? `<details class="pc-ann-more" ${annMoreOpen.has(g.id) ? 'open' : ''} ontoggle="pcToggleAnnMore('${g.id}', this)">
                                <summary class="cursor-pointer list-none inline-flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-1.5 rounded-full border shadow-sm select-none transition hover:brightness-95" style="background:${g.bg};color:${g.fg};border-color:${g.bd}">
                                    <i class="fa-regular fa-folder-open"></i> ดูเรื่องอื่น ๆ ในกลุ่มนี้อีก ${arr.length - 1} เรื่อง <i class="fa-solid fa-chevron-down text-[9px]"></i>
                                </summary>
                                <div class="anng-rest mt-3 space-y-3 pl-2 border-l-2" style="border-color:${g.bd}"></div>
                            </details>` : ''}
                        </div>`;
                    // [v29] ประกาศสำคัญ (ปักหมุด) : แสดงครบทุกเรื่อง ไม่พับเก็บ
                    if (g.id === 'pinned') arr.forEach(x => sec.querySelector('.anng-latest').appendChild(x.card));
                    else sec.querySelector('.anng-latest').appendChild(arr[0].card);
                    const rest = sec.querySelector('.anng-rest');
                    if (rest) arr.slice(1).forEach(x => rest.appendChild(x.card));
                    frag.appendChild(sec);
                });
                list.innerHTML = '';
                list.appendChild(frag);
            }
            (function () {
                const orig = window.renderAssignmentsList;
                window.renderAssignmentsList = function () {
                    const r = orig.apply(this, arguments);
                    try { groupAnnouncements(); } catch (e) { console.warn('[v24] ann group', e.message); }
                    return r;
                };
            })();
        })();



        /* ============================================================================
           v25 (25 ก.ย. 2569) : ชุดปรับปรุง 16 ข้อ
             1,4  กิจกรรม : วันนี้/เดือนนี้/ปีนี้/ย้อนหลัง + ค้นหา + ปุ่มกรองกลุ่มบริหาร
             2,3  โมดอลสร้างประกาศ : ส่วนหัวสีม่วง + "แจ้งถึง" (ทุกคน/กลุ่มบริหาร/กลุ่มงาน/บุคคล)
             5,8,9 พิมพ์ปฏิทิน : เลือกกลุ่มบริหาร , วันหยุดวงกลมแดง , จัดกลาง + วันเวลาที่พิมพ์
             6    ข้อสั่งการด่วน ผอ. / รอง ผอ.               7  ตราความเห็นวางต่อจากตราหมายเลขก่อนหน้า
             10   แชร์ปฏิทินงาน/กำหนดงาน ตามกลุ่ม/บุคคล        11 ตัวเลขหนังสือเข้าบนการ์ดห้อง
             12   ออกจากระบบขณะยังมีงานค้าง -> แจ้งเตือน+ยืนยัน  13 บันทึกไฟล์ไป Drive เบื้องหลัง + แถบ %
             14   ตัวเลขแท็บกิจกรรม = จำนวนเรื่อง               15 ออกเลขรับกลุ่มงานเบื้องหลัง (ไม่ค้าง)
             16   เข้าสู่ระบบด้วย Telegram
           ============================================================================ */
        (function v25() {
            const myId = () => (state.user && state.user.id) ? String(state.user.id) : '';
            const clean = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const roomNow = () => (document.getElementById('banner-room-name')?.innerText || '').trim();
            const MAIN_GROUPS = ['กลุ่มบริหารวิชาการ', 'กลุ่มบริหารงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารทั่วไป'];
            const GROUP_TONE = {
                'กลุ่มบริหารวิชาการ': { bg: '#ffe4e6', fg: '#9f1239', bd: '#fecdd3' },
                'กลุ่มบริหารงบประมาณ': { bg: '#dcfce7', fg: '#166534', bd: '#bbf7d0' },
                'กลุ่มบริหารงานบุคคล': { bg: '#dbeafe', fg: '#1e40af', bd: '#bfdbfe' },
                'กลุ่มบริหารทั่วไป': { bg: '#ede9fe', fg: '#5b21b6', bd: '#ddd6fe' }
            };
            const parentOf = (name) => {
                const n = clean(name);
                const r = (defaultRooms || []).find(x => clean(x.name) === n);
                return r && r.parent ? clean(r.parent) : '';
            };

            /* ---------------------------------------------------------------
               [ข้อ 13] ตัวแสดงงานเบื้องหลัง (มุมขวาล่าง) : แถบ % ของการบันทึกไฟล์ไป Drive / การออกเลขรับ
               --------------------------------------------------------------- */
            const BG = new Map();          // id -> { label, pct (null = ไม่ทราบ %), state: run|ok|err, detail, t }
            let bgEl = null, bgHideT = null;
            function bgRender() {
                if (!bgEl) {
                    bgEl = document.createElement('div');
                    bgEl.id = 'pc-bg-tasks';
                    bgEl.style.cssText = 'position:fixed;right:14px;bottom:56px;z-index:4001;width:min(340px,calc(100vw - 28px));display:none;font-family:Sarabun,sans-serif;';
                    document.body.appendChild(bgEl);
                }
                const items = Array.from(BG.entries());
                if (!items.length) { bgEl.style.display = 'none'; return; }
                bgEl.style.display = 'block';
                bgEl.innerHTML = `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 30px rgba(2,6,23,.18);padding:10px 12px;">
                    <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#334155;margin-bottom:6px;">
                        ${items.some(([, t]) => t.state === 'run')
                            ? '<i class="fa-solid fa-cloud-arrow-up" style="color:#2563eb"></i> กำลังบันทึก...<span style="margin-left:auto;font-weight:600;color:#94a3b8;font-size:10.5px;">ทำงานต่อได้ตามปกติ</span>'
                            : (items.some(([, t]) => t.state === 'err')
                                ? '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626"></i> บันทึกไม่สำเร็จ<span style="margin-left:auto;font-weight:600;color:#94a3b8;font-size:10.5px;">ระบบจะลองใหม่อัตโนมัติ</span>'
                                : '<i class="fa-solid fa-circle-check" style="color:#059669"></i> บันทึกเรียบร้อย')}
                    </div>
                    ${items.map(([id, t]) => {
                        const col = t.state === 'err' ? '#dc2626' : (t.state === 'ok' ? '#059669' : '#2563eb');
                        const pct = t.pct === null || t.pct === undefined ? null : Math.max(0, Math.min(100, Math.round(t.pct)));
                        return `<div style="margin-top:6px;">
                            <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#334155;">
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.state === 'run' ? '<i class="fa-solid fa-spinner fa-spin" style="color:' + col + '"></i>' : (t.state === 'ok' ? '<i class="fa-solid fa-circle-check" style="color:' + col + '"></i>' : '<i class="fa-solid fa-circle-exclamation" style="color:' + col + '"></i>')} ${esc(t.detail || t.label)}</span>
                                <b style="color:${col};white-space:nowrap;">${pct === null ? (t.state === 'run' ? '…' : '') : pct + '%'}</b>
                            </div>
                            <div style="height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden;margin-top:3px;">
                                <div style="height:100%;border-radius:99px;background:${col};width:${pct === null ? (t.state === 'run' ? 35 : 100) : pct}%;${pct === null && t.state === 'run' ? 'animation:pcIndet 1.2s ease-in-out infinite;' : 'transition:width .25s;'}"></div>
                            </div></div>`;
                    }).join('')}</div>`;
            }
            if (!document.getElementById('pc-bg-style')) {
                const st = document.createElement('style');
                st.id = 'pc-bg-style';
                st.textContent = '@keyframes pcIndet{0%{margin-left:-35%}100%{margin-left:100%}}';
                document.head.appendChild(st);
            }
            PC.bgTask = function (id, label, pct) {
                BG.set(id, { label: label, pct: pct === undefined ? null : pct, state: 'run', detail: label, t: Date.now() });
                clearTimeout(bgHideT);
                bgRender();
                const api2 = {
                    update(p, detail) { const t = BG.get(id); if (!t) return; t.pct = p; if (detail) t.detail = detail; bgRender(); },
                    done(detail) { const t = BG.get(id); if (!t) return; t.state = 'ok'; t.pct = 100; if (detail) t.detail = detail; bgRender(); setTimeout(() => { if (BG.get(id) && BG.get(id).state === 'ok') { BG.delete(id); bgRender(); } }, 2500); },
                    fail(detail) { const t = BG.get(id); if (!t) return; t.state = 'err'; if (detail) t.detail = detail; bgRender(); setTimeout(() => { if (BG.get(id) && BG.get(id).state === 'err') { BG.delete(id); bgRender(); } }, 8000); }
                };
                return api2;
            };
            PC.bgActive = () => Array.from(BG.values()).filter(t => t.state === 'run');

            /* [ข้อ 13] อัปโหลดไฟล์หนังสือไป Google Drive เป็นชุดเล็ก ๆ ทีละ 2 คำขอพร้อมกัน พร้อม % ตามขนาดไฟล์
               ล้มเหลว -> ระบบบันทึกจะลองใหม่อัตโนมัติทุก 15 วินาทีจนกว่าจะสำเร็จ (ผู้ใช้ประทับตรา/ทำงานต่อได้ระหว่างนี้) */
            uploadJobs = async function (list) {
                if (!list.length) return;
                const total = list.reduce((s, f) => s + (f.data ? f.data.length : 0), 0) || 1;
                let doneBytes = 0, doneFiles = 0;
                const task = PC.bgTask('upload', 'บันทึกไฟล์หนังสือไป Google Drive', 0);
                task.update(0, 'บันทึกไฟล์ไป Google Drive 0/' + list.length + ' ไฟล์');
                const batches = [];
                let cur = [], size = 0;
                list.forEach(f => {
                    const len = f.data.length;
                    if (cur.length && (size + len > 2500000 || cur.length >= 3)) { batches.push(cur); cur = []; size = 0; }
                    cur.push(f); size += len;
                });
                if (cur.length) batches.push(cur);
                try {
                    await runPool(batches, 2, async (batch) => {
                        const res = await api('uploadAssets', {
                            files: batch.map((f, i) => ({ key: String(i), data: f.data, kind: f.kind, name: f.name, route: f.route, date: f.date }))
                        }, { timeout: 300000, retries: 2 });
                        res.forEach(r => {
                            const f = batch[Number(r.key)];
                            if (!f || !r.id) return;
                            assetIds.set(f.job.value, r.id);
                            assetCache.put(r.id, f.kind === 'text' ? f.data : f.job.value);
                        });
                        doneFiles += batch.length;
                        doneBytes += batch.reduce((s, f) => s + f.data.length, 0);
                        task.update(doneBytes / total * 100, 'บันทึกไฟล์ไป Google Drive ' + doneFiles + '/' + list.length + ' ไฟล์');
                    });
                    task.done('บันทึกไฟล์ไป Google Drive ครบ ' + list.length + ' ไฟล์');
                } catch (e) {
                    task.fail('บันทึกไฟล์ไม่สำเร็จ จะลองใหม่อัตโนมัติ (' + e.message + ')');
                    throw e;
                }
            };
            // เริ่มบันทึกไฟล์ทันทีที่ธุรการลงรับ/ประทับตรา (ไม่ต้องรอกดส่งต่อ)
            ['applyAdminStamp', 'applyProposalStamp', 'applyDirectorStamp', 'applyAdminGroupReceiveStamp', 'applySubgroupAdminReceiveStamp',
                'applyAdminGroupProposalStamp', 'applySubgroupAdminProposalStamp', 'applySubdirectorGroupStamp', 'applyAssistantGroupStamp', 'applyAssigneeStamp'
            ].forEach(fn => {
                const orig = window[fn];
                if (typeof orig !== 'function') return;
                window[fn] = function () {
                    const r = orig.apply(this, arguments);
                    Promise.resolve(r).finally(() => docSync.schedule(1500));
                    return r;
                };
            });

            /* ---------------------------------------------------------------
               [ข้อ 15] กดส่งต่อจากธุรการกลุ่ม : รอเลขรับจริงจากทะเบียนก่อน (ถ้ายังออกไม่เสร็จ)
               --------------------------------------------------------------- */
            (function () {
                const orig = window.forwardDoc;
                window.forwardDoc = async function (currentStage) {
                    const stage = Number(currentStage);
                    const spec = PC.RECV_SPEC && PC.RECV_SPEC[stage];
                    const doc = spec ? findDoc(state.activeDocIds[stage]) : null;
                    if (spec && doc && doc[spec.field] && !doc[spec.field + 'Ok']) {
                        const canvas = state.canvases[getCanvasKey(stage)];
                        const hasStamp = !!(canvas && canvas.getObjects().some(o => o.stampName === spec.stampName));
                        if (hasStamp) {
                            status.show('กำลังรอเลขรับ' + spec.label + 'จากทะเบียน…', 'busy');
                            try {
                                await Promise.race([
                                    PC.startRecvJob(doc, stage, spec.field, spec.groupsField, spec.stampName, spec.label),
                                    new Promise((_, rej) => setTimeout(() => rej(new Error('เซิร์ฟเวอร์ตอบช้า')), 60000))
                                ]);
                                status.hide();
                            } catch (e) {
                                status.hide();
                                const r = await Swal.fire({
                                    icon: 'warning', title: 'ยังออกเลขรับจากทะเบียนไม่สำเร็จ',
                                    html: `<div class="text-sm">${esc(e.message)}<br>ขณะนี้ใช้เลขชั่วคราว <b>${esc(doc[spec.field])}</b></div>`,
                                    showDenyButton: true, showCancelButton: true,
                                    confirmButtonText: 'ลองใหม่', denyButtonText: 'ส่งต่อด้วยเลขชั่วคราว', cancelButtonText: 'ยกเลิก'
                                });
                                if (r.isConfirmed) return window.forwardDoc(currentStage);
                                if (!r.isDenied) return;
                            }
                        }
                    }
                    return orig.apply(this, arguments);
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 12] ออกจากระบบขณะยังมีงานค้าง -> บอกว่ากำลังทำอะไรอยู่ แล้วให้ยืนยัน
               --------------------------------------------------------------- */
            function pendingWork() {
                const out = [];
                let dirty = 0;
                try { const om = docSync.orders(); dirty = state.documentQueue.filter(d => d && d.id && docSync.isDirty(d, om)).length; } catch (e) { /* ข้าม */ }
                if (docSync.running) out.push({ icon: 'fa-floppy-disk', text: 'กำลังบันทึกหนังสือขึ้นเซิร์ฟเวอร์' });
                else if (dirty) out.push({ icon: 'fa-floppy-disk', text: 'หนังสือที่แก้ไขแล้วยังไม่ได้บันทึก ' + dirty + ' ฉบับ' });
                if (docSync.failed) out.push({ icon: 'fa-triangle-exclamation', text: 'การบันทึกครั้งล่าสุดไม่สำเร็จ (ระบบกำลังลองใหม่)' });
                PC.bgActive().forEach(t => out.push({ icon: 'fa-cloud-arrow-up', text: t.detail || t.label }));
                if (PC.inflightWrites > 0) out.push({ icon: 'fa-paper-plane', text: 'กำลังส่งข้อมูล (ประกาศ / ความคิดเห็น / งาน / การตั้งค่า)' });
                ['admin', 'director', 'admingroup', 'subdirectorgroup', 'subgroupadmin', 'assistantgroup', 'assignee'].forEach(t => {
                    const tab = document.getElementById('tab-' + t);
                    if (!tab || !tab.classList.contains('fixed')) return;
                    const stage = STAGE_OF_TAB[t];
                    const cv = state.canvases[getCanvasKey(stage)];
                    const d = findDoc(state.activeDocIds[stage]);
                    const cur = cv && cv.getObjects().some(o => o.stampName && o.isCurrentStep);
                    if (d && cur) out.push({ icon: 'fa-stamp', text: 'ประทับตราแล้วแต่ยังไม่ได้กดส่งต่อ : ' + String(d.subject || d.title || '').substring(0, 50) });
                });
                return out;
            }
            const STAGE_OF_TAB = { admin: 1, director: 4, admingroup: 5, subdirectorgroup: 6, subgroupadmin: 65, assistantgroup: 7, assignee: 8 };
            PC.pendingWork = pendingWork;
            async function performLogout(flush) {
                prog('กำลังออกจากระบบ…', flush ? 'บันทึกข้อมูลล่าสุดขึ้นเซิร์ฟเวอร์' : 'ปิดการเชื่อมต่อ');
                if (flush) {
                    try { await docSync.flush(); } catch (e) { /* ข้าม */ }
                    try { await Promise.allSettled(Array.from((PC.recvJobs || new Map()).values())); } catch (e) { /* ข้าม */ }
                }
                const remNow = loadRemember();
                api('logout', { rt: remNow && PC.user && remNow.userId === PC.user.id ? remNow.rt : '' }, { retries: 0, noAuthRedirect: true }).catch(() => {});
                clearRemember();
                try { if (PC.clearGoogleHint) PC.clearGoogleHint(); } catch (e) { /* ข้าม */ }
                endSession();
                showLoginView();
                const loginIdInput = document.getElementById('login-userid');
                if (loginIdInput && localStorage.getItem('savedRememberMe') !== 'true') loginIdInput.value = '';
                progEnd();
                Swal.fire({ icon: 'success', title: 'ออกจากระบบเรียบร้อย', showConfirmButton: false, timer: 1200 });
            }
            window.logout = async function () {
                const work = pendingWork();
                if (!work.length) {
                    const r = await Swal.fire({
                        title: 'ยืนยันการออกจากระบบ?', text: 'คุณต้องการออกจากระบบการทำงานใช่หรือไม่', icon: 'question',
                        showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#64748b',
                        confirmButtonText: '<i class="fa-solid fa-arrow-right-from-bracket mr-1"></i> ใช่, ออกจากระบบ', cancelButtonText: 'ยกเลิก', reverseButtons: true
                    });
                    if (r.isConfirmed) performLogout(true);
                    return;
                }
                const r = await Swal.fire({
                    icon: 'warning', title: 'ยังมีงานที่กำลังดำเนินการอยู่',
                    html: `<div class="text-left text-sm">
                        <ul class="space-y-1.5 mb-3">${work.map(w => `<li class="flex gap-2 items-start"><i class="fa-solid ${w.icon} text-amber-500 mt-0.5 w-4 text-center"></i><span>${esc(w.text)}</span></li>`).join('')}</ul>
                        <div class="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-2">ถ้าออกจากระบบตอนนี้ งานที่ยังไม่เสร็จอาจไม่ถูกบันทึก แนะนำให้กด <b>"รอให้เสร็จแล้วออก"</b></div></div>`,
                    customClass: { popup: 'pc-wide-modal' },
                    showDenyButton: true, showCancelButton: true,
                    confirmButtonText: '<i class="fa-solid fa-hourglass-half mr-1"></i> รอให้เสร็จแล้วออก',
                    denyButtonText: 'ออกจากระบบทันที', cancelButtonText: 'กลับไปทำงานต่อ', denyButtonColor: '#ef4444'
                });
                if (r.isConfirmed) performLogout(true);
                else if (r.isDenied) performLogout(false);
            };

            /* ---------------------------------------------------------------
               [ข้อ 3 / 10] ตัวเลือกผู้รับ (ใช้ร่วมกัน : แจ้งถึง , แชร์ปฏิทินงาน , แชร์กำหนดงาน)
                 all = ทุกคน | g:กลุ่มบริหาร/กลุ่มงาน | s:กลุ่มสาระ | u:ผู้ใช้
               --------------------------------------------------------------- */
            function audienceGroups(opt) {
                opt = opt || {};
                const P = PC.cdd.PALETTE, G = PC.cdd.GREY;
                const groups = [];
                if (opt.all !== false) groups.push({ key: 'all', label: 'ทั่วไป', tone: { bg: '#fef3c7', fg: '#92400e', bd: '#fde68a' }, items: [{ v: 'all', label: opt.allLabel || 'แจ้งทุกกลุ่ม ทุกคน', hint: 'ทั้งโรงเรียน', s: 'ทั่วไป ทุกคน ทั้งโรงเรียน all' }] });
                const mine = new Set((state.user.groups || []).map(clean));
                const tagMine = (n) => (mine.has(clean(n)) ? ' (ของฉัน)' : '');
                groups.push({
                    key: 'main', label: 'กลุ่มบริหาร', tone: { bg: '#ffe4e6', fg: '#9f1239', bd: '#fecdd3' },
                    items: MAIN_GROUPS.map(g => ({ v: 'g:' + g, label: g + tagMine(g), hint: 'รวมทุกกลุ่มงานในสังกัด', s: normQ(g) }))
                });
                const subs = (defaultRooms || []).filter(r => (r.type || '') === 'sub' || (r.parent && !MAIN_GROUPS.includes(clean(r.name))))
                    .map(r => clean(r.name)).filter((n, i, a) => n && a.indexOf(n) === i);
                if (subs.length) groups.push({
                    key: 'sub', label: 'กลุ่มงาน', tone: { bg: '#dbeafe', fg: '#1e40af', bd: '#bfdbfe' },
                    items: subs.map(n => ({ v: 'g:' + n, label: n + tagMine(n), hint: parentOf(n), s: normQ(n + ' ' + parentOf(n)) }))
                });
                if (opt.subjects) {
                    const subj = Array.from(new Set((PC.users || []).map(u => String(u.subjectGroup || '').trim()).concat([String(state.user.subjectGroup || '').trim()]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
                    if (subj.length) groups.push({
                        key: 'subj', label: 'กลุ่มสาระการเรียนรู้', tone: { bg: '#dcfce7', fg: '#166534', bd: '#bbf7d0' },
                        items: subj.map(n => ({ v: 's:' + n, label: n + (clean(state.user.subjectGroup) === clean(n) ? ' (ของฉัน)' : ''), hint: '', s: normQ(n) }))
                    });
                }
                const users = (PC.users || []).filter(u => u && u.id && u.active !== false && String(u.id) !== myId())
                    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'th'));
                if (users.length) groups.push({
                    key: 'user', label: 'เฉพาะบุคคล', tone: { bg: '#ede9fe', fg: '#5b21b6', bd: '#ddd6fe' },
                    items: users.map(u => ({ v: 'u:' + u.id, label: u.name || u.id, hint: [u.position, (u.groups || [])[0] || u.group, u.subjectGroup].filter(Boolean).join(' · '), s: normQ([u.name, u.id, u.position, u.group, (u.groups || []).join(' '), u.subjectGroup].join(' ')) }))
                });
                return groups;
            }
            function mountAudience(id, selected, opt) {
                if (!document.getElementById(id) || !PC.cdd) return;
                PC.cdd.mount(id, Object.assign({
                    groups: audienceGroups(opt), icon: 'fa-paper-plane', accent: '#7c3aed', unit: 'รายการ', maxChips: 4,
                    placeholder: 'ทุกคน (แตะเพื่อเลือกกลุ่ม / บุคคล)', searchPlaceholder: 'ค้นหากลุ่มบริหาร / กลุ่มงาน / ชื่อบุคคล…'
                }, opt || {}), false);
                (selected || []).forEach(v => PC.cdd.set(id, v, true));
                PC.cdd.render(id);
            }
            const chosenTokens = (id) => (PC.CDD && PC.CDD[id] ? PC.cdd.chosen(id).map(x => x.it.v) : []);
            /** ผู้ใช้ปัจจุบันอยู่ในกลุ่มผู้รับหรือไม่ (ฝั่งหน้าเว็บ ใช้กับประกาศ) */
            function iAmIn(list, ownerId) {
                if (!Array.isArray(list) || !list.length || list.includes('all')) return true;
                if (realRole() === 'ADMIN' || (ownerId && String(ownerId) === myId())) return true;
                const mine = new Set();
                (state.user.groups || []).concat(state.user.group ? [state.user.group] : []).forEach(g => { mine.add(clean(g)); const p = parentOf(g); if (p) mine.add(p); });
                const subj = clean(state.user.subjectGroup);
                return list.some(t => {
                    t = String(t);
                    if (t.indexOf('u:') === 0) return t.substring(2) === myId();
                    if (t.indexOf('g:') === 0) return mine.has(clean(t.substring(2)));
                    if (t.indexOf('s:') === 0) return !!subj && clean(t.substring(2)) === subj;
                    return false;
                });
            }
            PC.iAmIn = iAmIn;
            function audienceText(list) {
                if (!Array.isArray(list) || !list.length || list.includes('all')) return 'ทุกกลุ่ม ทุกคน';
                const nameOf = (id) => ((PC.users || []).find(u => String(u.id) === id) || {}).name || id;
                return list.map(t => t.indexOf('u:') === 0 ? nameOf(t.substring(2)) : t.substring(2)).join(', ');
            }

            // ----- [ข้อ 3] แจ้งถึง ในโมดอลสร้าง/แก้ไขประกาศ -----
            PC.getAnnAudience = function () {
                const v = chosenTokens('announce-audience-picker');
                return v.includes('all') ? [] : v;
            };
            (function () {
                const orig = window.openCreateAnnouncement;
                window.openCreateAnnouncement = function () {
                    const r = orig.apply(this, arguments);
                    const h = document.getElementById('modal-announcement-title');
                    if (h) h.innerHTML = '<i class="fa-solid fa-bullhorn"></i> สร้างประกาศ / แจ้งข่าวสารใหม่';
                    mountAudience('announce-audience-picker', []);
                    return r;
                };
            })();
            (function () {
                const orig = window.editAnnouncement;
                window.editAnnouncement = function (id) {
                    const r = orig.apply(this, arguments);
                    const a = (state.assignments || []).find(x => x.AssignmentID === id);
                    const h = document.getElementById('modal-announcement-title');
                    if (h) h.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขประกาศ / ข่าวสาร';
                    let aud = a && a.Audience;
                    if (typeof aud === 'string') { try { aud = JSON.parse(aud); } catch (e) { aud = []; } }
                    mountAudience('announce-audience-picker', Array.isArray(aud) ? aud : []);
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 1 / 4] แท็บกิจกรรม : วันนี้ / เดือนนี้ / ปีนี้ / ทั้งหมด / ย้อนหลัง + ค้นหา + ปุ่มกรองกลุ่มบริหาร
               --------------------------------------------------------------- */
            const AF = { period: 'all', year: '', cat: 'all', q: '', counts: {}, catCounts: {}, years: [] };
            const annTime = (a) => { const t = Date.parse(a.CreatedAt || ''); return isNaN(t) ? 0 : t; };
            const annAudience = (a) => { let v = a.Audience; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; };
            function annText(a) {
                let desc = String(a.Instructions || '');
                if (desc.trim().charAt(0) === '{') { try { desc = JSON.parse(desc.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')).desc || ''; } catch (e) { /* ข้าม */ } }
                return normQ([a.Title, desc, a.Group, a.Reporter, a.CreatedByName].join(' '));
            }
            const catOf = (a) => (typeof PC.annCategoryOf === 'function' ? (a.isPinned ? (PC.annCategoryOf(Object.assign({}, a, { isPinned: false }))) : PC.annCategoryOf(a)) : 'other');
            function filterAnnouncements(all) {
                const q = normQ(AF.q);
                const now = new Date();
                const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate();
                const visible = all.filter(a => iAmIn(annAudience(a), a.CreatedBy) && !(a.isHidden && !state.showHiddenAnnouncements));
                const byText = visible.filter(a => !q || annText(a).includes(q));
                const c = { today: 0, month: 0, year: 0, all: 0 };
                const cc = { all: 0 };
                const years = new Set();
                const tag = new Map();
                byText.forEach(a => {
                    const t = annTime(a), d = new Date(t || 0);
                    const inY = !!t && d.getFullYear() === y, inM = inY && d.getMonth() === m, inD = inM && d.getDate() === dd;
                    if (t && d.getFullYear() !== y) years.add(d.getFullYear());
                    tag.set(a, { inY, inM, inD, y: t ? d.getFullYear() : 0, cat: catOf(a) });
                });
                const periodOk = (a) => {
                    const g = tag.get(a);
                    if (AF.year) return g.y === Number(AF.year);
                    return AF.period === 'all' ? true : (AF.period === 'today' ? g.inD : (AF.period === 'month' ? g.inM : g.inY));
                };
                const catOk = (a) => AF.cat === 'all' || tag.get(a).cat === AF.cat;
                byText.forEach(a => {
                    const g = tag.get(a);
                    if (catOk(a)) { c.all++; if (g.inY) c.year++; if (g.inM) c.month++; if (g.inD) c.today++; }
                    if (periodOk(a)) { cc.all++; cc[g.cat] = (cc[g.cat] || 0) + 1; }
                });
                AF.counts = c; AF.catCounts = cc;
                AF.years = Array.from(years).sort((p, n) => n - p);
                // ปักหมุดแสดงเสมอ (ถ้าตรงกลุ่ม/คำค้น) ไม่ถูกตัดด้วยช่วงเวลา
                // [v30 ข้อ 1] ประกาศสำคัญ (ปักหมุด) ตรึงไว้บนสุดเสมอ : ไม่ถูกตัดด้วยตัวกรองกลุ่ม / ช่วงเวลา (ยังค้นหาได้)
                const pinnedAny = (a) => a.isPinned || (typeof PC.annPinnedForMe === 'function' && PC.annPinnedForMe(a));
                return byText.filter(a => pinnedAny(a) || (catOk(a) && periodOk(a)));
            }
            const CAT_BTNS = [
                { id: 'all', name: 'ทั้งหมด', icon: 'fa-layer-group', bg: '#334155' },
                { id: 'other', name: 'ทั่วไป / ส่วนกลาง', icon: 'fa-bullhorn', bg: '#64748b' },
                { id: 'กลุ่มบริหารวิชาการ', name: 'วิชาการ', icon: 'fa-book', bg: '#e11d48' },
                { id: 'กลุ่มบริหารงบประมาณ', name: 'งบประมาณ', icon: 'fa-coins', bg: '#059669' },
                { id: 'กลุ่มบริหารงานบุคคล', name: 'บุคคล', icon: 'fa-users-gear', bg: '#2563eb' },
                { id: 'กลุ่มบริหารทั่วไป', name: 'ทั่วไป (กลุ่มบริหาร)', icon: 'fa-building-shield', bg: '#7c3aed' }
            ];
            window.annPeriod = function (p) { AF.period = p || 'all'; AF.year = ''; renderAssignmentsList(); };
            window.annYear = function (y) { AF.year = String(y || ''); if (!AF.year) AF.period = 'all'; renderAssignmentsList(); };
            window.annCat = function (c) { AF.cat = c || 'all'; renderAssignmentsList(); };
            window.annSearch = (function () { let t = null; return function (v) { clearTimeout(t); t = setTimeout(() => { AF.q = v || ''; renderAssignmentsList(); }, 250); }; })();
            function renderAnnFilterBar() {
                const bar = document.getElementById('ann-filterbar');
                if (!bar) return;
                if (!bar.querySelector('#af-periods')) {
                    bar.innerHTML = `<div class="flex flex-col xl:flex-row xl:items-center gap-2 mb-2">
                            <div id="af-periods" class="flex flex-wrap items-center gap-1.5"></div>
                            <div class="relative xl:ml-auto xl:w-72">
                                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input id="af-search" type="search" autocomplete="off" placeholder="ค้นหาหัวข้อ / รายละเอียด / ผู้แจ้ง" oninput="annSearch(this.value)"
                                       class="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-amber-400">
                            </div>
                        </div>
                        <div id="af-cats" class="flex flex-wrap items-center gap-1.5"></div>`;
                }
                const c = AF.counts || {};
                const chip = (id, label, n) => {
                    const on = !AF.year && AF.period === id;
                    return `<button type="button" onclick="annPeriod('${id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition border ${on ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-amber-50'}">${label}<span class="ml-1 px-1.5 rounded-full text-[10px] ${on ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}">${n || 0}</span></button>`;
                };
                const years = Array.from(new Set(AF.years.concat(AF.year ? [Number(AF.year)] : []))).sort((a, b) => b - a);
                const arch = years.length
                    ? `<select onchange="annYear(this.value)" class="px-2 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer ${AF.year ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-300'}">
                            <option value="">ย้อนหลัง…</option>${years.map(y => `<option value="${y}" ${String(AF.year) === String(y) ? 'selected' : ''}>ปี พ.ศ. ${y + 543}</option>`).join('')}</select>`
                    : `<span class="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-300 text-slate-400">ย้อนหลัง : ยังไม่มีปีก่อน</span>`;
                document.getElementById('af-periods').innerHTML = '<span class="text-xs font-bold text-slate-500 mr-1"><i class="fa-regular fa-calendar"></i> ประกาศ</span>' +
                    chip('today', 'วันนี้', c.today) + chip('month', 'เดือนนี้', c.month) + chip('year', 'ปีนี้', c.year) + chip('all', 'ทั้งหมด', c.all) + arch;
                const cc = AF.catCounts || {};
                document.getElementById('af-cats').innerHTML = '<span class="text-xs font-bold text-slate-500 mr-1"><i class="fa-solid fa-filter"></i> กลุ่ม</span>' +
                    CAT_BTNS.map(b => {
                        const on = AF.cat === b.id;
                        const n = b.id === 'all' ? cc.all : (cc[b.id] || 0);
                        return `<button type="button" onclick="annCat('${b.id}')" class="px-3 py-1.5 rounded-full text-[11px] font-bold transition border flex items-center gap-1.5"
                            style="${on ? `background:${b.bg};color:#fff;border-color:${b.bg};` : `background:#fff;color:${b.bg};border-color:#e2e8f0;`}"><i class="fa-solid ${b.icon}"></i>${b.name}<span class="px-1.5 rounded-full text-[10px]" style="${on ? 'background:rgba(255,255,255,.25)' : 'background:#f1f5f9;color:#64748b'}">${n || 0}</span></button>`;
                    }).join('');
            }
            function addAudienceChips() {
                const list = document.getElementById('assignments-list');
                if (!list) return;
                list.querySelectorAll('form[onsubmit*="handleAddComment"]').forEach(f => {
                    const m = (f.getAttribute('onsubmit') || '').match(/handleAddComment\(event,\s*'([^']+)'/);
                    const a = m && (state.assignments || []).find(x => x.AssignmentID === m[1]);
                    const card = f.closest('.rounded-2xl');
                    const desc = card && card.querySelector('.whitespace-pre-wrap');
                    if (!a || !desc || card.querySelector('.pc-aud-chip')) return;
                    const aud = annAudience(a);
                    const span = document.createElement('div');
                    span.className = 'pc-aud-chip mb-1.5';
                    span.innerHTML = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${aud.length ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}"><i class="fa-solid fa-paper-plane mr-1"></i>แจ้งถึง: ${esc(audienceText(aud))}</span>`;
                    desc.parentElement.insertBefore(span, desc);
                });
            }
            (function () {
                const orig = window.renderAssignmentsList;
                window.renderAssignmentsList = function () {
                    const all = state.assignments || [];
                    const shown = filterAnnouncements(all);
                    const filtered = shown.length !== all.filter(a => !(a.isHidden && !state.showHiddenAnnouncements)).length || AF.q || AF.cat !== 'all' || AF.period !== 'all' || AF.year;
                    let r;
                    state.assignments = shown;
                    try { r = orig.apply(this, arguments); } finally { state.assignments = all; }
                    try {
                        renderAnnFilterBar();
                        addAudienceChips();
                        const list = document.getElementById('assignments-list');
                        if (list && !shown.length && all.length && filtered) {
                            list.innerHTML = `<div class="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-10 text-center">
                                <i class="fa-solid fa-magnifying-glass text-3xl text-slate-300 mb-3"></i>
                                <h4 class="font-bold text-slate-500">ไม่พบประกาศตามเงื่อนไขที่เลือก</h4>
                                <p class="text-xs text-slate-400 mt-1">ลองเลือก "ทั้งหมด" หรือเปลี่ยนกลุ่ม / คำค้น</p></div>`;
                        }
                    } catch (e) { console.warn('[v25] ann filter', e.message); }
                    return r;
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 6] ข้อสั่งการด่วนของ ผอ. และ รอง ผอ. (รูปแบบเดียวกับของ ผช.ผอ.)
               --------------------------------------------------------------- */
            const CMD_SETS = {
                director: { ta: 'director-comment', key: 'directorCmds', box: 'director-cmd-picker', base: 'ทราบ/ มอบ', groupSel: '.director-group-checkbox:checked',
                    defaults: ['ทราบ', 'อนุญาต', 'อนุมัติ', 'ดำเนินการตามเสนอ', 'ดำเนินการตามระเบียบ/กฎหมาย'] },
                subdirectorgroup: { ta: 'subdirectorgroup-comment', key: 'subdirectorCmds', box: 'subdirector-cmd-picker', base: 'ทราบ/ มอบ', groupSel: '.subdirector-group-checkbox:checked',
                    defaults: ['ดำเนินการตามระเบียบ', 'ประชาสัมพันธ์ทุกคนทราบ'] }
            };
            const cmdsOf = (cfg) => {
                let c = [];
                try { c = JSON.parse(localStorage.getItem(cfg.key) || '[]'); } catch (e) { c = []; }
                if (!Array.isArray(c) || !c.length) c = cfg.defaults.slice();
                return c.map(x => String(x).trim()).filter((x, i, a) => x && a.indexOf(x) === i);
            };
            function composeComment(which) {
                const cfg = CMD_SETS[which];
                const ta = document.getElementById(cfg.ta);
                if (!ta) return;
                const known = new Set(cmdsOf(cfg));
                const chosen = chosenTokens(cfg.box);
                chosen.forEach(c => known.add(c));
                const groups = Array.from(document.querySelectorAll(cfg.groupSel)).map(cb => cb.value);
                const keep = String(ta.value || '').split('\n').filter(l => {
                    const t = l.trim();
                    if (t.indexOf('☑') === 0) return false;
                    if (t.indexOf('- ') === 0 && known.has(t.substring(2).trim())) return false;
                    return true;
                });
                const base = keep.join('\n').trim() || cfg.base;
                ta.value = [base].concat(groups.length ? ['☑ ' + groups.join(', ')] : []).concat(chosen.map(c => '- ' + c)).join('\n');
            }
            function mountCmdPicker(which) {
                const cfg = CMD_SETS[which];
                const ta = document.getElementById(cfg.ta);
                if (!ta || !PC.cdd) return;
                let box = document.getElementById(cfg.box);
                if (!box) {
                    const wrap = document.createElement('div');
                    wrap.className = 'mt-2';
                    wrap.innerHTML = `<div class="flex justify-between items-center mb-1">
                        <label class="text-xs font-bold text-slate-600"><i class="fa-solid fa-bolt text-amber-500 mr-1"></i> ข้อสั่งการด่วน <span class="text-[10px] text-slate-400 font-normal">(บันทึกอัตโนมัติ)</span></label>
                        <button type="button" onclick="pcResetCmd('${which}')" class="text-[10px] font-bold text-slate-500 hover:text-rose-600"><i class="fa-solid fa-eraser"></i> ล้างความเห็น</button></div>
                        <div id="${cfg.box}" class="text-xs"></div>`;
                    ta.parentElement.appendChild(wrap);
                    box = document.getElementById(cfg.box);
                }
                const list = cmdsOf(cfg);
                PC.cdd.mount(cfg.box, {
                    flat: true, removable: true, addable: true, icon: 'fa-bolt', accent: '#d97706', unit: 'ข้อ', maxChips: 3,
                    groups: [{ key: 'cmd', label: 'ข้อสั่งการ', tone: { bg: '#fef3c7', fg: '#92400e', bd: '#fde68a' }, items: list.map(c => ({ v: c, label: c, hint: '', s: normQ(c) })) }],
                    placeholder: 'แตะเพื่อเลือกข้อสั่งการ (เลือกได้หลายข้อ)', searchPlaceholder: 'ค้นหาข้อสั่งการ…', addPlaceholder: 'พิมพ์ข้อสั่งการใหม่ แล้วกด Enter',
                    onChange: () => composeComment(which),
                    onAdd: (v) => {
                        if (!v) return;
                        const cur = cmdsOf(cfg);
                        if (!cur.includes(v)) { cur.push(v); try { localStorage.setItem(cfg.key, JSON.stringify(cur)); } catch (e) { /* ข้าม */ } }
                        PC.cdd.set(cfg.box, v, true);
                        mountCmdPicker(which);
                        composeComment(which);
                    },
                    onRemove: (v) => {
                        Swal.fire({ icon: 'question', title: 'ลบข้อสั่งการนี้?', text: v, showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#e11d48' }).then(r => {
                            if (!r.isConfirmed) return;
                            try { localStorage.setItem(cfg.key, JSON.stringify(cmdsOf(cfg).filter(c => c !== v))); } catch (e) { /* ข้าม */ }
                            mountCmdPicker(which);
                            composeComment(which);
                        });
                    }
                }, true);
            }
            window.pcResetCmd = function (which) {
                const cfg = CMD_SETS[which];
                const s = PC.CDD[cfg.box];
                if (s) { s.sel.clear(); s.order = []; PC.cdd.render(cfg.box); }
                const ta = document.getElementById(cfg.ta);
                if (ta) ta.value = cfg.base;
                composeComment(which);
            };
            window.updateDirectorComment = function () { composeComment('director'); };
            window.updateSubdirectorGroupComment = function () { composeComment('subdirectorgroup'); };
            (function () {
                const orig = window.loadAssistantCommands;
                window.loadAssistantCommands = function () {
                    const r = orig.apply(this, arguments);
                    try { mountCmdPicker('director'); mountCmdPicker('subdirectorgroup'); } catch (e) { /* ข้าม */ }
                    return r;
                };
            })();
            (function () {
                const orig = window.selectDoc;
                window.selectDoc = function (docId, stage) {
                    const r = orig.apply(this, arguments);
                    const which = Number(stage) === 4 ? 'director' : (Number(stage) === 6 ? 'subdirectorgroup' : '');
                    if (which) setTimeout(() => {
                        const s = PC.CDD[CMD_SETS[which].box];
                        if (s) { s.sel.clear(); s.order = []; s.open = false; PC.cdd.render(CMD_SETS[which].box); }
                    }, 60);
                    return r;
                };
            })();
            try { mountCmdPicker('director'); mountCmdPicker('subdirectorgroup'); } catch (e) { /* ข้าม */ }

            /* ---------------------------------------------------------------
               [ข้อ 7] ตราประทับความเห็น : วางต่อจากตราหมายเลขก่อนหน้า (ตราที่ 3 วางใต้ตราที่ 2 ...)
                 ใต้ตราก่อนหน้า -> ขวา -> ซ้าย (ถ้าที่ไม่พอ) , ตรา ผอ. (หมายเลข 1) ใช้ตำแหน่งเดิม
               --------------------------------------------------------------- */
            function stampNumber(o) {
                const kids = (o && typeof o.getObjects === 'function') ? o.getObjects() : [];
                if (!kids.some(k => k.type === 'circle' && String(k.fill || '').toLowerCase() === '#dc2626')) return 0;
                const t = kids.find(k => (k.type === 'text' || k.type === 'i-text') && /^\d{1,2}$/.test(String(k.text || '').trim()));
                return t ? Number(String(t.text).trim()) : 0;
            }
            (function () {
                const orig = window.computeStampPlacement;
                if (typeof orig !== 'function') return;
                window.computeStampPlacement = function (canvas, group, sigPadKey) {
                    try {
                        if (sigPadKey !== 'director') {
                            let prev = null, best = 0;
                            canvas.getObjects().forEach(o => {
                                if (o === group || !o.stampName || o.isCurrentStep) return;
                                const n = stampNumber(o);
                                if (n > best) { best = n; prev = o; }
                            });
                            if (prev) {
                                const bg = canvas.backgroundImage;
                                const pw = bg ? bg.width * bg.scaleX : canvas.width, ph = bg ? bg.height * bg.scaleY : canvas.height;
                                const gw = group.width * (group.scaleX || 1), gh = group.height * (group.scaleY || 1);
                                prev.setCoords();
                                const r = prev.getBoundingRect(true, true);
                                const gap = 10;
                                const clampX = (x) => Math.min(Math.max(x, gw / 2 + 6), pw - gw / 2 - 6);
                                if (r.top + r.height + gap + gh <= ph - 6) return { left: clampX(r.left + r.width / 2), top: r.top + r.height + gap + gh / 2, from: 'after-stamp-' + best };
                                if (r.left + r.width + gap + gw <= pw - 6) return { left: r.left + r.width + gap + gw / 2, top: Math.max(gh / 2 + 6, r.top + gh / 2), from: 'right-of-stamp-' + best };
                                if (r.left - gap - gw >= 6) return { left: r.left - gap - gw / 2, top: Math.max(gh / 2 + 6, r.top + gh / 2), from: 'left-of-stamp-' + best };
                            }
                        }
                    } catch (e) { console.warn('[v25] stamp placement', e.message); }
                    return orig.apply(this, arguments);
                };
            })();

            /* ---------------------------------------------------------------
               [ข้อ 10] แชร์ปฏิทินงาน / กำหนดงาน ให้ทั้งโรงเรียน , กลุ่มบริหาร , กลุ่มงาน , กลุ่มสาระ หรือบุคคลที่เลือก
                 (เซิร์ฟเวอร์กรองให้ ผู้ที่ไม่อยู่ในรายชื่อจะไม่ได้รับข้อมูลรายการนั้นเลย)
               --------------------------------------------------------------- */
            const SHARE_UI = {
                event: { mode: 'event-share-mode', box: 'event-share-picker', custom: 'custom' },
                task: { mode: 'task-visibility', box: 'task-share-picker', custom: 'shared' }
            };
            PC.onShareModeChange = function (kind) {
                const ui = SHARE_UI[kind];
                const sel = document.getElementById(ui.mode), box = document.getElementById(ui.box);
                if (!sel || !box) return;
                const on = sel.value === ui.custom;
                box.classList.toggle('hidden', !on);
                if (on && !PC.CDD[ui.box]) mountAudience(ui.box, [], { all: false, subjects: true, placeholder: 'แตะเพื่อเลือกกลุ่ม / บุคคลที่เห็นได้' });
            };
            PC.getShareTo = function (kind) {
                const ui = SHARE_UI[kind];
                const sel = document.getElementById(ui.mode);
                if (!sel || sel.value !== ui.custom) return [];
                return chosenTokens(ui.box).filter(v => v !== 'all');
            };
            function setShareUI(kind, list) {
                const ui = SHARE_UI[kind];
                const sel = document.getElementById(ui.mode);
                if (!sel) return;
                const custom = Array.isArray(list) && list.length > 0;
                if (kind === 'event') sel.value = custom ? 'custom' : 'all';
                else if (custom) sel.value = 'shared';
                mountAudience(ui.box, custom ? list : [], { all: false, subjects: true, placeholder: 'แตะเพื่อเลือกกลุ่ม / บุคคลที่เห็นได้' });
                document.getElementById(ui.box)?.classList.toggle('hidden', sel.value !== ui.custom);
            }
            const asList = (v) => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; };
            (function () {
                const o1 = window.openEventModal;
                window.openEventModal = function () { const r = o1.apply(this, arguments); setShareUI('event', []); return r; };
                const o2 = window.editEvent;
                window.editEvent = function (id) {
                    const r = o2.apply(this, arguments);
                    const evt = (state.calendarEvents || []).find(e => e.id === id);
                    if (evt) setShareUI('event', asList(evt.shareTo));
                    return r;
                };
                const o3 = window.openTaskModal;
                window.openTaskModal = function () { const r = o3.apply(this, arguments); setShareUI('task', []); return r; };
                const o4 = window.editTask;
                window.editTask = function (id) {
                    const r = o4.apply(this, arguments);
                    const t = (state.tasks || []).find(x => x.id === id);
                    if (t) { const v = document.getElementById('task-visibility'); if (v) v.value = t.visibility || 'private'; setShareUI('task', t.visibility === 'shared' ? asList(t.shareTo) : []); }
                    return r;
                };
            })();
            // งานที่ผู้อื่นแชร์ให้ (เฉพาะกลุ่ม/บุคคล) แสดงในแท็บย่อยตามประเภทงาน เหมือนงานที่เผยแพร่
            const origTFM25 = tasksForMode;
            tasksForMode = function (mode) {
                const base = origTFM25(mode);
                if (mode !== 'subject' && mode !== 'school') return base;
                const have = new Set(base.map(t => t.id));
                const extra = (state.tasks || []).filter(t => t && t.id && !have.has(t.id) && t.visibility === 'shared' && t.listType === mode && String(t.ownerId) !== myId());
                return base.concat(extra);
            };
            const origRow25 = taskRowHtml;
            taskRowHtml = function (t) {
                let html = origRow25(t);
                if (t && t.visibility === 'shared') {
                    const chip = `<span class="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full" title="${esc(audienceText(asList(t.shareTo)))}"><i class="fa-solid fa-share-nodes mr-1"></i>แชร์ : ${esc(audienceText(asList(t.shareTo)).substring(0, 40))}</span>`;
                    html = html.replace('<div class="flex flex-wrap items-center gap-1.5 mt-1">', '$&' + chip);
                }
                return html;
            };

            /* ---------------------------------------------------------------
               [ข้อ 11] การ์ดห้องหนังสือ : ตัวเลขกระพริบ = จำนวนหนังสือรอในกล่องหนังสือเข้าของห้องนั้น
               --------------------------------------------------------------- */
            function inboxCountFor(roomName) {
                const role = state.user.role;
                const isRealAdmin = realRole() === 'ADMIN';
                const STAGE_BY_ROLE = { Administrative: [1], Director: [4], ActingDirector: [4], AdminGroup: [5, 65], SubdirectorGroup: [6], AssistantGroup: [7], Assignee: [8] };
                const SIGNKEY_STAGE = { admin: 1, director: 4, admingroup: 5, subdirectorgroup: 6, subgroupadmin: 65, assistantgroup: 7, assignee: 8 };
                const keys = (PC.user && Array.isArray(PC.user.signRoles)) ? PC.user.signRoles : [];
                const allowed = isRealAdmin ? [1, 4, 5, 6, 65, 7, 8] : (keys.length ? keys.map(k => SIGNKEY_STAGE[k]).filter(Boolean) : (STAGE_BY_ROLE[role] || []));
                const nr = clean(roomName);
                const isCentral = roomName === CENTRAL;
                const match = (list) => Array.isArray(list) && list.some(g => { const ng = clean(g); return nr.includes(ng) || ng.includes(nr); });
                let items = state.documentQueue.filter(doc => {
                    const st = Number(doc.stage);
                    if (st === 99) return false;
                    if (st === 8 && window.pcAssignedToMe && window.pcAssignedToMe(doc)) return match(doc.subGroups) || (isCentral && !(doc.subGroups || []).length);
                    if (st === 8 && !isRealAdmin && window.pcAssignedToOthers && window.pcAssignedToOthers(doc)) return false;
                    if (!allowed.includes(st)) return false;
                    if (isCentral) return st === 1 || st === 4;
                    if (roomName.includes('กลุ่มบริหาร')) return [5, 6].includes(st) && match(doc.assignedGroups);
                    return [65, 7, 8].includes(st) && match(doc.subGroups);
                });
                if (isCentral && typeof groupDocsForCentral === 'function') items = groupDocsForCentral(items);
                return items.length;
            }
            PC.inboxCountFor = inboxCountFor;
            function paintRoomBubbles() {
                const grid = document.getElementById('rooms-grid');
                if (!grid || !PC.user || !state.documentQueue) return;
                grid.querySelectorAll('.room-card').forEach(card => {
                    card.querySelector('.pc-room-bubble')?.remove();
                    const name = card.querySelector('.room-name-span')?.innerText.trim();
                    if (!name) return;
                    const n = inboxCountFor(name);
                    if (!n) return;
                    const b = document.createElement('div');
                    b.className = 'pc-room-bubble absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-white/95 text-rose-700 rounded-full pl-1.5 pr-2.5 py-1 shadow-lg text-[11px] font-black';
                    b.title = 'หนังสือรอดำเนินการในกล่องหนังสือเข้า ' + n + ' ฉบับ';
                    b.innerHTML = `<span class="relative flex h-5 min-w-[20px]"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span class="relative inline-flex items-center justify-center rounded-full h-5 min-w-[20px] px-1 bg-rose-600 text-white text-[11px]">${n > 99 ? '99+' : n}</span></span> รอดำเนินการ`;
                    card.appendChild(b);
                    const idSpan = card.querySelector('.pc-room-type') || card.querySelector('.room-id-span');   // [ต.ค. 2569] ป้ายประเภทห้อง
                    if (idSpan) idSpan.style.marginTop = '1.75rem';
                });
            }
            (function () {
                const orig = window.renderDashboardRooms;
                window.renderDashboardRooms = function () {
                    const r = orig.apply(this, arguments);
                    try { paintRoomBubbles(); } catch (e) { console.warn('[v25] room bubbles', e.message); }
                    return r;
                };
            })();
            const origRerender25 = rerenderAll;
            rerenderAll = function (what) {
                origRerender25(what);
                try { if (what.docs && isVisible('view-dashboard')) paintRoomBubbles(); } catch (e) { /* ข้าม */ }
            };

            /* ---------------------------------------------------------------
               [ข้อ 16] เข้าสู่ระบบด้วย Telegram (Telegram Login Widget : bot_id + request_access=write)
                 ผู้ดูแลระบบ : สร้างบอทที่ @BotFather -> /setdomain ใส่โดเมนหน้าเว็บ -> รัน setupTelegram ใน Code.gs
               --------------------------------------------------------------- */
            let tgPromise = null;
            const TG_RETURN_KEY = 'pc_tg_return';
            function loadTelegram() {
                if (window.Telegram && Telegram.Login && typeof Telegram.Login.auth === 'function') return Promise.resolve();
                if (tgPromise) return tgPromise;
                tgPromise = new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https:/\/telegram.org/js/telegram-widget.js?22';
                    s.async = true;
                    s.onload = () => res();
                    s.onerror = () => { tgPromise = null; rej(new Error('โหลดบริการของ Telegram ไม่สำเร็จ')); };
                    document.head.appendChild(s);
                });
                return tgPromise;
            }
            window.loginWithTelegram = function () {
                const cfg = PC.getAuthCfg ? PC.getAuthCfg() : null;
                if (!cfg || cfg.telegram === undefined) {
                    if (PC.loadAuthConfig) PC.loadAuthConfig().catch(() => {});
                    toast('info', 'กำลังเตรียมการเชื่อมต่อ Telegram กรุณากดอีกครั้งในอีกสักครู่');
                    return;
                }
                if (cfg.telegram && cfg.telegram.botId && PC.gwFramed) {
                    /* [หน้าครอบ] หน้าต่างของ Telegram ตรวจโดเมนของหน้าที่เรียก (กรอบ Apps Script ไม่ใช่โดเมนที่ตั้งกับบอท)
                       -> พาทั้งแท็บไปหน้ายืนยันของ Telegram ในนามหน้าครอบ แล้วกลับมาที่หน้าครอบพร้อม #tgAuthResult (หน้าครอบส่งต่อให้ /exec) */
                    try { localStorage.setItem(TG_RETURN_KEY, JSON.stringify({ remember: !!(document.getElementById('rememberMe') || {}).checked, at: Date.now() })); } catch (e) { /* ข้าม */ }
                    PC.gwGoTop('https:/\/oauth.telegram.org/auth?bot_id=' + encodeURIComponent(cfg.telegram.botId) +
                        '&origin=' + encodeURIComponent(PC.GWRAP_ORIGIN) + '&return_to=' + encodeURIComponent(PC.GWRAP_URL) +
                        '&request_access=write&lang=th');
                    return;
                }
                if (!cfg.telegram || !cfg.telegram.botId) {
                    Swal.fire({ icon: 'info', title: 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วย Telegram', html: '<div class="text-sm text-left">ผู้ดูแลระบบต้อง :<br>1) สร้างบอทที่ @BotFather แล้วพิมพ์ /setdomain ใส่โดเมนของหน้าเว็บนี้<br>2) ใส่ชื่อบอทใน CONFIG.TELEGRAM_BOT_USERNAME และรัน setupTelegram ใน Code.gs</div>' });
                    return;
                }
                if (!(window.Telegram && Telegram.Login && Telegram.Login.auth)) {
                    loadTelegram().then(() => toast('info', 'พร้อมแล้ว กรุณากดปุ่ม Telegram อีกครั้ง'), e => Swal.fire({ icon: 'error', title: 'เชื่อมต่อ Telegram ไม่สำเร็จ', text: e.message }));
                    toast('info', 'กำลังโหลดบริการของ Telegram...');
                    return;
                }
                const remember = !!(document.getElementById('rememberMe') || {}).checked;
                // ต้องเรียกทันทีจากการกดปุ่ม (ไม่มี await ก่อนหน้า) เพื่อไม่ให้เบราว์เซอร์บล็อกหน้าต่างของ Telegram
                Telegram.Login.auth({ bot_id: cfg.telegram.botId, request_access: 'write', lang: 'th' }, async (data) => {
                    if (!data) { toast('info', 'ยกเลิกการเข้าสู่ระบบด้วย Telegram'); return; }
                    try {
                        prog('กำลังเข้าสู่ระบบด้วย Telegram...', 'ตรวจสอบบัญชี Telegram');
                        let res = await api('telegramLogin', { auth: data, remember: remember }, { retries: 1, noAuthRedirect: true, timeout: 25000 });
                        if (res && res.linkRequired) {
                            progEnd();
                            res = await PC.linkAccountFlow('telegramLogin', res, remember);
                            if (!res) return;
                            prog('กำลังเข้าสู่ระบบด้วย Telegram...', 'ผูกบัญชีเรียบร้อย');
                        }
                        await PC.completeLogin(res, { remember: remember });
                    } catch (err) { PC.oauthFail(err, 'Telegram'); }
                });
            };
            /* [หน้าครอบ] กลับมาจากหน้ายืนยันของ Telegram : หน้าครอบส่ง ?tgAuthResult=<base64 JSON> มา
               รับเฉพาะเมื่อเครื่องนี้เพิ่งกดปุ่ม Telegram เอง (ภายใน 15 นาที) กันลิงก์ที่คนอื่นทำไว้พาเข้าบัญชีของเขา
               ลายมือชื่อ (hash) เซิร์ฟเวอร์ตรวจด้วย bot token เหมือนเดิม  คืน true ถ้าจัดการแล้ว */
            PC.handleTelegramReturn = function () {
                let raw = '';
                try { raw = new URLSearchParams(location.search).get('tgAuthResult') || ''; } catch (e) { return false; }
                if (!raw) return false;
                try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ข้าม */ }
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem(TG_RETURN_KEY) || 'null'); localStorage.removeItem(TG_RETURN_KEY); } catch (e) { saved = null; }
                if (!saved || Date.now() - Number(saved.at || 0) > 15 * 60000) return false;
                let data = null;
                try {
                    let b = raw.replace(/-/g, '+').replace(/_/g, '/');
                    while (b.length % 4) b += '=';
                    const bin = atob(b);
                    data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
                } catch (e) { data = null; }
                if (!data || !data.id || !data.hash) { toast('info', 'ยกเลิกการเข้าสู่ระบบด้วย Telegram'); return false; }
                const remember = !!saved.remember;
                (async () => {
                    try {
                        prog('กำลังเข้าสู่ระบบด้วย Telegram...', 'ตรวจสอบบัญชี Telegram');
                        let res = await api('telegramLogin', { auth: data, remember: remember }, { retries: 1, noAuthRedirect: true, timeout: 25000 });
                        if (res && res.linkRequired) {
                            progEnd();
                            res = await PC.linkAccountFlow('telegramLogin', res, remember);
                            if (!res) return;
                            prog('กำลังเข้าสู่ระบบด้วย Telegram...', 'ผูกบัญชีเรียบร้อย');
                        }
                        await PC.completeLogin(res, { remember: remember });
                    } catch (err) { PC.oauthFail(err, 'Telegram'); }
                })();
                return true;
            };
            setTimeout(() => {
                const cfg = PC.getAuthCfg ? PC.getAuthCfg() : null;
                if (cfg && cfg.telegram && cfg.telegram.botId && !PC.gwFramed) loadTelegram().catch(() => {});
            }, 1500);
        })();


        /* =====================================================================
           [v26] การบันทึกไฟล์ไป Google Drive
             1 ตัดแถบ "กำลังบันทึกหนังสือ..." มุมล่างออก -> รวมเป็นกล่องเดียว หัวข้อ "กำลังบันทึก..."
             2 แถบ % ค่อย ๆ เพิ่มขึ้นจนเสร็จ (ประมาณจากขนาดไฟล์ + ความเร็วเน็ตที่วัดได้จริง) ไม่ค้างที่ 0%
             3 อัปโหลดเร็วขึ้น : ภาพหนังสือเป็น JPEG , ย่อรูปถ่ายใหญ่ , แบ่งไฟล์เป็นชิ้นเล็กส่งพร้อมกัน 3 ทาง
             4 ไม่บันทึกซ้ำ : ถ่ายภาพหน้ากระดาษใหม่เฉพาะเมื่อตรา/รอยเขียนเปลี่ยนจริง (ไม่นับเส้นประกระพริบ)
           ===================================================================== */
        (function v26() {
            /* ---------- [ข้อ 4] ลายเซ็นของสถานะ canvas (ตัดค่าที่เปลี่ยนเองจากแอนิเมชันออก) ---------- */
            const SKIP_KEYS = { strokeDashOffset: 1, version: 1 };
            function normalize(v) {
                if (Array.isArray(v)) return v.map(normalize);
                if (v && typeof v === 'object') {
                    const o = {};
                    Object.keys(v).sort().forEach(k => { if (!SKIP_KEYS[k]) o[k] = normalize(v[k]); });
                    return o;
                }
                if (typeof v === 'number') return Math.round(v * 10) / 10;
                if (typeof v === 'string' && v.length > 2000) return '#' + v.length + ':' + v.substring(0, 60) + v.substring(v.length - 60);
                return v;
            }
            window.pcCanvasSig = function (json) {
                try { return JSON.stringify(normalize(typeof json === 'string' ? JSON.parse(json) : json)); }
                catch (e) { return 'x' + Math.random(); }        // อ่านไม่ได้ -> ถือว่าเปลี่ยน (ถ่ายภาพใหม่)
            };

            /* ---------- [ข้อ 2] งานเบื้องหลังที่ไม่รู้ % (เช่น ออกเลขรับ) : ให้แถบค่อย ๆ ขยับตามเวลา ---------- */
            const baseBg = PC.bgTask;
            if (typeof baseBg === 'function') {
                PC.bgTask = function (id, label, pct) {
                    if (pct !== undefined && pct !== null) return baseBg(id, label, pct);
                    const t0 = Date.now();
                    const task = baseBg(id, label, 2);
                    const iv = setInterval(() => { task.update(2 + 93 * (1 - Math.exp(-(Date.now() - t0) / 5000))); }, 300);
                    const stop = () => clearInterval(iv);
                    return {
                        update(p, detail) { if (p !== null && p !== undefined) stop(); task.update(p, detail); },
                        done(detail) { stop(); task.done(detail); },
                        fail(detail) { stop(); task.fail(detail); }
                    };
                };
            }

            /* ---------- [ข้อ 1/2] การบันทึกหนังสือ -> กล่อง "กำลังบันทึก..." กล่องเดียว พร้อม % ---------- */
            const S = { active: false, task: null, pct: 0, anchor: 0, anchorAt: 0, start: 0, n: 0, detail: '', up: null, tick: null, showT: null };
            function sRender() {
                if (!S.task) return;
                S.task.update(S.pct, S.detail);
            }
            function sTick() {
                if (!S.active) return;
                let target;
                if (S.up) target = S.up.base + S.up.span * S.up.est();
                else target = S.anchor + (97 - S.anchor) * (1 - Math.exp(-(Date.now() - S.anchorAt) / 4000));
                S.pct = Math.max(S.pct, Math.min(99, target));
                sRender();
            }
            const SAVE = {
                begin(n) {
                    S.n = n;
                    if (S.active) { S.detail = 'บันทึกหนังสือ ' + n + ' รายการ'; sRender(); return; }
                    S.active = true; S.pct = 1; S.anchor = 1; S.anchorAt = Date.now(); S.start = Date.now(); S.up = null;
                    S.detail = 'บันทึกหนังสือ ' + n + ' รายการ';
                    clearInterval(S.tick);
                    S.tick = setInterval(sTick, 250);
                    clearTimeout(S.showT);
                    // บันทึกเล็ก ๆ ที่เสร็จในไม่ถึงครึ่งวินาที ไม่ต้องแสดงกล่องให้รบกวน
                    S.showT = setTimeout(() => { if (S.active && !S.task) { S.task = PC.bgTask('save', S.detail, S.pct); sRender(); } }, 500);
                },
                phase(detail) {                 // เข้าสู่ช่วงที่ไม่รู้ % (เช่น ส่งข้อมูลหนังสือ) : ค่อย ๆ ขยับต่อจากจุดเดิม
                    S.up = null; S.anchor = S.pct; S.anchorAt = Date.now();
                    if (detail) S.detail = detail;
                    sRender();
                },
                end(ok, msg) {
                    clearInterval(S.tick); clearTimeout(S.showT);
                    const wasActive = S.active;
                    S.active = false; S.up = null;
                    if (ok) {
                        if (S.task) S.task.done('บันทึกเรียบร้อย ' + S.n + ' รายการ');
                    } else {
                        const t = S.task || PC.bgTask('save', S.detail || 'บันทึกหนังสือ', S.pct);
                        t.fail(msg);
                    }
                    S.task = null;
                    return wasActive;
                }
            };
            PC.saveProgress = SAVE;

            const baseShow = status.show;
            status.show = function (text, kind, hideMs) {
                const s = String(text || '');
                let m;
                if ((m = s.match(/^กำลังบันทึกหนังสือ (\d+) รายการ/))) { SAVE.begin(Number(m[1])); return; }
                if (/^กำลังอัปโหลดไฟล์ไป Google Drive/.test(s)) return;
                if (/^บันทึกข้อมูลเรียบร้อย/.test(s)) { SAVE.end(true); return; }
                if (/^บันทึกไม่สำเร็จ/.test(s)) { SAVE.end(false, s); return; }
                return baseShow.call(this, text, kind, hideMs);
            };

            /* ---------- [ข้อ 2/3] อัปโหลดไป Drive : ชิ้นเล็ก ส่งพร้อมกัน 3 ทาง + % ประมาณตามเวลาจริง ----------
               (Apps Script ไม่รองรับ CORS preflight จึงวัด % การส่งจริงของเบราว์เซอร์ไม่ได้
                ระบบจึงประมาณจากขนาดไฟล์ ÷ ความเร็วที่วัดได้จากการส่งครั้งก่อน ๆ และจำไว้ใช้ครั้งต่อไป) */
            let RATE = 150;                       // ไบต์ต่อมิลลิวินาที (≈150KB/s) ค่าเริ่มต้น
            try { const r = Number(localStorage.getItem('pc-up-rate')); if (r > 10 && r < 20000) RATE = r; } catch (e) { /* ข้าม */ }
            const OVERHEAD = 1800;                // เวลาเซิร์ฟเวอร์สร้างไฟล์ใน Drive (ms ต่อคำขอ)
            const PER_FILE = 450;
            const expectMs = (b) => OVERHEAD + b.files.length * PER_FILE + b.bytes / RATE;
            const frac = (t, e) => (t < e ? 0.9 * t / e : 0.9 + 0.09 * (1 - Math.exp(-(t - e) / e)));
            const mb = (n) => (n / 1048576 * 0.75).toFixed(n > 7000000 ? 0 : 1) + ' MB';   // base64 -> ขนาดไฟล์จริง

            const viaScript = async function (list) {          // ทางเดิม : ส่ง base64 ผ่าน Apps Script
                if (!list.length) return;
                const isText = list.every(f => f.kind === 'text');
                if (!S.active) SAVE.begin(1);
                const total = list.reduce((s, f) => s + (f.data ? f.data.length : 0), 0) || 1;
                // ไฟล์ใหญ่ส่งเดี่ยว , ไฟล์เล็กรวมชุดละไม่เกิน ~1.2MB / 6 ไฟล์
                const batches = [];
                let cur = null;
                list.slice().sort((a, b) => b.data.length - a.data.length).forEach(f => {
                    const len = f.data.length;
                    if (len > 400000) { batches.push({ files: [f], bytes: len }); return; }
                    if (!cur || cur.bytes + len > 1200000 || cur.files.length >= 6) { cur = { files: [], bytes: 0 }; batches.push(cur); }
                    cur.files.push(f); cur.bytes += len;
                });
                let doneBytes = 0, doneFiles = 0;
                const inflight = new Set();
                const base = S.pct;
                const cap = isText ? 92 : 85;
                S.up = {
                    base: base, span: Math.max(0, cap - base),
                    est() {
                        const now = Date.now();
                        let b = doneBytes;
                        inflight.forEach(x => { b += x.bytes * frac(now - x.t0, x.exp); });
                        return Math.min(1, b / total);
                    }
                };
                const label = () => (isText ? 'บันทึกข้อมูลตราประทับ ' : 'บันทึกไฟล์ไป Google Drive ') + doneFiles + '/' + list.length + ' ไฟล์' + (isText ? '' : ' (' + mb(total) + ')');
                S.detail = label();
                sRender();
                try {
                    await runPool(batches, 3, async (batch) => {
                        const x = { bytes: batch.bytes, t0: Date.now(), exp: expectMs(batch) };
                        inflight.add(x);
                        try {
                            const res = await api('uploadAssets', {
                                files: batch.files.map((f, i) => ({ key: String(i), data: f.data, kind: f.kind, name: f.name, route: f.route, date: f.date, public: !!f.pub }))
                            }, { timeout: 300000, retries: 2 });
                            (res || []).forEach(r => {
                                const f = batch.files[Number(r.key)];
                                if (!f || !r.id) return;
                                assetIds.set(f.job.value, r.id);
                                assetCache.put(r.id, f.kind === 'text' ? f.data : f.job.value);
                            });
                            // วัดความเร็วจริง -> ใช้ประมาณ % ครั้งต่อไป
                            const dur = Date.now() - x.t0;
                            if (batch.bytes > 150000 && dur > OVERHEAD + 300) {
                                const measured = batch.bytes / (dur - OVERHEAD - batch.files.length * PER_FILE / 2);
                                if (measured > 0) {
                                    RATE = Math.max(20, Math.min(20000, RATE * 0.5 + measured * 0.5));
                                    try { localStorage.setItem('pc-up-rate', String(Math.round(RATE))); } catch (e) { /* ข้าม */ }
                                }
                            }
                        } finally {
                            inflight.delete(x);
                        }
                        doneBytes += batch.bytes;
                        doneFiles += batch.files.length;
                        S.detail = label();
                        sTick();
                    });
                } finally {
                    SAVE.phase(isText ? 'กำลังบันทึกข้อมูลหนังสือ…' : 'กำลังเตรียมข้อมูลตราประทับ…');
                }
                if (!isText) S.detail = 'บันทึกไฟล์ครบ ' + list.length + ' ไฟล์ · กำลังบันทึกข้อมูลหนังสือ…';
            };

            /* ---------- [v27] อัปโหลดตรงเข้า Google Drive (ไม่ผ่าน Apps Script) ----------
               1) ขอ "ลิงก์อัปโหลดครั้งเดียว" จากเซิร์ฟเวอร์ (1 คำขอ ได้ครบทุกไฟล์)
               2) เบราว์เซอร์ส่งไฟล์ดิบไปที่ลิงก์โดยตรง พร้อมกัน 4 ไฟล์ : เล็กกว่า base64 25% และแถบ % เป็นค่าจริง
               ถ้า Google/เครือข่ายไม่ยอมให้ส่งตรง -> กลับไปใช้ทางเดิมอัตโนมัติ (และพักทางตรงไว้ชั่วคราว) */
            const DIRECT_OFF = 'pc-direct-off';
            let directOffUntil = 0;
            try { directOffUntil = Number(localStorage.getItem(DIRECT_OFF) || 0); } catch (e) { /* ข้าม */ }
            function directAllowed() {
                return /^https?:$/.test(location.protocol) && typeof XMLHttpRequest === 'function' && Date.now() > directOffUntil;
            }
            function directOff(ms, why) {
                directOffUntil = Date.now() + ms;
                try { localStorage.setItem(DIRECT_OFF, String(directOffUntil)); } catch (e) { /* ข้าม */ }
                console.warn('[PC] ปิดการอัปโหลดตรงชั่วคราว ' + Math.round(ms / 60000) + ' นาที :', why);
            }
            PC.directUpload = {
                status: () => ({ allowed: directAllowed(), offUntil: directOffUntil ? new Date(directOffUntil).toLocaleString() : '', everWorked: (() => { try { return localStorage.getItem('pc-direct-ok') === '1'; } catch (e) { return false; } })() }),
                enable() { directOffUntil = 0; try { localStorage.removeItem(DIRECT_OFF); } catch (e) { /* ข้าม */ } }
            };
            const fmtMB = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
            function dataUrlToBlob(s) {
                const comma = s.indexOf(',');
                const head = s.substring(5, comma);
                const mime = head.split(';')[0] || 'application/octet-stream';
                if (/;base64$/i.test(head)) {
                    const bin = atob(s.substring(comma + 1));
                    const u = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                    return new Blob([u], { type: mime });
                }
                return new Blob([decodeURIComponent(s.substring(comma + 1))], { type: mime });
            }
            function putToDrive(url, blob, onProgress) {
                return new Promise((resolve, reject) => {
                    const x = new XMLHttpRequest();
                    x.open('PUT', url, true);
                    x.timeout = 300000;
                    x.upload.onprogress = (e) => onProgress(e.loaded);
                    x.onload = () => {
                        if (x.status === 200 || x.status === 201) {
                            try { const j = JSON.parse(x.responseText); if (j && j.id) return resolve(j.id); } catch (e) { /* ข้าม */ }
                            const er = new Error('Drive ไม่ส่งรหัสไฟล์กลับ'); er.hard = true; return reject(er);
                        }
                        reject(new Error('Drive ตอบกลับ HTTP ' + x.status));
                    };
                    x.onerror = () => { const er = new Error('เบราว์เซอร์ส่งไฟล์ตรงไป Drive ไม่ได้ (CORS/เครือข่าย)'); er.hard = true; reject(er); };
                    x.ontimeout = () => reject(new Error('หมดเวลาอัปโหลด'));
                    x.send(blob);
                });
            }
            async function viaDirect(list) {
                const isText = list.every(f => f.kind === 'text');
                if (!S.active) SAVE.begin(1);
                const items = list.map((f, i) => ({
                    f: f, key: String(i), loaded: 0,
                    blob: f.kind === 'text' ? new Blob([f.data], { type: 'application/json' }) : dataUrlToBlob(f.data)
                }));
                const total = items.reduce((s, x) => s + x.blob.size, 0) || 1;
                S.detail = (isText ? 'เตรียมบันทึกข้อมูลตราประทับ…' : 'เตรียมอัปโหลดตรงไป Google Drive (' + fmtMB(total) + ')...');
                sRender();
                const sessions = {};
                for (let i = 0; i < items.length; i += 30) {
                    const chunk = items.slice(i, i + 30);
                    const res = await api('uploadSessions', {
                        origin: location.origin,
                        files: chunk.map(x => ({ key: x.key, kind: x.f.kind, mime: x.blob.type, size: x.blob.size, name: x.f.name, route: x.f.route, date: x.f.date }))
                    }, { timeout: 60000, retries: 1 });
                    (res || []).forEach(r => { if (r && r.url) sessions[r.key] = r.url; });
                }
                const ready = items.filter(x => sessions[x.key]);
                if (!ready.length) throw new Error('เซิร์ฟเวอร์เปิดลิงก์อัปโหลดไม่ได้');
                let doneFiles = 0, firstErr = null;
                const pubIds = [];
                S.up = {
                    base: S.pct, span: Math.max(0, (isText ? 92 : 85) - S.pct),
                    est: () => Math.min(1, items.reduce((s, x) => s + x.loaded, 0) / total)
                };
                const label = () => (isText ? 'บันทึกข้อมูลตราประทับ ' : 'อัปโหลดตรงไป Google Drive ') + doneFiles + '/' + items.length + ' ไฟล์' + (isText ? '' : ' (' + fmtMB(total) + ')');
                S.detail = label();
                sRender();
                await runPool(ready, 4, async (x) => {
                    if (firstErr && firstErr.hard) return;
                    try {
                        const id = await putToDrive(sessions[x.key], x.blob, (n) => { x.loaded = n * 0.97; sTick(); });
                        x.loaded = x.blob.size;
                        assetIds.set(x.f.job.value, id);
                        assetCache.put(id, x.f.kind === 'text' ? x.f.data : x.f.job.value);
                        if (x.f.pub) pubIds.push(id);                       // [v35 ข้อ 2]
                        doneFiles++;
                        S.detail = label();
                        sTick();
                        try { localStorage.setItem('pc-direct-ok', '1'); } catch (e) { /* ข้าม */ }
                    } catch (e) {
                        x.loaded = 0;
                        if (!firstErr) firstErr = e;
                    }
                });
                if (firstErr && firstErr.hard) {
                    let ever = false;
                    try { ever = localStorage.getItem('pc-direct-ok') === '1'; } catch (e) { /* ข้าม */ }
                    // ไม่เคยส่งตรงสำเร็จในเครื่องนี้ = Google ไม่อนุญาต -> พัก 1 วัน , เคยสำเร็จ = เน็ตสะดุด -> พัก 10 นาที
                    directOff(ever || doneFiles ? 600000 : 86400000, firstErr.message);
                }
                // [v35 ข้อ 2] ไฟล์ที่ส่งตรง : ขอให้เซิร์ฟเวอร์เปิดแชร์ภาพหน้ากระดาษของหนังสือชั้นทั่วไป (ไม่ต้องรอผล)
                if (pubIds.length) api('setAssetsPublic', { ids: pubIds, on: true }, { retries: 1, timeout: 60000 }).catch(() => {});
                return list.filter(f => !assetIds.has(f.job.value));      // ไฟล์ที่ยังไม่สำเร็จ -> ส่งทางเดิมต่อ
            }

            uploadJobs = async function (list) {
                if (!list.length) return;
                let rest = list;
                if (directAllowed()) {
                    try {
                        rest = await viaDirect(list);
                    } catch (e) {
                        // เซิร์ฟเวอร์ยังไม่ได้ Deploy รุ่นใหม่ / เปิดลิงก์ไม่ได้ -> พักทางตรง 1 ชั่วโมง
                        if (e.hard) directOff(86400000, e.message);
                        else if (e.server || /ลิงก์อัปโหลด/.test(e.message)) directOff(3600000, e.message);
                        // เน็ตหลุด/หมดเวลา : ไม่พักทางตรง (ครั้งหน้าลองใหม่)
                        rest = list.filter(f => !assetIds.has(f.job.value));
                    }
                }
                if (rest.length) return viaScript(rest);
                const isText = list.every(f => f.kind === 'text');
                SAVE.phase(isText ? 'กำลังบันทึกข้อมูลหนังสือ…' : 'บันทึกไฟล์ครบ ' + list.length + ' ไฟล์ · กำลังบันทึกข้อมูลหนังสือ…');
            };

            /* [ข้อ 3] ดาวน์โหลด/พิมพ์ภาพหนังสือ : รองรับทั้ง JPEG (ใหม่) และ PNG (เดิม) — แก้ไว้ในฟังก์ชันหลักแล้ว */
        })();

        /* =====================================================================
           [v27] ไม่เก็บภาพหน้ากระดาษทุกขั้นตอน
             เดิม : ทุกครั้งที่ประทับตรา/ส่งต่อ ระบบถ่ายภาพทั้งหน้า (หลายร้อย KB–หลาย MB) แล้วอัปโหลดขึ้น Drive
             ใหม่ : เก็บภาพต้นฉบับครั้งเดียว + ข้อมูลตรา (canvasState ไม่กี่ KB)
                    ภาพหนังสือพร้อมตราสร้างในเครื่องตอน เปิดดู / ดาวน์โหลด / พิมพ์ / PDF / แชร์
             หนังสือเก่าที่ยังไม่มี canvasState ใช้ภาพเดิม (currentImage) ได้ตามปกติ
           ===================================================================== */
        (function v27() {
            const IMG_CACHE = new Map();                     // docId -> { cs, url }
            const PROPS = ['id', 'stampName', 'isCurrentStep', 'selectable', 'evented', 'originalFill', 'originalStroke', 'stampColor'];
            const csOf = (doc) => {
                const cs = doc && doc.canvasState;
                return (typeof cs === 'string' && cs.charAt(0) === '{') ? cs : '';
            };

            async function renderState(cs) {
                const json = JSON.parse(cs);
                if (!json.backgroundImage) return '';
                const el = document.createElement('canvas');
                const sc = new fabric.StaticCanvas(el, { enableRetinaScaling: false, renderOnAddRemove: false });
                try {
                    await new Promise((resolve, reject) => {
                        const t = setTimeout(() => reject(new Error('สร้างภาพหนังสือไม่ทันเวลา')), 25000);
                        sc.loadFromJSON(json, () => { clearTimeout(t); resolve(); }, (o, object) => {
                            PROPS.forEach(k => { if (o[k] !== undefined) object[k] = o[k]; });
                        });
                    });
                    const bg = sc.backgroundImage;
                    if (!bg || !bg.width) return '';
                    const w = bg.width * (bg.scaleX || 1), h = bg.height * (bg.scaleY || 1);
                    sc.setWidth(w);
                    sc.setHeight(h);
                    // ตราของขั้นตอนปัจจุบัน : แสดงแบบเดียวกับตอนส่งต่อ (พื้นขาวโปร่ง ไม่มีเส้นประ)
                    sc.getObjects().forEach(o => {
                        if (!o.stampName) return;
                        o.set('shadow', null);
                        if (o.isCurrentStep && o.item && o.item(0)) {
                            o.item(0).set({ fill: 'rgba(255, 255, 255, 0.75)', stroke: o.originalStroke || o.item(0).stroke, strokeDashArray: null, shadow: null });
                        }
                    });
                    sc.renderAll();
                    // ความละเอียดเท่าภาพต้นฉบับ (ไม่เกินกว้าง 2600px)
                    const mult = Math.max(1.5, Math.min(3, 1 / (bg.scaleX || 1), 2600 / w));
                    return sc.toDataURL({ format: 'jpeg', quality: 0.9, multiplier: mult });
                } finally {
                    try { sc.dispose(); } catch (e) { /* ข้าม */ }
                }
            }

            /** ภาพพร้อมตราที่สร้างไว้แล้ว (ถ้ายังไม่ได้สร้าง/ไม่มีข้อมูลตรา -> ภาพเดิม) */
            window.pcViewImg = function (doc) {
                if (!doc) return '';
                const cs = csOf(doc);
                if (cs) {
                    const c = IMG_CACHE.get(doc.id);
                    if (c && c.cs === cs) return c.url;
                }
                return doc.currentImage || '';
            };
            /** สร้างภาพพร้อมตราจาก canvasState (แคชไว้จนกว่าตราจะเปลี่ยน) */
            window.pcDocImage = async function (doc) {
                const cs = csOf(doc);
                if (!cs || typeof fabric === 'undefined') return (doc && doc.currentImage) || '';
                const c = IMG_CACHE.get(doc.id);
                if (c && c.cs === cs) return c.url;
                let url = '';
                try { url = await renderState(cs); } catch (e) { console.warn('[PC] render doc image', e); }
                if (url) {
                    IMG_CACHE.delete(doc.id);
                    IMG_CACHE.set(doc.id, { cs: cs, url: url });
                    while (IMG_CACHE.size > 12) IMG_CACHE.delete(IMG_CACHE.keys().next().value);
                    return url;
                }
                return doc.currentImage || '';
            };

            async function prepare(docId) {
                const doc = findDoc(docId);
                if (!doc) return null;
                if (needsHydrate(doc, 'image')) {
                    const ok = await hydrateDoc(doc, 'image');
                    if (!ok) return null;
                }
                await window.pcDocImage(doc);
                // [v34] สร้างภาพจากข้อมูลตราไม่ได้ (ข้อมูลตราเสีย) -> โหลดภาพหน้ากระดาษที่บันทึกไว้แทน
                const shown = window.pcViewImg(doc);
                if (typeof shown === 'string' && shown.indexOf('@@') === 0) await hydrateDoc(doc, 'imgonly');
                return doc;
            }
            PC.prepareDocImage = prepare;

            // เปิดดู / ดาวน์โหลด / PDF : สร้างภาพพร้อมตราก่อน แล้วเรียกฟังก์ชันเดิม
            ['viewFinalDocument', 'viewMainDocument', 'downloadFinalDoc', 'exportFinalPdf'].forEach(fn => {
                const orig = window[fn];
                if (typeof orig !== 'function') return;
                window[fn] = async function () {
                    const args = arguments;
                    try { await prepare(args[0]); } catch (e) { console.warn('[PC] prepare image', e); }
                    return orig.apply(this, args);
                };
            });

            // พิมพ์ : ใช้ iframe ซ่อน (ไม่โดนตัวบล็อกป๊อปอัป แม้ต้องรอโหลดภาพก่อน)
            window.printFinalDoc = async function (docId) {
                let doc = null;
                try { doc = await prepare(docId); } catch (e) { doc = findDoc(docId); }
                const img = window.pcViewImg(doc);
                if (!img) return Swal.fire('แจ้งเตือน', 'ไม่พบไฟล์หนังสือหรือยังไม่ได้อัปโหลด', 'warning');
                const fr = document.createElement('iframe');
                fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
                document.body.appendChild(fr);
                const d = fr.contentWindow.document;
                d.open();
                d.write('<html><head><title>พิมพ์เอกสาร ' + esc(doc.receiveNo || '') + '</title><style>body{margin:0;text-align:center}img{max-width:100%;height:auto}</style></head><body><img id="pc-print-img" src="' + img + '"></body></html>');
                d.close();
                const im = d.getElementById('pc-print-img');
                const go = () => {
                    try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { /* ข้าม */ }
                    setTimeout(() => fr.remove(), 60000);
                };
                if (im.complete && im.naturalWidth) go(); else { im.onload = go; im.onerror = () => fr.remove(); }
            };

            // แชร์ : สร้างภาพพร้อมตรา อัปโหลดครั้งเดียว (แคชตามข้อมูลตรา) แล้วเปิดลิงก์แชร์
            window.shareFinalDoc = async function (docId) {
                try {
                    status.show('กำลังเตรียมลิงก์แชร์…', 'busy');
                    const doc = await prepare(docId);
                    if (!doc) throw new Error('ไม่พบหนังสือ');
                    await docSync.flush();
                    const img = window.pcViewImg(doc);
                    if (!img) throw new Error('ไม่พบไฟล์หนังสือ');
                    let id = assetIds.get(img);
                    if (!id && img.indexOf('data:') === 0) {
                        await uploadJobs([{ data: img, kind: 'data', name: fileNameFor(doc, ['currentImage']), route: routeOf(doc), date: createdMs(doc), job: { value: img } }]);
                        if (PC.saveProgress && !docSync.running) PC.saveProgress.end(true);
                        id = assetIds.get(img);
                    }
                    if (!id) throw new Error('หนังสือยังไม่ถูกบันทึกขึ้น Google Drive');
                    const res = await api('shareAsset', { id: id });
                    status.hide();
                    try { await navigator.clipboard.writeText(res.url); } catch (e) { /* ข้าม */ }
                    Swal.fire({ icon: 'success', title: 'คัดลอกลิงก์แชร์แล้ว', html: '<input class="w-full p-2 border rounded-lg text-xs" readonly value="' + esc(res.url) + '" onclick="this.select()"><a href="' + esc(res.url) + '" target="_blank" class="inline-block mt-3 text-blue-600 font-bold text-sm">เปิดลิงก์</a>' });
                } catch (e) {
                    if (PC.saveProgress && !docSync.running) PC.saveProgress.end(false, 'แชร์ไม่สำเร็จ: ' + e.message);
                    status.hide();
                    Swal.fire({ icon: 'error', title: 'แชร์ไม่สำเร็จ', text: e.message });
                }
            };
        })();

        /* =====================================================================
           [v28]
             1-2 เพิ่มงาน / เพิ่มกิจกรรม : เลือก "แชร์เฉพาะกลุ่ม/บุคคล" -> เลือกกลุ่มบริหาร + กลุ่มงานที่ผู้ใช้สังกัดให้ก่อน
             3   การ์ดหนังสือ : ผู้รับขั้นตอนปัจจุบันเปิดอ่านแล้วหรือยัง (ตาราง DocReads)
             5   แท็บสถิติหนังสือรับ (Dashboard)
           ===================================================================== */
        (function v28() {
            const MAIN = ['กลุ่มบริหารวิชาการ', 'กลุ่มบริหารงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารทั่วไป'];
            const clean = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const myId = () => (state.user && state.user.id) ? String(state.user.id) : '';
            const rooms = () => (typeof defaultRooms !== 'undefined' && Array.isArray(defaultRooms)) ? defaultRooms : [];
            const parentOf = (name) => { const n = clean(name); const r = rooms().find(x => clean(x.name) === n); return r && r.parent ? clean(r.parent) : ''; };
            const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const pad2 = (n) => String(n).padStart(2, '0');
            const shortWhen = (ms) => { const d = new Date(Number(ms)); return isNaN(d) ? '' : d.getDate() + ' ' + TH_MS[d.getMonth()] + ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + ' น.'; };

            /* ---------------------------------------------------------------
               [ข้อ 1-2] ค่าเริ่มต้นของ "แชร์เฉพาะกลุ่ม / บุคคลที่เลือก" = กลุ่มบริหาร + กลุ่มงานที่ผู้ใช้สังกัด
               --------------------------------------------------------------- */
            function defaultShareTokens() {
                const out = [];
                const add = (g) => { const v = 'g:' + g; if (g && !out.includes(v)) out.push(v); };
                // เฉพาะกลุ่มที่มีอยู่ในตัวเลือกจริง (กลุ่มบริหาร 4 กลุ่ม + ห้องกลุ่มงาน)
                const subs = new Set(rooms().filter(r => (r.type || '') === 'sub' || (r.parent && !MAIN.includes(clean(r.name)))).map(r => clean(r.name)));
                const mine = (state.user.groups || []).concat(state.user.group ? [state.user.group] : []).map(clean).filter(Boolean);
                // ห้องที่ไม่มีข้อมูล parent : อนุมานจากลำดับห้อง (กลุ่มงานเรียงต่อท้ายกลุ่มบริหารของตน)
                const inferParent = (g) => {
                    const list = rooms(), i = list.findIndex(r => clean(r.name) === g);
                    for (let k = i - 1; k >= 0; k--) { const n = clean(list[k].name); if (MAIN.includes(n)) return n; }
                    return '';
                };
                mine.forEach(g => {
                    if (MAIN.includes(g)) { add(g); return; }
                    const p = parentOf(g) || inferParent(g);
                    if (MAIN.includes(p)) add(p);
                    if (subs.has(g)) add(g);           // เพิ่มเฉพาะกลุ่มงานที่มีในตัวเลือก
                });
                return out;
            }
            PC.defaultShareTokens = defaultShareTokens;
            const SHARE_BOX = {
                event: { mode: 'event-share-mode', box: 'event-share-picker', custom: 'custom' },
                task: { mode: 'task-visibility', box: 'task-share-picker', custom: 'shared' }
            };
            const origShareMode = PC.onShareModeChange;
            if (typeof origShareMode === 'function') {
                PC.onShareModeChange = function (kind) {
                    const r = origShareMode.apply(this, arguments);
                    const ui = SHARE_BOX[kind];
                    const sel = ui && document.getElementById(ui.mode);
                    if (sel && sel.value === ui.custom && PC.CDD && PC.CDD[ui.box] && !PC.cdd.chosen(ui.box).length) {
                        const def = defaultShareTokens();
                        if (def.length) { def.forEach(v => PC.cdd.set(ui.box, v, true)); PC.cdd.render(ui.box); }
                    }
                    return r;
                };
            }

            /* ---------------------------------------------------------------
               [ข้อ 3] เปิดอ่านแล้วหรือยัง
                 บันทึกเมื่อผู้รับของขั้นตอนปัจจุบัน (ผู้มีสิทธิ์ลงนาม/ปฏิบัติงานขั้นนั้น) เปิดหนังสือ
                 ผู้ดูแลระบบเปิดดูไม่นับ (มักเปิดตรวจสอบแทน ไม่ใช่ผู้รับตัวจริง)
               --------------------------------------------------------------- */
            const STAGE_WHO = (doc) => {
                const main = clean((doc.assignedGroups || [])[0]), sub = clean((doc.subGroups || [])[0]);
                return ({
                    1: 'ธุรการกลาง', 4: 'ผอ.', 5: 'ธุรการ' + (main || 'กลุ่มบริหาร'), 6: 'รอง ผอ.' + (main || 'กลุ่มบริหาร'),
                    65: 'ธุรการ' + (sub || 'กลุ่มงาน'), 7: 'ผช. ผอ.' + (sub || 'กลุ่มงาน'), 8: doc.assigneeName || 'ผู้รับผิดชอบ'
                })[Number(doc.stage)] || '';
            };
            function readsOf(doc) {
                const rec = PC.store && PC.store.reads && PC.store.reads[doc.id];
                if (!rec || !rec.d || Number(rec.d.stage) !== Number(doc.stage)) return {};
                let r = rec.d.readers;
                if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = {}; } }
                return (r && typeof r === 'object') ? r : {};
            }
            PC.readsOf = readsOf;
            window.pcReadBadge = function (doc, who) {
                if (!doc || Number(doc.stage) === 99) return '';
                const rd = readsOf(doc);
                const list = Object.keys(rd).map(k => ({ id: k, name: (rd[k] || [])[0] || k, t: Number((rd[k] || [])[1]) || 0 })).sort((a, b) => a.t - b.t);
                const base = 'transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border whitespace-nowrap';
                const idq = jsq(doc.id);
                const target = who || STAGE_WHO(doc);
                if (!list.length) {
                    return `<button type="button" onclick="PC.showReaders('${idq}')" class="${base} bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100" title="รอ ${esc(target)} เปิดอ่าน"><i class="fa-regular fa-envelope"></i> ยังไม่เปิดอ่าน</button>`;
                }
                const first = list[0];
                const more = list.length > 1 ? ' +' + (list.length - 1) : '';
                return `<button type="button" onclick="PC.showReaders('${idq}')" class="${base} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" title="เปิดอ่านเมื่อ ${esc(shortWhen(first.t))}"><i class="fa-solid fa-envelope-open-text"></i> เปิดอ่านแล้ว: ${esc(first.name)}${more}</button>`;
            };
            PC.showReaders = function (docId) {
                const doc = findDoc(docId);
                if (!doc) return;
                const rd = readsOf(doc);
                const list = Object.keys(rd).map(k => ({ name: (rd[k] || [])[0] || k, t: Number((rd[k] || [])[1]) || 0 })).sort((a, b) => a.t - b.t);
                const rows = list.length
                    ? list.map(x => `<div class="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0"><i class="fa-solid fa-circle-check text-emerald-600"></i><span class="font-bold text-slate-800 flex-1">${esc(x.name)}</span><span class="text-xs text-slate-500">${esc(shortWhen(x.t))}</span></div>`).join('')
                    : `<div class="flex items-center gap-2 py-2 text-slate-500"><i class="fa-regular fa-envelope"></i> ยังไม่มีผู้รับเปิดอ่าน</div>`;
                Swal.fire({
                    title: '<div class="text-base font-bold text-slate-800"><i class="fa-solid fa-envelope-open-text text-emerald-600 mr-2"></i>สถานะการเปิดอ่าน</div>',
                    html: `<div class="text-left text-sm">
                        <div class="text-xs text-slate-500 mb-1">ขั้นตอนปัจจุบัน</div>
                        <div class="font-bold text-indigo-700 mb-3"><i class="fa-solid fa-user-clock mr-1"></i>${esc(STAGE_WHO(doc))}</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-xl px-3">${rows}</div></div>`,
                    confirmButtonText: 'ปิด', confirmButtonColor: '#4f46e5'
                });
            };
            const canActOn = (doc) => {
                if (!doc || Number(doc.stage) === 99 || realRole() === 'ADMIN') return false;
                if (Number(doc.stage) === 8 && Array.isArray(doc.assigneeIds) && doc.assigneeIds.map(String).includes(myId())) return true;
                try { return typeof PC.signTabForDoc === 'function' && !!PC.signTabForDoc(doc); } catch (e) { return false; }
            };
            const readSending = new Set();
            let readRenderT = null;
            function markRead(doc) {
                if (!doc || !PC.token || !PC.store || !canActOn(doc)) return;
                const stage = Number(doc.stage);
                const rd = readsOf(doc);
                if (rd[myId()]) return;
                // แสดงผลทันทีในเครื่อง (เซิร์ฟเวอร์ยืนยันแล้วซิงก์กลับมาทับเอง)
                if (!PC.store.reads) PC.store.reads = {};
                const mine = Object.assign({}, rd);
                mine[myId()] = [state.user.name || myId(), Date.now()];
                PC.store.reads[doc.id] = { d: { id: doc.id, stage: stage, readers: mine }, r: 0, u: Date.now(), x: 0 };
                clearTimeout(readRenderT);
                readRenderT = setTimeout(() => { try { rerenderAll({ docs: true }); } catch (e) { /* ข้าม */ } }, 400);
                const key = doc.id + '|' + stage;
                if (readSending.has(key)) return;
                readSending.add(key);
                const send = (n) => api('markRead', { docId: doc.id, stage: stage }, { retries: 1, timeout: 30000 })
                    .then(() => readSending.delete(key))
                    .catch(e => {
                        if (n < 3 && (!e.server || e.code === 'BUSY')) setTimeout(() => send(n + 1), 15000 * (n + 1));
                        else readSending.delete(key);
                    });
                send(0);
            }
            PC.markRead = markRead;
            (function () {
                const orig = window.selectDoc;
                if (typeof orig !== 'function') return;
                window.selectDoc = function (docId, stage) {
                    const r = orig.apply(this, arguments);
                    Promise.resolve(r).finally(() => {
                        const doc = findDoc(docId);
                        if (doc && Number(stage) === Number(doc.stage)) markRead(doc);
                    });
                    return r;
                };
            })();
            ['viewMainDocument', 'viewFinalDocument'].forEach(fn => {
                const orig = window[fn];
                if (typeof orig !== 'function') return;
                window[fn] = function (docId) {
                    const r = orig.apply(this, arguments);
                    try { markRead(findDoc(docId)); } catch (e) { /* ข้าม */ }
                    return r;
                };
            });

            /* ---------------------------------------------------------------
               [ข้อ 5] แท็บสถิติหนังสือรับ
               --------------------------------------------------------------- */
            const DAY = 864e5;
            const G_COLOR = { 'กลุ่มบริหารวิชาการ': '#f7638a', 'กลุ่มบริหารงบประมาณ': '#047857', 'กลุ่มบริหารงานบุคคล': '#2563eb', 'กลุ่มบริหารทั่วไป': '#eda100', '': '#94a3b8' };
            const G_SHORT = { 'กลุ่มบริหารวิชาการ': 'วิชาการ', 'กลุ่มบริหารงบประมาณ': 'งบประมาณ', 'กลุ่มบริหารงานบุคคล': 'บุคคล', 'กลุ่มบริหารทั่วไป': 'ทั่วไป', '': 'ยังไม่มอบหมาย' };
            const ST = {
                late: { c: '#d03b3b', soft: '#fdecec', ink: '#ffffff', label: 'ตกค้าง (เกิน 7 วัน)', short: 'ตกค้าง', icon: 'fa-triangle-exclamation' },
                prog: { c: '#fab219', soft: '#fff6e0', ink: '#3b2a00', label: 'กำลังดำเนินการ', short: 'กำลังดำเนินการ', icon: 'fa-hourglass-half' },
                done: { c: '#0ca30c', soft: '#e7f6e7', ink: '#ffffff', label: 'เสร็จสิ้น', short: 'เสร็จสิ้น', icon: 'fa-circle-check' }
            };
            const STAGE_NAME = { 1: 'ธุรการกลาง', 4: 'ผอ.', 5: 'ธุรการกลุ่มบริหาร', 6: 'รอง ผอ.', 65: 'ธุรการกลุ่มงาน', 7: 'ผช. ผอ.', 8: 'ผู้รับผิดชอบ' };
            const STAGE_ORDER = [1, 4, 5, 6, 65, 7, 8];
            const PERIODS = [['today', 'วันนี้'], ['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['year', 'ปีนี้']];
            const S = { period: 'month', trend: 'week', week: 0, year: new Date().getFullYear() };
            try { const p = localStorage.getItem('pc-stats-period'); if (PERIODS.some(x => x[0] === p)) S.period = p; } catch (e) { /* ข้าม */ }
            // [v30 ข้อ 7] เลือกปีที่แสดงสถิติ (ปีก่อน ๆ โหลดจากคลังรายปีเพิ่ม)
            const ARCH = {};                                   // 'พ.ศ.' -> [doc]
            const isCurYear = () => S.year === new Date().getFullYear();
            const anchorNow = () => (isCurYear() ? Date.now() : new Date(S.year, 11, 31, 23, 59, 59).getTime());
            const tOf = (d) => {
                const m = /doc_(\d{12,13})/.exec(String(d.rootDocId || d.id || ''));
                if (m) return Number(m[1]);
                if (d._c) return Number(d._c);
                return createdMs(d);
            };

            const mainOf = (g) => {
                const n = clean(g);
                if (!n) return '';
                return MAIN.find(m => m === n) || MAIN.find(m => n.includes(m.replace('กลุ่มบริหาร', ''))) || '';
            };
            const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
            const weekStart = (ms) => { const d = new Date(dayStart(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };   // จันทร์
            const monthStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
            function periodRange(p) {
                if (!isCurYear()) return [new Date(S.year, 0, 1).getTime(), anchorNow()];
                const now = Date.now();
                if (p === 'today') return [dayStart(now), now];
                if (p === 'week') return [weekStart(now), now];
                if (p === 'year') return [new Date(new Date().getFullYear(), 0, 1).getTime(), now];
                return [monthStart(now), now];
            }
            const fmtDay = (ms, withYear) => { const d = new Date(ms); return d.getDate() + ' ' + TH_MS[d.getMonth()] + (withYear ? ' ' + (d.getFullYear() + 543) : ''); };
            function rangeText(p) {
                const [a, b] = periodRange(p);
                if (!isCurYear()) return 'ทั้งปี พ.ศ. ' + (S.year + 543);
                if (p === 'today') return fmtDay(a, true);
                if (p === 'year') return 'ปี พ.ศ. ' + (new Date(a).getFullYear() + 543);
                return fmtDay(a) + ' – ' + fmtDay(b, true);
            }
            const secretHidden = (doc) => doc && doc.secrecy && doc.secrecy !== 'normal' && !['ADMIN', 'Administrative', 'Director', 'ActingDirector'].includes(realRole());
            const recTime = (d) => { const r = PC.store && PC.store.docs && PC.store.docs[d.id]; return (r && r.u) || 0; };

            /** รวมสำเนาหนังสือ (ส่งหลายกลุ่ม = หลายสำเนา) เป็น "เรื่องรับ" 1 เรื่อง */
            function buildUnits() {
                const now = Date.now();
                const roots = new Map();
                const seen = new Set();
                const add = (d) => {
                    if (!d || !d.id || seen.has(d.id)) return;
                    seen.add(d.id);
                    const k = d.rootDocId || d.id;
                    if (!roots.has(k)) roots.set(k, []);
                    roots.get(k).push(d);
                };
                (state.documentQueue || []).forEach(add);
                (ARCH[String(S.year + 543)] || []).forEach(add);        // [v30 ข้อ 7] หนังสือในคลังของปีที่เลือก
                const units = [];
                roots.forEach((copies, k) => {
                    const t = Math.min.apply(null, copies.map(c => tOf(c) || now));
                    const done = copies.every(c => Number(c.stage) === 99);
                    const doneAt = done ? Math.max.apply(null, copies.map(c => Number(c.doneAt) || recTime(c) || t)) : 0;
                    const status = done ? 'done' : (now - t > 7 * DAY ? 'late' : 'prog');
                    units.push({ key: k, t: t, copies: copies, done: done, doneAt: doneAt, status: status, head: copies.find(c => c.id === k) || copies[0] });
                });
                return units;
            }
            const copyStatus = (u, list) => (list.every(c => Number(c.stage) === 99) ? 'done' : (Date.now() - u.t > 7 * DAY ? 'late' : 'prog'));
            const emptyCount = () => ({ total: 0, late: 0, prog: 0, done: 0 });
            function groupStats(units) {
                const byMain = {}, bySub = {};
                units.forEach(u => {
                    const mains = new Map(), subs = new Map();
                    u.copies.forEach(c => {
                        const m = mainOf((c.assignedGroups || [])[0]);
                        if (!mains.has(m)) mains.set(m, []);
                        mains.get(m).push(c);
                        (c.subGroups || []).map(clean).filter(Boolean).forEach(s => { if (!subs.has(s)) subs.set(s, []); subs.get(s).push(c); });
                    });
                    // ถ้ามีสำเนาที่มอบหมายกลุ่มแล้ว ไม่นับสำเนาต้นเรื่อง (ยังไม่มอบหมาย) ซ้ำ
                    if (mains.size > 1) mains.delete('');
                    mains.forEach((list, m) => { const o = byMain[m] = byMain[m] || emptyCount(); o.total++; o[copyStatus(u, list)]++; });
                    subs.forEach((list, s) => { const o = bySub[s] = bySub[s] || emptyCount(); o.total++; o[copyStatus(u, list)]++; });
                });
                return { byMain: byMain, bySub: bySub };
            }

            // ---------- tooltip ----------
            function tipEl() {
                let el = document.getElementById('pcs-tip');
                if (!el) { el = document.createElement('div'); el.id = 'pcs-tip'; el.className = 'pcs-tip'; document.body.appendChild(el); }
                return el;
            }
            function showTip(html, x, y) {
                const el = tipEl();
                el.innerHTML = html;
                el.style.display = 'block';
                const w = el.offsetWidth, h = el.offsetHeight;
                let L = x + 14, T = y - h - 12;
                if (L + w > window.innerWidth - 8) L = x - w - 14;
                if (L < 8) L = 8;
                if (T < 8) T = y + 18;
                el.style.left = L + 'px';
                el.style.top = T + 'px';
            }
            const hideTip = () => { const el = document.getElementById('pcs-tip'); if (el) el.style.display = 'none'; };
            const tipRow = (color, label, value) => `<div style="display:flex;align-items:center;gap:6px;margin-top:2px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex:none"></span><span style="flex:1">${label}</span><b style="margin-left:10px">${value}</b></div>`;

            // ---------- องค์ประกอบกราฟ ----------
            const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
            const pctTxt = (a, b) => { const v = pct(a, b); return (v % 1 ? v.toFixed(1) : String(v)) + '%'; };
            const num = (n) => Number(n || 0).toLocaleString('th-TH');
            const card = (title, sub, body, extra) => `<div class="pcs-card"><div class="flex items-start justify-between gap-3 mb-3 flex-wrap"><div><div class="pcs-h">${title}</div>${sub ? `<div class="pcs-sub mt-0.5">${sub}</div>` : ''}</div>${extra || ''}</div>${body}</div>`;
            const emptyBox = (text) => `<div class="pcs-empty"><i class="fa-regular fa-folder-open"></i><div>${text || 'ยังไม่มีข้อมูลในช่วงเวลานี้'}</div></div>`;

            function kpiCards(units) {
                const c = emptyCount();
                units.forEach(u => { c.total++; c[u.status]++; });
                const doneU = units.filter(u => u.done && u.doneAt >= u.t);
                const avg = doneU.length ? doneU.reduce((s, u) => s + (u.doneAt - u.t), 0) / doneU.length / DAY : null;
                const avgTxt = avg === null ? '' : (avg < 1 ? 'เฉลี่ยไม่ถึง 1 วัน/เรื่อง' : 'เฉลี่ย ' + avg.toFixed(1) + ' วัน/เรื่อง');
                // [v29 ข้อ 1] การ์ดสรุปแบบพื้นไล่สี ตัวเลขใหญ่ ไอคอนวงกลมโปร่ง + fa-fade
                const GRAD = {
                    total: 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)',
                    late: 'linear-gradient(135deg,#f43f5e 0%,#be123c 100%)',
                    prog: 'linear-gradient(135deg,#f59e0b 0%,#c2410c 100%)',
                    done: 'linear-gradient(135deg,#10b981 0%,#047857 100%)',
                    zero: 'linear-gradient(135deg,#64748b 0%,#475569 100%)'   // [ต.ค. 2569] ตกค้าง 0 = ไม่ใช่เรื่องร้าย ไม่ใช้สีแดง
                };
                const item = (key, label, icon, value, sub, share) => `
                    <div class="pcs-kpi2" style="background:${key === 'late' && !value ? GRAD.zero : GRAD[key]}" data-tip="${esc(`<b>${label}</b><br>${num(value)} เรื่อง${key !== 'total' ? ' (' + pctTxt(value, c.total) + ' ของทั้งหมด)' : ''}`)}">
                        <div class="min-w-0 flex-1 relative" style="z-index:1">
                            <div class="lb">${label}</div>
                            <div class="v">${num(value)}<span class="u">เรื่อง</span></div>
                            <div class="sb">${sub}</div>
                            <div class="bar"><i style="width:${share}%"></i></div>
                        </div>
                        <div class="ic"><i class="fa-solid ${icon} fa-fade" style="--fa-animation-duration:2.2s;--fa-fade-opacity:.45"></i></div>
                    </div>`;
                return `<div class="pcs-kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                    ${item('total', 'หนังสือรับทั้งหมด', 'fa-inbox', c.total, rangeText(S.period), c.total ? 100 : 0)}
                    ${item('late', ST.late.label, ST.late.icon, c.late, pctTxt(c.late, c.total) + ' ของทั้งหมด', pct(c.late, c.total))}
                    ${item('prog', ST.prog.label, ST.prog.icon, c.prog, pctTxt(c.prog, c.total) + ' ของทั้งหมด', pct(c.prog, c.total))}
                    ${item('done', ST.done.label, ST.done.icon, c.done, pctTxt(c.done, c.total) + (avgTxt ? ' · ' + avgTxt : ''), pct(c.done, c.total))}
                </div>`;
            }

            function donutCard(gs) {
                const keys = MAIN.concat(['']).filter(k => gs.byMain[k] && gs.byMain[k].total);
                const total = keys.reduce((s, k) => s + gs.byMain[k].total, 0);
                if (!total) return card('<i class="fa-solid fa-chart-pie text-indigo-500"></i> สัดส่วนตามกลุ่มบริหาร', rangeText(S.period), emptyBox());
                const R = 62, C = 2 * Math.PI * R, GAP = keys.length > 1 ? 3 : 0;
                let off = 0;
                const arcs = keys.map(k => {
                    const v = gs.byMain[k].total, len = v / total * C;
                    const seg = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${G_COLOR[k]}" stroke-width="24" stroke-dasharray="${Math.max(0.01, len - GAP)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"
                        data-tip="${esc(`<b>${k || 'ยังไม่มอบหมายกลุ่ม'}</b>` + tipRow(G_COLOR[k], 'จำนวน', num(v) + ' เรื่อง') + tipRow(G_COLOR[k], 'สัดส่วน', pctTxt(v, total)))}" style="cursor:pointer"></circle>`;
                    off += len;
                    return seg;
                }).join('');
                const svg = `<svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="สัดส่วนหนังสือตามกลุ่มบริหาร">
                    <circle cx="90" cy="90" r="${R}" fill="none" stroke="#f1f5f9" stroke-width="24"></circle>${arcs}
                    <text x="90" y="86" text-anchor="middle" style="font:800 28px Sarabun,sans-serif;fill:#0f172a">${num(total)}</text>
                    <text x="90" y="108" text-anchor="middle" style="font:600 12px Sarabun,sans-serif;fill:#64748b">เรื่อง</text></svg>`;
                const legend = keys.map(k => `<div class="flex items-center gap-2 py-1.5" data-tip="${esc(`<b>${k || 'ยังไม่มอบหมายกลุ่ม'}</b>` + tipRow(G_COLOR[k], 'จำนวน', num(gs.byMain[k].total) + ' เรื่อง'))}">
                        <span class="w-3 h-3 rounded-full shrink-0" style="background:${G_COLOR[k]}"></span>
                        <span class="text-[12.5px] font-semibold text-slate-700 flex-1 truncate">${k ? esc(k) : 'ยังไม่มอบหมายกลุ่ม'}</span>
                        <span class="text-[12px] text-slate-500 tabular-nums">${num(gs.byMain[k].total)}</span>
                        <span class="text-[12.5px] font-extrabold text-slate-800 w-12 text-right tabular-nums">${pctTxt(gs.byMain[k].total, total)}</span></div>`).join('');
                return card('<i class="fa-solid fa-chart-pie text-indigo-500"></i> สัดส่วนตามกลุ่มบริหาร', rangeText(S.period) + ' · หนังสือที่ส่งหลายกลุ่มนับในทุกกลุ่ม',
                    `<div class="flex flex-col sm:flex-row lg:flex-col items-center gap-4"><div class="shrink-0">${svg}</div><div class="w-full min-w-0">${legend}</div></div>`);
            }

            const statusLegend = () => `<div class="flex flex-wrap gap-x-3 gap-y-1">${['late', 'prog', 'done'].map(k => `<span class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><span class="w-2.5 h-2.5 rounded-sm" style="background:${ST[k].c}"></span>${ST[k].label}</span>`).join('')}</div>`;
            function stackBar(o, name) {
                const segs = ['late', 'prog', 'done'].filter(k => o[k] > 0).map(k => {
                    const w = o[k] / o.total * 100;
                    const lab = w >= 14 ? pctTxt(o[k], o.total) : '';
                    return `<span style="flex:${o[k]} 1 0;background:${ST[k].c};color:${ST[k].ink}" data-tip="${esc(`<b>${name}</b>` + tipRow(ST[k].c, ST[k].label, num(o[k]) + ' เรื่อง (' + pctTxt(o[k], o.total) + ')'))}">${lab}</span>`;
                }).join('');
                return `<div class="pcs-stack">${segs}</div>`;
            }
            function subgroupCard(gs) {
                const names = Object.keys(gs.bySub).sort((a, b) => gs.bySub[b].total - gs.bySub[a].total);
                const body = names.length ? `<div class="space-y-3 pcs-scroll">${names.map(n => {
                    const o = gs.bySub[n], p = parentOf(n);
                    return `<div>
                        <div class="flex items-end justify-between gap-2 mb-1">
                            <div class="min-w-0"><div class="text-[12.5px] font-bold text-slate-800 truncate">${esc(n)}</div>${p ? `<div class="text-[10.5px] text-slate-400 font-semibold truncate"><span class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style="background:${G_COLOR[mainOf(p)] || '#94a3b8'}"></span>${esc(p)}</div>` : ''}</div>
                            <div class="text-[11px] text-slate-500 whitespace-nowrap tabular-nums"><b class="text-slate-800 text-[13px]">${num(o.total)}</b> เรื่อง · เสร็จ ${pctTxt(o.done, o.total)}</div>
                        </div>${stackBar(o, n)}</div>`;
                }).join('')}</div>` : emptyBox('ยังไม่มีหนังสือที่มอบหมายถึงกลุ่มงานในช่วงเวลานี้');
                return card('<i class="fa-solid fa-bars-progress text-indigo-500"></i> ความคืบหน้าตามกลุ่มงาน', rangeText(S.period), body, statusLegend());
            }

            function niceTicks(max) {
                if (max <= 0) return [0, 1, 2, 3, 4];
                const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
                const step = Math.max(1, [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw));
                const out = [];
                for (let v = 0; v <= max + step * 0.001 || out.length < 2; v += step) out.push(Math.round(v * 100) / 100);
                if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
                return out;
            }
            function smoothPath(pts) {
                const n = pts.length;
                if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : '';
                const dx = [], m = [], t = [];
                for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
                t[0] = m[0]; t[n - 1] = m[n - 2];
                for (let i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
                for (let i = 0; i < n - 1; i++) {
                    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
                    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
                    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
                }
                let d = `M${pts[0][0]},${pts[0][1]}`;
                for (let i = 0; i < n - 1; i++) {
                    const h = dx[i] / 3;
                    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
                }
                return d;
            }
            function trendBuckets(units) {
                const out = [], anchor = anchorNow();
                const MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
                if (S.trend === 'month') {
                    // ปีปัจจุบัน : 12 เดือนล่าสุด , ปีก่อน : ม.ค. – ธ.ค. ของปีนั้น
                    const d = new Date(anchor); d.setDate(1); d.setHours(0, 0, 0, 0);
                    for (let i = 11; i >= 0; i--) {
                        const a = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), b = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
                        const ad = new Date(a);
                        out.push({ a: a, b: b, label: TH_MS[ad.getMonth()], full: 'เดือน' + MONTH_FULL[ad.getMonth()] + ' ' + (ad.getFullYear() + 543) });
                    }
                } else {
                    const w0 = weekStart(anchor);
                    for (let i = 11; i >= 0; i--) {
                        const a = w0 - i * 7 * DAY, b = a + 7 * DAY;
                        out.push({ a: a, b: b, label: fmtDay(a), full: 'สัปดาห์ ' + fmtDay(a) + ' – ' + fmtDay(b - DAY, true) });
                    }
                }
                out.forEach(k => { k.v = units.filter(u => u.t >= k.a && u.t < k.b).length; });
                return out;
            }
            function trendCard() {
                const tog = `<div class="flex gap-1">${[['week', 'รายสัปดาห์'], ['month', 'รายเดือน']].map(([k, l]) => `<button type="button" class="pcs-mini ${S.trend === k ? 'on' : ''}" onclick="PC.statsSet('trend','${k}')">${l}</button>`).join('')}</div>`;
                const sub = S.trend === 'month'
                    ? (isCurYear() ? '12 เดือนล่าสุด' : 'ม.ค. – ธ.ค. ' + (S.year + 543))
                    : (isCurYear() ? '12 สัปดาห์ล่าสุด (เริ่มวันจันทร์)' : '12 สัปดาห์สุดท้ายของปี ' + (S.year + 543));
                return card('<i class="fa-solid fa-chart-line text-indigo-500"></i> แนวโน้มการรับหนังสือ', sub,
                    `<div id="pcs-trend" style="position:relative;min-height:290px;overflow:hidden"></div>`, tog);
            }
            // [v30 ข้อ 6] สีไล่ตามแนวแกน x (ส้ม -> ชมพู -> ม่วง -> ฟ้า -> เขียว) ใช้กับเส้น จุด และพื้นที่ใต้กราฟ
            const TREND_STOPS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'];
            function mixAt(f) {
                const n = TREND_STOPS.length - 1, p = Math.max(0, Math.min(1, f)) * n, i = Math.min(n - 1, Math.floor(p)), t = p - i;
                const h = (c) => [1, 3, 5].map(k => parseInt(c.substr(k, 2), 16));
                const a = h(TREND_STOPS[i]), b = h(TREND_STOPS[i + 1]);
                return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('');
            }
            function drawTrend(units) {
                const host = document.getElementById('pcs-trend');
                if (!host) return;
                const data = trendBuckets(units);
                const W = Math.max(300, host.clientWidth || 600), H = 230, PL = 40, PR = 24, PT = 16, PB = 28;
                const max = Math.max.apply(null, data.map(d => d.v));
                const ticks = niceTicks(max), top = ticks[ticks.length - 1] || 1;
                const x = (i) => PL + (W - PL - PR) * (data.length === 1 ? 0.5 : i / (data.length - 1));
                const y = (v) => PT + (H - PT - PB) * (1 - v / top);
                const pts = data.map((d, i) => [x(i), y(d.v)]);
                const col = pts.map((p, i) => mixAt(data.length === 1 ? 0.5 : i / (data.length - 1)));
                const line = smoothPath(pts);
                const area = line + ` L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`;
                const every = W < 520 ? 2 : 1;
                const grid = ticks.map(t => `<line x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}" stroke="#eef0f4" stroke-width="1"></line><text x="${PL - 9}" y="${y(t) + 4}" text-anchor="end" style="font:600 10.5px Sarabun,sans-serif;fill:#94a3b8">${num(t)}</text>`).join('');
                const xl = data.map((d, i) => (i % every === (data.length - 1) % every) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="font:600 10.5px Sarabun,sans-serif;fill:#94a3b8">${esc(d.label)}</text>` : '').join('');
                const stops = (op) => TREND_STOPS.map((c, i) => `<stop offset="${i / (TREND_STOPS.length - 1) * 100}%" stop-color="${c}" stop-opacity="${op}"></stop>`).join('');
                // ตัวเลขล่าสุด + เพิ่ม/ลดจากช่วงก่อน (เหนือแกน y)
                const cur = data[data.length - 1].v, prev = data.length > 1 ? data[data.length - 2].v : 0, diff = cur - prev;
                const unitWord = S.trend === 'month' ? 'เดือน' : 'สัปดาห์';
                const curLabel = isCurYear() ? (S.trend === 'month' ? 'เดือนนี้' : 'สัปดาห์นี้') : data[data.length - 1].label;
                const dCol = diff > 0 ? '#16a34a' : (diff < 0 ? '#dc2626' : '#64748b');
                const dIcon = diff > 0 ? 'fa-caret-up' : (diff < 0 ? 'fa-caret-down' : 'fa-minus');
                const head = `<div class="flex items-end flex-wrap gap-x-3 gap-y-1 mb-1" style="padding-left:${PL - 34}px">
                        <div class="leading-none"><span style="font-size:30px;font-weight:800;color:#0f172a">${num(cur)}</span><span class="text-[12px] font-bold text-slate-400 ml-1">เรื่อง · ${esc(curLabel)}</span></div>
                        <div class="text-[12.5px] font-bold pb-0.5" style="color:${dCol}"><i class="fa-solid ${dIcon} mr-0.5"></i>${diff > 0 ? '+' : ''}${num(diff)} <span class="font-semibold text-slate-400">จาก${unitWord}ก่อน</span></div>
                    </div>`;
                host.innerHTML = head + `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="แนวโน้มจำนวนหนังสือรับ" style="display:block;overflow:visible">
                    <defs>
                        <linearGradient id="pcsLine" gradientUnits="userSpaceOnUse" x1="${PL}" y1="0" x2="${W - PR}" y2="0">${stops(1)}</linearGradient>
                        <linearGradient id="pcsArea" gradientUnits="userSpaceOnUse" x1="${PL}" y1="0" x2="${W - PR}" y2="0">${stops(0.28)}</linearGradient>
                        <linearGradient id="pcsFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0"></stop><stop offset="100%" stop-color="#fff" stop-opacity=".92"></stop></linearGradient>
                    </defs>
                    ${grid}
                    <line x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}" stroke="#cbd5e1" stroke-width="1"></line>
                    <line x1="${PL}" x2="${PL}" y1="${PT - 6}" y2="${y(0)}" stroke="#cbd5e1" stroke-width="1"></line>
                    <path d="${area}" fill="url(#pcsArea)"></path>
                    <path d="${area}" fill="url(#pcsFade)"></path>
                    <path d="${line}" fill="none" stroke="url(#pcsLine)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
                    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 6 : 4.5}" fill="${i === pts.length - 1 ? '#fff' : col[i]}" stroke="${i === pts.length - 1 ? col[i] : '#fff'}" stroke-width="${i === pts.length - 1 ? 3 : 2}"></circle>`).join('')}
                    ${xl}
                    <line id="pcs-cross" x1="0" x2="0" y1="${PT}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1" style="display:none"></line>
                    <circle id="pcs-dot" r="7" fill="#2a78d6" stroke="#fff" stroke-width="2" style="display:none"></circle>
                    <rect x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="transparent" id="pcs-hit"></rect></svg>`;
                const svg = host.querySelector('svg');
                const hit = host.querySelector('#pcs-hit'), cross = host.querySelector('#pcs-cross'), dot = host.querySelector('#pcs-dot');
                const move = (ev) => {
                    const r = svg.getBoundingClientRect();
                    const px = ev.clientX - r.left;
                    let best = 0;
                    pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[best][0] - px)) best = i; });
                    const p = pts[best];
                    cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.style.display = '';
                    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.setAttribute('fill', col[best]); dot.style.display = '';
                    const d0 = best > 0 ? data[best].v - data[best - 1].v : null;
                    showTip(`<b>${esc(data[best].full)}</b>` + tipRow(col[best], 'หนังสือรับ', num(data[best].v) + ' เรื่อง') +
                        (d0 === null ? '' : tipRow(d0 > 0 ? '#16a34a' : (d0 < 0 ? '#dc2626' : '#64748b'), 'เทียบช่วงก่อน', (d0 > 0 ? '+' : '') + num(d0))), r.left + p[0], r.top + p[1]);
                };
                hit.addEventListener('pointermove', move);
                hit.addEventListener('pointerdown', move);
                hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; dot.style.display = 'none'; hideTip(); });
            }

            function stageCard(units) {
                const cnt = {};
                units.forEach(u => u.copies.forEach(c => { const s = Number(c.stage); if (s !== 99 && STAGE_NAME[s]) cnt[s] = (cnt[s] || 0) + 1; }));
                const max = Math.max(0, ...STAGE_ORDER.map(s => cnt[s] || 0));
                const body = max ? `<div class="space-y-2.5">${STAGE_ORDER.map(s => {
                    const v = cnt[s] || 0, w = v / max * 100;
                    return `<div class="flex items-center gap-2" data-tip="${esc(`<b>รอที่ ${STAGE_NAME[s]}</b>` + tipRow('#2a78d6', 'หนังสือค้างขั้นนี้', num(v) + ' ฉบับ'))}">
                        <div class="w-[92px] shrink-0 text-[11.5px] font-semibold text-slate-600 truncate">${STAGE_NAME[s]}</div>
                        <div class="flex-1 h-3.5 flex items-center">${v ? `<div style="width:${Math.max(2, w)}%;height:14px;background:#2a78d6;border-radius:0 4px 4px 0"></div>` : '<div style="width:2px;height:14px;background:#e2e8f0"></div>'}</div>
                        <div class="w-8 text-right text-[12px] font-extrabold text-slate-800 tabular-nums">${num(v)}</div></div>`;
                }).join('')}</div>` : emptyBox('ไม่มีหนังสือค้างในขั้นตอนใด');
                return card('<i class="fa-solid fa-diagram-next text-indigo-500"></i> หนังสือรออยู่ที่ขั้นตอนใด', 'หนังสือที่ยังไม่เสร็จ (' + rangeText(S.period) + ')', body);
            }

            function weekTableCard(unitsAll) {
                const a = weekStart(anchorNow()) - S.week * 7 * DAY, b = a + 7 * DAY;     // [v30] ปีก่อน = นับจากสัปดาห์สุดท้ายของปี
                const units = unitsAll.filter(u => u.t >= a && u.t < b);
                const gs = groupStats(units);
                const keys = MAIN.concat(['']).filter(k => k || (gs.byMain[''] && gs.byMain[''].total));
                const sum = emptyCount();
                keys.forEach(k => { const o = gs.byMain[k] || emptyCount(); ['total', 'late', 'prog', 'done'].forEach(f => { sum[f] += o[f]; }); });
                const row = (label, color, o, bold) => `<tr${bold ? ' style="background:#f8fafc"' : ''}>
                    <td>${color ? `<span class="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style="background:${color}"></span>` : ''}<span class="${bold ? 'font-extrabold' : 'font-semibold'} text-slate-800">${label}</span></td>
                    <td class="font-extrabold text-slate-900">${num(o.total)}</td>
                    <td>${o.late ? `<span class="pcs-pill" style="background:${ST.late.soft};color:#a61b1b">${num(o.late)}</span>` : '<span class="text-slate-300">0</span>'}</td>
                    <td>${o.prog ? `<span class="pcs-pill" style="background:${ST.prog.soft};color:#8a5a00">${num(o.prog)}</span>` : '<span class="text-slate-300">0</span>'}</td>
                    <td>${o.done ? `<span class="pcs-pill" style="background:${ST.done.soft};color:#0a6b0a">${num(o.done)}</span>` : '<span class="text-slate-300">0</span>'}</td>
                    <td style="min-width:110px"><div class="flex items-center gap-2 justify-end"><div class="pcs-meter"><i style="width:${pct(o.done, o.total)}%"></i></div><span class="text-[11.5px] font-bold text-slate-600 w-10 text-right">${o.total ? pctTxt(o.done, o.total) : '-'}</span></div></td></tr>`;
                const nav = `<div class="flex items-center gap-1">
                    <button type="button" class="pcs-mini" onclick="PC.statsSet('week',${S.week + 1})" title="สัปดาห์ก่อนหน้า"><i class="fa-solid fa-chevron-left"></i></button>
                    <button type="button" class="pcs-mini ${S.week === 0 ? 'on' : ''}" onclick="PC.statsSet('week',0)">${isCurYear() ? 'สัปดาห์นี้' : 'สัปดาห์สุดท้ายของปี'}</button>
                    <button type="button" class="pcs-mini" onclick="PC.statsSet('week',${Math.max(0, S.week - 1)})" ${S.week === 0 ? 'disabled style="opacity:.4"' : ''} title="สัปดาห์ถัดไป"><i class="fa-solid fa-chevron-right"></i></button></div>`;
                const body = `<div class="overflow-x-auto"><table class="pcs-table w-full">
                    <thead><tr><th>กลุ่มบริหาร</th><th>ทั้งหมด</th><th>ตกค้าง</th><th>กำลังดำเนินการ</th><th>เสร็จสิ้น</th><th>อัตราเสร็จ</th></tr></thead>
                    <tbody>${keys.map(k => row(k || 'ยังไม่มอบหมายกลุ่ม', G_COLOR[k], gs.byMain[k] || emptyCount())).join('')}${row('รวม (นับตามกลุ่ม)', '', sum, true)}</tbody></table></div>
                    <div class="pcs-sub mt-2">ตกค้าง = ยังไม่เสร็จและรับมาเกิน 7 วัน · ใช้ปุ่ม ‹ › ดูสัปดาห์ก่อนหน้า</div>`;
                return card('<i class="fa-solid fa-table-list text-indigo-500"></i> สรุปรายสัปดาห์ตามกลุ่มบริหาร', 'หนังสือที่รับในสัปดาห์ ' + fmtDay(a) + ' – ' + fmtDay(b - DAY, true), body, nav);
            }

            function lateCard(units) {
                const late = units.filter(u => u.status === 'late').sort((a, b) => a.t - b.t).slice(0, 5);
                const body = late.length ? `<div class="divide-y divide-slate-100">${late.map(u => {
                    const d = u.head, days = Math.floor((Date.now() - u.t) / DAY);
                    const waiting = Array.from(new Set(u.copies.filter(c => Number(c.stage) !== 99).map(c => STAGE_WHO(c)).filter(Boolean))).join(', ');
                    const subj = secretHidden(d) ? 'หนังสือชั้นความลับ' : (d.subject || d.title || '-');
                    return `<button type="button" onclick="viewMainDocument('${jsq(d.id)}')" class="w-full text-left flex items-start gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-1 transition">
                        <div class="shrink-0 text-center rounded-xl px-2 py-1" style="background:${ST.late.soft};min-width:52px"><div class="text-[17px] font-extrabold leading-none" style="color:#a61b1b">${days}</div><div class="text-[9.5px] font-bold" style="color:#a61b1b">วัน</div></div>
                        <div class="min-w-0 flex-1"><div class="text-[12.5px] font-bold text-slate-800 truncate">${esc(subj)}</div>
                        <div class="text-[11px] text-slate-500 truncate">${d.receiveNo ? 'รับที่ ' + esc(d.receiveNo) + ' · ' : ''}รอ: ${esc(waiting || '-')}</div></div></button>`;
                }).join('')}</div>` : emptyBox('ไม่มีหนังสือตกค้าง 👍');
                return card(`<i class="fa-solid ${ST.late.icon}" style="color:${ST.late.c}"></i> ตกค้างนานที่สุด`, 'ยังไม่เสร็จ เกิน 7 วัน (' + rangeText(S.period) + ')', body);
            }

            /* [v30 ข้อ 8] สถิติหนังสือของผู้ใช้คนนี้ : หนังสือที่ผ่านมือ (ลงนาม/ลงรับแล้ว) + ที่กำลังรอท่านดำเนินการ */
            function myDocStats(units) {
                const me = myId(), admin = realRole() === 'ADMIN';
                const c = { total: 0, prog: 0, done: 0 };
                if (!me) return c;
                units.forEach(u => u.copies.forEach(d => {
                    const signed = (Array.isArray(d.signLog) ? d.signLog : []).some(x => String(x.userId) === me);
                    const assigned = typeof window.pcAssignedToMe === 'function' && !!window.pcAssignedToMe(d);
                    let waiting = false;
                    if (!admin && !d._archived && Number(d.stage) !== 99) {
                        try { waiting = typeof PC.signTabForDoc === 'function' && !!PC.signTabForDoc(d); } catch (e) { waiting = false; }
                    }
                    if (!signed && !assigned && !waiting) return;
                    c.total++;
                    if (signed || (assigned && Number(d.stage) === 99)) c.done++; else c.prog++;
                }));
                return c;
            }
            /* [v35 ข้อ 4/5] หนังสือที่กำลังรอผู้ใช้คนนี้ลงนาม / ลงรับ + ปุ่มนำทางไปกล่องหนังสือเข้า */
            function myWaiting() {
                const admin = realRole() === 'ADMIN';
                let n = 0;
                (state.documentQueue || []).forEach(d => {
                    if (!d || Number(d.stage) === 99) return;
                    try {
                        if ((typeof window.pcAssignedToMe === 'function' && window.pcAssignedToMe(d) && Number(d.stage) === 8) ||
                            (!admin && typeof PC.signTabForDoc === 'function' && PC.signTabForDoc(d))) n++;
                    } catch (e) { /* ข้าม */ }
                });
                return n;
            }
            PC.myWaiting = myWaiting;
            PC.goInbox = function () {
                const btn = document.getElementById('tab-btn-inbox');
                if (btn && btn.classList.contains('hidden') && !tabAllowed('inbox')) return Swal.fire('แจ้งเตือน', 'บัญชีของท่านไม่มีแท็บกล่องหนังสือเข้า', 'info');
                switchTab('inbox');
                try { window.scrollTo({ top: document.getElementById('tab-btn-inbox').getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); } catch (e) { /* ข้าม */ }
            };
            PC.myDocStats = () => myDocStats((S._all || buildUnits()).filter(u => { const [a, b] = periodRange(S.period); return u.t >= a && u.t <= b; }));
            function myStatsCard(units) {
                if (!state.user || !state.user.id) return '';
                const c = myDocStats(units);
                const waiting = myWaiting();              // [v35 ข้อ 5] หนังสือที่รอท่านลงนาม/ลงรับ ณ ตอนนี้ (ไม่ขึ้นกับช่วงเวลาที่เลือก)
                const pos = state.user.position || state.user.title || '';
                const tile = (label, icon, color, soft, value, share) => `
                    <div class="rounded-2xl p-3.5 border" style="background:${soft};border-color:${color}33" data-tip="${esc(`<b>${label}</b><br>${num(value)} ฉบับ${share !== null ? ' (' + pctTxt(value, c.total) + ')' : ''}`)}">
                        <div class="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-600"><i class="fa-solid ${icon}" style="color:${color === '#fab219' ? '#b7791f' : color}"></i>${label}</div>
                        <div class="flex items-baseline gap-1.5 mt-1"><span class="text-[28px] font-extrabold text-slate-900 leading-none">${num(value)}</span><span class="text-[11px] font-bold text-slate-400">ฉบับ</span>
                            ${share !== null ? `<span class="ml-auto text-[13px] font-extrabold text-slate-700">${pctTxt(value, c.total)}</span>` : ''}</div>
                        <div class="h-1.5 rounded-full mt-2 overflow-hidden" style="background:#ffffffaa"><div class="h-full rounded-full" style="width:${share === null ? (c.total ? 100 : 0) : share}%;background:${color}"></div></div>
                    </div>`;
                const R = 44, C = 2 * Math.PI * R, pd = c.total ? c.done / c.total : 0;
                const GAP = c.done && c.prog ? 3 : 0;
                const donut = `<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="สัดส่วนหนังสือของฉัน">
                    <circle cx="60" cy="60" r="${R}" fill="none" stroke="#f1f5f9" stroke-width="16"></circle>
                    ${c.done ? `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${ST.done.c}" stroke-width="16" stroke-dasharray="${Math.max(0.01, pd * C - GAP)} ${C}" transform="rotate(-90 60 60)" data-tip="${esc('<b>เสร็จสิ้น</b><br>' + num(c.done) + ' ฉบับ (' + pctTxt(c.done, c.total) + ')')}"></circle>` : ''}
                    ${c.prog ? `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${ST.prog.c}" stroke-width="16" stroke-dasharray="${Math.max(0.01, (1 - pd) * C - GAP)} ${C}" stroke-dashoffset="${-pd * C}" transform="rotate(-90 60 60)" data-tip="${esc('<b>กำลังดำเนินการ</b><br>' + num(c.prog) + ' ฉบับ (' + pctTxt(c.prog, c.total) + ')')}"></circle>` : ''}
                    <text x="60" y="58" text-anchor="middle" style="font:800 20px Sarabun,sans-serif;fill:#0f172a">${c.total ? pctTxt(c.done, c.total) : '-'}</text>
                    <text x="60" y="76" text-anchor="middle" style="font:600 10.5px Sarabun,sans-serif;fill:#64748b">เสร็จแล้ว</text></svg>`;
                return `<div class="pcs-card">
                    <div class="flex flex-col lg:flex-row gap-4 items-stretch">
                        <div class="lg:w-[270px] shrink-0 flex items-center gap-3 p-3 rounded-2xl" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff)">
                            <img src="${esc(state.user.image || DEFAULT_AVATAR)}" onerror="this.src='${DEFAULT_AVATAR}'" class="w-14 h-14 rounded-full object-cover shrink-0" style="box-shadow:0 0 0 3px #fff,0 4px 12px rgba(79,70,229,.25)">
                            <div class="min-w-0">
                                <div class="text-[11px] font-extrabold text-indigo-600"><i class="fa-solid fa-user-check mr-1"></i>สถิติหนังสือของฉัน</div>
                                <div class="text-[15px] font-extrabold text-slate-900 truncate">${esc(state.user.name || '')}</div>
                                ${pos ? `<div class="text-[11.5px] text-slate-500 font-semibold truncate">${esc(pos)}</div>` : ''}
                                <div class="text-[10.5px] text-slate-400 font-semibold mt-0.5">${esc(rangeText(S.period))}</div>
                            </div>
                        </div>
                        ${(c.total || waiting) ? `<div class="flex-1 grid grid-cols-2 xl:grid-cols-4 gap-3 min-w-0">
                            <button type="button" onclick="PC.goInbox()" class="pcs-wait rounded-2xl p-3.5 text-left text-white relative overflow-hidden" title="ไปที่กล่องหนังสือเข้าเพื่อลงนาม">
                                <div class="flex items-center gap-1.5 text-[11.5px] font-bold"><i class="fa-solid fa-pen-nib ${waiting ? 'fa-fade' : ''}"></i>รอลงนาม</div>
                                <div class="flex items-baseline gap-1.5 mt-1"><span class="text-[28px] font-extrabold leading-none">${num(waiting)}</span><span class="text-[11px] font-bold opacity-80">ฉบับ</span></div>
                                <div class="text-[11px] font-bold mt-2 flex items-center gap-1 opacity-95">ไปกล่องหนังสือเข้า <i class="fa-solid fa-arrow-right"></i></div>
                            </button>
                            ${tile('ทั้งหมด', 'fa-layer-group', '#4f46e5', '#eef2ff', c.total, null)}
                            ${tile('กำลังดำเนินการ', ST.prog.icon, ST.prog.c, ST.prog.soft, c.prog, pct(c.prog, c.total))}
                            ${tile('เสร็จสิ้น', ST.done.icon, ST.done.c, ST.done.soft, c.done, pct(c.done, c.total))}
                        </div>
                        <div class="shrink-0 flex items-center justify-center">${donut}</div>`
                        : `<div class="flex-1">${emptyBox('ยังไม่มีหนังสือที่ผ่านการดำเนินการของท่านในช่วงเวลานี้')}</div>`}
                    </div>
                    <div class="pcs-sub mt-2">นับหนังสือที่ท่านลงนาม / ลงรับแล้ว (เสร็จสิ้น) และหนังสือที่กำลังรอท่านดำเนินการ (กำลังดำเนินการ)</div>
                </div>`;
            }

            // [v30 ข้อ 7] เปลี่ยนปีที่แสดง
            PC.statsYear = async function (v) {
                const y = Number(v);
                if (!y) return;
                S.year = y;
                S.week = 0;
                const ty = String(y + 543);
                if (!isCurYear() && (PC.archiveYears || []).map(String).includes(ty) && !ARCH[ty]) {
                    const root = document.getElementById('stats-root');
                    if (root) root.insertAdjacentHTML('afterbegin', `<div class="pcs-card mb-3 text-center text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังเปิดคลังหนังสือปี พ.ศ. ${esc(ty)}...</div>`);
                    try {
                        const res = await api('getArchive', { year: ty }, { timeout: 120000 });
                        ARCH[ty] = (res.docs || []).map(x => Object.assign({}, x.d, { _c: x.c, _archived: true }));
                    } catch (e) {
                        Swal.fire({ icon: 'error', title: 'เปิดคลังหนังสือไม่สำเร็จ', text: e.message });
                    }
                }
                renderStats();
            };

            function statsCss() {
                if (document.getElementById('pcs-style')) return;
                const st = document.createElement('style');
                st.id = 'pcs-style';
                st.textContent = `
                    #stats-root{font-family:Sarabun,sans-serif;color:#0f172a}
                    .pcs-hero{background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 50%,#6d28d9 100%);border-radius:22px;padding:18px 20px;color:#fff;box-shadow:0 14px 34px rgba(55,48,163,.28);position:relative;overflow:hidden}
                    .pcs-hero:before{content:'';position:absolute;right:-70px;top:-90px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.16),rgba(255,255,255,0) 70%)}
                    .pcs-hero:after{content:'';position:absolute;left:30%;bottom:-120px;width:300px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(167,139,250,.25),rgba(167,139,250,0) 70%)}
                    .pcs-seg{display:inline-flex;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:3px;gap:2px;position:relative;z-index:1;flex-wrap:wrap}
                    .pcs-seg button{padding:7px 13px;border-radius:11px;font-size:12px;font-weight:700;color:#e0e7ff;white-space:nowrap;transition:.15s}
                    .pcs-seg button:hover{background:rgba(255,255,255,.12)}
                    .pcs-seg button.on{background:#fff;color:#312e81;box-shadow:0 3px 10px rgba(0,0,0,.18)}
                    .pcs-card{background:#fff;border:1px solid #e6e8ef;border-radius:18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 10px 26px rgba(15,23,42,.05);padding:16px;min-width:0}
                    .pcs-h{font-size:14px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px}
                    .pcs-sub{font-size:11px;color:#64748b;font-weight:500}
                    .pcs-kpi{position:relative;overflow:hidden;padding:14px 16px 14px 18px}
                    .pcs-kpi .accent{position:absolute;left:0;top:0;bottom:0;width:4px}
                    .pcs-kpi .ic{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:15px}
                    .pcs-kpi .v{font-size:30px;font-weight:800;line-height:1.1;color:#0f172a}
                    .pcs-kpi .bar{height:6px;border-radius:99px;background:#f1f5f9;overflow:hidden;margin-top:10px}
                    .pcs-kpi .bar i{display:block;height:100%;border-radius:99px;transition:width .5s}
                    .pcs-mini{font-size:11px;padding:5px 10px;border-radius:9px;font-weight:700;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;transition:.15s}
                    .pcs-mini:hover{background:#eef2ff}
                    .pcs-mini.on{background:#312e81;color:#fff;border-color:#312e81}
                    .pcs-tip{position:fixed;z-index:6000;background:#0f172a;color:#fff;font-size:11.5px;padding:8px 11px;border-radius:10px;box-shadow:0 12px 28px rgba(2,6,23,.3);pointer-events:none;display:none;max-width:280px;font-family:Sarabun,sans-serif;line-height:1.5}
                    .pcs-stack{display:flex;gap:2px;height:20px;border-radius:7px;overflow:hidden;background:#f1f5f9}
                    .pcs-stack span{display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;min-width:3px;cursor:pointer}
                    .pcs-scroll{max-height:380px;overflow-y:auto;padding-right:4px}
                    .pcs-table th{font-size:11px;color:#64748b;font-weight:700;text-align:right;padding:8px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap}
                    .pcs-table td{font-size:12.5px;padding:9px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
                    .pcs-table th:first-child,.pcs-table td:first-child{text-align:left}
                    .pcs-pill{display:inline-block;min-width:28px;text-align:center;padding:1px 8px;border-radius:99px;font-weight:800;font-size:12px}
                    .pcs-meter{width:60px;height:6px;border-radius:99px;background:#e7f6e7;overflow:hidden}
                    .pcs-meter i{display:block;height:100%;background:#0ca30c;border-radius:99px}
                    .pcs-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#94a3b8;font-size:12.5px;font-weight:600;padding:34px 10px;text-align:center}
                    .pcs-empty i{font-size:26px;color:#cbd5e1}
                    .tabular-nums{font-variant-numeric:tabular-nums}
                    .pcs-row > div > .pcs-card{height:100%}
                    .pcs-table{border-collapse:separate;border-spacing:0}
                    .pcs-table thead th{background:#0f172a;color:#fff;border-bottom:0;padding:10px 10px;font-size:11.5px}
                    .pcs-table thead th:first-child{border-radius:10px 0 0 10px}
                    .pcs-table thead th:last-child{border-radius:0 10px 10px 0}
                    .pcs-table tbody tr:nth-child(even) td{background:#f8fafc}
                    .pcs-table tbody tr td{transition:background .15s}
                    .pcs-table tbody tr:hover td{background:#e0e7ff !important}
                    .pcs-year{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:700;outline:none;cursor:pointer;font-family:Sarabun,sans-serif}
                    .pcs-year option{color:#0f172a}
                    .pcs-go{background:#fff;color:#312e81;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,.18);transition:.15s;white-space:nowrap}
                    .pcs-go:hover{transform:translateY(-1px);background:#eef2ff}
                    .pcs-go .n{background:#dc2626;color:#fff;border-radius:99px;min-width:20px;height:20px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
                    .pcs-wait{background:linear-gradient(135deg,#6366f1,#a855f7);box-shadow:0 8px 20px rgba(99,102,241,.3);transition:.15s}
                    .pcs-wait:hover{transform:translateY(-2px);filter:brightness(1.06)}
                    .pcs-kpi2{position:relative;overflow:hidden;border-radius:18px;padding:18px 20px;color:#fff;display:flex;align-items:center;gap:14px;box-shadow:0 10px 24px rgba(15,23,42,.14);min-height:132px;transition:transform .2s,box-shadow .2s}
                    .pcs-kpi2:hover{transform:translateY(-2px);box-shadow:0 16px 32px rgba(15,23,42,.2)}
                    .pcs-kpi2:before{content:'';position:absolute;right:-40px;top:-50px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.10)}
                    .pcs-kpi2:after{content:'';position:absolute;right:30px;bottom:-70px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.07)}
                    .pcs-kpi2 .lb{font-size:14px;font-weight:700;opacity:.95;text-shadow:0 1px 2px rgba(0,0,0,.15)}
                    .pcs-kpi2 .v{font-size:42px;font-weight:800;line-height:1.05;letter-spacing:-.5px;margin-top:4px;text-shadow:0 2px 6px rgba(0,0,0,.18)}
                    .pcs-kpi2 .v .u{font-size:13px;font-weight:700;margin-left:6px;opacity:.85;letter-spacing:0}
                    .pcs-kpi2 .sb{font-size:11.5px;font-weight:600;opacity:.92;margin-top:4px;text-shadow:0 1px 2px rgba(0,0,0,.18)}
                    .pcs-kpi2 .bar{height:5px;border-radius:99px;background:rgba(255,255,255,.25);overflow:hidden;margin-top:10px;max-width:220px}
                    .pcs-kpi2 .bar i{display:block;height:100%;border-radius:99px;background:#fff;transition:width .5s}
                    .pcs-kpi2 .ic{position:relative;z-index:1;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:24px;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}`;
                document.head.appendChild(st);
            }

            function renderStats() {
                const root = document.getElementById('stats-root');
                if (!root) return;
                statsCss();
                hideTip();
                const all = buildUnits();
                S._all = all;
                const [a, b] = periodRange(S.period);
                const units = all.filter(u => u.t >= a && u.t <= b);
                const gs = groupStats(units);
                const seg = isCurYear()
                    ? PERIODS.map(([k, l]) => `<button type="button" class="${S.period === k ? 'on' : ''}" onclick="PC.statsSet('period','${k}')">${l}</button>`).join('')
                    : `<button type="button" class="on">ทั้งปี ${S.year + 543}</button>`;
                // [v30 ข้อ 7] ปีที่เลือกได้ : ปีปัจจุบัน + ปีที่มีหนังสือในระบบ + ปีในคลังรายปี
                const years = new Set([new Date().getFullYear(), S.year]);
                (state.documentQueue || []).forEach(d => { const t = tOf(d); if (t) years.add(new Date(t).getFullYear()); });
                (PC.archiveYears || []).forEach(y => { const g = Number(y) - 543; if (g > 2000) years.add(g); });
                const yearSel = `<select class="pcs-year" onchange="PC.statsYear(this.value)" title="เลือกปีที่แสดงสถิติ">${Array.from(years).sort((p, q) => q - p).map(y => `<option value="${y}" ${y === S.year ? 'selected' : ''}>ปี พ.ศ. ${y + 543}</option>`).join('')}</select>`;
                root.innerHTML = `
                    <div class="space-y-4">
                        <div class="pcs-hero">
                            <div class="flex flex-wrap items-center justify-between gap-3 relative" style="z-index:1">
                                <div class="flex items-center gap-3">
                                    <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-lg" style="background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25)"><i class="fa-solid fa-chart-pie"></i></div>
                                    <div><div class="text-lg sm:text-xl font-extrabold leading-tight">สถิติหนังสือรับ</div>
                                    <div class="text-[12px] text-indigo-100 font-semibold">${esc(rangeText(S.period))} · อัปเดต ${pad2(new Date().getHours())}.${pad2(new Date().getMinutes())} น.</div></div>
                                </div>
                                <div class="flex flex-wrap items-center gap-2 relative" style="z-index:1">
                                    <button type="button" class="pcs-go" onclick="PC.goInbox()" title="ไปที่กล่องหนังสือเข้าเพื่อลงนาม"><i class="fa-solid fa-pen-nib"></i> กล่องหนังสือเข้า · ลงนาม${myWaiting() ? `<span class="n">${num(myWaiting())}</span>` : ''}</button>
                                    ${yearSel}<div class="pcs-seg">${seg}</div></div>
                            </div>
                        </div>
                        ${kpiCards(units)}
                        <div id="pc-online-stats"></div>
                        ${myStatsCard(units)}
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pcs-row">
                            <div class="lg:col-span-1 min-w-0">${donutCard(gs)}</div>
                            <div class="lg:col-span-2 min-w-0">${subgroupCard(gs)}</div>
                        </div>
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pcs-row">
                            <div class="lg:col-span-2 min-w-0">${trendCard()}</div>
                            <div class="lg:col-span-1 min-w-0">${stageCard(units)}</div>
                        </div>
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pcs-row">
                            <div class="lg:col-span-2 min-w-0">${weekTableCard(all)}</div>
                            <div class="lg:col-span-1 min-w-0">${lateCard(units)}</div>
                        </div>
                    </div>`;
                if (PC.onlinePaint) PC.onlinePaint();      // [v41] แผง "กำลังออนไลน์" อยู่ใต้การ์ดสรุป ต้องวาดใหม่ทุกครั้งที่หน้าสถิติถูกสร้าง
                // [v29] วาดกราฟแนวโน้มตามความกว้างจริงของกล่อง (Tailwind CDN สร้างคลาส grid ช้ากว่าการวาดครั้งแรก)
                const trendHost = document.getElementById('pcs-trend');
                if (trendHost && window.ResizeObserver) {
                    if (PC._trendRO) PC._trendRO.disconnect();
                    let lastW = 0;
                    PC._trendRO = new ResizeObserver(() => {
                        const w = trendHost.clientWidth;
                        if (w && Math.abs(w - lastW) > 4) { lastW = w; drawTrend(all); }
                    });
                    PC._trendRO.observe(trendHost);
                } else drawTrend(all);
                if (!root.dataset.tipBound) {
                    root.dataset.tipBound = '1';
                    const onMove = (ev) => {
                        const t = ev.target.closest && ev.target.closest('[data-tip]');
                        if (!t || !root.contains(t)) { if (!ev.target.closest || !ev.target.closest('#pcs-trend')) hideTip(); return; }
                        showTip(t.getAttribute('data-tip'), ev.clientX, ev.clientY);
                    };
                    root.addEventListener('pointermove', onMove);
                    root.addEventListener('pointerdown', onMove);
                    root.addEventListener('pointerleave', hideTip);
                }
            }
            PC.renderStats = renderStats;
            // [v35 ข้อ 6] ชุดเครื่องมือกราฟ ใช้ร่วมกับหน้าสถิติการใช้งานระบบ
            PC.chartKit = { css: statsCss, smoothPath: smoothPath, niceTicks: niceTicks, showTip: showTip, hideTip: hideTip, tipRow: tipRow, mixAt: mixAt, num: num, pct: pct, pctTxt: pctTxt };
            PC.statsSet = function (k, v) {
                S[k] = v;
                if (k === 'period') { try { localStorage.setItem('pc-stats-period', v); } catch (e) { /* ข้าม */ } }
                renderStats();
            };
            const statsVisible = () => { const el = document.getElementById('tab-stats'); return !!(el && !el.classList.contains('hidden')); };
            let statsT = null;
            const statsSoon = () => { clearTimeout(statsT); statsT = setTimeout(() => { if (statsVisible()) renderStats(); }, 600); };

            // เปิดแท็บ -> วาด , ข้อมูลหนังสือเปลี่ยน -> วาดใหม่ , ขนาดจอเปลี่ยน -> วาดกราฟแนวโน้มใหม่
            (function () {
                const orig = window.switchTab;
                if (typeof orig !== 'function') return;
                window.switchTab = function (tabName) {
                    const r = orig.apply(this, arguments);
                    if (tabName === 'stats') setTimeout(renderStats, 30); else hideTip();
                    return r;
                };
            })();
            const origRerender28 = rerenderAll;
            rerenderAll = function (what) {
                const r = origRerender28.apply(this, arguments);
                if (what && what.docs) statsSoon();
                return r;
            };
            let rsT = null;
            window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (statsVisible()) drawTrend(S._all || buildUnits()); }, 250); });

            // สิทธิ์ : ใครเห็นทะเบียนหนังสือรับได้ ก็เห็นสถิติได้ (หรือผู้ดูแลระบบติ๊กให้แท็บนี้โดยตรง)
            const origTabAllowed28 = tabAllowed;
            tabAllowed = function (tab) {
                if (tab === 'stats') return origTabAllowed28('stats') || origTabAllowed28('alldocs');
                return origTabAllowed28(tab);
            };
            PC.tabAllowed = tabAllowed;
            (function () {
                const orig = window.applyRolePermissions;
                if (typeof orig !== 'function') return;
                window.applyRolePermissions = function () {
                    const r = orig.apply(this, arguments);
                    const btn = document.getElementById('tab-btn-stats');
                    if (btn) btn.classList.toggle('hidden', !(PC.user && tabAllowed('stats')));
                    return r;
                };
            })();
        })();

        /* =====================================================================
           [v29]
             2 งาน/กิจกรรมที่แชร์เฉพาะกลุ่ม/บุคคล : ขึ้นในแท็บกิจกรรมของผู้รับ (เซิร์ฟเวอร์สร้างประกาศ ANN_TASK_/ANN_EVT_)
               + ปักหมุดไว้บนสุดใน "ประกาศสำคัญ" ของผู้รับ , แท็บกำหนดงาน : ผู้รับเห็นงาน , ล่าสุดอยู่บน , ปักหมุดได้
             3 แท็บกิจกรรม : ผู้ใช้ปักหมุดเรื่องใดก็ได้ไว้บนสุด (ปักหมุดส่วนตัว)
             4 แท็บกิจกรรม : เลือกเรื่องไปแสดงใน "งานของฉัน" (ล่าสุดอยู่บน , ปักหมุดได้)
             ค่าส่วนตัวเก็บเป็น Settings scope=user ชื่อ actPrefs (ตามผู้ใช้ไปทุกเครื่อง)
           ===================================================================== */
        (function v29() {
            const MAIN = ['กลุ่มบริหารวิชาการ', 'กลุ่มบริหารงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารทั่วไป'];
            const clean = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const myId = () => (state.user && state.user.id) ? String(state.user.id) : '';
            const rooms = () => (typeof defaultRooms !== 'undefined' && Array.isArray(defaultRooms)) ? defaultRooms : [];
            const parentOf = (g) => {
                const n = clean(g), list = rooms(), i = list.findIndex(r => clean(r.name) === n);
                if (i < 0) return '';
                if (list[i].parent) return clean(list[i].parent);
                for (let k = i - 1; k >= 0; k--) { const m = clean(list[k].name); if (MAIN.includes(m)) return m; }
                return '';
            };
            const asList = (v) => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; };
            const isLinked = (a) => /^ANN_(TASK|EVT)_/.test(String(a && a.AssignmentID || ''));
            const linkOf = (a) => { const m = /^ANN_(TASK|EVT)_(.+)$/.exec(String(a && a.AssignmentID || '')); return m ? { kind: m[1] === 'TASK' ? 'task' : 'event', id: m[2] } : null; };
            const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const shortDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + TH_MS[d.getMonth()] + ' ' + (d.getFullYear() + 543); };

            /** ผู้ใช้อยู่ในรายชื่อผู้รับ "จริง" หรือไม่ (ไม่นับสิทธิ์ ADMIN / เจ้าของ) */
            function myTokens() {
                const s = new Set(['u:' + myId()]);
                (state.user.groups || []).concat(state.user.group ? [state.user.group] : []).forEach(g => {
                    const c = clean(g);
                    if (!c) return;
                    s.add('g:' + c);
                    const p = parentOf(c);
                    if (p) s.add('g:' + p);
                });
                if (state.user.subjectGroup) s.add('s:' + clean(state.user.subjectGroup));
                return s;
            }
            function isRecipient(list) {
                list = asList(list);
                if (!list.length) return false;
                const mine = myTokens();
                return list.some(t => { t = String(t); const k = t.substring(0, 2); return (k === 'g:' || k === 's:') ? mine.has(k + clean(t.substring(2))) : mine.has(t); });
            }
            PC.isRecipient = isRecipient;

            // ---------- ค่าส่วนตัว ----------
            const PREF = 'actPrefs';
            const prefKey = () => 'u:' + myId() + ':' + PREF;
            let prefCache = null, prefStamp = null;
            function prefs() {
                const rec = PC.store && PC.store.settings ? PC.store.settings[prefKey()] : null;
                const stamp = rec ? (rec.u || 0) + '|' + (rec.x ? 1 : 0) : 'none';
                if (prefCache && prefStamp === stamp) return prefCache;
                let v = rec && !rec.x ? rec.value : null;
                if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
                v = v && typeof v === 'object' ? v : {};
                const arr = (x) => Array.isArray(x) ? x.map(String) : [];
                prefCache = {
                    pins: arr(v.pins), unpins: arr(v.unpins), workPins: arr(v.workPins), taskPins: arr(v.taskPins),
                    work: Array.isArray(v.work) ? v.work.filter(w => w && w.id).map(w => ({ id: String(w.id), at: Number(w.at) || 0 })) : []
                };
                prefStamp = stamp;
                return prefCache;
            }
            let saveT = null;
            function savePrefs(p) {
                if (!PC.store || !PC.store.settings || !myId()) return;
                PC.store.settings[prefKey()] = { key: prefKey(), name: PREF, scope: 'user', value: p, x: 0, u: Date.now() };
                prefCache = null;
                clearTimeout(saveT);
                saveT = setTimeout(() => {
                    apiWrite('saveSettings', { items: [{ name: PREF, scope: 'user', value: prefs() }] })
                        .then(() => saveSnapshotSoon())
                        .catch(e => Swal.fire('บันทึกไม่สำเร็จ', e.message, 'error'));
                }, 500);
            }
            const edit = (fn) => { const p = JSON.parse(JSON.stringify(prefs())); fn(p); savePrefs(p); };
            const without = (arr, id) => arr.filter(x => x !== id);

            // ---------- [ข้อ 2/3] ปักหมุดใน "ประกาศสำคัญ" ----------
            PC.annPinnedForMe = function (a) {
                if (!a || !a.AssignmentID) return false;
                const id = String(a.AssignmentID), p = prefs();
                if (p.unpins.includes(id)) return false;
                if (p.pins.includes(id)) return true;
                return isLinked(a) && String(a.CreatedBy || '') !== myId() && isRecipient(a.Audience);
            };
            PC.toggleMyPin = function (id) {
                const a = (state.assignments || []).find(x => x.AssignmentID === id);
                if (!a) return;
                const on = PC.annPinnedForMe(a);
                edit(p => {
                    p.pins = without(p.pins, id);
                    p.unpins = without(p.unpins, id);
                    if (on) { if (isLinked(a) && isRecipient(a.Audience)) p.unpins.push(id); }
                    else p.pins.push(id);
                });
                renderAssignmentsList();
                toast('success', on ? 'เลิกปักหมุดแล้ว' : '📌 ปักหมุดไว้บนสุดของประกาศแล้ว');
            };

            // ---------- [ข้อ 4] เรื่องที่เลือกไปแสดงใน "งานของฉัน" ----------
            const inWork = (id) => prefs().work.some(w => w.id === id);
            PC.toggleMyWork = function (id) {
                const on = inWork(id);
                edit(p => {
                    p.work = p.work.filter(w => w.id !== id);
                    p.workPins = without(p.workPins, id);
                    if (!on) p.work.push({ id: id, at: Date.now() });
                });
                renderAssignmentsList();
                renderSavedWork();
                toast('success', on ? 'นำออกจากงานของฉันแล้ว' : '✅ เพิ่มไปที่ "งานของฉัน" แล้ว');
            };
            PC.toggleWorkPin = function (id) {
                const on = prefs().workPins.includes(id);
                edit(p => { p.workPins = without(p.workPins, id); if (!on) p.workPins.push(id); });
                renderSavedWork();
            };

            // ---------- ปุ่มบนการ์ดในแท็บกิจกรรม ----------
            const chipBtn = 'text-[10px] font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition shadow-sm';
            function decorateCards() {
                const list = document.getElementById('assignments-list');
                if (!list) return;
                const byId = {};
                (state.assignments || []).forEach(a => { byId[a.AssignmentID] = a; });
                list.querySelectorAll('form[onsubmit*="handleAddComment"]').forEach(f => {
                    const m = (f.getAttribute('onsubmit') || '').match(/handleAddComment\(event,\s*'([^']+)'/);
                    const a = m && byId[m[1]];
                    const card = f.closest('.rounded-2xl');
                    if (!a || !card || card.querySelector('.pc29-acts')) return;
                    card.setAttribute('data-ann', a.AssignmentID);
                    const idq = jsq(a.AssignmentID);
                    const pinned = PC.annPinnedForMe(a), saved = inWork(a.AssignmentID);
                    const box = document.createElement('div');
                    box.className = 'pc29-acts flex items-center gap-1.5 flex-wrap justify-end';
                    box.innerHTML =
                        (a.isPinned ? '' : `<button type="button" onclick="PC.toggleMyPin('${idq}')" class="${chipBtn} ${pinned ? 'text-amber-700 bg-amber-100 border-amber-300 hover:bg-amber-200' : 'text-slate-500 bg-white border-slate-200 hover:bg-amber-50'}" title="${pinned ? 'เลิกปักหมุด (เฉพาะของท่าน)' : 'ปักหมุดเรื่องนี้ไว้บนสุด (เฉพาะของท่าน)'}"><i class="fa-solid fa-thumbtack ${pinned ? 'rotate-45 text-amber-600' : ''}"></i><span>${pinned ? 'ปักหมุดของฉัน' : 'ปักหมุด'}</span></button>`) +
                        `<button type="button" onclick="PC.toggleMyWork('${idq}')" class="${chipBtn} ${saved ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100' : 'text-slate-500 bg-white border-slate-200 hover:bg-rose-50'}" title="${saved ? 'นำออกจากงานของฉัน' : 'เพิ่มเรื่องนี้ไปแสดงในแท็บ งานของฉัน'}"><i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i><span>${saved ? 'อยู่ในงานของฉัน' : 'เพิ่มไปงานของฉัน'}</span></button>`;
                    const col = card.querySelector('div.items-end');
                    if (col) col.insertBefore(box, col.firstChild);
                    // งาน/กิจกรรมที่แชร์ : ป้ายบอกประเภท + ปุ่มเปิดรายการต้นทาง
                    const ln = linkOf(a);
                    const head = card.querySelector('h4');
                    if (ln && head && !card.querySelector('.pc29-link')) {
                        const tag = document.createElement('span');
                        tag.className = 'pc29-link text-[10px] font-bold px-2 py-0.5 rounded-full border ' + (ln.kind === 'task' ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-purple-700 bg-purple-50 border-purple-200');
                        tag.innerHTML = `<i class="fa-solid ${ln.kind === 'task' ? 'fa-list-check' : 'fa-calendar-days'} mr-1"></i>${ln.kind === 'task' ? 'งานที่แชร์ถึงท่าน' : 'กิจกรรมที่แชร์ถึงท่าน'}`;
                        head.parentElement.appendChild(tag);
                        const open = document.createElement('button');
                        open.type = 'button';
                        open.className = 'pc29-link mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition ' + (ln.kind === 'task' ? 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100' : 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100');
                        open.innerHTML = `<i class="fa-solid ${ln.kind === 'task' ? 'fa-list-check' : 'fa-calendar-days'}"></i> ${ln.kind === 'task' ? 'เปิดในกำหนดงาน' : 'เปิดในปฏิทินงาน'}`;
                        open.onclick = () => PC.openLinked(ln.kind, ln.id);
                        const desc = card.querySelector('.whitespace-pre-wrap');
                        if (desc) desc.insertAdjacentElement('afterend', open);
                    }
                });
            }
            PC.openLinked = function (kind, id) {
                if (kind === 'task') {
                    const t = (state.tasks || []).find(x => x.id === id);
                    if (!t) return Swal.fire('ไม่พบงาน', 'งานนี้อาจถูกลบหรือเลิกแชร์แล้ว', 'info');
                    switchTab('tasks');
                    try { switchTaskList(['subject', 'school'].includes(t.listType) ? t.listType : 'mine'); } catch (e) { /* ข้าม */ }
                    if (typeof window.viewTask === 'function' && String(t.ownerId) !== myId()) setTimeout(() => window.viewTask(id), 200);
                    else if (typeof window.editTask === 'function') setTimeout(() => window.editTask(id), 200);
                } else {
                    switchTab('calendar');
                }
            };
            (function () {
                const orig = window.renderAssignmentsList;
                window.renderAssignmentsList = function () {
                    const r = orig.apply(this, arguments);
                    try { decorateCards(); } catch (e) { console.warn('[v29] ann decorate', e.message); }
                    return r;
                };
            })();

            // ---------- [ข้อ 2] แท็บกำหนดงาน : ผู้รับเห็นงานที่แชร์ , ล่าสุดอยู่บน , ปักหมุดได้ ----------
            const origTFM29 = tasksForMode;
            tasksForMode = function (mode) {
                const base = origTFM29(mode);
                if (mode !== 'mine') return base;
                const have = new Set(base.map(t => t.id));
                const extra = (state.tasks || []).filter(t => t && t.id && !have.has(t.id) && t.visibility === 'shared' &&
                    String(t.ownerId) !== myId() && !['subject', 'school'].includes(t.listType) && isRecipient(t.shareTo));
                return base.concat(extra);
            };
            const taskTime = (t) => {
                if (t._t) return Number(t._t);                         // [v31] แถวกิจกรรมจากปฏิทิน
                const r = PC.store && PC.store.tasks && PC.store.tasks[t.id];
                if (r && r.c) return Number(r.c);
                const m = /(\d{12,13})/.exec(String(t.id || ''));
                return m ? Number(m[1]) : 0;
            };
            PC.sortTasksForMe = function (items) {
                const pins = new Set(prefs().taskPins);
                items.sort((a, b) => (Number(pins.has(b.id)) - Number(pins.has(a.id))) || (taskTime(b) - taskTime(a)) || String(a.title).localeCompare(String(b.title), 'th'));
                return items;
            };
            PC.toggleTaskPin = function (id) {
                const on = prefs().taskPins.includes(id);
                edit(p => { p.taskPins = without(p.taskPins, id); if (!on) p.taskPins.push(id); });
                renderTasks();
                toast('success', on ? 'เลิกปักหมุดงานแล้ว' : '📌 ปักหมุดงานไว้บนสุดแล้ว');
            };
            const origRow29 = taskRowHtml;
            taskRowHtml = function (t) {
                let html = origRow29(t);
                const on = prefs().taskPins.includes(t.id);
                const star = '<button type="button" onclick="event.stopPropagation(); toggleTaskStar';
                const pinBtn = `<button type="button" onclick="event.stopPropagation(); PC.toggleTaskPin('${jsq(t.id)}')" class="w-7 h-7 rounded-lg ${on ? 'text-amber-600' : 'text-slate-300'} hover:text-amber-600 transition shrink-0" title="${on ? 'เลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}"><i class="fa-solid fa-thumbtack text-[12px] ${on ? 'rotate-45' : ''}"></i></button>`;
                html = html.replace(star, pinBtn + star);
                if (on) html = html.replace('rounded-xl hover:bg-slate-50 transition', 'rounded-xl bg-amber-50/70 hover:bg-amber-50 transition');
                if (t.visibility === 'shared' && String(t.ownerId) !== myId() && isRecipient(t.shareTo) && html.indexOf('pc29-shared') === -1) {
                    html = html.replace('<div class="flex flex-wrap items-center gap-1.5 mt-1">', '$&<span class="pc29-shared text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-share-nodes mr-1"></i>แชร์ถึงท่าน</span>');
                }
                return html;
            };

            // ---------- [ข้อ 4] ส่วน "เรื่องที่บันทึกจากกิจกรรม" ในแท็บงานของฉัน ----------
            PC.gotoAnn = function (id) {
                switchTab('activities');
                const find = () => document.querySelector('#assignments-list [data-ann="' + CSS.escape(id) + '"]');
                const show = (card) => {
                    const det = card.closest('details'); if (det) det.open = true;
                    const body = card.closest('[id^="anng-body-"]'); if (body) body.classList.remove('hidden');
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('ring-4', 'ring-rose-300');
                    setTimeout(() => card.classList.remove('ring-4', 'ring-rose-300'), 2200);
                };
                setTimeout(() => {
                    let card = find();
                    if (card) return show(card);
                    // ถูกตัวกรองซ่อนอยู่ -> ล้างตัวกรองแล้วหาใหม่
                    try { if (window.annCat) window.annCat('all'); if (window.annPeriod) window.annPeriod('all'); } catch (e) { /* ข้าม */ }
                    setTimeout(() => { card = find(); if (card) show(card); else toast('info', 'ไม่พบเรื่องนี้ในแท็บกิจกรรม (อาจถูกลบหรือซ่อนแล้ว)'); }, 250);
                }, 250);
            };
            function annDesc(a) {
                let d = String(a.Instructions || '').trim();
                if (d.charAt(0) === '{') { try { d = JSON.parse(d.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')).desc || ''; } catch (e) { /* ข้าม */ } }
                return d.replace(/\s+/g, ' ').trim();
            }
            function renderSavedWork() {
                const periods = document.getElementById('mywork-periods');
                if (!periods) return;
                let box = document.getElementById('mywork-saved');
                if (!box) {
                    box = document.createElement('div');
                    box.id = 'mywork-saved';
                    box.className = 'mb-4';
                    const row = periods.parentElement;
                    row.parentElement.insertBefore(box, row);
                }
                const p = prefs();
                const pins = new Set(p.workPins);
                const byId = {};
                (state.assignments || []).forEach(a => { byId[a.AssignmentID] = a; });
                const items = p.work.map(w => ({ w: w, a: byId[w.id] || null }))
                    .sort((x, y) => (Number(pins.has(y.w.id)) - Number(pins.has(x.w.id))) ||
                        ((Date.parse(y.a && y.a.CreatedAt || '') || y.w.at) - (Date.parse(x.a && x.a.CreatedAt || '') || x.w.at)));
                if (!items.length) {
                    box.innerHTML = `<div class="flex items-center gap-2 text-[11.5px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3 py-2.5">
                        <i class="fa-regular fa-bookmark text-rose-500"></i> เลือกเรื่องจากแท็บ <b class="text-slate-700">กิจกรรม</b> มาไว้ที่นี่ได้ ด้วยปุ่ม <b class="text-slate-700">"เพิ่มไปงานของฉัน"</b> บนการ์ดแต่ละเรื่อง</div>`;
                    return;
                }
                const row = ({ w, a }) => {
                    const idq = jsq(w.id), pinned = pins.has(w.id);
                    if (!a) return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
                        <i class="fa-regular fa-circle-xmark text-slate-400"></i><div class="flex-1 text-[12px] text-slate-500">เรื่องนี้ถูกลบ หรือท่านไม่มีสิทธิ์เห็นแล้ว</div>
                        <button type="button" onclick="PC.toggleMyWork('${idq}')" class="text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-white">นำออก</button></div>`;
                    const ln = linkOf(a);
                    const ncm = Array.isArray(a.comments) ? a.comments.length : 0;
                    const icon = ln ? (ln.kind === 'task' ? 'fa-list-check' : 'fa-calendar-days') : 'fa-bullhorn';
                    return `<div class="flex items-start gap-3 px-3 py-3 rounded-xl border transition hover:shadow-sm ${pinned ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style="background:${pinned ? '#f59e0b' : '#e11d48'}"><i class="fa-solid ${pinned ? 'fa-thumbtack' : icon} text-sm"></i></div>
                        <div class="min-w-0 flex-1 cursor-pointer" onclick="PC.gotoAnn('${idq}')">
                            <div class="text-[13.5px] font-bold text-slate-800 leading-snug">${esc(a.Title || '-')}</div>
                            ${annDesc(a) ? `<div class="text-[11.5px] text-slate-500 truncate mt-0.5">${esc(annDesc(a).substring(0, 160))}</div>` : ''}
                            <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                                ${a.Group ? `<span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full"><i class="fa-solid fa-sitemap mr-1"></i>${esc(a.Group)}</span>` : ''}
                                ${(a.Reporter || a.CreatedByName) ? `<span class="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-user-pen mr-1"></i>${esc(a.Reporter || a.CreatedByName)}</span>` : ''}
                                <span class="text-[10px] text-slate-500"><i class="fa-regular fa-calendar mr-1"></i>${esc(shortDate(a.CreatedAt))}</span>
                                ${ncm ? `<span class="text-[10px] text-slate-500"><i class="fa-regular fa-comments mr-1"></i>${ncm} ความคิดเห็น</span>` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            <button type="button" onclick="PC.toggleWorkPin('${idq}')" class="w-8 h-8 rounded-lg ${pinned ? 'text-amber-600 bg-amber-100' : 'text-slate-400 hover:bg-slate-100'} transition" title="${pinned ? 'เลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}"><i class="fa-solid fa-thumbtack ${pinned ? 'rotate-45' : ''}"></i></button>
                            <button type="button" onclick="PC.gotoAnn('${idq}')" class="w-8 h-8 rounded-lg text-blue-600 hover:bg-blue-50 transition" title="เปิดในแท็บกิจกรรม"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                            <button type="button" onclick="PC.toggleMyWork('${idq}')" class="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 transition" title="นำออกจากงานของฉัน"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>`;
                };
                box.innerHTML = `<div class="rounded-2xl border border-rose-200 overflow-hidden">
                    <div class="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-100">
                        <i class="fa-solid fa-bookmark text-rose-600"></i>
                        <span class="font-bold text-sm text-rose-800">เรื่องที่บันทึกจากแท็บกิจกรรม</span>
                        <span class="ml-auto text-[11px] font-bold bg-white border border-rose-200 text-rose-700 px-2.5 py-0.5 rounded-full">${items.length} เรื่อง</span>
                    </div>
                    <div class="p-2 space-y-2 bg-white max-h-[420px] overflow-y-auto">${items.map(row).join('')}</div></div>`;
            }
            PC.renderSavedWork = renderSavedWork;
            (function () {
                const orig = window.renderMyWork;
                if (typeof orig !== 'function') return;
                window.renderMyWork = function () {
                    const r = orig.apply(this, arguments);
                    try { renderSavedWork(); } catch (e) { console.warn('[v29] saved work', e.message); }
                    return r;
                };
            })();
            // ค่าส่วนตัวเปลี่ยนจากเครื่องอื่น (ซิงก์) -> วาดใหม่
            const origRerender29 = rerenderAll;
            let lastStamp = null;
            rerenderAll = function (what) {
                const r = origRerender29.apply(this, arguments);
                try {
                    const rec = PC.store && PC.store.settings ? PC.store.settings[prefKey()] : null;
                    const stamp = rec ? String(rec.u) : '';
                    if (stamp !== lastStamp) {
                        lastStamp = stamp;
                        if (!(what && what.ann)) renderAssignmentsList();
                        renderSavedWork();
                        if (typeof renderTasks === 'function' && document.getElementById('tab-tasks') && !document.getElementById('tab-tasks').classList.contains('hidden')) renderTasks();
                    }
                } catch (e) { /* ข้าม */ }
                return r;
            };
        })();

        /* =====================================================================
           [v31]
             3 งานใหม่ / กิจกรรม : ตั้งแจ้งเตือนล่วงหน้าได้ (บนจอ + เสียง + แจ้งเตือนเบราว์เซอร์ , เซิร์ฟเวอร์ส่ง Telegram)
             4 กิจกรรมของโรงเรียน / กลุ่มสาระ / กลุ่มงาน -> แสดงในแท็บย่อย งานโรงเรียน / งานกลุ่มสาระ / งานกลุ่มงาน ของกำหนดงาน
             5 แท็บย่อยของกำหนดงาน : สีไล่ระดับต่างกัน + hover
           ===================================================================== */
        (function v31() {
            const MAIN = ['กลุ่มบริหารวิชาการ', 'กลุ่มบริหารงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารทั่วไป'];
            const clean = (s) => String(s || '').replace(/ฯ/g, '').trim();
            const pad2 = (n) => String(n).padStart(2, '0');
            const myId = () => (state.user && state.user.id) ? String(state.user.id) : '';
            const rooms = () => (typeof defaultRooms !== 'undefined' && Array.isArray(defaultRooms)) ? defaultRooms : [];
            const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const thDay = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? Number(m[3]) + ' ' + TH_MS[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543) : ''; };
            const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
            const parentOf = (g) => {
                const n = clean(g), list = rooms(), i = list.findIndex(r => clean(r.name) === n);
                if (i < 0) return '';
                if (list[i].parent) return clean(list[i].parent);
                for (let k = i - 1; k >= 0; k--) { const m = clean(list[k].name); if (MAIN.includes(m)) return m; }
                return '';
            };
            const myGroups = () => {
                const s = new Set();
                (state.user.groups || []).concat(state.user.group ? [state.user.group] : []).forEach(g => { const c = clean(g); if (c) { s.add(c); const p = parentOf(c); if (p) s.add(p); } });
                return s;
            };
            const subGroupNames = () => rooms().filter(r => (r.type || '') === 'sub' || (r.parent && !MAIN.includes(clean(r.name))) || /^กลุ่มงาน/.test(clean(r.name)))
                .map(r => clean(r.name)).filter((n, i, a) => n && a.indexOf(n) === i);
            const subjectNames = () => Array.from(new Set((PC.users || []).map(u => clean(u.subjectGroup)).concat([clean(state.user.subjectGroup)]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));

            /* ---------- [ข้อ 3] ตัวเลือกแจ้งเตือนล่วงหน้า : ขออนุญาตแจ้งเตือนของเบราว์เซอร์เมื่อเลือกครั้งแรก ---------- */
            PC.onRemindPick = function (sel) {
                if (Number(sel && sel.value) > 0 && 'Notification' in window && Notification.permission === 'default') {
                    try { Notification.requestPermission(); } catch (e) { /* ข้าม */ }
                }
            };

            /* ---------- [ข้อ 4] โมดอลกิจกรรม : ประเภท + ชื่อกลุ่มสาระ/กลุ่มงาน ---------- */
            PC.onEventScope = function (keepName) {
                const scope = document.getElementById('event-scope')?.value || '';
                const box = document.getElementById('event-scope-name-box');
                const sel = document.getElementById('event-scope-name');
                const lab = document.getElementById('event-scope-name-label');
                if (!box || !sel) return;
                const need = scope === 'subject' || scope === 'group';
                box.classList.toggle('hidden', !need);
                if (!need) return;
                const cur = keepName !== undefined ? keepName : sel.value;
                let opts, mine;
                if (scope === 'subject') {
                    lab.textContent = 'กลุ่มสาระการเรียนรู้';
                    opts = subjectNames();
                    mine = clean(state.user.subjectGroup);
                } else {
                    lab.textContent = 'กลุ่มงาน / กลุ่มบริหาร';
                    opts = MAIN.concat(subGroupNames().filter(n => !MAIN.includes(n)));
                    mine = clean((state.user.groups || [])[0] || state.user.group || '');
                }
                if (cur && !opts.includes(cur)) opts.unshift(cur);
                sel.innerHTML = opts.map(n => `<option value="${esc(n)}">${esc(n)}${n === mine ? ' (ของฉัน)' : ''}</option>`).join('') || '<option value="">- ไม่มีรายการ -</option>';
                sel.value = cur && opts.includes(cur) ? cur : (opts.includes(mine) ? mine : (opts[0] || ''));
            };
            (function () {
                const o1 = window.openEventModal;
                if (typeof o1 === 'function') window.openEventModal = function () {
                    const r = o1.apply(this, arguments);
                    const s = document.getElementById('event-scope'); if (s) s.value = '';
                    const rm = document.getElementById('event-remind'); if (rm) rm.value = '0';
                    PC.onEventScope();
                    return r;
                };
                const o2 = window.editEvent;
                if (typeof o2 === 'function') window.editEvent = function (id) {
                    const r = o2.apply(this, arguments);
                    const evt = (state.calendarEvents || []).find(e => e.id === id);
                    if (evt) {
                        const s = document.getElementById('event-scope'); if (s) s.value = evt.scope || '';
                        const rm = document.getElementById('event-remind'); if (rm) rm.value = String(Number(evt.remind) || 0);
                        PC.onEventScope(evt.scopeName || '');
                    }
                    return r;
                };
                const o3 = window.openTaskModal;
                if (typeof o3 === 'function') window.openTaskModal = function () {
                    const r = o3.apply(this, arguments);
                    const rm = document.getElementById('task-remind'); if (rm) rm.value = '0';
                    return r;
                };
                const o4 = window.editTask;
                if (typeof o4 === 'function') window.editTask = function (id) {
                    const r = o4.apply(this, arguments);
                    const t = (state.tasks || []).find(x => x.id === id);
                    const rm = document.getElementById('task-remind');
                    if (t && rm) rm.value = String(Number(t.remind) || 0);
                    return r;
                };
            })();

            /* ---------- [ข้อ 4] กิจกรรมในแท็บย่อยของกำหนดงาน ---------- */
            const deptGroup = (dept) => { const d = clean(dept); if (!d || /ส่วนกลาง/.test(d)) return ''; return MAIN.find(m => m === d || m === 'กลุ่ม' + d || m.indexOf(d) !== -1) || d; };
            function eventRows(mode) {
                const admin = realRole() === 'ADMIN';
                const mySubj = clean(state.user.subjectGroup);
                const groups = myGroups();
                const today = todayStr();
                return (state.calendarEvents || []).filter(e => {
                    if (!e || !e.id || e.scope !== mode) return false;
                    if (mode === 'school') return true;
                    const mineRec = String(e.recorder || '') === myId();
                    if (mode === 'subject') return admin || mineRec || !mySubj || clean(e.scopeName) === mySubj;
                    return admin || mineRec || groups.has(clean(e.scopeName));
                }).map(e => {
                    const end = e.endDate || e.startDate || e.date || '';
                    const rec = PC.store && PC.store.events && PC.store.events[e.id];
                    return {
                        id: 'evt:' + e.id, _event: e, _t: (rec && rec.c) || (Number((/(\d{12,13})/.exec(String(e.id)) || [])[1]) || 0),
                        title: e.title || '', desc: e.desc || '', dueDate: e.startDate || e.date || '', dueTime: e.startTime || '', allDay: !e.startTime,
                        status: end && end < today ? 'done' : 'open', ownerId: e.recorder || '', ownerName: e.responsible || '',
                        group: mode === 'school' ? deptGroup(e.dept) : (mode === 'group' ? clean(e.scopeName) : ''),
                        subjectGroup: mode === 'subject' ? clean(e.scopeName) : '', listType: mode, visibility: 'public', starred: false, repeat: 'none'
                    };
                });
            }
            const origTFM31 = tasksForMode;
            tasksForMode = function (mode) {
                if (mode === 'group') {
                    const groups = myGroups(), me = myId(), admin = realRole() === 'ADMIN';
                    const tasks = (state.tasks || []).filter(t => t && t.id && t.listType === 'group' && (
                        String(t.ownerId) === me || admin ||
                        (t.visibility === 'public' && (groups.has(clean(t.group)) || groups.has(parentOf(t.group)))) ||
                        (t.visibility === 'shared' && typeof PC.isRecipient === 'function' && PC.isRecipient(t.shareTo))));
                    return tasks.concat(eventRows('group'));
                }
                const base = origTFM31(mode);
                if (mode === 'school' || mode === 'subject') return base.concat(eventRows(mode));
                return base;
            };
            PC.showEventRow = function (id) {
                const e = (state.calendarEvents || []).find(x => x.id === id);
                if (!e) return;
                if ((String(e.recorder || '') === myId() || ['ADMIN', 'Director'].includes(realRole())) && typeof window.editEvent === 'function') return window.editEvent(id);
                const row = (icon, label, v) => v ? `<div class="flex gap-2 py-1.5 border-b border-slate-100 last:border-0"><i class="fa-solid ${icon} w-4 text-center text-purple-500 mt-0.5"></i><div class="w-24 shrink-0 text-slate-500">${label}</div><div class="flex-1 font-semibold text-slate-800 whitespace-pre-wrap">${esc(v)}</div></div>` : '';
                const s = e.startDate || e.date || '', en = e.endDate || s;
                Swal.fire({
                    title: '<div class="text-base font-bold text-slate-800"><i class="fa-solid fa-calendar-days text-purple-600 mr-2"></i>' + esc(e.title) + '</div>',
                    html: `<div class="text-left text-sm">${row('fa-calendar', 'วันที่', thDay(s) + (en && en !== s ? ' – ' + thDay(en) : ''))}${row('fa-clock', 'เวลา', e.startTime ? e.startTime + (e.endTime ? ' – ' + e.endTime : '') + ' น.' : '')}
                        ${row('fa-location-dot', 'สถานที่', e.location && e.location !== 'ไม่ระบุสถานที่' ? e.location : '')}${row('fa-layer-group', 'ประเภท', { school: 'กิจกรรมของโรงเรียน', subject: 'กิจกรรมของกลุ่มสาระ', group: 'กิจกรรมของกลุ่มงาน' }[e.scope] + (e.scopeName ? ' : ' + e.scopeName : ''))}
                        ${row('fa-user-tie', 'ผู้รับผิดชอบ', e.responsible || '')}${row('fa-align-left', 'รายละเอียด', e.desc || '')}</div>`,
                    confirmButtonText: 'ปิด', confirmButtonColor: '#7c3aed'
                });
            };
            const origRow31 = taskRowHtml;
            taskRowHtml = function (t) {
                if (!t || !t._event) return origRow31(t);
                const e = t._event, done = t.status === 'done';
                const s = e.startDate || e.date || '', en = e.endDate || s;
                const pinned = typeof PC.toggleTaskPin === 'function' && (() => { try { const st = PC.store.settings['u:' + myId() + ':actPrefs']; const v = st && !st.x ? st.value : null; return !!(v && Array.isArray(v.taskPins) && v.taskPins.includes(t.id)); } catch (x) { return false; } })();
                return `
                <div class="group flex items-start gap-3 px-3 py-2 rounded-xl ${pinned ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-slate-50'} transition ${done ? 'opacity-55' : ''}">
                    <div class="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-white text-[10px]" style="background:linear-gradient(135deg,#a855f7,#6366f1)"><i class="fa-solid fa-calendar-day"></i></div>
                    <div class="flex-1 min-w-0 cursor-pointer" onclick="PC.showEventRow('${jsq(e.id)}')">
                        <div class="text-sm font-semibold text-slate-800 ${done ? 'line-through' : ''} truncate">${esc(t.title)}</div>
                        ${t.desc ? `<div class="text-[11px] text-slate-500 truncate">${esc(t.desc)}</div>` : ''}
                        <div class="flex flex-wrap items-center gap-1.5 mt-1">
                            <span class="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-calendar-days mr-1"></i>กิจกรรม</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200"><i class="fa-regular fa-clock mr-1"></i>${esc(thDay(s) + (en && en !== s ? ' – ' + thDay(en) : '') + (e.startTime ? ' ' + e.startTime : ''))}${done ? ' (ผ่านไปแล้ว)' : ''}</span>
                            ${e.location && e.location !== 'ไม่ระบุสถานที่' ? `<span class="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-location-dot mr-1"></i>${esc(e.location)}</span>` : ''}
                            ${e.responsible ? `<span class="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-user mr-1"></i>${esc(e.responsible)}</span>` : ''}
                            ${Number(e.remind) > 0 ? `<span class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-bell mr-1"></i>แจ้งล่วงหน้า</span>` : ''}
                        </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); PC.toggleTaskPin('${jsq(t.id)}')" class="w-7 h-7 rounded-lg ${pinned ? 'text-amber-600' : 'text-slate-300'} hover:text-amber-600 transition shrink-0" title="${pinned ? 'เลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}"><i class="fa-solid fa-thumbtack text-[12px] ${pinned ? 'rotate-45' : ''}"></i></button>
                </div>`;
            };
            // แถวงานปกติ : ป้ายแจ้งเตือนล่วงหน้า
            const origRow31b = taskRowHtml;
            taskRowHtml = function (t) {
                let html = origRow31b(t);
                if (t && !t._event && Number(t.remind) > 0 && html.indexOf('pc31-remind') === -1) {
                    html = html.replace('<div class="flex flex-wrap items-center gap-1.5 mt-1">', '$&<span class="pc31-remind text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" title="แจ้งเตือนล่วงหน้า"><i class="fa-solid fa-bell mr-1"></i>' + esc(remindText(Number(t.remind))) + '</span>');
                }
                return html;
            };

            /* ---------- [ข้อ 5] แท็บย่อยของกำหนดงาน : สีไล่ระดับ ---------- */
            if (!document.getElementById('pc31-style')) {
                const st = document.createElement('style');
                st.id = 'pc31-style';
                st.textContent = `
                    #task-subtabs .pc-st{border:0!important;color:var(--st-ink)!important;background:var(--st-soft)!important;box-shadow:0 1px 2px rgba(15,23,42,.08),inset 0 0 0 1px var(--st-line)!important;transition:transform .15s,box-shadow .15s,filter .15s,background .15s!important}
                    #task-subtabs .pc-st:hover{background:var(--st-grad)!important;color:#fff!important;transform:translateY(-1px);box-shadow:0 8px 18px var(--st-shadow)!important}
                    #task-subtabs .pc-st.pc-st-on{background:var(--st-grad)!important;color:#fff!important;box-shadow:0 8px 20px var(--st-shadow)!important}
                    #task-subtabs .pc-st.pc-st-on:hover{filter:brightness(1.07)}
                    #task-subtabs .pc-st .pc-tl-x span{color:inherit!important}
                    .pc-st-mine{--st-grad:linear-gradient(135deg,#6366f1,#a855f7);--st-soft:linear-gradient(135deg,#eef2ff,#f5f3ff);--st-ink:#4338ca;--st-line:#c7d2fe;--st-shadow:rgba(99,102,241,.35)}
                    .pc-st-subject{--st-grad:linear-gradient(135deg,#0ea5e9,#2563eb);--st-soft:linear-gradient(135deg,#e0f2fe,#dbeafe);--st-ink:#0369a1;--st-line:#bae6fd;--st-shadow:rgba(14,165,233,.35)}
                    .pc-st-school{--st-grad:linear-gradient(135deg,#10b981,#0d9488);--st-soft:linear-gradient(135deg,#d1fae5,#ccfbf1);--st-ink:#047857;--st-line:#a7f3d0;--st-shadow:rgba(16,185,129,.35)}
                    .pc-st-group{--st-grad:linear-gradient(135deg,#f59e0b,#f43f5e);--st-soft:linear-gradient(135deg,#fef3c7,#ffe4e6);--st-ink:#b45309;--st-line:#fde68a;--st-shadow:rgba(244,63,94,.32)}
                    .pc-st-c0{--st-grad:linear-gradient(135deg,#ec4899,#a855f7);--st-soft:linear-gradient(135deg,#fce7f3,#f3e8ff);--st-ink:#be185d;--st-line:#fbcfe8;--st-shadow:rgba(236,72,153,.32)}
                    .pc-st-c1{--st-grad:linear-gradient(135deg,#06b6d4,#6366f1);--st-soft:linear-gradient(135deg,#cffafe,#e0e7ff);--st-ink:#0e7490;--st-line:#a5f3fc;--st-shadow:rgba(6,182,212,.32)}
                    .pc-st-c2{--st-grad:linear-gradient(135deg,#84cc16,#10b981);--st-soft:linear-gradient(135deg,#ecfccb,#d1fae5);--st-ink:#4d7c0f;--st-line:#d9f99d;--st-shadow:rgba(132,204,22,.32)}
                    .pc-st-c3{--st-grad:linear-gradient(135deg,#f97316,#ef4444);--st-soft:linear-gradient(135deg,#ffedd5,#fee2e2);--st-ink:#c2410c;--st-line:#fed7aa;--st-shadow:rgba(249,115,22,.32)}
                    #pc-remind-box{position:fixed;left:14px;bottom:14px;z-index:4500;display:flex;flex-direction:column;gap:8px;width:min(340px,calc(100vw - 28px));font-family:Sarabun,sans-serif}
                    #pc-remind-box .rm{background:#fff;border-radius:16px;box-shadow:0 14px 34px rgba(2,6,23,.22);border:1px solid #fde68a;overflow:hidden;animation:pcRmIn .25s ease-out}
                    @keyframes pcRmIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}`;
                document.head.appendChild(st);
            }
            function decorateSubtabs() {
                const box = document.getElementById('task-subtabs');
                if (!box) return;
                let ci = 0;
                box.querySelectorAll('.task-subtab').forEach(b => {
                    if (b.classList.contains('pc-add-tl')) return;
                    const key = String(b.id || '').replace('tasktab-', '');
                    const tone = ['mine', 'subject', 'school', 'group'].includes(key) ? key : 'c' + (ci++ % 4);
                    b.classList.forEach(c => { if (/^pc-st-/.test(c) && c !== 'pc-st-on') b.classList.remove(c); });
                    b.classList.add('pc-st', 'pc-st-' + tone);
                    b.classList.toggle('pc-st-on', key === taskListMode);
                });
            }
            PC.decorateSubtabs = decorateSubtabs;
            (function () {
                const orig = window.renderTasks;
                if (typeof orig !== 'function') return;
                window.renderTasks = function () {
                    const r = orig.apply(this, arguments);
                    try { decorateSubtabs(); } catch (e) { /* ข้าม */ }
                    return r;
                };
            })();

            /* ---------- [ข้อ 3] ตัวแจ้งเตือนล่วงหน้าบนหน้าเว็บ ---------- */
            function remindText(min) {
                if (min % 10080 === 0) return 'ก่อน ' + (min / 10080) + ' สัปดาห์';
                if (min % 1440 === 0) return 'ก่อน ' + (min / 1440) + ' วัน';
                if (min % 60 === 0) return 'ก่อน ' + (min / 60) + ' ชม.';
                return 'ก่อน ' + min + ' นาที';
            }
            const dueMsOf = (ymd, hm) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return 0;
                const t = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
                return new Date(ymd + 'T' + (t ? pad2(t[1]) + ':' + t[2] : '08:00') + ':00').getTime();
            };
            const leftText = (ms) => {
                if (ms <= 0) return 'ถึงกำหนดแล้ว';
                const m = Math.round(ms / 60000);
                if (m < 60) return 'อีก ' + m + ' นาที';
                if (m < 1440) return 'อีก ' + Math.floor(m / 60) + ' ชม. ' + (m % 60 ? (m % 60) + ' นาที' : '');
                return 'อีก ' + Math.floor(m / 1440) + ' วัน';
            };
            function remindItems() {
                const me = myId(), out = [];
                if (!me) return out;
                (state.tasks || []).forEach(t => {
                    const rm = Number(t && t.remind) || 0;
                    if (!rm || t.status === 'done' || !t.dueDate) return;
                    const mine = String(t.ownerId) === me;
                    const shared = t.visibility === 'shared' && typeof PC.isRecipient === 'function' && PC.isRecipient(t.shareTo);
                    if (!mine && !shared) return;
                    out.push({ kind: 'task', id: t.id, title: t.title, rm: rm, due: dueMsOf(t.dueDate, t.allDay ? '' : t.dueTime), when: thDay(t.dueDate) + (!t.allDay && t.dueTime ? ' เวลา ' + t.dueTime + ' น.' : '') });
                });
                (state.calendarEvents || []).forEach(e => {
                    const rm = Number(e && e.remind) || 0;
                    if (!rm) return;
                    const s = e.startDate || e.date || '';
                    out.push({ kind: 'event', id: e.id, title: e.title, rm: rm, due: dueMsOf(s, e.startTime), when: thDay(s) + (e.startTime ? ' เวลา ' + e.startTime + ' น.' : '') });
                });
                return out;
            }
            const shown = new Set();
            function checkReminders() {
                if (!PC.token || !state.user || !state.user.id) return;
                const now = Date.now();
                remindItems().forEach(x => {
                    if (!x.due || now < x.due - x.rm * 60000 || now > x.due) return;
                    const key = 'pc-remind:' + myId() + ':' + x.kind + ':' + x.id + ':' + x.due + ':' + x.rm;
                    let done = shown.has(key);
                    try { done = done || localStorage.getItem(key) === '1'; } catch (e) { /* ข้าม */ }
                    if (done) return;
                    shown.add(key);
                    try { localStorage.setItem(key, '1'); } catch (e) { /* ข้าม */ }
                    showReminder(x, x.due - now);
                });
            }
            function showReminder(x, left) {
                let box = document.getElementById('pc-remind-box');
                if (!box) { box = document.createElement('div'); box.id = 'pc-remind-box'; document.body.appendChild(box); }
                const card = document.createElement('div');
                card.className = 'rm';
                const isTask = x.kind === 'task';
                card.innerHTML = `
                    <div class="flex items-center gap-2 px-3.5 py-2 text-white text-[12px] font-bold" style="background:linear-gradient(135deg,#f59e0b,#f43f5e)">
                        <i class="fa-solid fa-bell fa-shake"></i> แจ้งเตือนล่วงหน้า (${esc(remindText(x.rm))})
                        <button type="button" class="ml-auto text-white/80 hover:text-white" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="px-3.5 py-3">
                        <div class="text-[11px] font-bold ${isTask ? 'text-indigo-600' : 'text-purple-600'}"><i class="fa-solid ${isTask ? 'fa-list-check' : 'fa-calendar-days'} mr-1"></i>${isTask ? 'งาน' : 'กิจกรรม'}</div>
                        <div class="text-[14px] font-extrabold text-slate-800 leading-snug">${esc(x.title || '')}</div>
                        <div class="text-[12px] text-slate-600 mt-0.5"><i class="fa-regular fa-clock mr-1"></i>${esc(x.when)} · <b class="text-rose-600">${esc(leftText(left))}</b></div>
                        <button type="button" class="pc-rm-open mt-2 text-[11.5px] font-bold px-3 py-1.5 rounded-lg text-white" style="background:${isTask ? '#6366f1' : '#7c3aed'}">${isTask ? 'เปิดงาน' : 'เปิดกิจกรรม'}</button>
                    </div>`;
                const close = () => { card.remove(); if (typeof stopCalendarSound === 'function') stopCalendarSound(); };
                card.querySelector('button[title="ปิด"]').onclick = close;
                card.querySelector('.pc-rm-open').onclick = () => {
                    close();
                    if (isTask) { switchTab('tasks'); setTimeout(() => (typeof window.editTask === 'function' ? window.editTask(x.id) : null), 200); }
                    else { switchTab('calendar'); setTimeout(() => PC.showEventRow(x.id), 200); }
                };
                box.appendChild(card);
                // เสียงเตือนตามการตั้งค่าเสียงปฏิทิน
                try {
                    const soundOn = (typeof calSettings === 'undefined' || !calSettings) ? true : calSettings.soundOn !== false;
                    const audio = document.getElementById('calendar-audio');
                    if (soundOn && audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
                } catch (e) { /* ข้าม */ }
                // การแจ้งเตือนของเบราว์เซอร์ (ถ้าผู้ใช้อนุญาต)
                try {
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('⏰ ' + (isTask ? 'งาน' : 'กิจกรรม') + ' : ' + (x.title || ''), { body: x.when + ' · ' + leftText(left), tag: 'pc-remind-' + x.id });
                    }
                } catch (e) { /* ข้าม */ }
            }
            PC.checkReminders = checkReminders;
            setInterval(checkReminders, 30000);
            setTimeout(checkReminders, 5000);
        })();

        /* =====================================================================
           [v34] โหลดไฟล์หนังสือล่วงหน้าเบื้องหลัง (หลังเข้าสู่ระบบ)
             - เฉพาะหนังสือที่ "กำลังรอผู้ใช้คนนี้ดำเนินการ" (รอลงนาม / รอลงรับ / มอบหมายถึงตัวเอง) เรียงจากฉบับล่าสุด
             - เก็บลงแคชในเครื่อง (IndexedDB) เท่านั้น ไม่กินหน่วยความจำของหน้าเว็บ -> กดดู/ลงนามแล้วขึ้นทันที
             - ทีละ 2 ฉบับ ทุก 12 วินาที , หยุดเมื่อกำลังบันทึกงาน / แท็บไม่ได้เปิดอยู่ / ผู้ใช้เปิดโหมดประหยัดเน็ต
             - หนังสือใหม่ที่เข้ามาระหว่างใช้งานจะถูกโหลดล่วงหน้าให้เช่นกัน
           ===================================================================== */
        (function v34() {
            const warmed = new Set();
            let busy = false, total = 0, user = '';
            function candidates() {
                const me = state.user && state.user.id ? String(state.user.id) : '';
                if (!PC.token || !PC.store || !me) return [];
                if (me !== user) { user = me; warmed.clear(); total = 0; }
                const admin = realRole() === 'ADMIN';
                const out = [];
                const q = state.documentQueue || [];
                for (let i = q.length - 1; i >= 0 && out.length < 2; i--) {       // ฉบับล่าสุดก่อน
                    const d = q[i];
                    if (!d || !d.id || warmed.has(d.id) || Number(d.stage) === 99) continue;
                    let mine = false;
                    try {
                        mine = (typeof window.pcAssignedToMe === 'function' && !!window.pcAssignedToMe(d)) ||
                            (!admin && typeof PC.signTabForDoc === 'function' && !!PC.signTabForDoc(d));
                    } catch (e) { mine = false; }
                    if (mine) out.push(d);
                }
                return out;
            }
            async function tick() {
                if (busy || total >= 40 || document.visibilityState !== 'visible') return;
                if (navigator.connection && navigator.connection.saveData) return;
                if (PC.inflightWrites > 0 || (PC.docSync && PC.docSync.running)) return;     // ไม่แย่งคิวกับการบันทึก
                const list = candidates();
                if (!list.length) return;
                busy = true;
                try {
                    for (const d of list) {
                        warmed.add(d.id);
                        const toks = Array.from(new Set(collectTokens(d, 'image').map(t => t.token)));
                        if (!toks.length) continue;
                        const pub = !d.secrecy || d.secrecy === 'normal';      // [v35] ชั้น "ทั่วไป" : ภาพดึงตรงจาก Google
                        for (const tk of toks) await warmToken(tk, pub);        // มีในแคชแล้ว = ไม่เรียกเซิร์ฟเวอร์
                        total++;
                    }
                } catch (e) {
                    console.warn('[PC] prefetch', e.message);
                } finally {
                    busy = false;
                }
            }
            PC.prefetchStatus = () => ({ warmed: warmed.size, fetched: total, busy: busy });
            setInterval(tick, 12000);
            setTimeout(tick, 6000);
        })();

        /* =====================================================================
           [v35]
             4 แท็บสถิติหนังสือรับ = แท็บแรก / หน้าหลักเมื่อเข้าห้อง
             6 แท็บ "สถิติการใช้งานระบบ" (เฉพาะผู้ดูแลระบบ) : สรุปจากชีต Logs รายวัน / เดือน / ปี / ย้อนหลัง + แนวโน้ม
           ===================================================================== */
        (function v35() {
            const pad2 = (n) => String(n).padStart(2, '0');
            const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            const DAY = 864e5;

            /* ---------- [ข้อ 4] เข้าห้องแล้วเปิดแท็บสถิติเป็นหน้าแรก ---------- */
            (function () {
                const orig = window.openRoom;
                if (typeof orig !== 'function') return;
                window.openRoom = function () {
                    const r = orig.apply(this, arguments);
                    try {
                        const b = document.getElementById('tab-btn-stats');
                        if (b && !b.classList.contains('hidden') && document.getElementById('view-room') && !document.getElementById('view-room').classList.contains('hidden')) switchTab('stats');
                    } catch (e) { /* ข้าม */ }
                    return r;
                };
            })();

            /* ---------- [ข้อ 6] สิทธิ์ : เฉพาะผู้ดูแลระบบ ---------- */
            const origTabAllowed35 = tabAllowed;
            tabAllowed = function (tab) {
                if (tab === 'usage') return !!PC.user && realRole() === 'ADMIN';
                return origTabAllowed35(tab);
            };
            PC.tabAllowed = tabAllowed;
            (function () {
                const orig = window.applyRolePermissions;
                if (typeof orig !== 'function') return;
                window.applyRolePermissions = function () {
                    const r = orig.apply(this, arguments);
                    const btn = document.getElementById('tab-btn-usage');
                    if (btn) btn.classList.toggle('hidden', !tabAllowed('usage'));
                    return r;
                };
            })();

            const U = { period: 'month', trend: 'day', metric: 'l', year: new Date().getFullYear(), cache: {}, loading: false, error: '' };
            const isCur = () => U.year === new Date().getFullYear();
            const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
            const weekStart = (ms) => { const d = new Date(dayStart(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
            const keyOf = (ms) => { const d = new Date(ms); return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
            function range() {
                const now = Date.now();
                if (!isCur()) return [new Date(U.year, 0, 1).getTime(), new Date(U.year, 11, 31, 23, 59, 59).getTime()];
                if (U.period === 'today') return [dayStart(now), now];
                if (U.period === 'week') return [weekStart(now), now];
                if (U.period === 'year') return [new Date(U.year, 0, 1).getTime(), now];
                return [new Date(U.year, new Date().getMonth(), 1).getTime(), now];
            }
            function rangeText() {
                const [a, b] = range();
                const f = (ms, y) => { const d = new Date(ms); return d.getDate() + ' ' + TH_MS[d.getMonth()] + (y ? ' ' + (d.getFullYear() + 543) : ''); };
                if (!isCur()) return 'ทั้งปี พ.ศ. ' + (U.year + 543);
                if (U.period === 'today') return f(a, true);
                if (U.period === 'year') return 'ปี พ.ศ. ' + (U.year + 543);
                return f(a) + ' – ' + f(b, true);
            }
            const profileOf = (id) => (PC.users || []).find(x => String(x.id) === String(id)) || {};
            const avatarOf = (id) => profileOf(id).image || DEFAULT_AVATAR;

            /* [v36 ข้อ 1] กดรูป/ชื่อผู้ใช้ในตาราง -> โมดอลรูปผู้ใช้ + ข้อมูลการใช้งานในช่วงที่เลือก */
            PC.usageUser = function (id) {
                const c = U.cache[U.year];
                if (!c || !c.data || !PC.chartKit) return;
                const K = PC.chartKit, num = K.num, pctTxt = K.pctTxt;
                const data = c.data, days = data.days || {}, u = (data.users || {})[id] || {}, p = profileOf(id);
                const [a, b] = range();
                const s = sumRange(days, a, b);
                const list = [];
                for (let t = dayStart(a); t <= b; t += DAY) { const x = days[keyOf(t)]; list.push({ t: t, v: (x && x.u && x.u[id]) || 0, l: (x && x.ul && x.ul[id]) || 0 }); }
                const act = list.filter(x => x.v > 0);
                const total = act.reduce((n, x) => n + x.v, 0);
                const logins = list.reduce((n, x) => n + x.l, 0);
                const hasLogins = Object.keys(days).some(k => days[k].ul);
                const rank = Object.keys(s.u).sort((p1, p2) => s.u[p2] - s.u[p1]).indexOf(id) + 1;
                const fmt = (ms) => { const d = new Date(ms); return d.getDate() + ' ' + TH_MS[d.getMonth()] + ' ' + (d.getFullYear() + 543); };
                const lastLogin = p.lastLogin ? (() => { const d = new Date(p.lastLogin); return isNaN(d) ? '' : fmt(d.getTime()) + ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + ' น.'; })() : '';
                // กราฟแท่งเล็ก : สูงสุด 30 วันล่าสุดของช่วง
                const tail = list.slice(-30), mx = Math.max(1, ...tail.map(x => x.v));
                const spark = `<div class="flex items-end gap-[2px]" style="height:64px">${tail.map(x => `<div class="flex-1" title="${fmt(x.t)} : ${x.v} รายการ" style="height:${x.v ? Math.max(4, x.v / mx * 60) : 2}px;background:${x.v ? '#0d9488' : '#e2e8f0'};border-radius:3px 3px 0 0"></div>`).join('')}</div>
                    <div class="flex justify-between text-[10px] font-semibold text-slate-400 mt-1"><span>${fmt(tail[0].t)}</span><span>${fmt(tail[tail.length - 1].t)}</span></div>`;
                const box = (label, value, unit, color) => `<div class="rounded-xl border p-2.5 text-center" style="background:${color}12;border-color:${color}33">
                        <div class="text-[10.5px] font-bold text-slate-500">${label}</div><div class="text-[20px] font-extrabold text-slate-900 leading-tight">${value}</div><div class="text-[10px] font-bold text-slate-400">${unit}</div></div>`;
                const row = (icon, label, value) => value ? `<div class="flex gap-2 py-1.5 border-b border-slate-100 last:border-0"><i class="fa-solid ${icon} w-4 text-center text-teal-600 mt-0.5"></i><div class="w-28 shrink-0 text-slate-500">${label}</div><div class="flex-1 font-semibold text-slate-800">${esc(value)}</div></div>` : '';
                if (!document.getElementById('pcu-modal-style')) {
                    const st = document.createElement('style');
                    st.id = 'pcu-modal-style';
                    st.textContent = '.pcu-modal{padding:0 0 1.25em!important;overflow:hidden}.pcu-modal .swal2-html-container{margin:0!important;padding:0!important;text-align:left}';
                    document.head.appendChild(st);
                }
                Swal.fire({
                    html: `<div class="px-6 py-4 flex justify-between items-center" style="background:linear-gradient(135deg,#0f766e,#0d9488)">
                            <h3 class="text-lg font-bold text-white flex items-center gap-2"><i class="fa-solid fa-user-clock"></i> ข้อมูลการใช้งานของผู้ใช้</h3>
                            <button type="button" onclick="Swal.close()" class="text-white/80 hover:text-white transition" title="ปิด"><i class="fa-solid fa-xmark text-xl"></i></button></div>
                        <div class="px-4 sm:px-6 pt-4 text-sm">
                            <div class="flex items-center gap-4 mb-4">
                                <img src="${esc(p.image || DEFAULT_AVATAR)}" onerror="this.src='${DEFAULT_AVATAR}'" class="w-24 h-24 rounded-full object-cover shrink-0 bg-slate-100" style="border:3px solid #fff;box-shadow:0 0 0 3px #0d9488,0 8px 20px rgba(13,148,136,.3)">
                                <div class="min-w-0">
                                    <div class="text-[18px] font-extrabold text-slate-900 leading-tight">${esc(u.n || p.name || id)}</div>
                                    ${p.position ? `<div class="text-[12.5px] font-semibold text-slate-600 mt-0.5">${esc(p.position)}</div>` : ''}
                                    <div class="flex flex-wrap gap-1.5 mt-1.5">
                                        <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">${esc(ROLE_LABEL[u.r] || u.r || '-')}</span>
                                        ${rank ? `<span class="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><i class="fa-solid fa-ranking-star mr-1"></i>อันดับที่ ${rank} จาก ${num(Object.keys(s.u).length)} คน</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                ${box('รายการที่ทำ', num(total), 'รายการ', '#2563eb')}
                                ${box('เข้าสู่ระบบ', hasLogins ? num(logins) : '-', hasLogins ? 'ครั้ง' : 'ยังไม่มีข้อมูล', '#0d9488')}
                                ${box('วันที่เข้าใช้งาน', num(act.length), 'วัน', '#7c3aed')}
                                ${box('สัดส่วนของทั้งระบบ', pctTxt(total, s.a), 'ของรายการทั้งหมด', '#d97706')}
                            </div>
                            <div class="rounded-xl border border-slate-200 p-3 mb-3">
                                <div class="text-[11.5px] font-bold text-slate-600 mb-2"><i class="fa-solid fa-chart-column text-teal-600 mr-1"></i>จำนวนรายการต่อวัน (${esc(rangeText())})</div>
                                ${total ? spark : '<div class="text-center text-slate-400 text-xs py-4">ไม่มีการใช้งานในช่วงเวลานี้</div>'}
                            </div>
                            <div class="rounded-xl border border-slate-200 px-3">
                                ${row('fa-id-badge', 'รหัสผู้ใช้งาน', id)}
                                ${row('fa-sitemap', 'กลุ่มงาน', u.g || (p.groups || []).join(', '))}
                                ${row('fa-book', 'กลุ่มสาระ', p.subjectGroup)}
                                ${row('fa-calendar-check', 'ใช้งานล่าสุด (ในช่วงนี้)', act.length ? fmt(act[act.length - 1].t) : '')}
                                ${row('fa-right-to-bracket', 'เข้าสู่ระบบล่าสุด', lastLogin)}
                                ${row('fa-gauge', 'เฉลี่ยต่อวันที่ใช้งาน', act.length ? (total / act.length).toFixed(1) + ' รายการ/วัน' : '')}
                            </div>
                        </div>`,
                    width: 600, customClass: { popup: 'pc-wide-modal pcu-modal' },
                    showConfirmButton: true, confirmButtonText: 'ปิดหน้าต่าง', confirmButtonColor: '#0d9488'
                });
            };

            /** รวมข้อมูลรายวันในช่วง [a, b] */
            function sumRange(days, a, b) {
                const o = { l: 0, a: 0, u: {}, d: {}, h: new Array(24).fill(0), k: {}, s: [0, 0], n: 0 };
                for (let t = dayStart(a); t <= b; t += DAY) {
                    const x = days[keyOf(t)];
                    if (!x) continue;
                    o.n++;
                    o.l += x.l || 0; o.a += x.a || 0;
                    Object.keys(x.u || {}).forEach(k => { o.u[k] = (o.u[k] || 0) + x.u[k]; });
                    Object.keys(x.d || {}).forEach(k => { o.d[k] = (o.d[k] || 0) + x.d[k]; });
                    Object.keys(x.k || {}).forEach(k => { o.k[k] = (o.k[k] || 0) + x.k[k]; });
                    (x.h || []).forEach((v, i) => { o.h[i] += v || 0; });
                    if (x.s) { o.s[0] += x.s[0] || 0; o.s[1] += x.s[1] || 0; }
                }
                return o;
            }
            async function load(force) {
                const y = U.year;
                const c = U.cache[y];
                if (!force && c && Date.now() - c.at < 5 * 60000) return c.data;
                U.loading = true; U.error = '';
                render();
                try {
                    const data = await api('usageStats', { year: y, nocache: !!force }, { timeout: 120000, retries: 1 });
                    U.cache[y] = { at: Date.now(), data: data };
                    return data;
                } catch (e) {
                    U.error = e.message;
                    return null;
                } finally {
                    U.loading = false;
                }
            }

            function render() {
                const root = document.getElementById('usage-root');
                if (!root || !PC.chartKit) return;
                const K = PC.chartKit;
                K.css();
                K.hideTip();
                const num = K.num, pctTxt = K.pctTxt, pct = K.pct;
                const c = U.cache[U.year];
                const data = c ? c.data : null;
                const years = new Set([new Date().getFullYear(), U.year].concat((data && data.years) || []));
                const yearSel = `<select class="pcs-year" onchange="PC.usageSet('year', Number(this.value))">${Array.from(years).sort((p, q) => q - p).map(y => `<option value="${y}" ${y === U.year ? 'selected' : ''}>ปี พ.ศ. ${y + 543}</option>`).join('')}</select>`;
                const seg = isCur()
                    ? [['today', 'วันนี้'], ['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['year', 'ปีนี้']].map(([k, l]) => `<button type="button" class="${U.period === k ? 'on' : ''}" onclick="PC.usageSet('period','${k}')">${l}</button>`).join('')
                    : `<button type="button" class="on">ทั้งปี ${U.year + 543}</button>`;
                const hero = `<div class="pcs-hero" style="background:linear-gradient(135deg,#0f172a 0%,#0e7490 55%,#0d9488 100%);box-shadow:0 14px 34px rgba(13,148,136,.28)">
                        <div class="flex flex-wrap items-center justify-between gap-3 relative" style="z-index:1">
                            <div class="flex items-center gap-3">
                                <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-lg" style="background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25)"><i class="fa-solid fa-chart-line"></i></div>
                                <div><div class="text-lg sm:text-xl font-extrabold leading-tight">สถิติการใช้งานระบบ</div>
                                <div class="text-[12px] text-teal-100 font-semibold">${esc(rangeText())}${data ? ' · ข้อมูล ณ ' + pad2(new Date(data.at).getHours()) + '.' + pad2(new Date(data.at).getMinutes()) + ' น.' : ''}</div></div>
                            </div>
                            <div class="flex flex-wrap items-center gap-2 relative" style="z-index:1">
                                <button type="button" class="pcs-go" onclick="PC.usageReload()" title="ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์"><i class="fa-solid fa-rotate ${U.loading ? 'fa-spin' : ''}"></i> รีเฟรช</button>
                                ${yearSel}<div class="pcs-seg">${seg}</div>
                            </div>
                        </div>
                    </div>`;
                if (!data) {
                    root.innerHTML = `<div class="space-y-4">${hero}<div class="pcs-card"><div class="pcs-empty">${U.loading ? '<i class="fa-solid fa-spinner fa-spin"></i><div>กำลังสรุปข้อมูลการใช้งานจากบันทึกของระบบ...</div>' : `<i class="fa-solid fa-triangle-exclamation"></i><div>${esc(U.error || 'ยังไม่มีข้อมูล')}</div>`}</div></div></div>`;
                    return;
                }
                const [a, b] = range();
                const s = sumRange(data.days || {}, a, b);
                const users = data.users || {};
                const activeIds = Object.keys(s.u);
                const totalUsers = Object.keys(users).filter(id => !users[id].x).length || 1;
                const avgMin = s.s[1] ? s.s[0] / s.s[1] / 60000 : null;
                const GRAD = ['linear-gradient(135deg,#3b82f6,#1d4ed8)', 'linear-gradient(135deg,#10b981,#047857)', 'linear-gradient(135deg,#f59e0b,#c2410c)', 'linear-gradient(135deg,#a855f7,#6d28d9)'];
                const kpi = (i, label, icon, value, unit, sub, share) => `<div class="pcs-kpi2" style="background:${GRAD[i]}">
                        <div class="min-w-0 flex-1 relative" style="z-index:1"><div class="lb">${label}</div><div class="v">${value}<span class="u">${unit}</span></div><div class="sb">${sub}</div>
                        ${share === null ? '' : `<div class="bar"><i style="width:${share}%"></i></div>`}</div>
                        <div class="ic"><i class="fa-solid ${icon} fa-fade" style="--fa-animation-duration:2.2s;--fa-fade-opacity:.45"></i></div></div>`;
                const kpis = `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                    ${kpi(0, 'เข้าสู่ระบบ', 'fa-right-to-bracket', num(s.l), 'ครั้ง', s.n ? 'เฉลี่ย ' + (s.l / s.n).toFixed(1) + ' ครั้ง/วันที่มีการใช้งาน' : 'ยังไม่มีการเข้าใช้', null)}
                    ${kpi(1, 'ผู้ใช้ที่เข้าใช้งาน', 'fa-users', num(activeIds.length), 'คน', pctTxt(activeIds.length, totalUsers) + ' ของผู้ใช้ทั้งหมด ' + num(totalUsers) + ' คน', Math.min(100, pct(activeIds.length, totalUsers)))}
                    ${kpi(2, 'รายการที่ทำในระบบ', 'fa-bolt', num(s.a), 'รายการ', activeIds.length ? 'เฉลี่ย ' + (s.a / activeIds.length).toFixed(1) + ' รายการ/คน' : '-', null)}
                    ${kpi(3, 'เวลาใช้งานเฉลี่ย', 'fa-stopwatch', avgMin === null ? '-' : (avgMin >= 60 ? (avgMin / 60).toFixed(1) : Math.round(avgMin)), avgMin === null ? '' : (avgMin >= 60 ? 'ชม./ครั้ง' : 'นาที/ครั้ง'), s.s[1] ? 'จากการออกจากระบบ ' + num(s.s[1]) + ' ครั้ง' : 'ยังไม่มีข้อมูลการออกจากระบบ', null)}
                </div>`;
                // [v36 ข้อ 2] ส่วนหัวของแต่ละส่วนมีสีพื้นหลัง (ไล่สีต่างกันตามส่วน)
                const HEAD = {
                    trend: 'linear-gradient(135deg,#0f766e,#0d9488)', device: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                    hours: 'linear-gradient(135deg,#047857,#10b981)', actions: 'linear-gradient(135deg,#4338ca,#6366f1)',
                    table: 'linear-gradient(135deg,#b45309,#f59e0b)', roles: 'linear-gradient(135deg,#6d28d9,#a855f7)'
                };
                const toneOf = (title) => (/อุปกรณ์/.test(title) ? 'device' : /ช่วงเวลา/.test(title) ? 'hours' : /รายการที่ทำ/.test(title) ? 'actions' : /สูงสุด/.test(title) ? 'table' : /บทบาท/.test(title) ? 'roles' : 'trend');
                const card = (title, sub, body, extra, tone) => `<div class="pcs-card" style="overflow:hidden">
                        <div class="pcu-head flex items-start justify-between gap-3 flex-wrap" style="background:${HEAD[tone || toneOf(title)]}">
                            <div><div class="pcs-h">${title}</div>${sub ? `<div class="pcs-sub mt-0.5">${sub}</div>` : ''}</div>${extra || ''}</div>${body}</div>`;
                if (!document.getElementById('pcu-style')) {
                    const st = document.createElement('style');
                    st.id = 'pcu-style';
                    st.textContent = `.pcu-head{margin:-16px -16px 14px;padding:12px 16px;color:#fff}
                        .pcu-head .pcs-h{color:#fff}.pcu-head .pcs-h i{color:#fff !important;opacity:.95}
                        .pcu-head .pcs-sub{color:rgba(255,255,255,.85)}
                        .pcu-head .pcs-mini{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.3);color:#fff}
                        .pcu-head .pcs-mini:hover{background:rgba(255,255,255,.28)}
                        .pcu-head .pcs-mini.on{background:#fff;color:#0f172a;border-color:#fff}
                        .pcu-ava{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 0 0 2px #0d9488,0 2px 6px rgba(15,23,42,.18);cursor:pointer;transition:transform .15s;background:#f1f5f9;flex:none}
                        .pcu-ava:hover{transform:scale(1.12)}
                        .pcu-user{display:flex;align-items:center;gap:8px;cursor:pointer}
                        .pcu-user:hover .nm{color:#0d9488;text-decoration:underline}`;
                    document.head.appendChild(st);
                }
                const empty = (t) => `<div class="pcs-empty"><i class="fa-regular fa-folder-open"></i><div>${t || 'ยังไม่มีข้อมูลในช่วงเวลานี้'}</div></div>`;
                // แนวโน้ม
                const tog = `<div class="flex flex-wrap gap-1">
                    ${[['l', 'เข้าสู่ระบบ'], ['u', 'ผู้ใช้งาน'], ['a', 'รายการ']].map(([k, l]) => `<button type="button" class="pcs-mini ${U.metric === k ? 'on' : ''}" onclick="PC.usageSet('metric','${k}')">${l}</button>`).join('')}
                    <span class="w-px bg-slate-200 mx-1"></span>
                    ${[['day', 'รายวัน'], ['month', 'รายเดือน']].map(([k, l]) => `<button type="button" class="pcs-mini ${U.trend === k ? 'on' : ''}" onclick="PC.usageSet('trend','${k}')">${l}</button>`).join('')}</div>`;
                const trend = card('<i class="fa-solid fa-chart-area text-teal-600"></i> แนวโน้มการใช้งาน', U.trend === 'month' ? 'รายเดือน ปี พ.ศ. ' + (U.year + 543) : '30 วันล่าสุด' + (isCur() ? '' : 'ของปี ' + (U.year + 543)),
                    `<div id="pcu-trend" style="position:relative;min-height:290px;overflow:hidden"></div>`, tog);
                // อุปกรณ์
                const DEV_COL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#94a3b8'];
                const devKeys = Object.keys(s.d).sort((p, q) => s.d[q] - s.d[p]).slice(0, 5);
                const devTotal = devKeys.reduce((t, k) => t + s.d[k], 0);
                const R = 62, C = 2 * Math.PI * R, GAP = devKeys.length > 1 ? 3 : 0;
                let off = 0;
                const arcs = devKeys.map((k, i) => { const len = s.d[k] / devTotal * C; const seg2 = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${DEV_COL[i]}" stroke-width="24" stroke-dasharray="${Math.max(0.01, len - GAP)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)" data-tip="${esc('<b>' + esc(k) + '</b>' + K.tipRow(DEV_COL[i], 'เข้าสู่ระบบ', num(s.d[k]) + ' ครั้ง (' + pctTxt(s.d[k], devTotal) + ')'))}"></circle>`; off += len; return seg2; }).join('');
                const device = card('<i class="fa-solid fa-mobile-screen-button text-teal-600"></i> อุปกรณ์ที่ใช้เข้าระบบ', rangeText(), devTotal ? `<div class="flex flex-col items-center gap-3">
                        <svg viewBox="0 0 180 180" width="170" height="170" role="img" aria-label="สัดส่วนอุปกรณ์"><circle cx="90" cy="90" r="${R}" fill="none" stroke="#f1f5f9" stroke-width="24"></circle>${arcs}
                        <text x="90" y="86" text-anchor="middle" style="font:800 26px Sarabun,sans-serif;fill:#0f172a">${num(devTotal)}</text><text x="90" y="108" text-anchor="middle" style="font:600 12px Sarabun,sans-serif;fill:#64748b">ครั้ง</text></svg>
                        <div class="w-full">${devKeys.map((k, i) => `<div class="flex items-center gap-2 py-1.5"><span class="w-3 h-3 rounded-full shrink-0" style="background:${DEV_COL[i]}"></span><span class="text-[12.5px] font-semibold text-slate-700 flex-1 truncate">${esc(k)}</span><span class="text-[12px] text-slate-500 tabular-nums">${num(s.d[k])}</span><span class="text-[12.5px] font-extrabold text-slate-800 w-12 text-right tabular-nums">${pctTxt(s.d[k], devTotal)}</span></div>`).join('')}</div></div>` : empty());
                // ช่วงเวลา
                const hMax = Math.max(1, ...s.h);
                const hours = card('<i class="fa-solid fa-clock text-teal-600"></i> ช่วงเวลาที่เข้าใช้งาน', 'จำนวนการเข้าสู่ระบบตามชั่วโมง (' + rangeText() + ')', s.l ? `<div class="flex items-end gap-[3px]" style="height:150px">
                        ${s.h.map((v, i) => `<div class="flex-1 flex flex-col items-center justify-end h-full" data-tip="${esc('<b>' + pad2(i) + '.00 – ' + pad2(i) + '.59 น.</b>' + K.tipRow('#0d9488', 'เข้าสู่ระบบ', num(v) + ' ครั้ง'))}">
                            ${v === hMax && v ? `<div class="text-[9.5px] font-extrabold text-slate-700 mb-0.5">${num(v)}</div>` : ''}
                            <div style="width:100%;max-width:22px;height:${v ? Math.max(3, v / hMax * 120) : 2}px;background:${v ? '#0d9488' : '#e2e8f0'};border-radius:4px 4px 0 0"></div></div>`).join('')}</div>
                        <div class="flex gap-[3px] mt-1">${s.h.map((v, i) => `<div class="flex-1 text-center text-[9.5px] font-semibold text-slate-400">${i % 3 === 0 ? pad2(i) : ''}</div>`).join('')}</div>` : empty());
                // รายการที่ทำมากที่สุด
                const bars = (obj, color, unit, limit, labelOf) => {
                    const keys = Object.keys(obj).sort((p, q) => obj[q] - obj[p]).slice(0, limit);
                    const max = Math.max(1, ...keys.map(k => obj[k]));
                    return keys.length ? `<div class="space-y-2.5">${keys.map(k => `<div class="flex items-center gap-2" data-tip="${esc('<b>' + esc(labelOf ? labelOf(k) : k) + '</b>' + K.tipRow(color, 'จำนวน', num(obj[k]) + ' ' + unit))}">
                        <div class="w-[118px] shrink-0 text-[11.5px] font-semibold text-slate-600 truncate">${esc(labelOf ? labelOf(k) : k)}</div>
                        <div class="flex-1 flex items-center"><div style="width:${Math.max(2, obj[k] / max * 100)}%;height:14px;background:${color};border-radius:0 4px 4px 0"></div></div>
                        <div class="w-10 text-right text-[12px] font-extrabold text-slate-800 tabular-nums">${num(obj[k])}</div></div>`).join('')}</div>` : empty();
                };
                const actions = card('<i class="fa-solid fa-list-check text-teal-600"></i> รายการที่ทำมากที่สุด', rangeText(), bars(s.k, '#2a78d6', 'ครั้ง', 8));
                // ตามบทบาท
                const byRole = {};
                activeIds.forEach(id => { const r = (users[id] && users[id].r) || 'ไม่ทราบ'; byRole[r] = (byRole[r] || 0) + 1; });
                const roles = card('<i class="fa-solid fa-user-tag text-teal-600"></i> ผู้ใช้ที่เข้าใช้งานตามบทบาท', rangeText(), bars(byRole, '#0d9488', 'คน', 8, (k) => ROLE_LABEL[k] || k));
                // ผู้ใช้สูงสุด
                const top = activeIds.sort((p, q) => s.u[q] - s.u[p]).slice(0, 10);
                const never = Object.keys(users).filter(id => !users[id].x && !s.u[id]).length;
                const table = card('<i class="fa-solid fa-ranking-star text-teal-600"></i> ผู้ใช้งานสูงสุด 10 อันดับ', rangeText() + ' · ผู้ใช้ที่ยังไม่ได้เข้าใช้ในช่วงนี้ ' + num(never) + ' คน',
                    top.length ? `<div class="overflow-x-auto"><table class="pcs-table w-full"><thead><tr><th>ผู้ใช้งาน</th><th>บทบาท</th><th>กลุ่มงาน</th><th>รายการ</th><th>สัดส่วน</th></tr></thead><tbody>
                        ${top.map((id, i) => { const u = users[id] || {}; return `<tr><td><div class="flex items-center gap-2"><span class="inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-extrabold shrink-0 ${i < 3 ? 'bg-amber-400 text-amber-950' : 'bg-slate-200 text-slate-600'}">${i + 1}</span>
                                <span class="pcu-user" onclick="PC.usageUser('${jsq(id)}')" title="ดูข้อมูลการใช้งานของ ${esc(u.n || id)}"><img class="pcu-ava" loading="lazy" decoding="async" src="${esc(avatarOf(id))}" onerror="this.src='${DEFAULT_AVATAR}'" alt=""><span class="nm font-semibold text-slate-800">${esc(u.n || id)}</span></span></div></td>
                            <td style="text-align:left">${esc(ROLE_LABEL[u.r] || u.r || '-')}</td><td style="text-align:left;max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(u.g || '-')}</td>
                            <td class="font-extrabold text-slate-900">${num(s.u[id])}</td>
                            <td style="min-width:110px"><div class="flex items-center gap-2 justify-end"><div class="pcs-meter" style="background:#ccfbf1"><i style="width:${pct(s.u[id], s.u[top[0]])}%;background:#0d9488"></i></div><span class="text-[11.5px] font-bold text-slate-600 w-10 text-right">${pctTxt(s.u[id], s.a)}</span></div></td></tr>`; }).join('')}
                        </tbody></table></div>` : empty());
                root.innerHTML = `<div class="space-y-4">${hero}${kpis}
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pcs-row"><div class="lg:col-span-2 min-w-0">${trend}</div><div class="lg:col-span-1 min-w-0">${device}</div></div>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pcs-row"><div class="lg:col-span-2 min-w-0">${hours}</div><div class="lg:col-span-1 min-w-0">${actions}</div></div>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pcs-row"><div class="lg:col-span-2 min-w-0">${table}</div><div class="lg:col-span-1 min-w-0">${roles}</div></div>
                </div>`;
                const host = document.getElementById('pcu-trend');
                if (host && window.ResizeObserver) {
                    if (PC._usageRO) PC._usageRO.disconnect();
                    let lastW = 0;
                    PC._usageRO = new ResizeObserver(() => { const w = host.clientWidth; if (w && Math.abs(w - lastW) > 4) { lastW = w; drawTrend(data); } });
                    PC._usageRO.observe(host);
                } else drawTrend(data);
                if (!root.dataset.tipBound) {
                    root.dataset.tipBound = '1';
                    const onMove = (ev) => {
                        const t = ev.target.closest && ev.target.closest('[data-tip]');
                        if (!t || !root.contains(t)) { if (!ev.target.closest || !ev.target.closest('#pcu-trend')) K.hideTip(); return; }
                        K.showTip(t.getAttribute('data-tip'), ev.clientX, ev.clientY);
                    };
                    root.addEventListener('pointermove', onMove);
                    root.addEventListener('pointerdown', onMove);
                    root.addEventListener('pointerleave', K.hideTip);
                }
            }

            function drawTrend(data) {
                const host = document.getElementById('pcu-trend');
                if (!host) return;
                const K = PC.chartKit, num = K.num;
                const days = data.days || {};
                const val = (o) => (U.metric === 'u' ? Object.keys(o.u).length : o[U.metric]);
                const anchor = isCur() ? Date.now() : new Date(U.year, 11, 31, 12).getTime();
                const pts0 = [];
                if (U.trend === 'month') {
                    const lastM = isCur() ? new Date().getMonth() : 11;
                    for (let m = 0; m <= lastM; m++) {
                        const a = new Date(U.year, m, 1).getTime(), b = new Date(U.year, m + 1, 0, 23, 59, 59).getTime();
                        pts0.push({ label: TH_MS[m], full: 'เดือน' + TH_MF[m] + ' ' + (U.year + 543), v: val(sumRange(days, a, Math.min(b, anchor))) });
                    }
                } else {
                    const yStart = new Date(U.year, 0, 1).getTime();
                    for (let i = 29; i >= 0; i--) {
                        const t = dayStart(anchor) - i * DAY;
                        if (t < yStart) continue;
                        const d = new Date(t);
                        pts0.push({ label: d.getDate() + ' ' + TH_MS[d.getMonth()], full: d.getDate() + ' ' + TH_MF[d.getMonth()] + ' ' + (d.getFullYear() + 543), v: val(sumRange(days, t, t)) });
                    }
                }
                if (!pts0.length) { host.innerHTML = '<div class="pcs-empty"><i class="fa-regular fa-folder-open"></i><div>ยังไม่มีข้อมูล</div></div>'; return; }
                const unit = U.metric === 'l' ? 'ครั้ง' : (U.metric === 'u' ? 'คน' : 'รายการ');
                const name = U.metric === 'l' ? 'เข้าสู่ระบบ' : (U.metric === 'u' ? 'ผู้ใช้งาน' : 'รายการที่ทำ');
                const W = Math.max(300, host.clientWidth || 600), H = 230, PL = 40, PR = 24, PT = 16, PB = 28;
                const ticks = K.niceTicks(Math.max.apply(null, pts0.map(d => d.v))), top = ticks[ticks.length - 1] || 1;
                const x = (i) => PL + (W - PL - PR) * (pts0.length === 1 ? 0.5 : i / (pts0.length - 1));
                const y = (v) => PT + (H - PT - PB) * (1 - v / top);
                const pts = pts0.map((d, i) => [x(i), y(d.v)]);
                const col = pts.map((p, i) => K.mixAt(pts.length === 1 ? 0.5 : i / (pts.length - 1)));
                const line = K.smoothPath(pts);
                const area = line + ` L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`;
                const every = Math.max(1, Math.ceil(pts.length / (W < 520 ? 6 : 11)));
                const STOPS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'];
                const stops = (op) => STOPS.map((c, i) => `<stop offset="${i / (STOPS.length - 1) * 100}%" stop-color="${c}" stop-opacity="${op}"></stop>`).join('');
                const cur = pts0[pts0.length - 1].v, prev = pts0.length > 1 ? pts0[pts0.length - 2].v : 0, diff = cur - prev;
                const dCol = diff > 0 ? '#16a34a' : (diff < 0 ? '#dc2626' : '#64748b');
                host.innerHTML = `<div class="flex items-end flex-wrap gap-x-3 gap-y-1 mb-1" style="padding-left:6px">
                        <div class="leading-none"><span style="font-size:30px;font-weight:800;color:#0f172a">${num(cur)}</span><span class="text-[12px] font-bold text-slate-400 ml-1">${unit} · ${esc(pts0[pts0.length - 1].label)}</span></div>
                        <div class="text-[12.5px] font-bold pb-0.5" style="color:${dCol}"><i class="fa-solid ${diff > 0 ? 'fa-caret-up' : (diff < 0 ? 'fa-caret-down' : 'fa-minus')} mr-0.5"></i>${diff > 0 ? '+' : ''}${num(diff)} <span class="font-semibold text-slate-400">จาก${U.trend === 'month' ? 'เดือน' : 'วัน'}ก่อน</span></div></div>
                    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="แนวโน้ม${name}" style="display:block;overflow:visible">
                    <defs><linearGradient id="pcuLine" gradientUnits="userSpaceOnUse" x1="${PL}" y1="0" x2="${W - PR}" y2="0">${stops(1)}</linearGradient>
                        <linearGradient id="pcuArea" gradientUnits="userSpaceOnUse" x1="${PL}" y1="0" x2="${W - PR}" y2="0">${stops(0.28)}</linearGradient>
                        <linearGradient id="pcuFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0"></stop><stop offset="100%" stop-color="#fff" stop-opacity=".92"></stop></linearGradient></defs>
                    ${ticks.map(t => `<line x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}" stroke="#eef0f4" stroke-width="1"></line><text x="${PL - 9}" y="${y(t) + 4}" text-anchor="end" style="font:600 10.5px Sarabun,sans-serif;fill:#94a3b8">${num(t)}</text>`).join('')}
                    <line x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}" stroke="#cbd5e1" stroke-width="1"></line><line x1="${PL}" x2="${PL}" y1="${PT - 6}" y2="${y(0)}" stroke="#cbd5e1" stroke-width="1"></line>
                    <path d="${area}" fill="url(#pcuArea)"></path><path d="${area}" fill="url(#pcuFade)"></path>
                    <path d="${line}" fill="none" stroke="url(#pcuLine)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
                    ${pts.map((p, i) => (pts.length <= 16 || i === pts.length - 1) ? `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 6 : 4.5}" fill="${i === pts.length - 1 ? '#fff' : col[i]}" stroke="${i === pts.length - 1 ? col[i] : '#fff'}" stroke-width="${i === pts.length - 1 ? 3 : 2}"></circle>` : '').join('')}
                    ${pts0.map((d, i) => ((pts0.length - 1 - i) % every === 0) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="font:600 10.5px Sarabun,sans-serif;fill:#94a3b8">${esc(d.label)}</text>` : '').join('')}
                    <line id="pcu-cross" x1="0" x2="0" y1="${PT}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1" style="display:none"></line>
                    <circle id="pcu-dot" r="7" fill="#2a78d6" stroke="#fff" stroke-width="2" style="display:none"></circle>
                    <rect x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="transparent" id="pcu-hit"></rect></svg>`;
                const svg = host.querySelector('svg'), hit = host.querySelector('#pcu-hit'), cross = host.querySelector('#pcu-cross'), dot = host.querySelector('#pcu-dot');
                const move = (ev) => {
                    const r = svg.getBoundingClientRect(), px = ev.clientX - r.left;
                    let best = 0;
                    pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[best][0] - px)) best = i; });
                    const p = pts[best];
                    cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.style.display = '';
                    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.setAttribute('fill', col[best]); dot.style.display = '';
                    K.showTip('<b>' + esc(pts0[best].full) + '</b>' + K.tipRow(col[best], name, num(pts0[best].v) + ' ' + unit), r.left + p[0], r.top + p[1]);
                };
                hit.addEventListener('pointermove', move);
                hit.addEventListener('pointerdown', move);
                hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; dot.style.display = 'none'; K.hideTip(); });
            }

            async function open(force) {
                if (!tabAllowed('usage')) return;
                render();
                await load(force);
                render();
            }
            PC.renderUsage = open;
            PC.usageReload = () => open(true);
            PC.usageSet = function (k, v) {
                U[k] = v;
                if (k === 'year') open(false); else render();
            };
            (function () {
                const orig = window.switchTab;
                if (typeof orig !== 'function') return;
                window.switchTab = function (tabName) {
                    const r = orig.apply(this, arguments);
                    if (tabName === 'usage') setTimeout(() => open(false), 30);
                    return r;
                };
            })();
        })();

        /* ============================================================================
         *  [v37] ใครกำลังออนไลน์อยู่ : แผงด้านบนของหน้า "สถิติหนังสือรับ" และ "สถิติการใช้งานระบบ"
         *  - เซิร์ฟเวอร์จดเวลาใช้งานล่าสุดของแต่ละคนจากทุกคำสั่ง (รวมการซิงก์ทุก 30 วินาทีของหน้าที่เปิดอยู่)
         *  - เห็นภายใน 2 นาที = ออนไลน์ , 2-10 นาที = พักหน้าจอ (ย่อหน้าต่าง/สลับแท็บ/ปิดไปแล้ว)
         *  - ดึงรายชื่อใหม่ทุก 30 วินาที เฉพาะตอนที่เปิดหน้าสถิติอยู่และหน้าจอแสดงอยู่
         *  [v38] ชื่อ/ตำแหน่ง/รูป มากับรายชื่อออนไลน์เลย (ไม่แสดงรหัสผู้ใช้ระหว่างรอ) , ชื่ออยู่ใต้รูป ,
         *        กดรูป -> โมดอลเวลาเข้าใช้งาน + ระยะเวลาใช้งาน , แบ่งหน้าเมื่อมีจำนวนมาก
         * ==========================================================================*/
        (function v37() {
            const ON_MS = 120000, REFRESH_MS = 30000, TILE_W = 104, ROWS = { stats: 1, usage: 2 };
            const O = { list: [], at: 0, skew: 0, loading: false, err: '', off: false, page: { stats: 0, usage: 0 } };
            const HOSTS = { stats: 'stats-root', usage: 'usage-root' };
            const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const profileOf = (id) => (PC.users || []).find(x => String(x.id) === String(id)) || {};
            const pad2 = (n) => (n < 10 ? '0' : '') + n;
            const serverNow = () => Date.now() - O.skew;

            function css() {
                if (document.getElementById('pc-online-css')) return;
                const st = document.createElement('style');
                st.id = 'pc-online-css';
                st.textContent = `.pco-card{background:#fff;border:1px solid #e6e8ef;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 20px rgba(15,23,42,.05);overflow:hidden}
                    .pco-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 14px;color:#fff;background:linear-gradient(120deg,#047857,#10b981 55%,#34d399)}
                    .pco-title{font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px}
                    .pco-count{font-size:19px;font-weight:800;line-height:1}
                    .pco-sub{font-size:11px;color:rgba(255,255,255,.9);font-weight:500}
                    .pco-btn{margin-left:auto;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);color:#fff;cursor:pointer;transition:background .15s}
                    .pco-btn:hover{background:rgba(255,255,255,.32)}
                    .pco-pulse{position:relative;width:10px;height:10px;border-radius:50%;background:#bbf7d0;flex:none}
                    .pco-pulse:after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid #bbf7d0;animation:pcoPulse 1.6s ease-out infinite}
                    @keyframes pcoPulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.5);opacity:0}}
                    .pco-body{padding:8px 8px 6px;display:flex;flex-wrap:wrap;gap:2px 0}
                    .pco-user{width:${TILE_W}px;padding:4px 3px;border-radius:14px;text-align:center;cursor:pointer;transition:background .15s,transform .15s}
                    .pco-user:hover{background:#f0fdf4;transform:translateY(-2px)}
                    .pco-avw{position:relative;display:inline-block}
                    .pco-av{width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 0 0 2.5px #10b981,0 3px 8px rgba(15,23,42,.16);background:#f1f5f9;display:block}
                    .pco-user.away .pco-av{box-shadow:0 0 0 2.5px #cbd5e1;filter:grayscale(.65)}
                    .pco-user.me .pco-av{box-shadow:0 0 0 2.5px #10b981,0 0 0 5px #a7f3d0}
                    .pco-dot{position:absolute;right:0;bottom:0;width:11px;height:11px;border-radius:50%;background:#22c55e;border:2px solid #fff}
                    .pco-user.away .pco-dot{background:#f59e0b}
                    .pco-nm{margin-top:3px;font-size:11.5px;font-weight:700;color:#0f172a;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                    .pco-inf{font-size:10px;color:#64748b;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                    .pco-empty{padding:2px 6px 4px;font-size:12.5px;color:#64748b}
                    .pco-pager{display:flex;align-items:center;justify-content:center;gap:5px;padding:0 12px 8px;flex-wrap:wrap}
                    .pco-pg{min-width:26px;height:26px;padding:0 8px;border-radius:9px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s}
                    .pco-pg:hover:not(:disabled){background:#ecfdf5;border-color:#6ee7b7}
                    .pco-pg.on{background:#059669;border-color:#059669;color:#fff}
                    .pco-pg:disabled{opacity:.4;cursor:default}
                    .pco-pgt{font-size:11px;color:#64748b;margin-left:6px}
                    .pco-m-av{width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid #fff;box-shadow:0 0 0 4px #10b981,0 8px 22px rgba(15,23,42,.2);background:#f1f5f9;margin:6px auto 0;display:block}
                    .pco-m-av.away{box-shadow:0 0 0 4px #cbd5e1,0 8px 22px rgba(15,23,42,.2)}
                    .pco-m-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:10px 12px;text-align:left}
                    .pco-m-lb{font-size:11px;color:#64748b;font-weight:600}
                    .pco-m-v{font-size:15px;font-weight:800;color:#0f172a;margin-top:2px}`;
                document.head.appendChild(st);
            }

            const visibleTab = () => Object.keys(HOSTS).find(k => {
                const el = document.getElementById('tab-' + k);
                return el && !el.classList.contains('hidden');
            }) || '';

            function agoText(ms) {
                const s = Math.max(0, Math.round(ms / 1000));
                if (s < 60) return 'เมื่อสักครู่';
                return Math.round(s / 60) + ' นาทีที่แล้ว';
            }
            function durText(ms) {
                const s = Math.max(0, Math.floor(ms / 1000));
                const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
                if (h) return h + ' ชั่วโมง ' + m + ' นาที';
                if (m) return m + ' นาที ' + x + ' วินาที';
                return x + ' วินาที';
            }
            function timeText(ms) {
                const d = new Date(ms + O.skew), n = new Date();
                const day = d.toDateString() === n.toDateString() ? 'วันนี้' : d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543);
                return day + ' เวลา ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + ' น.';
            }

            /* ชื่อ/ตำแหน่ง/รูป : ใช้ที่เซิร์ฟเวอร์ส่งมากับรายชื่อออนไลน์ก่อน แล้วค่อยเสริมจากรายชื่อผู้ใช้ที่โหลดไว้ (ไม่แสดงรหัสผู้ใช้) */
            function person(x) {
                const p = profileOf(x.id);
                return {
                    name: x.n || p.name || ((p.firstname || '') + ' ' + (p.lastname || '')).trim() || 'ผู้ใช้งาน',
                    position: x.p || p.position || '',
                    image: window.pcThumb(x.img, 128) || p.image || DEFAULT_AVATAR
                };
            }
            function rowsNow() {
                const now = serverNow();
                const rows = O.list.map(x => Object.assign({}, x, { id: String(x.id), age: now - x.t }));
                return rows.filter(x => x.age <= ON_MS).concat(rows.filter(x => x.age > ON_MS));
            }

            function cardHtml(kind, width) {
                const myId = String((PC.me && PC.me.id) || '');
                const rows = rowsNow();
                const onCount = rows.filter(x => x.age <= ON_MS).length, awayCount = rows.length - onCount;
                const per = Math.max(3, Math.floor(Math.max(0, (width || 900) - 16) / TILE_W)) * (ROWS[kind] || 1);
                const pages = Math.max(1, Math.ceil(rows.length / per));
                const page = O.page[kind] = Math.min(Math.max(0, O.page[kind] || 0), pages - 1);
                const tile = (x) => {
                    const isAway = x.age > ON_MS, p = person(x), me = x.id === myId;
                    return `<div class="pco-user ${isAway ? 'away' : ''} ${me ? 'me' : ''}" onclick="PC.onlineUser('${jsq(x.id)}','${kind}')" title="${esc(p.name)}${me ? ' (คุณ)' : ''} · ${isAway ? 'พักหน้าจอ' : 'กำลังออนไลน์'}">
                        <span class="pco-avw"><img class="pco-av" src="${esc(p.image)}" onerror="this.src='${DEFAULT_AVATAR}'" alt=""><span class="pco-dot"></span></span>
                        <div class="pco-nm">${esc(p.name)}${me ? ' <span style="color:#059669;font-weight:600">(คุณ)</span>' : ''}</div>
                        ${p.position ? `<div class="pco-inf">${esc(p.position)}</div>` : ''}
                    </div>`;
                };
                let body, pager = '';
                if (O.err) body = `<div class="pco-empty"><i class="fa-solid fa-triangle-exclamation text-amber-500"></i> ${esc(O.err)}</div>`;
                else if (!O.at) body = `<div class="pco-empty"><i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบผู้ใช้งานที่ออนไลน์...</div>`;
                else if (!rows.length) body = `<div class="pco-empty">ยังไม่มีผู้ใช้งานออนไลน์ในขณะนี้</div>`;
                else {
                    body = rows.slice(page * per, page * per + per).map(tile).join('');
                    if (pages > 1) {
                        const nums = [];
                        for (let i = 0; i < pages; i++) {
                            if (pages > 7 && i > 0 && i < pages - 1 && Math.abs(i - page) > 1) { if (nums[nums.length - 1] !== '…') nums.push('…'); continue; }
                            nums.push(i);
                        }
                        pager = `<div class="pco-pager">
                            <button type="button" class="pco-pg" ${page === 0 ? 'disabled' : ''} onclick="PC.onlinePage('${kind}',${page - 1})" title="หน้าก่อน"><i class="fa-solid fa-chevron-left"></i></button>
                            ${nums.map(i => i === '…' ? '<span class="pco-pgt" style="margin:0">…</span>' : `<button type="button" class="pco-pg ${i === page ? 'on' : ''}" onclick="PC.onlinePage('${kind}',${i})">${i + 1}</button>`).join('')}
                            <button type="button" class="pco-pg" ${page >= pages - 1 ? 'disabled' : ''} onclick="PC.onlinePage('${kind}',${page + 1})" title="หน้าถัดไป"><i class="fa-solid fa-chevron-right"></i></button>
                            <span class="pco-pgt">แสดง ${page * per + 1}–${Math.min(rows.length, page * per + per)} จาก ${rows.length} คน</span>
                        </div>`;
                    }
                }
                const d = new Date(O.at || Date.now());
                const sub = O.at ? `อัปเดต ${pad2(d.getHours())}.${pad2(d.getMinutes())} น.${awayCount ? ` · พักหน้าจอ ${awayCount} คน` : ''}` : '';
                return `<div class="pco-card" style="margin-bottom:${kind === 'usage' ? 16 : 0}px">
                    <div class="pco-head">
                        <span class="pco-pulse"></span>
                        <span class="pco-title">กำลังออนไลน์ <span class="pco-count">${O.at && !O.err ? onCount : '–'}</span> คน</span>
                        <span class="pco-sub">${sub}</span>
                        <button type="button" class="pco-btn" onclick="PC.onlineReload()" title="ตรวจสอบอีกครั้ง"><i class="fa-solid fa-rotate ${O.loading ? 'fa-spin' : ''}"></i> รีเฟรช</button>
                    </div>
                    <div class="pco-body">${body}</div>${pager}
                </div>`;
            }

            function paint() {
                css();
                Object.keys(HOSTS).forEach(kind => {
                    const root = document.getElementById(HOSTS[kind]);
                    if (!root) return;
                    let host = document.getElementById('pc-online-' + kind);
                    if (kind === 'usage' && !tabAllowed('usage')) { if (host) host.innerHTML = ''; return; }
                    if (kind === 'stats' && !host) return;      // [v41] ช่องของหน้านี้ถูกสร้างพร้อมหน้าสถิติ (ใต้การ์ดสรุป) ยังไม่ถูกวาด = ยังไม่ต้องแสดง
                    if (!host) {
                        host = document.createElement('div');
                        host.id = 'pc-online-' + kind;
                        root.parentNode.insertBefore(host, root);
                    }
                    host.innerHTML = cardHtml(kind, host.clientWidth);
                });
            }
            PC.onlinePage = function (kind, n) { O.page[kind] = n; paint(); };
            PC.onlinePaint = paint;

            /* [v38 ข้อ 2] กดรูป -> โมดอลรูปผู้ใช้ + เวลาที่เข้าใช้งาน + ระยะเวลาที่ใช้งานจนถึงปัจจุบัน (นับต่อเนื่องขณะเปิดอยู่) */
            let modalTimer = null;
            PC.onlineUser = function (id, kind) {
                const find = () => rowsNow().find(r => r.id === String(id));
                const x = find();
                if (!x || typeof Swal === 'undefined') return;
                const p = person(x), admin = tabAllowed('usage');
                const canStats = admin && kind === 'usage' && typeof PC.usageUser === 'function';
                const fill = () => {
                    const r = find() || x, away = (serverNow() - r.t) > ON_MS;
                    const el = (k) => document.getElementById('pco-m-' + k);
                    if (!el('st')) return;
                    el('st').innerHTML = away
                        ? '<span style="color:#b45309"><i class="fa-solid fa-circle" style="font-size:9px"></i> พักหน้าจอ · ใช้งานล่าสุด ' + agoText(serverNow() - r.t) + '</span>'
                        : '<span style="color:#059669"><i class="fa-solid fa-circle" style="font-size:9px"></i> กำลังออนไลน์</span>';
                    el('in').textContent = r.s ? timeText(r.s) : 'ไม่ทราบ';
                    el('dur').textContent = r.s ? durText((away ? r.t : serverNow()) - r.s) : 'ไม่ทราบ';
                    el('durlb').textContent = away ? 'ระยะเวลาที่ใช้งาน (ถึงครั้งล่าสุด)' : 'ระยะเวลาที่ใช้งานจนถึงปัจจุบัน';
                    const av = el('av'); if (av) av.classList.toggle('away', away);
                };
                clearInterval(modalTimer);
                Swal.fire({
                    title: 'ผู้ใช้งานที่ออนไลน์',
                    html: `<img id="pco-m-av" class="pco-m-av" src="${esc(p.image)}" onerror="this.src='${DEFAULT_AVATAR}'" alt="">
                        <div style="margin-top:12px;font-size:17px;font-weight:800;color:#0f172a">${esc(p.name)}</div>
                        ${p.position ? `<div style="font-size:13px;color:#64748b">${esc(p.position)}</div>` : ''}
                        <div id="pco-m-st" style="margin-top:6px;font-size:12.5px;font-weight:700"></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
                            <div class="pco-m-box"><div class="pco-m-lb"><i class="fa-solid fa-right-to-bracket"></i> เข้าใช้งานเมื่อ</div><div class="pco-m-v" id="pco-m-in"></div></div>
                            <div class="pco-m-box"><div class="pco-m-lb"><i class="fa-solid fa-stopwatch"></i> <span id="pco-m-durlb"></span></div><div class="pco-m-v" id="pco-m-dur"></div></div>
                        </div>
                        ${admin && x.d ? `<div style="margin-top:10px;font-size:12px;color:#64748b"><i class="fa-solid fa-display"></i> อุปกรณ์ : ${esc(x.d)}</div>` : ''}`,
                    width: 460,
                    showConfirmButton: canStats, confirmButtonText: '<i class="fa-solid fa-chart-column"></i> ดูสถิติการใช้งาน', confirmButtonColor: '#0d9488',
                    showCancelButton: true, cancelButtonText: 'ปิด',
                    customClass: { popup: 'pc-head-modal' },
                    didOpen: () => { fill(); modalTimer = setInterval(fill, 1000); },
                    willClose: () => { clearInterval(modalTimer); modalTimer = null; }
                }).then(r => { if (r.isConfirmed && canStats) PC.usageUser(String(id)); });
            };

            async function load() {
                if (O.loading || O.off || !PC.token) return;
                O.loading = true;
                try {
                    const data = await PC.api('online', {}, { retries: 0, timeout: 20000 });
                    O.list = (data && data.list) || [];
                    O.skew = Date.now() - ((data && data.now) || Date.now());
                    O.at = Date.now();
                    O.err = '';
                } catch (e) {
                    if (e && e.code === 'NOT_FOUND') { O.off = true; O.err = 'ต้องอัปเดต Code.gs เป็นรุ่นล่าสุดก่อน จึงจะแสดงผู้ใช้งานที่ออนไลน์ได้'; }
                    else if (e && e.code === 'AUTH') { /* ระบบหลักจัดการเอง */ }
                    else if (!O.at) O.err = 'ตรวจสอบผู้ใช้งานที่ออนไลน์ไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ';
                } finally {
                    O.loading = false;
                    paint();
                }
            }
            PC.onlineReload = function () { O.off = false; O.err = ''; paint(); load(); };
            PC.onlineState = () => O;

            function tick() {
                if (!PC.token) { O.list = []; O.at = 0; O.off = false; O.err = ''; return; }
                if (document.visibilityState !== 'visible' || !visibleTab()) return;
                if (visibleTab() === 'usage' && !document.getElementById('pc-online-usage')) paint();
                if (Date.now() - O.at >= REFRESH_MS) load();
            }
            setInterval(tick, 4000);
            document.addEventListener('visibilitychange', () => setTimeout(tick, 300));
            let rz = null;
            window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (visibleTab() && O.at) paint(); }, 200); });
            (function () {
                const orig = window.switchTab;
                if (typeof orig !== 'function') return;
                window.switchTab = function (tabName) {
                    const r = orig.apply(this, arguments);
                    if (HOSTS[tabName]) setTimeout(() => { paint(); tick(); }, 60);
                    return r;
                };
            })();
        })();

        /* ============================================================================
         *  [v42] "ไม่พบห้องที่ท่านมีสิทธิ์เข้าใช้งาน" ทั้งที่ควรมีห้อง -> ซ่อมแซมเอง ไม่ต้องให้ผู้ใช้ออก/เข้าระบบใหม่
         *  สาเหตุที่เป็นไปได้ : ข้อมูลยังโหลดไม่ครบตอนวาดหน้า , สำเนาในเครื่องเสีย (ไม่มีห้อง) , สิทธิ์ห้องในเครื่องเก่ากว่าเซิร์ฟเวอร์
         *  ลำดับการซ่อม : 1) รายชื่อห้องจากคำตอบ login  2) ดึงข้อมูลตัวเองสดจากเซิร์ฟเวอร์  3) โหลดข้อมูลทั้งหมดใหม่ (ไม่ใช้สำเนาในเครื่อง)
         *  ทำเองอัตโนมัติไม่เกิน 1 รอบต่อ 60 วินาที , มีปุ่มให้กดเองและบอกข้อมูลที่ใช้ตรวจ
         * ==========================================================================*/
        (function v42() {
            const H = { busy: false, at: 0, step: '' };
            PC.healState = () => Object.assign({}, H);
            const card = (inner) => `<div class="col-span-full text-center py-12 px-4 bg-white rounded-3xl border">${inner}</div>`;

            function diag() {
                const u = (typeof state !== 'undefined' && state.user) || {};
                return `ตำแหน่ง: ${esc(u.title || '-')} · ห้องในระบบ: ${(typeof defaultRooms !== 'undefined' ? defaultRooms.length : 0)} · ห้องที่กำหนดให้ผู้ใช้: ${((PC.user && PC.user.rooms) || []).length}`;
            }

            PC.onNoRooms = function (grid) {
                if (!grid) return;
                // ข้อมูลยังโหลดอยู่ : บอกให้รอ (โหลดเสร็จระบบวาดหน้านี้ใหม่เอง)
                if (PC.bgLoading || !PC.store) {
                    grid.innerHTML = PC.skel ? '<div style="grid-column:1/-1">' + PC.skel.cards(3, 'กำลังโหลดรายชื่อห้อง…') + '</div>' : card('<i class="fa-solid fa-spinner fa-spin text-3xl text-blue-500 mb-3"></i><p class="font-bold text-slate-600">กำลังโหลดรายชื่อห้อง...</p>');   // [v83]
                    return;
                }
                if (H.busy) {
                    grid.innerHTML = card(`<i class="fa-solid fa-spinner fa-spin text-3xl text-blue-500 mb-3"></i><p class="font-bold text-slate-600">กำลังตรวจสอบสิทธิ์เข้าห้อง...</p><p class="text-xs text-slate-400 mt-1">${esc(H.step)}</p>`);
                    return;
                }
                grid.innerHTML = card(`<i class="fa-solid fa-folder-open text-4xl text-slate-300 mb-3"></i>
                    <p class="font-bold text-slate-600">ยังไม่มีห้องที่ท่านเข้าใช้งานได้</p>
                    <p class="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">กด "โหลดข้อมูลห้องใหม่" ก่อน ถ้ายังไม่มี แจ้งผู้ดูแลระบบให้กำหนดกลุ่มงานหรือสิทธิ์เข้าห้องของท่าน</p>
                    <p class="text-[11px] text-slate-400 mt-2">${diag()}</p>
                    <button type="button" onclick="PC.healRooms(true)" class="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow"><i class="fa-solid fa-rotate"></i> โหลดข้อมูลห้องใหม่</button>`);
                if (Date.now() - H.at > 60000) setTimeout(() => PC.healRooms(false), 50);
            };

            PC.healRooms = async function (manual) {
                if (H.busy || !PC.token || !PC.user) return;
                H.busy = true; H.at = Date.now();
                const tok = PC.token;
                const redraw = () => { try { renderDashboardRooms(); } catch (e) { /* ข้าม */ } };
                const ok = () => { try { return allowedRoomList().length > 0; } catch (e) { return false; } };
                try {
                    redraw();
                    // 1) รายชื่อห้องที่ได้มาตอน login
                    H.step = 'ใช้รายชื่อห้องจากการเข้าสู่ระบบ';
                    if (!defaultRooms.length && Array.isArray(PC.loginRooms) && PC.loginRooms.length) seedRooms(PC.loginRooms);
                    if (ok()) return;
                    // 2) สิทธิ์ล่าสุดของตัวเอง
                    H.step = 'ดึงสิทธิ์ล่าสุดจากเซิร์ฟเวอร์'; redraw();
                    const me = await api('me', {}, { retries: 1, noAuthRedirect: true, timeout: 30000 });
                    if (PC.token !== tok) return;
                    if (me && me.id) { PC.freshMe = Object.assign({}, me); mergeMe(me); }
                    if (ok()) return;
                    // 3) โหลดข้อมูลทั้งหมดใหม่ ไม่ใช้สำเนาในเครื่อง
                    H.step = 'โหลดข้อมูลทั้งหมดใหม่'; redraw();
                    await loadAllData(true, { quiet: true });
                } catch (e) {
                    console.warn('[PC] healRooms', e && e.message);
                    if (manual) toast('error', 'โหลดข้อมูลห้องไม่สำเร็จ : ' + ((e && e.message) || ''));
                } finally {
                    H.busy = false;
                    if (PC.token === tok) { redraw(); try { updateNavBack(); } catch (e) { /* ข้าม */ } }
                }
            };
        })();

        /* ============================================================================
         *  [v43] วัดความเร็วการเข้าสู่ระบบตามที่ผู้ใช้เจอจริง + อุ่นเครื่องตั้งแต่เปิดหน้า login
         *  - warm : เปิดหน้าเว็บแล้วเรียกเซิร์ฟเวอร์ทันที ระหว่างที่ผู้ใช้พิมพ์รหัส Apps Script จะตื่นและเตรียมดัชนีรหัสผ่านไว้
         *  - perf : เข้าใช้งานเสร็จแล้วส่งเวลาแต่ละขั้นไปบันทึก (login / ส่วนหลัก / ส่วนที่เหลือ แยก "รอเครือข่าย" กับ "เซิร์ฟเวอร์ทำงาน")
         *  - ผู้ดูแลดูสรุปที่ท้ายหน้า "สถิติการใช้งานระบบ"
         * ==========================================================================*/
        (function v43() {
            PC.netProbe = null;
            setTimeout(() => {
                const a = Date.now();
                PC.api('warm', {}, { retries: 0, timeout: 30000, noAuthRedirect: true })
                    .then(d => { PC.netProbe = { ms: Date.now() - a, srv: d && d.ms }; })
                    .catch(() => { /* เซิร์ฟเวอร์รุ่นเก่าไม่มีคำสั่งนี้ -> ข้าม */ });
            }, 500);

            let warmN = 0;
            const warmTimer = setInterval(() => {   // [v99] ให้ Apps Script ตื่นและแคชอุ่นอยู่ตอนผู้ใช้กดเข้าสู่ระบบ
                if (++warmN > 12) { clearInterval(warmTimer); return; }
                if (PC.token || PC.user || document.visibilityState === 'hidden' || (PC.perf && !PC.perf.usable && PC.perf.t0 && Date.now() - PC.perf.t0 < 120000)) return;   // [v100] PC.user = เข้าแอปแล้ว (รวมเข้าจากเครื่องที่ยังรอยืนยัน) ไม่ต้องปลุกเซิร์ฟเวอร์
                PC.api('warm', {}, { retries: 0, timeout: 20000, noAuthRedirect: true }).catch(() => { /* ข้าม */ });
            }, 45000);
            PC.reportPerf = function () {
                const P = PC.perf;
                if (!P || P.sent || !PC.token || !P.usable) return;
                P.sent = true;
                if (Math.max(P.usable, P.login || 0) < 3000 && P.via !== 'auto' && Math.random() > 0.2) return;   // [v45] ครั้งที่เร็วอยู่แล้ว เก็บตัวอย่างแค่ 20%
                const pt = (PC.loadTiming && PC.loadTiming.parts) || {};
                const c = navigator.connection || {};
                PC.api('perf', {
                    via: P.via, login: P.login || 0, usable: P.usable, total: Date.now() - P.t0,
                    loginSrv: P.loginSrv || 0, loginPre: P.loginPre || 0, tries: P.tries || 1,   // [v99]
                    warm: (PC.netProbe && PC.netProbe.ms) || 0,
                    core: (pt.core && pt.core.total) || 0, coreSrv: (pt.core && pt.core.server) || 0,
                    rest: (pt.rest && pt.rest.total) || 0, restSrv: (pt.rest && pt.rest.server) || 0,
                    net: c.effectiveType || '', rtt: c.rtt || 0, snap: pt.core ? 0 : 1
                }, { retries: 0, timeout: 15000, noAuthRedirect: true }).catch(() => { /* ข้าม */ });
            };

            /* ---------- ผู้ดูแล : สรุปความเร็ว ---------- */
            const Q = { data: null, loading: false, err: '' };
            const sec = (ms) => (ms / 1000).toFixed(ms >= 10000 ? 0 : 1);
            const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
            const p90 = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * 0.9))]; };
            const pad2 = (n) => (n < 10 ? '0' : '') + n;

            function paint() {
                const root = document.getElementById('usage-root');
                if (!root || !tabAllowed('usage')) return;
                let host = document.getElementById('pc-perf-usage');
                if (!host) { host = document.createElement('div'); host.id = 'pc-perf-usage'; root.parentNode.appendChild(host); }
                const list = (Q.data && Q.data.list) || [];
                const rows = list.filter(x => x.d && x.d.usable);
                const usable = rows.map(x => x.d.usable);
                const netCore = rows.filter(x => x.d.core).map(x => Math.max(0, x.d.core - x.d.coreSrv));
                const srvCore = rows.filter(x => x.d.core).map(x => x.d.coreSrv);
                const logins = rows.filter(x => x.d.login).map(x => x.d.login);
                const warm = rows.filter(x => x.d.warm).map(x => x.d.warm);
                const loginSrvs = rows.filter(x => x.d.ls).map(x => x.d.ls);
                const hedged = rows.filter(x => x.d.login && x.d.tr > 1).length, withLogin = rows.filter(x => x.d.login).length;
                const stat = (lb, v, sub, tone) => `<div style="flex:1 1 150px;min-width:140px;border-radius:14px;padding:10px 12px;background:${tone};border:1px solid rgba(15,23,42,.06)"><div style="font-size:11px;color:#475569;font-weight:600">${lb}</div><div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.2">${v}</div><div style="font-size:10.5px;color:#64748b">${sub}</div></div>`;
                const slow = rows.slice().sort((a, b) => b.d.usable - a.d.usable).slice(0, 10);
                const nameOf = (x) => { const p = (PC.users || []).find(u => String(u.id) === String(x.u)) || {}; return p.name || x.n || x.u; };
                const when = (t) => { const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()); };
                let body;
                if (Q.err) body = `<div style="padding:14px;font-size:13px;color:#b45309"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(Q.err)}</div>`;
                else if (!Q.data) body = `<div style="padding:14px">${PC.skel ? PC.skel.lines(3) : '<span style="font-size:13px;color:#64748b">กำลังโหลด...</span>'}</div>`;
                else if (!rows.length) body = `<div style="padding:14px;font-size:13px;color:#64748b">ยังไม่มีข้อมูล — ต้องใช้ Code.gs รุ่นล่าสุด แล้วให้ผู้ใช้เข้าสู่ระบบสักครั้ง ข้อมูลจะเริ่มสะสมที่นี่</div>`;
                else body = `<div style="padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px">
                        ${stat('ใช้งานได้หลังกดเข้าสู่ระบบ (ค่ากลาง)', sec(med(usable)) + ' วิ', `จาก ${rows.length} ครั้งล่าสุด`, '#eff6ff')}
                        ${stat('ช้าสุด 10% (P90)', sec(p90(usable)) + ' วิ', 'ผู้ใช้ที่ช้าที่สุดเจอประมาณนี้', '#fff7ed')}
                        ${stat('ตรวจรหัสผ่าน (ค่ากลาง)', logins.length ? sec(med(logins)) + ' วิ' : '-', 'ขั้นแรกสุดของการเข้าสู่ระบบ', '#f0fdf4')}
                        ${stat('รอเครือข่าย · ส่วนหลัก', netCore.length ? sec(med(netCore)) + ' วิ' : '-', 'เวลาที่ไม่ใช่เซิร์ฟเวอร์ทำงาน (เครือข่าย/คิว)', '#faf5ff')}
                        ${stat('เซิร์ฟเวอร์ทำงาน · ส่วนหลัก', srvCore.length ? sec(med(srvCore)) + ' วิ' : '-', 'เวลาที่ Apps Script อ่านข้อมูลจริง', '#ecfeff')}
                        ${stat('ปลุกเซิร์ฟเวอร์ตอนเปิดหน้า', warm.length ? sec(med(warm)) + ' วิ' : '-', 'ตอบกลับครั้งแรกจากหน้า login', '#f8fafc')}
                        ${stat('Apps Script ทำงาน · login (ค่ากลาง)', loginSrvs.length ? sec(med(loginSrvs)) + ' วิ' : '-', 'เวลาในเซิร์ฟเวอร์ที่เหลือคือชั้นรับส่ง/เครือข่าย', '#ecfeff')}
                        ${stat('login ที่ต้องส่งซ้ำ', withLogin ? Math.round(100 * hedged / withLogin) + '%' : '-', 'ส่งคำขอสำรองเพราะตอบช้าเกิน 4.5 วิ', '#fefce8')}
                    </div>
                    <div style="padding:0 14px 6px;font-size:11.5px;color:#64748b;font-weight:600">ครั้งที่ช้าที่สุด 10 อันดับ</div>
                    <div style="overflow:auto;padding:0 8px 12px"><table style="width:100%;border-collapse:collapse;font-size:12px">
                        <thead><tr style="background:#f1f5f9;color:#334155"><th style="text-align:left;padding:6px 8px">ผู้ใช้</th><th style="text-align:left;padding:6px 8px">เมื่อ</th><th style="padding:6px 8px">ใช้งานได้ (วิ)</th><th style="padding:6px 8px">ตรวจรหัส</th><th style="padding:6px 8px">ส่วนหลัก (เซิร์ฟเวอร์)</th><th style="padding:6px 8px">ส่วนที่เหลือ</th><th style="padding:6px 8px">เครือข่าย</th></tr></thead>
                        <tbody>${slow.map(x => `<tr style="border-top:1px solid #eef2f7"><td style="padding:5px 8px;font-weight:600;color:#0f172a;white-space:nowrap">${esc(nameOf(x))}</td><td style="padding:5px 8px;white-space:nowrap;color:#64748b">${when(x.t)} ${x.d.via === 'auto' ? '· อัตโนมัติ' : ''}${x.d.snap ? '· ใช้สำเนาในเครื่อง' : ''}</td><td style="padding:5px 8px;text-align:center;font-weight:800;color:${x.d.usable > 20000 ? '#dc2626' : x.d.usable > 8000 ? '#d97706' : '#0f172a'}">${sec(x.d.usable)}</td><td style="padding:5px 8px;text-align:center">${x.d.login ? sec(x.d.login) + (x.d.ls ? ' (' + sec(x.d.ls) + ')' : '') + (x.d.tr > 1 ? ' ×' + x.d.tr : '') : '-'}</td><td style="padding:5px 8px;text-align:center">${x.d.core ? sec(x.d.core) + ' (' + sec(x.d.coreSrv) + ')' : '-'}</td><td style="padding:5px 8px;text-align:center">${x.d.rest ? sec(x.d.rest) + ' (' + sec(x.d.restSrv) + ')' : '-'}</td><td style="padding:5px 8px;text-align:center;color:#64748b">${esc(x.d.net || '-')}${x.d.rtt ? ' · ' + x.d.rtt + 'ms' : ''}</td></tr>`).join('')}</tbody></table></div>`;
                host.innerHTML = `<div style="background:#fff;border:1px solid #e6e8ef;border-radius:18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 10px 26px rgba(15,23,42,.05);overflow:hidden;margin-top:16px">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 16px;color:#fff;background:linear-gradient(120deg,#9a3412,#ea580c 55%,#fb923c)">
                        <span style="font-size:14px;font-weight:800"><i class="fa-solid fa-gauge-high"></i> ความเร็วการเข้าสู่ระบบที่ผู้ใช้เจอจริง</span>
                        <span style="font-size:11px;color:rgba(255,255,255,.9)">หน่วย : วินาที · ในวงเล็บ = เวลาที่เซิร์ฟเวอร์ทำงานจริง</span>
                        <button type="button" onclick="PC.perfReload()" style="margin-left:auto;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);color:#fff;cursor:pointer"><i class="fa-solid fa-rotate ${Q.loading ? 'fa-spin' : ''}"></i> รีเฟรช</button>
                    </div>${body}</div>`;
            }

            async function load(force) {
                if (Q.loading || !PC.token || !tabAllowed('usage')) return;
                Q.loading = true; Q.err = ''; paint();
                try { Q.data = await PC.api('perfStats', { nocache: !!force }, { retries: 0, timeout: 60000 }); }
                catch (e) { Q.err = e && e.code === 'NOT_FOUND' ? 'ต้องอัปเดต Code.gs เป็นรุ่นล่าสุดก่อน' : ((e && e.message) || 'โหลดไม่สำเร็จ'); }
                finally { Q.loading = false; paint(); }
            }
            PC.perfReload = () => load(true);
            (function () {
                const orig = window.switchTab;
                if (typeof orig !== 'function') return;
                window.switchTab = function (tabName) {
                    const r = orig.apply(this, arguments);
                    if (tabName === 'usage') setTimeout(() => { paint(); load(false); }, 400);
                    return r;
                };
            })();
        })();

        // ตั้งค่าปุ่ม Gmail / LINE ทันทีจากค่าที่จำไว้ แล้วตรวจกับเซิร์ฟเวอร์เบื้องหลัง (เตรียมบริการ Google ล่วงหน้า)
        function initOauth() {
            applyOauthButtons();
            if (authCfg && authCfg.google) loadGis().catch(() => {});
            // ค่าที่จำไว้ยังใหม่มาก (ไม่เกิน 10 นาที) ไม่ต้องถามเซิร์ฟเวอร์ซ้ำ ; เกินนั้นถามใหม่เบื้องหลังเสมอ (คำขอเล็ก ๆ) เพื่อให้ได้ Client ID ล่าสุดจากเซิร์ฟเวอร์
            if (!authCfg || Date.now() - authCfgAt > 10 * 60000) setTimeout(() => loadAuthConfig().catch(() => {}), 300);
        }

        /** จุดเริ่มต้นเมื่อเปิดหน้าเว็บ : กลับมาจาก LINE -> เข้าสู่ระบบด้วย LINE , ไม่ใช่ -> กู้ session เดิม */
        function bootAuth() {
            initOauth();
            if (handleLineCallback()) return;
            if (PC.handleTelegramReturn && PC.handleTelegramReturn()) return;
            if (PC.handleAcctLogin && PC.handleAcctLogin()) return;   // [ต.ค. 2569] กลับจากบัญชีผู้ใช้กลาง
            /* [รอบ 5 ข้อ 4] ไม่มี session/การจดจำ = อยู่หน้า login -> ผู้ที่ login Gmail ค้างไว้ เห็นปุ่ม "ดำเนินการต่อในชื่อ …" ของ Google */
            let pending = false;
            try { pending = !!(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY)); } catch (e) { /* ข้าม */ }
            const p = restoreSession();
            if (!pending && authCfg && authCfg.google) loadGis().then(() => setTimeout(promptOneTap, 600)).catch(() => {});
            return p;
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAuth);   // [ชุด 3 ข้อ 6] เดิม restoreSession
        else bootAuth();
    })();

	// ================================================================
	// [ข้อ 13] Progress Overlay แบบแสดงเปอร์เซ็นต์ (แทน loading overlay เดิม)
	// ใช้ได้ทั่วระบบ :  showProgress(title, detail) -> updateProgress(%, detail) -> hideProgress()
	// ถ้าไม่ทราบความคืบหน้าจริง ใช้ startFakeProgress() เพื่อไต่ % แบบนุ่มนวลจนถึง 90%
	// ================================================================
	let __pcProgTimer = null;
	let __pcProgValue = 0;

	function ensureProgressEl() {
		let el = document.getElementById('pc-progress-overlay');
		if (el) return el;
		el = document.createElement('div');
		el.id = 'pc-progress-overlay';
		el.className = 'hidden';
		el.innerHTML =
			'<div class="pcp-backdrop"></div>' +
			'<div class="pcp-card">' +
			'  <div id="pcp-percent" class="pcp-percent">0%</div>' +
			'  <div id="pcp-title" class="pcp-title">กำลังดำเนินการ...</div>' +
			'  <div class="pcp-track"><div id="pcp-bar" class="pcp-bar"></div></div>' +
			'  <div id="pcp-detail" class="pcp-detail"></div>' +
			'</div>';
		document.body.appendChild(el);
		return el;
	}

	function showProgress(title, detail) {
		const el = ensureProgressEl();
		__pcProgValue = 0;
		el.classList.remove('hidden');
		document.getElementById('pcp-title').innerText = title || 'กำลังดำเนินการ…';
		document.getElementById('pcp-detail').innerText = detail || '';
		setProgressBar(0);
	}

	function setProgressBar(v) {
		const bar = document.getElementById('pcp-bar');
		const pct = document.getElementById('pcp-percent');
		if (!bar || !pct) return;
		const n = Math.max(0, Math.min(100, Math.round(v)));
		bar.style.width = n + '%';
		pct.innerText = n + '%';
	}

	function updateProgress(percent, detail) {
		if (typeof percent === 'number') { __pcProgValue = percent; setProgressBar(percent); }
		if (detail !== undefined) {
			const d = document.getElementById('pcp-detail');
			if (d) d.innerText = detail;
		}
	}

	/** ไต่ % อัตโนมัติสำหรับงานที่วัดความคืบหน้าจริงไม่ได้ (หยุดที่ 90% รอ hideProgress) */
	function startFakeProgress(stepMs) {
		clearInterval(__pcProgTimer);
		__pcProgTimer = setInterval(() => {
			const remain = 90 - __pcProgValue;
			if (remain <= 0.5) return;
			__pcProgValue += Math.max(0.4, remain * 0.08);
			setProgressBar(__pcProgValue);
		}, stepMs || 220);
	}

	function hideProgress() {
		clearInterval(__pcProgTimer);
		__pcProgTimer = null;
		setProgressBar(100);
		const el = document.getElementById('pc-progress-overlay');
		if (!el) return;
		setTimeout(() => el.classList.add('hidden'), 280);
	}

	window.showProgress = showProgress;
	window.updateProgress = updateProgress;
	function stopFakeProgress() { clearInterval(__pcProgTimer); __pcProgTimer = null; }   // [v99]
	window.startFakeProgress = startFakeProgress;
	window.stopFakeProgress = stopFakeProgress;
	window.hideProgress = hideProgress;

	/* [ข้อ 13] กันลืมปิด overlay : เมื่อมีการเปิดกล่องข้อความผลลัพธ์ (Swal ที่มี icon หรือปุ่มยืนยัน)
	   ให้ปิด progress overlay อัตโนมัติ — ครอบคลุมทุกเส้นทางรวมถึงกรณี error
	   (กล่อง loading ของ Swal เอง คือกล่องที่ไม่มี icon และมี didOpen -> ไม่ถูกปิด) */
	(function wrapSwalForProgress() {
		if (!window.Swal || typeof Swal.fire !== 'function' || Swal.__pcProgressWrapped) return;
		const origFire = Swal.fire.bind(Swal);
		Swal.__pcProgressWrapped = true;
		Swal.fire = function (...args) {
			const o = args[0];
			const isSwalLoadingBox = o && typeof o === 'object' && typeof o.didOpen === 'function' && !o.icon;
			if (!isSwalLoadingBox) {
				try { hideProgress(); } catch (e) { /* ข้าม */ }
			}
			return origFire(...args);
		};
	})();

	// ================================================================
	// [ข้อ 3 + 18 + 20] ระบบนำเข้าผู้ใช้งาน (Excel / Google Sheet) + โหลดวันหยุด
	// ----------------------------------------------------------------
	// สาเหตุ error เดิม "ReferenceError: GAS_URL is not defined" :
	//   GAS_URL ถูกประกาศด้วย const อยู่ "ภายใน" IIFE ( (function(){ ... })() )
	//   แต่โค้ดชุดนี้เขียนไว้ "นอก" IIFE จึงมองไม่เห็นตัวแปรนั้น
	// วิธีแก้ : เรียกผ่าน PC.api(...) ที่เปิดไว้ให้แล้ว (ดู PC.api = api ด้านบน)
	//           ซึ่งแนบ token / retry / จัดการ error ให้ครบเหมือนส่วนอื่นของระบบ
	// ================================================================

	/** helper : เรียก API อย่างปลอดภัย แม้สคริปต์ PC ยังโหลดไม่เสร็จ */
	function pcApi(action, payload, opt) {
		if (!window.PC || typeof PC.api !== 'function') {
			return Promise.reject(new Error('ระบบยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ'));
		}
		return PC.api(action, payload, opt);
	}

	// ==========================================
	// [ข้อ 3] ฟอร์มตัวอย่างสำหรับนำเข้าผู้ใช้งาน
	// ==========================================
	// [ข้อ 3] เพิ่มคอลัมน์ ลิงก์รูปโปรไฟล์ และ สถานะการใช้งาน
	const USER_IMPORT_COLUMNS = [
		'รหัสใช้งาน (ID)', 'ชื่อ', 'นามสกุล', 'ตำแหน่ง',
		'กลุ่มงาน (หลายกลุ่มคั่นด้วย ,)', 'กลุ่มสาระการเรียนรู้',
		'ประเภท (Role)', 'อีเมล', 'เบอร์โทรศัพท์', 'รหัสผ่าน (เว้นว่างระบบจะสุ่มให้)',
		'ลิงก์รูปโปรไฟล์ (URL)', 'สถานะการใช้งาน (เปิด/ปิด)'
	];

	async function downloadUserImportTemplate() {
		await PCLib.load('xlsx');   // [v46]
		const ws_data = [
			USER_IMPORT_COLUMNS,
			['teacher01', 'สมชาย', 'ใจดี', 'ครู', 'กลุ่มงานการจัดการศึกษา, กลุ่มงานบุคลากร', 'วิทยาศาสตร์และเทคโนโลยี', 'Assignee', 'somchai@school.ac.th', '0812345678', '', 'https:/\/drive.google.com/file/d/XXXXXXXXXXXXXXXXXXXXX/view', 'เปิด'],
			['admin02', 'สมหญิง', 'รักเรียน', 'ธุรการ', 'กลุ่มบริหารวิชาการ', '', 'AdminGroup', 'somying@school.ac.th', '0898765432', '', '', 'ปิด']
		];
		const ws = XLSX.utils.aoa_to_sheet(ws_data);
		ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 34 }, { wch: 26 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 28 }, { wch: 40 }, { wch: 20 }];
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'UsersImportTemplate');
		XLSX.writeFile(wb, 'แบบฟอร์มนำเข้าผู้ใช้งาน.xlsx');
	}
	window.downloadUserImportTemplate = downloadUserImportTemplate;

	/** จับคู่หัวตารางในไฟล์ Excel -> ชื่อฟิลด์ (รองรับทั้งไทย/อังกฤษ และสลับลำดับคอลัมน์ได้) */
	const IMPORT_HEADER_ALIAS = {
		id: ['id', 'รหัสใช้งาน', 'รหัสผู้ใช้', 'รหัสผู้ใช้งาน', 'userid', 'username'],
		firstname: ['firstname', 'ชื่อ', 'ชื่อจริง'],
		lastname: ['lastname', 'นามสกุล', 'สกุล'],
		position: ['position', 'ตำแหน่ง'],
		groups: ['group', 'groups', 'กลุ่มงาน', 'กลุ่มบริหาร', 'สังกัด'],
		subjectGroup: ['subjectgroup', 'กลุ่มสาระ', 'กลุ่มสาระการเรียนรู้'],
		role: ['role', 'ประเภท', 'บทบาท', 'สิทธิ์'],
		email: ['email', 'อีเมล', 'e-mail'],
		phone: ['phone', 'tel', 'เบอร์โทร', 'เบอร์โทรศัพท์', 'โทรศัพท์', 'หมายเลขโทรศัพท์'],
		password: ['password', 'รหัสผ่าน'],
		image: ['image', 'imageurl', 'photo', 'avatar', 'ลิงก์รูป', 'ลิงก์รูปโปรไฟล์', 'รูปโปรไฟล์'],   // [ข้อ 3]
		active: ['active', 'status', 'สถานะ', 'สถานะการใช้งาน', 'เปิดใช้งาน']                          // [ข้อ 3]
	};
	/** [ข้อ 3] ตีความสถานะการใช้งานจากข้อความหลายรูปแบบ (ว่าง = เปิดใช้งาน) */
	function parseActiveText(v) {
		const t = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
		if (!t) return true;
		return !(t === 'false' || t === '0' || t === 'no' || t === 'n' ||
			t === 'ปิด' || t === 'ปิดใช้งาน' || t === 'ไม่ใช้งาน' || t === 'ระงับ');
	}

	function normImportHeader(s) {
		return String(s === undefined || s === null ? '' : s)
			.toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s()\[\]{}.:_\-]/g, '').trim();
	}
	function mapImportHeaders(headerRow) {
		const map = {};
		(headerRow || []).forEach((h, i) => {
			const n = normImportHeader(h);
			if (!n) return;
			Object.keys(IMPORT_HEADER_ALIAS).forEach(field => {
				if (map[field] !== undefined) return;
				if (IMPORT_HEADER_ALIAS[field].some(a => { const x = normImportHeader(a); return n === x || n.indexOf(x) === 0; })) map[field] = i;
			});
		});
		return map;
	}

	async function handleUserImport(event) {
		const input = event && event.target ? event.target : null;
		const file = input && input.files ? input.files[0] : null;
		if (!file) return;
		if (!window.PC || !PC.token) {
			Swal.fire('ยังไม่ได้เข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบก่อนนำเข้าข้อมูล', 'warning');
			if (input) input.value = '';
			return;
		}

		let rows = [];
		try {
			const buf = await file.arrayBuffer();
			await PCLib.load('xlsx');   // [v46]
			const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
			const worksheet = workbook.Sheets[workbook.SheetNames[0]];
			const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
			if (!grid.length) throw new Error('ไฟล์ว่าง');

			const map = mapImportHeaders(grid[0]);
			// ถ้าจับคู่หัวตารางไม่ได้เลย ให้ถอยไปใช้ลำดับคอลัมน์ตามฟอร์มมาตรฐาน
			const useFixed = map.id === undefined;
			const FIXED = { id: 0, firstname: 1, lastname: 2, position: 3, groups: 4, subjectGroup: 5, role: 6, email: 7, phone: 8, password: 9, image: 10, active: 11 };
			const idx = useFixed ? FIXED : map;
			const body = grid.slice(1);
			const cell = (r, f) => (idx[f] === undefined ? '' : String(r[idx[f]] === undefined || r[idx[f]] === null ? '' : r[idx[f]]).trim());

			rows = body.map(r => ({
				id: cell(r, 'id'),
				firstname: cell(r, 'firstname'),
				lastname: cell(r, 'lastname'),
				position: cell(r, 'position'),
				groups: cell(r, 'groups'),
				subjectGroup: cell(r, 'subjectGroup'),
				role: cell(r, 'role'),
				email: cell(r, 'email'),
				phone: cell(r, 'phone'),
				password: cell(r, 'password'),
				image: cell(r, 'image'),                          // [ข้อ 3] ลิงก์รูปโปรไฟล์
				active: parseActiveText(cell(r, 'active')),       // [ข้อ 3] สถานะการใช้งาน
				activeRaw: cell(r, 'active')                      // [แก้ข้อมูลหาย] ช่องว่าง = ไม่เปลี่ยนสถานะของผู้ใช้เดิม
			})).filter(u => u.id);
		} catch (err) {
			Swal.fire('ข้อผิดพลาด', 'อ่านไฟล์ไม่สำเร็จ หรือรูปแบบไฟล์ไม่ถูกต้อง (' + err.message + ')', 'error');
			if (input) input.value = '';
			return;
		}

		if (!rows.length) {
			Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลผู้ใช้งานที่ถูกต้องในไฟล์ (ต้องมีคอลัมน์ "รหัสใช้งาน (ID)")', 'warning');
			if (input) input.value = '';
			return;
		}

		const confirm = await Swal.fire({
			title: 'ยืนยันนำเข้า ' + rows.length + ' รายการ?',
			html: '<div class="text-left text-sm space-y-2">'
				+ '<div>ตัวอย่างแถวแรก : <b>' + PC.esc(rows[0].id) + '</b> — ' + PC.esc((rows[0].firstname + ' ' + rows[0].lastname).trim() || '-') + '</div>'
				+ '<label class="flex items-center gap-2 mt-3 cursor-pointer"><input type="checkbox" id="imp-overwrite" class="w-4 h-4"> <span>ทับข้อมูลเดิมถ้ารหัสใช้งานซ้ำ</span></label>'
				+ '<div class="text-[11px] text-slate-500">* ผู้ใช้ใหม่ที่ไม่กรอกรหัสผ่าน ระบบจะสุ่มรหัสให้และแสดงรายการท้ายการนำเข้า</div>'
				+ '</div>',
			icon: 'question', showCancelButton: true,
			confirmButtonText: 'นำเข้าเลย', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2563eb',
			preConfirm: () => ({ overwrite: !!document.getElementById('imp-overwrite')?.checked })
		});
		if (!confirm.isConfirmed) { if (input) input.value = ''; return; }
		const overwrite = confirm.value.overwrite;

		// [ข้อ 21] ส่งเป็นชุด (ชุดละ 150 แถว) แทนการยิงทีละคน -> เร็วขึ้นมากและไม่ชน LockService
		const CHUNK = 150;
		const chunks = [];
		for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));

		let ok = 0, failed = 0, created = [], skipped = [];
		showProgress('กำลังนำเข้าข้อมูลผู้ใช้งาน', 'เตรียมข้อมูล…');
		try {
			for (let c = 0; c < chunks.length; c++) {
				updateProgress(Math.round((c / chunks.length) * 100), 'ชุดที่ ' + (c + 1) + ' / ' + chunks.length + ' (' + chunks[c].length + ' รายการ)');
				const res = await pcApi('importUsers', { users: chunks[c], overwrite: overwrite }, { timeout: 300000, retries: 1 });
				ok += res.ok || 0;
				failed += res.failed || 0;
				created = created.concat(res.created || []);
				skipped = skipped.concat(res.skipped || []);
			}
			updateProgress(100, 'กำลังรีเฟรชรายชื่อ…');
			if (PC.reload) await PC.reload();
			hideProgress();

			const skipHtml = skipped.length
				? '<div class="mt-3 max-h-40 overflow-y-auto text-left text-[11px] border rounded-lg p-2 bg-rose-50">'
				+ skipped.map(s => '<div>แถว ' + s.line + ' : <b>' + PC.esc(s.id || '-') + '</b> — ' + PC.esc(s.reason) + '</div>').join('') + '</div>'
				: '';
			const pwHtml = created.length
				? '<div class="mt-3 max-h-40 overflow-y-auto text-left text-[11px] border rounded-lg p-2 bg-emerald-50">'
				+ '<div class="font-bold mb-1">รหัสผ่านเริ่มต้นที่ระบบสุ่มให้ (กรุณาบันทึกไว้)</div>'
				+ created.map(c => '<div>' + PC.esc(c.id) + ' (' + PC.esc(c.name) + ') : <b class="tracking-widest">' + PC.esc(c.password) + '</b></div>').join('')
				+ '</div><button type="button" class="mt-2 text-[11px] font-bold text-blue-600" onclick="exportImportedPasswords()">ดาวน์โหลดรายการรหัสผ่าน (.xlsx)</button>'
				: '';
			window.__lastImportedPasswords = created;

			Swal.fire({
				icon: failed === 0 ? 'success' : 'info',
				title: 'สรุปผลการนำเข้าผู้ใช้งาน',
				width: 640,
				html: '<div class="text-left text-sm p-3 bg-slate-50 border rounded-lg">'
					+ 'นำเข้าสำเร็จ: <b class="text-emerald-600">' + ok + '</b> รายการ<br>'
					+ 'ข้าม/ผิดพลาด: <b class="text-rose-500">' + failed + '</b> รายการ</div>'
					+ pwHtml + skipHtml
			});
		} catch (err) {
			hideProgress();
			Swal.fire('นำเข้าไม่สำเร็จ', err.message, 'error');
		} finally {
			if (input) input.value = '';
		}
	}
	window.handleUserImport = handleUserImport;

	async function exportImportedPasswords() {
		const list = window.__lastImportedPasswords || [];
		if (!list.length) return;
		await PCLib.load('xlsx');   // [v46]
		const ws = XLSX.utils.aoa_to_sheet([['รหัสใช้งาน', 'ชื่อ-สกุล', 'รหัสผ่านเริ่มต้น']].concat(list.map(c => [c.id, c.name, c.password])));
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Passwords');
		XLSX.writeFile(wb, 'รหัสผ่านเริ่มต้นผู้ใช้งานใหม่.xlsx');
	}
	window.exportImportedPasswords = exportImportedPasswords;

	// ==========================================
	// [ข้อ 18] เชื่อมต่อผู้ใช้งานจาก Google Sheet ภายนอกด้วย Sheet ID
	// ==========================================
	function currentUserSheetConfig() {
		try {
			const s = PC.store && PC.store.settings ? PC.store.settings['g:userSheet'] : null;
			return (s && s.value && typeof s.value === 'object') ? s.value : { sheetId: '', sheetName: '', auto: true, overwrite: true, lastSync: 0, lastResult: '' };
		} catch (e) { return { sheetId: '', sheetName: '', auto: true, overwrite: true, lastSync: 0, lastResult: '' }; }
	}

	async function openUserSheetModal() {
		if (!window.PC || !PC.token || PC.user.role !== 'ADMIN') {
			Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
			return;
		}
		const cfg = currentUserSheetConfig();
		const lastTxt = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString('th-TH') : 'ยังไม่เคยซิงก์';
		const r = await Swal.fire({
			title: '<div class="flex items-center justify-center gap-2"><i class="fa-solid fa-table-list text-emerald-600"></i> เชื่อมต่อผู้ใช้งานจาก Google Sheet</div>',
			width: 640,
			html: '<div class="text-left space-y-3 text-sm">'
				+ '<div><label class="text-xs font-bold text-slate-600">Sheet ID หรือ ลิงก์ Google Sheet</label>'
				+ '<input id="us-sheetid" class="w-full p-2 text-xs border rounded-lg bg-slate-50 mt-1" placeholder="1AbC...xyz" value="' + PC.esc(cfg.sheetId || '') + '"></div>'
				+ '<div><label class="text-xs font-bold text-slate-600">ชื่อชีต (เว้นว่าง = ชีตแรก)</label>'
				+ '<input id="us-sheetname" class="w-full p-2 text-xs border rounded-lg bg-slate-50 mt-1" placeholder="Users" value="' + PC.esc(cfg.sheetName || '') + '"></div>'
				+ '<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="us-auto" class="w-4 h-4" ' + (cfg.auto !== false ? 'checked' : '') + '> <span>ซิงก์อัตโนมัติทุก 1 ชั่วโมง (Auto Sync)</span></label>'
				+ '<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="us-overwrite" class="w-4 h-4" ' + (cfg.overwrite !== false ? 'checked' : '') + '> <span>ทับข้อมูลเดิมเมื่อรหัสใช้งานซ้ำ</span></label>'
				+ '<div class="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-2">'
				+ 'ชีตต้นทางต้องมีหัวตารางแถวแรก และต้องมีคอลัมน์ <b>รหัสใช้งาน (ID)</b><br>'
				+ 'รองรับคอลัมน์: ชื่อ, นามสกุล, ตำแหน่ง, กลุ่มงาน, กลุ่มสาระการเรียนรู้, ประเภท (Role), อีเมล, เบอร์โทรศัพท์, รหัสผ่าน<br>'
				+ 'อย่าลืมแชร์สิทธิ์ให้บัญชี Google ที่ Deploy สคริปต์นี้ (อย่างน้อย Viewer)</div>'
				+ '<div class="text-[11px] text-slate-500">ซิงก์ล่าสุด: <b>' + PC.esc(lastTxt) + '</b> ' + PC.esc(cfg.lastResult || '') + '</div>'
				+ '<div id="us-preview" class="text-[11px]"></div>'
				+ '</div>',
			showDenyButton: true, showCancelButton: true,
			confirmButtonText: '<i class="fa-solid fa-plug"></i> เชื่อมต่อ + ดึงข้อมูล',
			denyButtonText: '<i class="fa-solid fa-magnifying-glass"></i> ทดลองอ่าน',
			cancelButtonText: 'ปิด',
			confirmButtonColor: '#059669', denyButtonColor: '#0284c7',
			customClass: { popup: 'settings-wide-modal' },
			preConfirm: () => ({
				sheetId: document.getElementById('us-sheetid').value.trim(),
				sheetName: document.getElementById('us-sheetname').value.trim(),
				auto: document.getElementById('us-auto').checked,
				overwrite: document.getElementById('us-overwrite').checked
			})
		});

		if (r.isDenied) {
			const sheetId = document.getElementById('us-sheetid')?.value?.trim();
			try {
				showProgress('กำลังอ่านชีตต้นทาง', 'โปรดรอสักครู่…');
				updateProgress(40, 'เปิดไฟล์…');
				const prev = await pcApi('userSheetPreview', { sheetId: sheetId, sheetName: document.getElementById('us-sheetname')?.value?.trim() }, { timeout: 120000 });
				hideProgress();
				await Swal.fire({
					icon: 'success', title: 'อ่านชีตสำเร็จ', width: 640,
					html: '<div class="text-left text-xs space-y-1">'
						+ '<div>ไฟล์: <b>' + PC.esc(prev.fileName) + '</b> / ชีต: <b>' + PC.esc(prev.sheetName) + '</b></div>'
						+ '<div>พบข้อมูล <b>' + prev.total + '</b> แถว</div>'
						+ '<div>คอลัมน์ที่จับคู่ได้: <b>' + PC.esc(prev.matched.join(', ')) + '</b></div>'
						+ '<div class="mt-2 p-2 bg-slate-50 border rounded">' + prev.sample.map(s => PC.esc(s.id + ' — ' + (s.firstname + ' ' + s.lastname).trim())).join('<br>') + '</div>'
						+ '</div>'
				});
			} catch (e) { hideProgress(); Swal.fire('อ่านชีตไม่สำเร็จ', e.message, 'error'); }
			return openUserSheetModal();
		}
		if (!r.isConfirmed) return;

		const v = r.value;
		if (!v.sheetId) { Swal.fire('แจ้งเตือน', 'กรุณาระบุ Sheet ID', 'warning'); return openUserSheetModal(); }
		try {
			showProgress('กำลังเชื่อมต่อและดึงข้อมูลผู้ใช้', 'เปิดชีตต้นทาง…');
			updateProgress(30, 'อ่านข้อมูล…');
			const res = await pcApi('userSheetConnect', v, { timeout: 300000, retries: 0 });
			updateProgress(80, 'กำลังรีเฟรชรายชื่อ…');
			if (PC.reload) await PC.reload();
			hideProgress();
			const s = res.sync || { ok: 0, failed: 0 };
			Swal.fire({
				icon: 'success', title: 'เชื่อมต่อสำเร็จ',
				html: '<div class="text-left text-sm">ไฟล์: <b>' + PC.esc(res.fileName) + '</b><br>'
					+ 'พบ ' + res.total + ' แถว — นำเข้า <b class="text-emerald-600">' + s.ok + '</b> / ข้าม <b class="text-rose-500">' + s.failed + '</b><br>'
					+ (v.auto ? '<span class="text-[11px] text-slate-500">ระบบจะซิงก์ให้อัตโนมัติทุก 1 ชั่วโมง</span>' : '') + '</div>'
			});
		} catch (e) { hideProgress(); Swal.fire('เชื่อมต่อไม่สำเร็จ', e.message, 'error'); }
	}
	window.openUserSheetModal = openUserSheetModal;

	async function syncUserSheetNow() {
		try {
			showProgress('กำลังซิงก์ผู้ใช้งานจาก Google Sheet', 'อ่านข้อมูลต้นทาง…');
			updateProgress(40, 'นำเข้าข้อมูล…');
			const res = await pcApi('userSheetSync', {}, { timeout: 300000, retries: 0 });
			updateProgress(85, 'รีเฟรชรายชื่อ…');
			if (PC.reload) await PC.reload();
			hideProgress();
			Swal.fire({ icon: 'success', title: 'ซิงก์เรียบร้อย', text: 'นำเข้า ' + res.sync.ok + ' / ข้าม ' + res.sync.failed + ' รายการ', timer: 2500, showConfirmButton: false });
		} catch (e) { hideProgress(); Swal.fire('ซิงก์ไม่สำเร็จ', e.message, 'error'); }
	}
	window.syncUserSheetNow = syncUserSheetNow;

	// ==========================================
	// [ข้อ 20] โหลดวันหยุดปฏิทิน (แก้ ReferenceError: GAS_URL is not defined)
	// เดิมฟังก์ชันนี้ fetch(GAS_URL) ตรง ๆ ซึ่ง GAS_URL อยู่ใน IIFE จึงพัง
	// ตอนนี้มอบหมายให้ ensureHolidayYear ของสคริปต์ PC จัดการ (มีแคช + กันยิงซ้ำ)
	// ==========================================
	function loadThaiHolidays(year) {
		const y = Number(year) || new Date().getFullYear();
		try {
			if (typeof window.ensureHolidayYear === 'function') window.ensureHolidayYear(y);
		} catch (err) {
			console.warn('ไม่สามารถโหลดวันหยุดปฏิทินได้:', err && err.message ? err.message : err);
		}
	}
	window.loadThaiHolidays = loadThaiHolidays;

	
	
    