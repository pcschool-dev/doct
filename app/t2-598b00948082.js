
(function () {
    'use strict';
    const PC = window.PC;
    if (!PC) return;
    const esc = (s) => (PC.esc ? PC.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const DAYS = [1, 2, 3, 5, 7];

    /* ---------------- ตั้งค่าของผู้ใช้เอง ---------------- */
    /* [v95] เปิดหน้าต่างทันที (ไม่รอเซิร์ฟเวอร์) : แสดงค่าที่จำไว้จากครั้งก่อนหรือโครงรอโหลด แล้วดึงค่าล่าสุดมาแทนที่ (ถ้าผู้ใช้ยังไม่ได้แก้อะไร) ; จัดเป็น 2 คอลัมน์บนจอกว้าง */
    const NFP_KEY = () => 'pc-nfp:' + ((PC.user && PC.user.id) || '');
    let nfpMem = null;
    const nfpCached = () => {
        if (nfpMem && Date.now() - nfpMem.t < 86400000) return nfpMem;
        try { const r = JSON.parse(localStorage.getItem(NFP_KEY()) || 'null'); if (r && r.d && r.d.prefs && Date.now() - r.t < 86400000) { nfpMem = r; return r; } } catch (e) { /* ข้าม */ }
        return null;
    };
    const nfpSave = (d) => { nfpMem = { t: Date.now(), d: d }; try { localStorage.setItem(NFP_KEY(), JSON.stringify(nfpMem)); } catch (e) { /* ข้าม */ } };
    /** โหลดค่าตั้งของผู้ใช้ล่วงหน้า (เรียกตอนเปิดหน้าโปรไฟล์) -> เปิดหน้าตั้งค่าแจ้งเตือนแล้วเห็นทันที */
    PC.prefetchNotifyPrefs = async function () {
        try { const d = await PC.api('getNotifyPrefs', {}); nfpSave(d); return d; } catch (e) { return null; }
    };
    const nfpBuild = (d) => {
        const c = d.caps, p = d.prefs, du = p.due || { now: true, day: true, ahead: [1], over: true };
        const kinds = p.kinds ? p.kinds.split(',') : ['doc', 'due', 'chat'];
        const lineOn = p.line === '1' || (p.line === '' && c.line.byRole);
        const tgHint = !c.tg.linked ? '<span class="nf-warn">ยังไม่ได้ผูกบัญชี Telegram — เข้าสู่ระบบด้วย Telegram ที่หน้าล็อกอินเพื่อผูก</span>'
            : (c.tg.ok ? '<span class="nf-ok">พร้อมส่ง' + (c.tg.username ? ' (@' + esc(c.tg.username) + ')' : '') + '</span>'
                : '<span class="nf-warn">ผูกแล้ว แต่บอทยังส่งหาท่านไม่ได้ — เปิดบอท @' + esc(c.tg.bot) + ' แล้วกด Start</span>');
        const lineHint = !c.line.enabled ? '<span class="nf-warn">ผู้ดูแลระบบปิดการแจ้งเตือนทาง LINE ไว้</span>'
            : (!c.line.linked ? '<span class="nf-warn">ยังไม่ได้ผูกบัญชี LINE — เข้าสู่ระบบด้วย LINE ที่หน้าล็อกอินเพื่อผูก</span>'
                : (c.line.friend ? '<span class="nf-ok">พร้อมส่ง</span>' : '<span class="nf-warn">ผูกแล้ว แต่ยังไม่ได้เพิ่ม LINE Official Account ของโรงเรียนเป็นเพื่อน</span>'));
        const box = (id, on, title, hint, dis) => '<label class="nf-row" style="margin-top:6px"><input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + (dis ? ' disabled' : '') + '><div><div class="nf-t" style="font-weight:600">' + title + '</div>' + (hint ? '<div class="nf-h">' + hint + '</div>' : '') + '</div></label>';
        return '<div class="nfu">'
            + '<div class="nf-card"><label class="nf-row"><input type="checkbox" id="nf-tg" ' + (p.tg !== '0' ? 'checked' : '') + '><div><div class="nf-t"><i class="fa-brands fa-telegram" style="color:#229ed9"></i> Telegram <span style="font-weight:400;color:#64748b">(ช่องทางหลัก)</span></div><div class="nf-h">ได้รับทั้งเรื่องด่วนทันทีและข้อความสรุป ' + tgHint + '</div></div></label></div>'
            + '<div class="nf-card"><label class="nf-row"><input type="checkbox" id="nf-line" ' + (lineOn ? 'checked' : '') + '><div><div class="nf-t"><i class="fa-brands fa-line" style="color:#06c755"></i> LINE <span style="font-weight:400;color:#64748b">(เฉพาะเรื่องสำคัญ)</span></div><div class="nf-h">LINE มีโควตาจำกัดต่อเดือน จึงใช้เฉพาะหนังสือเร่งด่วนบางระดับ ถ้าโควตาหมดระบบจะส่งทาง Telegram แทน ' + (c.line.byRole ? '(บทบาทของท่านเปิดไว้ให้โดยอัตโนมัติ) ' : '') + lineHint + '</div></div></label></div>'
            + '<div class="nf-card"><label class="nf-row"><input type="checkbox" id="nf-email" ' + (p.email === '1' ? 'checked' : '') + (c.email ? '' : ' disabled') + '><div><div class="nf-t"><i class="fa-solid fa-envelope" style="color:#ea4335"></i> อีเมล <span style="font-weight:400;color:#64748b">(ช่องทางสำรอง)</span></div><div class="nf-h">' + (c.email ? 'ส่งไปที่ ' + esc(c.email) + ' เมื่อไม่มีช่องทางอื่น' : '<span class="nf-warn">ยังไม่มีอีเมลในข้อมูลผู้ใช้</span>') + '</div></div></label></div>'
            + '<div class="nf-card"><label class="nf-row"><input type="checkbox" id="nf-digest" ' + (p.digest !== '0' ? 'checked' : '') + '><div><div class="nf-t"><i class="fa-solid fa-list-check"></i> ข้อความสรุปหนังสือค้างรอท่าน</div><div class="nf-h">' + (d.cfg.pendingSummary === false ? 'ผู้ดูแลปิดข้อความสรุปตามรอบไว้ในขณะนี้ · ' : '') + 'สรุปหนังสือที่ค้างรอท่านดำเนินการทั้งหมด พร้อมการ์ดรายละเอียดทีละเรื่อง (สูงสุด 5 เรื่องแรก เรียงด่วนก่อน) ทาง Telegram ตามรอบ ' + esc((d.cfg.digest || []).join(', ')) + ' น. (' + esc(((d.cfg.digestDays || [1, 2, 3, 4, 5]).map((n) => ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][n])).join(' ')) + ') ส่วนหนังสือด่วนส่งทันที</div></div></label></div>'
            + '<div class="nf-card"><div class="nf-t"><i class="fa-solid fa-calendar-check" style="color:#7c3aed"></i> การแจ้งกำหนดส่งงาน</div>'
            + '<div class="nf-h">แจ้งหนังสือที่มีกำหนดส่งและงานในหน้ากำหนดงาน ตรวจทุกเช้าวันทำการเวลา ' + esc(d.cfg.dueHour || '08:00') + ' น. · ไม่ใช้โควตา LINE</div>'
            + box('nf-dnow', du.now, 'ทันทีที่ได้รับมอบหมาย', 'แจ้งทันที ไม่รอข้อความสรุป')
            + box('nf-dday', du.day, 'ในวันที่ครบกำหนด', 'แจ้งเช้าวันครบกำหนด (ครบวันเสาร์–อาทิตย์ จะแจ้งวันศุกร์)')
            + '<div class="nf-sub"><div class="nf-t" style="font-weight:600">ล่วงหน้า</div><div class="nf-chips">' + DAYS.map((n) => '<label class="nf-chk"><input type="checkbox" data-ahead="' + n + '" ' + ((du.ahead || []).indexOf(n) !== -1 ? 'checked' : '') + '> ' + n + ' วัน</label>').join('') + '</div></div>'
            + box('nf-dover', du.over, 'เมื่อเลยกำหนดแล้ว', 'แจ้งเตือน 1 ครั้ง ถ้ายังไม่ดำเนินการเสร็จ') + '</div>'
            + '<div class="nf-card"><div class="nf-t"><i class="fa-solid fa-filter"></i> ประเภทที่ต้องการรับ</div><div class="nf-chips">'
            + '<label class="nf-chk"><input type="checkbox" id="nf-k-doc" ' + (kinds.indexOf('doc') !== -1 ? 'checked' : '') + '> หนังสือ</label>'
            + '<label class="nf-chk"><input type="checkbox" id="nf-k-due" ' + (kinds.indexOf('due') !== -1 ? 'checked' : '') + '> กำหนดส่งงาน</label>'
            + '<label class="nf-chk"><input type="checkbox" id="nf-k-chat" ' + (kinds.indexOf('chat') !== -1 ? 'checked' : '') + '> ข้อความแชต</label></div>'
            + '<div class="nf-h" style="margin-top:10px"><i class="fa-solid fa-circle-info"></i> พิมพ์ "งาน" ถึง LINE OA (ได้การ์ดสรุป) หรือส่ง /wk (หรือ /งาน) ให้บอท Telegram เพื่อดูรายการงานค้างได้ทุกเมื่อ (ไม่เสียโควตา) · หนังสือชั้นความลับจะไม่แสดงชื่อเรื่องในข้อความ</div></div>'
            + '</div>';
    };
    PC.openNotifyPrefs = async function () {
        let dirty = false, ready = false;
        const cached = nfpCached();
        const host = () => document.getElementById('nfu-host');
        const confirmBtn = () => Swal.getConfirmButton();
        const skel = PC.skel ? PC.skel.cards(4, 'กำลังโหลด…') : '<div class="nf-h">กำลังโหลด...</div>';
        const paint = (d) => { const h = host(); if (!h) return; h.innerHTML = nfpBuild(d); ready = true; const b = confirmBtn(); if (b) b.disabled = false; };
        const load = () => PC.prefetchNotifyPrefs().then((d) => {
            if (!host()) return d;
            if (!d) { if (!ready) { host().innerHTML = '<div class="nf-h" style="color:#b91c1c;padding:8px">โหลดการตั้งค่าไม่สำเร็จ <button type="button" id="nfu-retry" class="nf-tab" style="margin-left:6px">ลองใหม่</button></div>'; const rb = document.getElementById('nfu-retry'); if (rb) rb.addEventListener('click', () => { host().innerHTML = skel; load(); }); } return d; }
            if (!ready || !dirty) paint(d);   // ค่าล่าสุดจากเซิร์ฟเวอร์ : แทนที่เมื่อผู้ใช้ยังไม่ได้แก้อะไร
            return d;
        });
        const r = await Swal.fire({
            title: '<i class="fa-solid fa-bell"></i> ตั้งค่าการแจ้งเตือน', html: '<div id="nfu-host" style="text-align:left">' + (cached ? nfpBuild(cached.d) : skel) + '</div>',
            width: Math.min(900, Math.max(300, window.innerWidth - 16)), showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ปิด',
            confirmButtonColor: '#059669', customClass: { popup: 'pc-head-modal nfu-modal' },
            didOpen: () => {
                if (cached) ready = true; else { const b = confirmBtn(); if (b) b.disabled = true; }
                const h = host(); if (h) h.addEventListener('change', () => { dirty = true; });
                load();
            },
            preConfirm: async () => {
                if (!ready) return false;
                try {
                    const v = (id) => { const el = document.getElementById(id); return el && el.checked ? '1' : '0'; };
                    const ahead = Array.from(document.querySelectorAll('input[data-ahead]')).filter((i) => i.checked).map((i) => Number(i.dataset.ahead));
                    const ks = ['doc', 'due', 'chat'].filter((k) => document.getElementById('nf-k-' + k).checked);
                    if (!ks.length) { Swal.showValidationMessage('ต้องเลือกประเภทที่ต้องการรับอย่างน้อย 1 อย่าง (ถ้าไม่ต้องการแจ้งเตือนเลย ให้ปิดช่องทางด้านบน)'); return false; }
                    const saved = await PC.api('saveNotifyPrefs', { tg: v('nf-tg'), line: v('nf-line'), email: v('nf-email'), digest: v('nf-digest'),
                        dueNow: v('nf-dnow'), dueDay: v('nf-dday'), dueOver: v('nf-dover'), dueAhead: ahead, kinds: ks });
                    if (nfpMem && saved) { nfpMem.d.prefs = saved; nfpSave(nfpMem.d); }   // ค่าที่จำไว้ตรงกับที่เพิ่งบันทึก
                    return saved;
                } catch (e) { Swal.showValidationMessage(e.message); return false; }
            }
        });
        if (r && r.isConfirmed && PC.toast) PC.toast('success', 'บันทึกการตั้งค่าการแจ้งเตือนแล้ว');
    };

    /* ---------------- รายงาน + ผู้รับตามขั้นตอน (ผู้ดูแลระบบ) ---------------- */
    /* [v81] รายงานและตั้งค่าแจ้งเตือนของผู้ดูแลย้ายไปเป็นหน้า "ตั้งค่าระบบ > ตั้งค่าแจ้งเตือน" (PC.openNotifyAdmin ถูกนิยามใหม่ในสคริปต์ท้ายไฟล์) */
})();
