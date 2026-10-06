
(function () {
    'use strict';
    const PC = window.PC;
    if (!PC) return;
    const esc = (s) => (PC.esc ? PC.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const DAYN = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const LV = { 1: 'ปกติ', 2: 'ด่วน', 3: 'ด่วนมาก', 4: 'ด่วนที่สุด' };
    const PRIO_OPT = [[1, 'ปกติ (ส่งทันทีทุกเรื่อง)'], [2, 'ด่วน ขึ้นไป'], [3, 'ด่วนมาก ขึ้นไป'], [4, 'ด่วนที่สุด เท่านั้น']];
    const ROLE_TH = { ADMIN: 'ผู้ดูแลระบบ', Director: 'ผอ.', ActingDirector: 'รักษาการ ผอ.', SubdirectorGroup: 'รอง ผอ.', AssistantGroup: 'ผช. ผอ./หัวหน้างาน', Administrative: 'ธุรการกลาง', AdminGroup: 'ธุรการกลุ่ม', Assignee: 'ผู้รับผิดชอบ' };
    const TG_MODE_TH = { webhook: 'Webhook ตรงเข้า Apps Script', poll: 'ดึงคำสั่งเองทุกนาที (polling)', relay: 'ผ่าน Cloudflare relay' };
    const SECS = [['a', 'ภาพรวมและสถานะ', 'fa-gauge-high'], ['c', 'ช่องทางและกติกาการส่ง', 'fa-sliders'], ['d', 'รอบสรุปหนังสือค้าง', 'fa-clock'], ['r', 'ผู้รับตามขั้นตอน', 'fa-people-arrows'], ['u', 'ผู้ใช้รายคน', 'fa-users'], ['t', 'เครื่องมือ', 'fa-screwdriver-wrench']];
    let D = null, sec = 'a';
    let S = { cfg: null, rules: null, users: null, usersOrig: null, find: '' };
    const root = () => document.getElementById('nfp-root');
    const toast = (icon, msg) => { if (PC.toast) PC.toast(icon, msg); };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const same = (a, b) => JSON.stringify(Array.isArray(a) ? a.slice().sort() : a) === JSON.stringify(Array.isArray(b) ? b.slice().sort() : b);
    const pill = (s) => s === 'ok' ? '<span class="nf-pill ok">พร้อม</span>' : (s === 'linked' ? '<span class="nf-pill mid">ผูกแล้ว/ยังส่งไม่ได้</span>' : '<span class="nf-pill no">ไม่มี</span>');
    const status = (ok, yes, no) => ok ? '<span class="nf-pill ok">' + yes + '</span>' : '<span class="nf-pill mid">' + no + '</span>';

    async function load() {
        D = await PC.api('notifyReport', {});
        const c = D.config || { times: ['08:30', '12:00', '15:30'], days: [1, 2, 3, 4, 5], pendingSummary: true };
        S.cfg = { on: c.pendingSummary !== false, times: (c.times || []).slice().sort(), days: (c.days || []).slice().sort() };
        S.cfgOrig = JSON.stringify(S.cfg);
        S.rules = {};
        (D.stages || []).forEach((s) => { const r0 = (D.rules && D.rules[s.id]) || {}; S.rules[s.id] = { stage: s.id, enabled: r0.enabled === '0' ? '0' : '1', due: r0.due === '0' ? '0' : '1', extra: (r0.extra || []).slice() }; });
        S.rulesOrig = JSON.stringify(S.rules);
        S.users = {}; S.usersOrig = {};
        (D.users || []).forEach((u) => {
            const cur = { tg: u.prefs.tg !== '0' ? '1' : '0', line: (u.prefs.line === '1' || (u.prefs.line === '' && u.lineAuto)) ? '1' : '0', email: u.prefs.email === '1' ? '1' : '0', digest: u.prefs.digest !== '0' ? '1' : '0' };
            S.users[u.id] = Object.assign({}, cur); S.usersOrig[u.id] = Object.assign({}, cur);
        });
    }

    function render() {
        const el = root(); if (!el) return;
        el.innerHTML = '<div class="nf-tabs" style="margin-bottom:14px">' + SECS.map((s) => '<button type="button" class="nf-tab' + (s[0] === sec ? ' on' : '') + '" data-sec="' + s[0] + '"><i class="fa-solid ' + s[2] + '"></i> ' + s[1] + '</button>').join('')
            + '<button type="button" class="nf-tab" data-act="reload" style="margin-left:auto" title="โหลดข้อมูลใหม่"><i class="fa-solid fa-rotate"></i> โหลดใหม่</button></div>'
            + '<div id="nfp-panel">' + ({ a: pOverview, c: pOptions, d: pDigest, r: pRules, u: pUsers, t: pTools }[sec])() + '</div>';
        if (sec === 'r') (D.stages || []).forEach((s) => renderChips(s.id));
        if (sec === 'u') syncAll();
    }

    /* ---------------- ภาพรวม + สถานะช่องทาง ---------------- */
    function pOverview() {
        const q = D.quota, m = D.month, qu = D.queue, ch = D.channels || { tg: {}, line: {}, email: {} };
        const pct = q.type === 'limited' && q.limit ? Math.min(100, Math.round(q.used * 100 / q.limit)) : 0;
        const quota = q.type === 'limited'
            ? '<div class="nf-t">โควตาข้อความ LINE ประจำเดือน <span style="font-weight:400;color:#64748b">(ใช้แล้ว ' + q.used + ' / ' + q.limit + ' · เหลือ ' + q.left + ')</span></div><div class="nf-bar" style="margin-top:6px"><i style="width:' + pct + '%"></i></div><div class="nf-h">ระบบกันไว้ ' + q.reserve + ' ข้อความ · ที่มา: ' + (q.src === 'api' ? 'LINE API' : 'ตัวนับในระบบ') + ' · เมื่อหมดจะสลับไปใช้ Telegram อัตโนมัติ</div>'
            : (q.type === 'none' ? '<div class="nf-t">แพ็กเกจ LINE ไม่จำกัดจำนวนข้อความ (ใช้แล้ว ' + q.used + ')</div>'
                : '<div class="nf-t nf-warn">ยังไม่ได้ตั้งค่า LINE OA (Channel access token) หรือถามโควตาไม่ได้</div><div class="nf-h">ใช้ตัวนับในระบบ : เหลือ ' + q.left + ' จาก ' + q.limit + '</div>');
        const days = (D.days || []).slice(0, 7).map((x) => '<tr><td>' + esc(x.day) + '</td><td>' + (Number(x.tg) || 0) + '</td><td>' + (Number(x.line) || 0) + '</td><td>' + (Number(x.email) || 0) + '</td><td>' + (Number(x.failed) || 0) + '</td><td>' + (Number(x.skipped) || 0) + '</td></tr>').join('');
        const card = (icon, color, title, body) => '<div class="nf-card" style="margin:0"><div class="nf-t"><i class="' + icon + '" style="color:' + color + '"></i> ' + title + '</div><div class="nf-h" style="margin-top:6px;line-height:1.7">' + body + '</div></div>';
        const tg = ch.tg || {}, ln = ch.line || {}, em = ch.email || {};
        const opt = D.options.values;
        return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:12px">'
            + card('fa-brands fa-telegram', '#229ed9', 'Telegram', status(tg.configured, 'เชื่อมบอทแล้ว', 'ยังไม่ได้ตั้ง token') + ' ' + (opt.TG_ENABLED === false ? '<span class="nf-pill no">ปิดส่งอัตโนมัติ</span>' : '') + '<br>บอท : ' + esc(tg.bot ? '@' + String(tg.bot).replace(/^@/, '') : '-') + '<br>รับคำสั่ง : ' + esc(TG_MODE_TH[tg.mode] || tg.mode || '-') + '<br>ผูกบัญชี ' + (tg.linked || 0) + ' คน · กด /start แล้ว ' + (tg.started || 0) + ' คน')
            + card('fa-brands fa-line', '#06c755', 'LINE', status(ln.configured, 'เชื่อม OA แล้ว', 'ยังไม่ได้ตั้ง token') + ' ' + (opt.LINE_ENABLED === false ? '<span class="nf-pill no">ปิดส่งอัตโนมัติ</span>' : '') + '<br>ผูกบัญชี ' + (ln.linked || 0) + ' คน · เป็นเพื่อนกับ OA ' + (ln.friends || 0) + ' คน<br>ใช้ LINE เมื่อหนังสือเร่งด่วนระดับ : ' + esc((opt.LINE_PRIORITIES || []).map((n) => LV[n]).join(', ') || 'ไม่เลือก (ไม่ใช้ LINE)'))
            + card('fa-solid fa-envelope', '#f59e0b', 'อีเมล', status(opt.EMAIL_ENABLED !== false, 'เปิดใช้', 'ปิดส่งอัตโนมัติ') + '<br>โควตาส่งอีเมลวันนี้เหลือ : ' + (em.remaining === null || em.remaining === undefined ? '-' : em.remaining) + ' ฉบับ<br>ส่งเฉพาะผู้ใช้ที่เลือกรับอีเมลไว้')
            + '</div>'
            + '<div class="nf-card">' + quota + '</div>'
            + '<div class="nf-grid"><div class="nf-stat"><b>' + m.tg + '</b><span>Telegram (เดือนนี้)</span></div><div class="nf-stat"><b>' + m.line + '</b><span>LINE (เดือนนี้)</span></div><div class="nf-stat"><b>' + m.email + '</b><span>อีเมล (เดือนนี้)</span></div><div class="nf-stat"><b>' + (qu.new + qu.digest + qu.sending) + '</b><span>รอส่งในคิว (ล้มเหลว ' + m.failed + ')</span></div></div>'
            + '<div class="nf-h" style="margin-bottom:4px"><b>7 วันล่าสุด</b> (ข้อความที่ส่ง)</div><div class="nf-scroll" style="max-height:30vh"><table class="nf-tbl"><thead><tr><th>วัน</th><th>Telegram</th><th>LINE</th><th>อีเมล</th><th>ล้มเหลว</th><th>ข้าม</th></tr></thead><tbody>' + (days || '<tr><td colspan="6" style="color:#94a3b8">ยังไม่มีการส่ง</td></tr>') + '</tbody></table></div>'
            + '<div class="nf-card" style="margin-top:10px"><div class="nf-t"><i class="fa-solid fa-key"></i> Token ของบอท</div><div class="nf-h">Token ของ Telegram / LINE เป็นความลับ จึงไม่เก็บหรือแก้ผ่านหน้าเว็บ : ตั้งในหน้า Apps Script ด้วยฟังก์ชัน <code>setupTelegram</code> (Telegram) และ <code>setLineBotToken</code> / <code>setLineSecret</code> (LINE) ส่วนวิธีรับคำสั่งของ Telegram ใช้ <code>useTelegramPolling</code> หรือ <code>setupTelegramRelay</code> ; ตรวจสถานะด้วย <code>checkTelegramWebhook</code></div></div>';
    }

    /* ---------------- ช่องทางและกติกาการส่ง ---------------- */
    function pOptions() {
        const V = D.options.values, F = D.options.defaults;
        const dh = (k) => '<div class="nf-h">ค่าเริ่มต้น : ' + esc(Array.isArray(F[k]) ? F[k].map((r) => ROLE_TH[r] || LV[r] || r).join(', ') || '(ไม่มี)' : (F[k] === true ? 'เปิด' : (F[k] === false ? 'ปิด' : F[k]))) + '</div>';
        const sw = (k, title, hint) => '<label class="nf-row" style="margin-top:8px"><input type="checkbox" data-opt="' + k + '" data-t="bool"' + (V[k] ? ' checked' : '') + '><div><div class="nf-t">' + title + '</div>' + (hint ? '<div class="nf-h">' + hint + '</div>' : '') + '</div></label>';
        const num = (k, title, hint, min, max, unit) => '<div style="margin-top:10px"><div class="nf-t">' + title + '</div><div style="display:flex;gap:6px;align-items:center;margin-top:3px"><input type="number" class="nf-in" style="max-width:100px" data-opt="' + k + '" data-t="int" min="' + min + '" max="' + max + '" value="' + esc(V[k]) + '"><span class="nf-h" style="margin:0">' + (unit || '') + '</span></div>' + (hint ? '<div class="nf-h">' + hint + '</div>' : '') + dh(k) + '</div>';
        const sel = (k, title, hint, opts) => '<div style="margin-top:10px"><div class="nf-t">' + title + '</div><select class="nf-in" data-opt="' + k + '" data-t="str" style="margin-top:3px">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(V[k]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' + (hint ? '<div class="nf-h">' + hint + '</div>' : '') + dh(k) + '</div>';
        const nSel = (k, title, hint) => '<div style="margin-top:10px"><div class="nf-t">' + title + '</div><select class="nf-in" data-opt="' + k + '" data-t="int" style="margin-top:3px">' + PRIO_OPT.map((o) => '<option value="' + o[0] + '"' + (Number(V[k]) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' + (hint ? '<div class="nf-h">' + hint + '</div>' : '') + dh(k) + '</div>';
        const ddLabel = (arr) => (arr || []).map((n) => LV[n]).join(', ') || 'ไม่เลือก (ไม่ใช้ LINE)';
        const ddMulti = (k, title, hint, opts) => '<div style="margin-top:10px"><div class="nf-t">' + title + '</div><div class="nf-dd" data-opt="' + k + '" data-t="multi"><button type="button" class="nf-dd-btn" data-dd-toggle><span data-dd-label>' + esc(ddLabel(V[k])) + '</span><i class="fa-solid fa-chevron-down" style="font-size:10px"></i></button>'
            + '<div class="nf-dd-panel" hidden>' + opts.map((o) => '<label class="nf-dd-opt"><input type="checkbox" data-ddv="' + o[0] + '"' + ((V[k] || []).indexOf(o[0]) !== -1 ? ' checked' : '') + '> ' + esc(o[1]) + '</label>').join('') + '</div></div>' + (hint ? '<div class="nf-h">' + hint + '</div>' : '') + dh(k) + '</div>';
        const roles = (D.options.roles || []).map((r) => '<label class="nf-chk"><input type="checkbox" data-role="' + r + '"' + ((V.LINE_ROLES || []).indexOf(r) !== -1 ? ' checked' : '') + '> ' + esc(ROLE_TH[r] || r) + '</label>').join('');
        const grid = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;align-items:start';
        return '<div style="' + grid + '">'
            + '<div class="nf-card" style="margin:0"><div class="nf-t"><i class="fa-brands fa-telegram" style="color:#229ed9"></i> Telegram (ช่องทางหลัก)</div>'
            + sw('TG_ENABLED', 'ส่งแจ้งเตือนอัตโนมัติทาง Telegram', 'ปิด = ไม่ส่งแจ้งเตือนทาง Telegram เลย (ผู้ใช้ยังพิมพ์ /งาน เพื่อดูงานของตนได้)')
            + sw('TG_PHOTO', 'แนบรูปหนังสือที่ประทับตราแล้วเป็นรูปในข้อความ', 'ใช้ได้เมื่อรูปเปิดผ่านลิงก์ได้ (โหมดแชร์ไฟล์ = ทุกคนที่มีลิงก์) ; หนังสือชั้นความลับไม่แนบรูป')
            + sw('TG_PHOTO_FIRST_PAGE', 'หนังสือหลายหน้า แสดงเฉพาะหน้า 1 ในรูป', 'ภาพทุกหน้าเปิดจากลิงก์ในข้อความ')
            + sw('TG_CAPTION_ABOVE', 'ให้ข้อความอยู่เหนือรูป (รูปอยู่ใต้ข้อความ)', '')
            + sw('PENDING_CARDS', 'สรุปหนังสือค้างตามรอบ : ส่งเป็นสรุป + การ์ดรายละเอียดทีละเรื่อง', 'ปิด = ส่งสรุปเป็นข้อความเดียว')
            + num('TG_LIST_MAX', 'จำนวนการ์ดรายละเอียดสูงสุดต่อครั้ง (/งาน และสรุปหนังสือค้าง)', 'เกินจากนี้ให้ดูในระบบ', 1, 10, 'เรื่อง')
            + '</div>'
            + '<div class="nf-card" style="margin:0"><div class="nf-t"><i class="fa-brands fa-line" style="color:#06c755"></i> LINE (เฉพาะเรื่องสำคัญ)</div>'
            + sw('LINE_ENABLED', 'ส่งแจ้งเตือนอัตโนมัติทาง LINE', 'ปิด = ไม่ใช้โควตา LINE ส่งแจ้งเตือน (ยังตอบคำว่า "งาน" ได้ ซึ่งไม่นับโควตา)')
            + sw('LINE_SEND_IMAGES', 'ส่งรูปหนังสือไปพร้อมการ์ด LINE', 'ปิด (ค่าเริ่มต้น) = การ์ดใช้ภาพปกโรงเรียน และไม่ส่งรูปหนังสือเลย · เปิด = ส่งรูปหนังสือที่ประทับตราแล้วตามตัวเลือกด้านล่าง (หนังสือชั้นความลับไม่ส่งรูปเสมอ)')
            + '<div style="margin-left:26px">'
            + sw('LINE_FLEX_DOC_IMAGE', 'ใช้รูปหนังสือเป็นภาพบนสุดของการ์ด', 'หนังสือหลายหน้าใช้หน้า 1 ; ไม่มีรูป ใช้ภาพปกโรงเรียน · ไม่นับโควตาเพิ่ม (รูปอยู่ในข้อความเดียวกับการ์ด) · มีผลเมื่อเปิดข้อความด้านบน')
            + sw('LINE_WORK_IMAGES', 'ตอบคำว่า "งาน" : ส่งรูปหนังสือ (ทุกหน้า) ต่อท้ายการ์ด', 'ส่งเป็นข้อความรูปภาพสูงสุด 4 เรื่องแรก · ตอบกลับ (reply) ไม่นับโควตา · แจ้งเตือนอัตโนมัติไม่ส่งรูปแยกเพื่อไม่ให้กินโควตา · มีผลเมื่อเปิดข้อความด้านบน')
            + '</div>'
            + '<div style="margin-top:10px"><div class="nf-t">LIFF ID ของปุ่ม "📤 แชร์เข้ากลุ่ม" ในการ์ด</div><input class="nf-in" data-opt="LINE_LIFF_ID" data-t="str" placeholder="เช่น 1234567890-AbCdEfGh" value="' + esc(V.LINE_LIFF_ID || '') + '" autocomplete="off" spellcheck="false"><div class="nf-h">ว่าง = ไม่แสดงปุ่มแชร์ · ผู้ใช้แตะปุ่มแล้วเลือกกลุ่ม/เพื่อน LINE เพื่อส่งการ์ดแบบเดียวกับต้นฉบับ (รวมรูปและลิงก์ไฟล์ ซึ่งใครมีลิงก์ก็เปิดได้) · หนังสือชั้นความลับไม่มีปุ่ม · วิธีสร้าง LIFF ดูคู่มือท้ายหน้านี้</div></div>'
            + '<div class="nf-card" style="margin:8px 0 0"><div class="nf-t">วิธีสร้าง LIFF (ทำครั้งเดียว)</div><div class="nf-h" style="line-height:1.7">1) LINE Developers → Channel <b>LINE Login</b> ที่ใช้ล็อกอินระบบ → แท็บ <b>LIFF</b> → Add<br>2) Endpoint URL = <code>https:/\/pc-book-register-f71e8.web.app/share.html</code> · Size = Tall/Full · Scope = <b>profile</b> · เปิด <b>Share target picker = ON</b><br>3) คัดลอก LIFF ID มาวางช่องด้านบน แล้วกดบันทึก<br>4) อัปโหลดไฟล์ <code>share.html</code> ไปที่เดียวกับ <code>v31.html</code> บน Firebase Hosting<br>5) Channel ต้องอยู่สถานะ <b>Published</b> ไม่เช่นนั้นผู้ใช้ทั่วไปเปิดไม่ได้</div></div>'
            + ddMulti('LINE_PRIORITIES', 'ใช้ LINE ส่งเมื่อหนังสือเร่งด่วนระดับ (เลือกได้มากกว่า 1)', 'ระดับที่ไม่ได้เลือกส่งทาง Telegram/อีเมลแทน เพื่อประหยัดโควตา (แพ็กเกจฟรี 300 ข้อความ/เดือน) · ไม่เลือกเลย = ไม่ใช้ LINE ส่งแจ้งเตือน', [[1, 'ปกติ'], [2, 'ด่วน'], [3, 'ด่วนมาก'], [4, 'ด่วนที่สุด']])
            + '<div style="margin-top:10px"><div class="nf-t">กลุ่มผู้ใช้ที่ใช้ LINE โดยอัตโนมัติ</div><div class="nf-chips">' + roles + '</div><div class="nf-h">ผู้ใช้อื่นเลือกเปิด LINE เองได้ในหน้าตั้งค่าของเขา</div>' + dh('LINE_ROLES') + '</div>'
            + num('LINE_RESERVE', 'กันโควตา LINE ไว้ไม่ใช้', 'เผื่อส่งเองจากหน้า OA Manager', 0, 500, 'ข้อความ')
            + num('LINE_FALLBACK_LIMIT', 'โควตา LINE ต่อเดือน (ใช้เมื่อถามจาก LINE ไม่ได้)', '', 0, 1000000, 'ข้อความ')
            + '</div>'
            + '<div class="nf-card" style="margin:0"><div class="nf-t"><i class="fa-solid fa-envelope" style="color:#f59e0b"></i> อีเมล</div>'
            + sw('EMAIL_ENABLED', 'ส่งแจ้งเตือนทางอีเมล', 'ส่งเฉพาะผู้ใช้ที่เลือกรับอีเมลไว้ ; ปิด = ไม่ส่งอีเมลแจ้งเตือนเลย (OTP ลืมรหัสผ่านไม่เกี่ยว ยังส่งตามปกติ)')
            + '</div>'
            + '<div class="nf-card" style="margin:0"><div class="nf-t"><i class="fa-solid fa-gauge-high"></i> กติกาการส่ง</div>'
            + nSel('IMMEDIATE_MIN_PRIORITY', 'ส่งทันทีเมื่อหนังสือเร่งด่วนระดับ', 'ต่ำกว่านี้รอรวมในข้อความสรุปตามรอบ')
            + sel('FILE_LINKS', 'ลิงก์ไฟล์ในข้อความ (ภาพหนังสือ ไฟล์ฉบับเต็ม ไฟล์แนบ)', '“ทุกคนที่มีลิงก์” จำเป็นสำหรับแสดงรูปใน Telegram ; “เฉพาะโดเมน” ใช้ได้เมื่อเจ้าของระบบเป็นบัญชีโดเมนโรงเรียน ; “ปิด” = ไม่ใส่ลิงก์และไม่แตะการแชร์ไฟล์ ; หนังสือชั้นความลับไม่มีลิงก์เสมอ', [['anyone', 'ทุกคนที่มีลิงก์'], ['domain', 'เฉพาะโดเมนของโรงเรียน'], ['off', 'ปิด (ไม่ใส่ลิงก์ไฟล์)']])
            + '<div style="margin-top:10px"><div class="nf-t">เวลาแจ้งกำหนดส่งงานประจำวัน</div><input type="time" class="nf-in" style="max-width:130px;margin-top:3px" data-opt="DUE_HOUR" data-t="str" value="' + esc(V.DUE_HOUR) + '"><div class="nf-h">ตรวจและแจ้งทุกเช้าวันทำการ (เวลาไทย) · ผู้ใช้เลือกประเภทที่จะรับเองได้</div>' + dh('DUE_HOUR') + '</div>'
            + num('CHAT_DELAY_MIN', 'ข้อความแชต : รอก่อนแจ้งเตือน', 'ถ้าผู้รับเข้าระบบมาอ่านในช่วงนี้ จะไม่แจ้ง', 1, 120, 'นาที')
            + num('CHAT_THROTTLE_MIN', 'ข้อความแชต : แจ้งผู้ส่งคนเดิมถึงผู้รับคนเดิมไม่เกิน 1 ครั้งต่อ', '', 1, 240, 'นาที')
            + '</div></div>'
            + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="nf-tab on" data-act="save-opts"><i class="fa-solid fa-floppy-disk"></i> บันทึกการตั้งค่า</button><button type="button" class="nf-tab" data-act="reset-opts"><i class="fa-solid fa-rotate-left"></i> คืนค่าเริ่มต้นทั้งหมด</button><span class="nf-h" id="nfp-msg-c" style="align-self:center"></span></div>'
            + '<div class="nf-h" style="margin-top:6px">การตั้งค่านี้มีผลกับการแจ้งเตือนถัดไปทันที (ไม่ต้อง Deploy ใหม่) · ค่าที่ตั้งตรงกับค่าเริ่มต้นจะไม่ถูกบันทึกเป็นการตั้งเอง</div>';
    }

    /* ---------------- รอบสรุปหนังสือค้าง ---------------- */
    function pDigest() {
        const c = S.cfg;
        return '<div style="max-width:640px">'
            + '<div class="nf-card"><label class="nf-row"><input type="checkbox" id="nfp-d-on"' + (c.on ? ' checked' : '') + '><div><div class="nf-t"><i class="fa-solid fa-envelope-open-text"></i> ส่งข้อความสรุปหนังสือค้างตามรอบ</div><div class="nf-h">ทุกรอบ ผู้ที่มีหนังสือค้างรอดำเนินการและมี Telegram (หรืออีเมลที่เลือกไว้) จะได้รับสรุปหนังสือค้างทั้งหมดของตนเอง ผู้ใช้ปิดรับของตนเองได้ในหน้าตั้งค่าของเขา · ปิดข้อนี้ = กลับไปใช้ข้อความสรุปเฉพาะหนังสือใหม่แบบเดิม</div></div></label></div>'
            + '<div class="nf-card"><div class="nf-t">เวลาที่ส่ง (เวลาไทย) สูงสุด 6 รอบ</div><div class="nf-chips">' + (c.times.map((t) => '<span class="nf-chip">' + esc(t) + ' น. <button type="button" data-rt="' + esc(t) + '" title="เอาออก">×</button></span>').join('') || '<span class="nf-h">ยังไม่มีเวลา</span>') + '</div>'
            + '<div style="margin-top:8px;display:flex;gap:8px;align-items:center"><input type="time" id="nfp-d-add" class="nf-in" style="max-width:130px"><button type="button" class="nf-tab" data-act="add-time">+ เพิ่มเวลา</button></div><div class="nf-h" id="nfp-d-err" style="color:#b91c1c"></div></div>'
            + '<div class="nf-card"><div class="nf-t">วันที่ส่ง</div><div class="nf-chips">' + DAYN.map((n, i) => '<label class="nf-chk"><input type="checkbox" data-day="' + i + '"' + (c.days.indexOf(i) !== -1 ? ' checked' : '') + '> ' + n + '</label>').join('') + '</div></div>'
            + '<div style="display:flex;gap:8px;align-items:center"><button type="button" class="nf-tab on" data-act="save-digest"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button><span class="nf-h" id="nfp-msg-d"></span></div></div>';
    }

    /* ---------------- ผู้รับตามขั้นตอน ---------------- */
    function pRules() {
        const nameOf = {}; (D.users || []).forEach((u) => { nameOf[u.id] = u.name || u.id; });
        const cards = (D.stages || []).map((s) => '<div class="nf-card" data-stage="' + s.id + '"><div class="nf-rule-head"><div><div class="nf-t">' + esc(s.label) + '</div><div class="nf-h">ผู้รับตามกติกา : ' + esc(s.base) + '</div></div>'
            + '<div style="display:flex;gap:10px;flex-wrap:wrap"><label class="nf-chk"><input type="checkbox" data-r="enabled"' + (S.rules[s.id].enabled !== '0' ? ' checked' : '') + '> แจ้งเมื่อถึงขั้นตอนนี้</label><label class="nf-chk"><input type="checkbox" data-r="due"' + (S.rules[s.id].due !== '0' ? ' checked' : '') + '> รวมในแจ้งกำหนดส่ง</label></div></div>'
            + '<div class="nf-sub"><div class="nf-h"><b>ผู้รับเพิ่มเติม</b> (ได้รับแจ้งเรื่องในขั้นตอนนี้ด้วย เช่น ผอ. หรือธุรการที่ต้องการสำเนา)</div><div class="nf-chips" data-chips></div>'
            + '<input class="nf-in" data-add list="nfp-ul" placeholder="พิมพ์ชื่อหรือรหัสผู้ใช้ แล้วเลือกจากรายการ" style="margin-top:6px"></div></div>').join('');
        return '<div class="nf-h" style="margin-bottom:8px">กำหนดว่าใครได้รับแจ้งเมื่อหนังสือถึงแต่ละขั้นตอน ผู้รับตามกติกา (บทบาท/กลุ่มงาน) ได้รับแจ้งแบบ 1:1 อยู่แล้ว ที่นี่เปิด/ปิดขั้นตอน และเพิ่มผู้รับเสริมได้ · ปิดการแจ้งไม่กระทบรายการ "งานของฉัน"</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:10px">' + cards + '</div>'
            + '<datalist id="nfp-ul">' + (D.users || []).map((u) => '<option value="' + esc((u.name || u.id) + ' (' + u.id + ')') + '"></option>').join('') + '</datalist>'
            + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button type="button" class="nf-tab on" data-act="save-rules"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button><span class="nf-h" id="nfp-msg-r"></span></div>';
    }
    function renderChips(stage) {
        const card = root().querySelector('.nf-card[data-stage="' + stage + '"]'); if (!card) return;
        const nameOf = {}; (D.users || []).forEach((u) => { nameOf[u.id] = u.name || u.id; });
        card.querySelector('[data-chips]').innerHTML = S.rules[stage].extra.length ? S.rules[stage].extra.map((id) => '<span class="nf-chip">' + esc(nameOf[id] || id) + ' <button type="button" data-rm="' + esc(id) + '" title="เอาออก">×</button></span>').join('') : '<span class="nf-h">ยังไม่มีผู้รับเพิ่มเติม</span>';
    }

    /* ---------------- ผู้ใช้รายคน ---------------- */
    /** ผู้ใช้ที่แสดงอยู่ตามช่องค้นหา (ปุ่ม "เลือกทุกคน" ใช้กับกลุ่มนี้ ; ไม่ค้นหา = ทุกคน) */
    function visibleUsers() {
        const k = S.find.trim().toLowerCase();
        return (D.users || []).filter((u) => !k || (u.name + ' ' + u.id).toLowerCase().indexOf(k) !== -1);
    }
    /** อัปเดตช่อง "เลือกทุกคน" ที่หัวคอลัมน์ : ติ๊กครบ = ติ๊ก , ติ๊กบางคน = สถานะกึ่งกลาง */
    function syncAll() {
        const vu = visibleUsers();
        root().querySelectorAll('input[data-all]').forEach((h) => {
            const n = vu.filter((u) => S.users[u.id][h.dataset.all] === '1').length;
            h.checked = vu.length > 0 && n === vu.length;
            h.indeterminate = n > 0 && n < vu.length;
            h.disabled = !vu.length;
        });
    }
    function pUsers() {
        const k = S.find.trim().toLowerCase();
        const th = (key, label, tip) => '<th><label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer" title="' + tip + '"><input type="checkbox" data-all="' + key + '" style="width:15px;height:15px;accent-color:#059669"> ' + label + '</label></th>';
        const rows = (D.users || []).filter((u) => !k || (u.name + ' ' + u.id).toLowerCase().indexOf(k) !== -1).map((u) => {
            const c = S.users[u.id];
            const cb = (key) => '<td><input type="checkbox" data-uid="' + esc(u.id) + '" data-k="' + key + '"' + (c[key] === '1' ? ' checked' : '') + '></td>';
            return '<tr><td>' + esc(u.name) + '</td><td>' + esc(ROLE_TH[u.role] || u.role) + '</td><td>' + pill(u.tg) + '</td><td>' + pill(u.line) + '</td>' + cb('tg') + cb('line') + cb('email') + cb('digest') + '</tr>';
        }).join('');
        return '<div class="nf-h" style="margin-bottom:6px"><b>การตั้งค่ารายคน</b> (ติ๊กแล้วกดบันทึก) <input id="nfp-find" placeholder="ค้นหาชื่อ/รหัส" value="' + esc(S.find) + '" style="margin-left:8px;border:1px solid #e2e8f0;border-radius:8px;padding:3px 8px;font-size:11px"></div>'
            + '<div class="nf-scroll" style="max-height:60vh"><table class="nf-tbl"><thead><tr><th>ชื่อ</th><th>บทบาท</th><th>Telegram</th><th>LINE</th>' + th('tg', 'รับ TG', 'ติ๊กเพื่อเลือกทุกคนที่แสดงอยู่') + th('line', 'รับ LINE', 'ติ๊กเพื่อเลือกทุกคนที่แสดงอยู่') + th('email', 'รับอีเมล', 'ติ๊กเพื่อเลือกทุกคนที่แสดงอยู่') + th('digest', 'รับสรุป', 'ติ๊กเพื่อเลือกทุกคนที่แสดงอยู่') + '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" style="color:#94a3b8">ไม่พบผู้ใช้</td></tr>') + '</tbody></table></div>'
            + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button type="button" class="nf-tab on" data-act="save-users"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button><span class="nf-h" id="nfp-msg-u"></span></div>';
    }

    /* ---------------- เครื่องมือ ---------------- */
    function pTools() {
        return '<div class="nf-card" style="max-width:640px"><div class="nf-t"><i class="fa-solid fa-stamp"></i> ภาพหนังสือที่มีตราประทับ (ใช้ในข้อความ Telegram/LINE)</div><div class="nf-h">หนังสือที่ส่งต่อตั้งแต่เวอร์ชันนี้จะมีภาพที่มีตราให้อัตโนมัติ ส่วนหนังสือที่ส่งต่อไปก่อนหน้านั้น ระบบสร้างให้เบื้องหลังเองเมื่อผู้ดูแลเปิดระบบค้างไว้ (ครั้งละไม่เกิน 4 ฉบับ) หรือกดปุ่มนี้เพื่อสร้างทั้งหมดทันที (ใช้เวลาประมาณ 1–3 วินาทีต่อฉบับ ห้ามปิดหน้าต่างระหว่างทำ)</div><button type="button" class="nf-tab on" data-act="backfill" style="margin-top:6px">สร้างภาพที่มีตราให้หนังสือเดิม</button><div class="nf-h" id="nfp-msg-t"></div></div>';
    }

    /* ---------------- การทำงาน ---------------- */
    const busy = (btn, on) => { if (btn) btn.disabled = on; };
    const say = (id, text, bad) => { const e = document.getElementById(id); if (e) { e.textContent = text; e.style.color = bad ? '#b91c1c' : '#047857'; } };

    async function reloadKeepSec() { try { await load(); render(); } catch (e) { /* ข้าม */ } }

    function readOpts() {
        const out = {};
        root().querySelectorAll('[data-opt]').forEach((el) => {
            const k = el.dataset.opt, t = el.dataset.t;
            out[k] = t === 'bool' ? el.checked : (t === 'int' ? (el.value === '' ? '' : Number(el.value)) : (t === 'multi' ? Array.from(el.querySelectorAll('[data-ddv]:checked')).map((x) => Number(x.dataset.ddv)) : el.value));
        });
        out.LINE_ROLES = Array.from(root().querySelectorAll('[data-role]:checked')).map((e) => e.dataset.role);
        return out;
    }
    async function saveOpts(reset, btn) {
        const F = D.options.defaults, cur = D.options.values;
        const vals = readOpts(), payload = {};
        Object.keys(vals).forEach((k) => {
            if (reset) { if (D.options.overridden.indexOf(k) !== -1) payload[k] = ''; return; }
            if (same(vals[k], F[k])) { if (D.options.overridden.indexOf(k) !== -1) payload[k] = ''; }   // ตรงค่าเริ่มต้น = คืนค่าเริ่มต้น
            else if (!same(vals[k], cur[k]) || D.options.overridden.indexOf(k) === -1) payload[k] = vals[k];
        });
        if (!Object.keys(payload).length) { say('nfp-msg-c', 'ไม่มีการเปลี่ยนแปลง'); return; }
        busy(btn, true); say('nfp-msg-c', 'กำลังบันทึก…');
        try {
            await PC.api('saveNotifyOptions', { opts: payload });
            await load(); render(); say('nfp-msg-c', reset ? 'คืนค่าเริ่มต้นแล้ว ✓' : 'บันทึกแล้ว ✓'); toast('success', reset ? 'คืนค่าเริ่มต้นแล้ว' : 'บันทึกการตั้งค่าแจ้งเตือนแล้ว');
        } catch (e) { say('nfp-msg-c', 'บันทึกไม่สำเร็จ : ' + e.message, true); busy(btn, false); }
    }
    async function saveDigest(btn) {
        const c = S.cfg;
        if (!c.times.length) return say('nfp-msg-d', 'ต้องมีเวลาส่งอย่างน้อย 1 รอบ', true);
        if (!c.days.length) return say('nfp-msg-d', 'เลือกวันที่ส่งอย่างน้อย 1 วัน', true);
        busy(btn, true); say('nfp-msg-d', 'กำลังบันทึก…');
        try { await PC.api('saveNotifyConfig', { times: c.times, days: c.days, pendingSummary: c.on ? '1' : '0' }); S.cfgOrig = JSON.stringify(c); say('nfp-msg-d', 'บันทึกแล้ว ✓'); toast('success', 'บันทึกรอบสรุปหนังสือค้างแล้ว'); }
        catch (e) { say('nfp-msg-d', 'บันทึกไม่สำเร็จ : ' + e.message, true); }
        busy(btn, false);
    }
    async function saveRules(btn) {
        busy(btn, true); say('nfp-msg-r', 'กำลังบันทึก…');
        try { await PC.api('saveNotifyRules', { rules: Object.keys(S.rules).map((k) => S.rules[k]) }); S.rulesOrig = JSON.stringify(S.rules); say('nfp-msg-r', 'บันทึกแล้ว ✓'); toast('success', 'บันทึกผู้รับตามขั้นตอนแล้ว'); }
        catch (e) { say('nfp-msg-r', 'บันทึกไม่สำเร็จ : ' + e.message, true); }
        busy(btn, false);
    }
    async function saveUsers(btn) {
        busy(btn, true); say('nfp-msg-u', 'กำลังบันทึก…');
        let n = 0;
        try {
            // [v84] ส่งเป็นชุด (ครั้งละไม่เกิน 100 คน) แทนทีละคน : เลือกทุกคนแล้วบันทึกไม่ต้องรอหลายสิบคำขอ
            const changed = Object.keys(S.users).filter((id) => { const c = S.users[id], o = S.usersOrig[id]; return c.tg !== o.tg || c.line !== o.line || c.email !== o.email || c.digest !== o.digest; });
            for (let i = 0; i < changed.length; i += 100) {
                const part = changed.slice(i, i + 100);
                await PC.api('saveNotifyPrefsBulk', { users: part.map((id) => Object.assign({ userId: id }, S.users[id])) });
                part.forEach((id) => { S.usersOrig[id] = Object.assign({}, S.users[id]); });
                n += part.length;
            }
            say('nfp-msg-u', n ? 'บันทึกแล้ว ' + n + ' คน ✓' : 'ไม่มีการเปลี่ยนแปลง'); if (n) toast('success', 'บันทึกการตั้งค่าผู้ใช้ ' + n + ' คนแล้ว');
        } catch (e) { say('nfp-msg-u', 'บันทึกไม่สำเร็จ (' + n + ' คนแรกบันทึกแล้ว) : ' + e.message, true); }
        busy(btn, false);
    }
    async function backfill(btn) {
        if (!PC.backfillStampedImages) return say('nfp-msg-t', 'ฟังก์ชันนี้ยังไม่พร้อมใช้งาน', true);
        busy(btn, true);
        try {
            const rs = await PC.backfillStampedImages((i, n, fail) => say('nfp-msg-t', 'กำลังสร้างภาพ ' + i + '/' + n + (fail ? ' (ไม่สำเร็จ ' + fail + ')' : '') + ' ...'), { retry: true });
            const why = Object.keys(rs.reasons || {}).map((k) => k + ' (' + rs.reasons[k] + ' ฉบับ)').join(' ; ');
            say('nfp-msg-t', rs.total ? ('เสร็จแล้ว : สร้างภาพที่มีตรา ' + rs.ok + ' ฉบับ' + (rs.fail ? ' · ไม่สำเร็จ ' + rs.fail + ' ฉบับ — ' + why : '') + (rs.ok ? ' (ระบบกำลังบันทึกขึ้น Google Drive เบื้องหลัง)' : '')) : 'ไม่มีหนังสือที่ต้องสร้างภาพเพิ่ม', !!rs.fail);
        } catch (e) { say('nfp-msg-t', 'ไม่สำเร็จ : ' + e.message, true); }
        busy(btn, false);
    }

    function wire() {
        const el = root(); if (!el || el.dataset.wired) return;
        el.dataset.wired = '1';
        el.addEventListener('click', (ev) => {
            const dd = ev.target.closest('[data-dd-toggle]');
            if (dd) { const p = dd.parentElement.querySelector('.nf-dd-panel'); const open = p.hasAttribute('hidden'); document.querySelectorAll('#nfp-root .nf-dd-panel').forEach((x) => x.setAttribute('hidden', '')); if (open) p.removeAttribute('hidden'); return; }
            const t = ev.target.closest('[data-sec],[data-act],[data-rt],[data-rm]'); if (!t) return;
            if (t.dataset.sec) { sec = t.dataset.sec; render(); return; }
            if (t.dataset.rt) { S.cfg.times = S.cfg.times.filter((x) => x !== t.dataset.rt); render(); return; }
            if (t.dataset.rm) { const card = t.closest('.nf-card[data-stage]'), st = Number(card.dataset.stage); S.rules[st].extra = S.rules[st].extra.filter((x) => x !== t.dataset.rm); renderChips(st); return; }
            const a = t.dataset.act;
            if (a === 'reload') { el.innerHTML = PC.skel ? PC.skel.html('panel') : '<div class="nf-h">กำลังโหลด...</div>'; reloadKeepSec(); }
            else if (a === 'save-opts') saveOpts(false, t);
            else if (a === 'reset-opts') { if (window.confirm('คืนค่าเริ่มต้นทุกรายการในหน้านี้ ?')) saveOpts(true, t); }
            else if (a === 'save-digest') saveDigest(t);
            else if (a === 'save-rules') saveRules(t);
            else if (a === 'save-users') saveUsers(t);
            else if (a === 'backfill') backfill(t);
            else if (a === 'add-time') {
                const inp = document.getElementById('nfp-d-add'), err = document.getElementById('nfp-d-err'), v = (inp.value || '').trim();
                err.textContent = '';
                if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { err.textContent = 'กรุณาเลือกเวลาให้ถูกต้อง'; return; }
                if (S.cfg.times.indexOf(v) !== -1) { err.textContent = 'มีเวลานี้แล้ว'; return; }
                if (S.cfg.times.length >= 6) { err.textContent = 'ตั้งได้สูงสุด 6 รอบ'; return; }
                S.cfg.times.push(v); S.cfg.times.sort(); render();
            }
        });
        el.addEventListener('change', (ev) => {
            const t = ev.target;
            if (t.dataset.ddv !== undefined) { const box = t.closest('.nf-dd'); box.querySelector('[data-dd-label]').textContent = (Array.from(box.querySelectorAll('[data-ddv]:checked')).map((x) => LV[Number(x.dataset.ddv)]).join(', ')) || 'ไม่เลือก (ไม่ใช้ LINE)'; return; }
            if (t.id === 'nfp-d-on') S.cfg.on = t.checked;
            else if (t.dataset.day !== undefined) { const i = Number(t.dataset.day); S.cfg.days = S.cfg.days.filter((x) => x !== i); if (t.checked) S.cfg.days.push(i); S.cfg.days.sort(); }
            else if (t.dataset.all) {   // [v84] เลือก/ยกเลิกทุกคนที่แสดงอยู่ในคอลัมน์นี้
                const key = t.dataset.all, v = t.checked ? '1' : '0';
                visibleUsers().forEach((u) => { S.users[u.id][key] = v; });
                root().querySelectorAll('input[data-uid][data-k="' + key + '"]').forEach((c) => { c.checked = t.checked; });
                syncAll();
            }
            else if (t.dataset.uid) { S.users[t.dataset.uid][t.dataset.k] = t.checked ? '1' : '0'; syncAll(); }
            else if (t.dataset.r) { const st = Number(t.closest('.nf-card[data-stage]').dataset.stage); S.rules[st][t.dataset.r] = t.checked ? '1' : '0'; }
            else if (t.dataset.add !== undefined) {
                const card = t.closest('.nf-card[data-stage]'), st = Number(card.dataset.stage), mm = /\(([^()]+)\)\s*$/.exec(t.value), id = mm ? mm[1] : t.value.trim();
                if ((D.users || []).some((u) => u.id === id) && S.rules[st].extra.indexOf(id) === -1) { S.rules[st].extra.push(id); renderChips(st); }
                t.value = '';
            }
        });
        el.addEventListener('input', (ev) => {
            if (ev.target.id === 'nfp-find') { S.find = ev.target.value; const pos = ev.target.selectionStart; document.getElementById('nfp-panel').innerHTML = pUsers(); syncAll(); const f = document.getElementById('nfp-find'); f.focus(); try { f.setSelectionRange(pos, pos); } catch (e) { /* ข้าม */ } }
        });
    }

    document.addEventListener('click', (ev) => { if (!ev.target.closest('.nf-dd')) document.querySelectorAll('.nf-dd-panel').forEach((x) => x.setAttribute('hidden', '')); });
    /** เปิดหน้า (เรียกจาก switchSubTab('settings-notify')) */
    PC.renderNotifySettings = async function () {
        const el = root(); if (!el) return;
        if (PC.user && PC.user.role !== 'ADMIN') { el.innerHTML = '<div class="nf-h">เฉพาะผู้ดูแลระบบ</div>'; return; }
        wire();
        el.innerHTML = PC.skel ? PC.skel.html('panel') : '<div class="nf-h">กำลังโหลด...</div>';
        try { await load(); render(); }
        catch (e) { el.innerHTML = '<div class="nf-h" style="color:#b91c1c">โหลดข้อมูลไม่สำเร็จ : ' + esc(e.message) + ' <button type="button" class="nf-tab" data-act="reload">ลองใหม่</button></div>'; }
    };
    /** ปุ่ม "รายงานแจ้งเตือน (ผู้ดูแล)" ในหน้าโปรไฟล์ : ไปที่หน้าตั้งค่าแจ้งเตือน */
    PC.openNotifyAdmin = function () {
        try { Swal.close(); } catch (e) { /* ข้าม */ }
        if (typeof window.switchTab === 'function') window.switchTab('settings');
        if (typeof window.switchSubTab === 'function') window.switchSubTab('settings-notify');
    };
})();
