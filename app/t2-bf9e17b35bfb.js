
(function () {
    'use strict';
    /* รายการบนแถบ (ซ้าย 2 + ขวา 2 + ปุ่มกลาง = เมนูทั้งหมด) : ซ่อนเองถ้าผู้ใช้ไม่มีสิทธิ์แท็บนั้น (ปุ่มแท็บบนหน้าเว็บถูกซ่อนไว้) */
    const ITEMS = [
        { tab: 'inbox', icon: 'fa-house', label: 'หน้าแรก' },
        { tab: 'alldocs', icon: 'fa-folder-open', label: 'ทะเบียน', alt: 'mywork' },
        'center',
        { tab: 'activities', icon: 'fa-comment-dots', label: 'กิจกรรม', alt: 'calendar' },
        { profile: true, icon: 'fa-user', label: 'โปรไฟล์' }
    ];
    const BADGE = { inbox: 'inbox-tab-badge', activities: 'activities-tab-badge', calendar: 'calendar-tab-badge', mywork: 'mywork-tab-badge', tasks: 'tasks-tab-badge' };
    const $ = (id) => document.getElementById(id);
    const tabBtn = (t) => $('tab-btn-' + t);
    /* [v96] ธุรการกลาง (Administrative) : ปุ่มกลางเป็น "+" เปิดแผ่นเพิ่มหนังสือใหม่ / เพิ่มกิจกรรม (และมีเมนูทั้งหมดอยู่ด้านล่างในแผ่นเดียวกัน) */
    const isAdm = () => !!(window.PC && PC.user && PC.user.role === 'Administrative');
    const allowed = (t) => { const b = tabBtn(t); return !!b && !b.classList.contains('hidden'); };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let nav = null, sheet = null;
    function build() {
        nav = document.createElement('nav');
        nav.id = 'pc-bn'; nav.setAttribute('aria-label', 'เมนูหลัก');
        document.body.appendChild(nav);
        sheet = document.createElement('div');
        sheet.id = 'pc-bn-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'เมนูทั้งหมด');
        document.body.appendChild(sheet);
        nav.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-bn]'); if (!b) return;
            const k = b.dataset.bn;
            if (k === 'menu') return openSheet();
            if (k === 'profile') { if (typeof window.openMyProfileModal === 'function') window.openMyProfileModal(); return; }
            go(k);
        });
        sheet.addEventListener('click', (ev) => {
            if (ev.target.closest('.bn-bg')) return closeSheet();
            const act = ev.target.closest('[data-bn-act]');
            if (act) { closeSheet(); return doAct(act.dataset.bnAct); }
            const b = ev.target.closest('[data-bn-tab]'); if (!b) return;
            closeSheet(); go(b.dataset.bnTab);
        });
        document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });
    }
    /* เพิ่มหนังสือใหม่ : ไปหน้าธุรการกลางแล้วเปิดตัวเลือกไฟล์ (ใช้ช่องอัปโหลดเดิมของหน้านั้น จึงได้ขั้นตอนเดิมทั้งหมด : ประมวลผลไฟล์ -> เลือกหนังสือ -> กรอกข้อมูล) ; เพิ่มกิจกรรม : เปิดหน้าต่างเพิ่มกิจกรรมเดิม */
    function doAct(a) {
        if (a === 'doc') {
            if (typeof window.switchTab === 'function') window.switchTab('admin');
            const inp = document.querySelector('#tab-admin input[type=file][onchange*="handleFileUpload"]');
            if (inp) inp.click();
        } else if (a === 'event') {
            if (typeof window.openEventModal === 'function') window.openEventModal();
        }
    }
    /* กดปุ่มแท็บจริงบนหน้าเว็บ : ใช้ตัวสลับหน้าเดิมทั้งหมด (รวม skeleton loading และการตรวจสิทธิ์) */
    function go(t) { const b = tabBtn(t); if (b) b.click(); }
    function openSheet() {
        const btns = Array.from(document.querySelectorAll('.tab-btn')).filter((b) => !b.classList.contains('hidden') && /^tab-btn-/.test(b.id));
        const cur = activeTab();
        const acts = isAdm() ? '<div class="bn-t">เพิ่มรายการ</div><div class="bn-a"><button type="button" data-bn-act="doc" class="doc"><i class="fa-solid fa-file-circle-plus"></i><span>เพิ่มหนังสือใหม่<small>PDF / รูปภาพ</small></span></button><button type="button" data-bn-act="event" class="evt"><i class="fa-solid fa-calendar-plus"></i><span>เพิ่มกิจกรรม<small>ลงปฏิทินงาน</small></span></button></div>' : '';
        sheet.innerHTML = '<div class="bn-bg"></div><div class="bn-p"><div class="bn-h"></div>' + acts + '<div class="bn-t">เมนูทั้งหมด</div><div class="bn-g">'
            + btns.map((b) => {
                const t = b.id.replace('tab-btn-', ''), ic = b.querySelector('i'), cls = ic ? ic.className.replace(/\bmr-\d+\b/, '').trim() : 'fa-solid fa-circle';
                const label = Array.from(b.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() || t;
                const bd = $(BADGE[t] || ''), n = bd && !bd.classList.contains('hidden') ? bd.textContent.trim() : '';
                return '<button type="button" data-bn-tab="' + esc(t) + '" class="' + (t === cur ? 'on' : '') + '"><i class="' + esc(cls) + '"></i><span>' + esc(label) + '</span>' + (n && n !== '0' ? '<span class="bn-b on">' + esc(n) + '</span>' : '') + '</button>';
            }).join('') + '</div></div>';
        sheet.classList.add('on');
    }
    function closeSheet() { if (sheet) sheet.classList.remove('on'); }
    const activeTab = () => { const el = document.querySelector('.tab-content:not(.hidden)'); return el ? el.id.replace('tab-', '') : ''; };

    function render() {
        if (!nav) return;
        const cur = activeTab();
        let html = '';
        ITEMS.forEach((it) => {
            if (it === 'center') { html += isAdm() ? '<div class="bn-c"><button type="button" data-bn="menu" aria-label="เพิ่มหนังสือ / เพิ่มกิจกรรม"><i class="fa-solid fa-plus"></i></button><span>เพิ่ม</span></div>' : '<div class="bn-c"><button type="button" data-bn="menu" aria-label="เมนูทั้งหมด"><i class="fa-solid fa-grip"></i></button><span>เมนู</span></div>'; return; }
            if (it.profile) { html += '<button type="button" class="bn-i" data-bn="profile"><i class="fa-solid ' + it.icon + '"></i><span>' + it.label + '</span></button>'; return; }
            const t = allowed(it.tab) ? it.tab : (it.alt && allowed(it.alt) ? it.alt : '');
            if (!t) return;
            const ic = t === it.tab ? it.icon : (t === 'mywork' ? 'fa-clipboard-list' : (t === 'calendar' ? 'fa-calendar-days' : it.icon));
            const label = t === it.tab ? it.label : (t === 'mywork' ? 'งานของฉัน' : (t === 'calendar' ? 'ปฏิทิน' : it.label));
            const bd = $(BADGE[t] || ''), n = bd && !bd.classList.contains('hidden') ? bd.textContent.trim() : '';
            html += '<button type="button" class="bn-i' + (cur === t ? ' on' : '') + '" data-bn="' + t + '"><i class="fa-solid ' + ic + '"></i><span>' + label + '</span>' + '<span class="bn-b' + (n && n !== '0' ? ' on' : '') + '">' + esc(n) + '</span></button>';
        });
        if (nav.dataset.h !== html) { nav.innerHTML = html; nav.dataset.h = html; }
    }
    /* แสดงเมื่อเข้าสู่ระบบแล้วและกำลังอยู่ในหน้าใช้งาน (ไม่แสดงที่หน้าล็อกอิน/หน้าเลือกห้อง) */
    function tick() {
        if (!nav) build();
        const loggedIn = !!(window.PC && PC.token && PC.user);
        const t = document.querySelector('.tab-content:not(.hidden)');
        const inApp = !!(t && t.offsetParent !== null);
        const on = loggedIn && inApp;
        nav.classList.toggle('on', on);
        document.body.classList.toggle('pc-bn-on', on);
        if (on) render(); else closeSheet();
    }
    setInterval(tick, 500);
    tick();
})();
