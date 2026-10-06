
(function () {
    'use strict';
    const PC = window.PC;
    if (!PC) return;
    const SK = PC.skel = PC.skel || {};
    const B = (w, h, c) => '<div class="pc-sk-b ' + (c || '') + '" style="width:' + w + ';height:' + h + '"></div>';
    const SR = (t) => '<span class="pc-sk-sr">' + (t || 'กำลังโหลด…') + '</span>';
    const card = (inner, st) => '<div class="pc-sk-card" style="' + (st || '') + '">' + inner + '</div>';
    const item = () => '<div class="pc-sk-card pc-sk-row">' + B('44px', '44px', 'round') + '<div class="pc-sk-col">' + B('60%', '14px') + B('92%', '11px') + B('38%', '11px') + '</div>' + B('64px', '24px', 'round') + '</div>';
    const items = (n) => Array.from({ length: n }, item).join('');
    const head = () => '<div class="pc-sk-card pc-sk-row">' + B('180px', '22px') + '<div style="flex:1"></div>' + B('200px', '34px') + B('84px', '34px') + '</div>';
    const tile = () => '<div class="pc-sk-card" style="display:flex;flex-direction:column;gap:10px">' + B('55%', '12px') + B('40%', '30px') + B('70%', '10px') + '</div>';
    const trow = (cols) => '<div class="pc-sk-row" style="padding:9px 0;border-bottom:1px solid #f1f5f9">' + Array.from({ length: cols }, (_, i) => '<div style="flex:' + (i === 0 ? 2 : 1) + '">' + B(i === 0 ? '80%' : '60%', '13px') + '</div>').join('') + '</div>';

    /** รายการการ์ด n ใบ (ใช้แทนข้อความ "กำลังโหลด...") */
    SK.cards = (n, caption) => '<div class="pc-sk-grid pc-sk-fade" role="status" aria-busy="true">' + items(n || 4) + SR(caption) + '</div>';
    /** แถวตาราง (ใส่ใน <tbody>) */
    SK.rows = (n, cols) => '<tr class="pc-sk-fade"><td colspan="' + (cols || 4) + '" style="padding:6px 12px"><div role="status" aria-busy="true">' + Array.from({ length: n || 6 }, () => trow(cols || 4)).join('') + SR() + '</div></td></tr>';
    /** แท่งข้อความ n บรรทัด */
    SK.lines = (n) => '<div class="pc-sk-col pc-sk-fade" role="status" aria-busy="true">' + Array.from({ length: n || 3 }, (_, i) => B(i % 2 ? '70%' : '92%', '12px')).join('') + SR() + '</div>';
    const HTML = {
        list: () => '<div class="pc-sk-grid" style="padding:4px">' + head() + items(6) + '</div>',
        queue: () => '<div class="pc-sk-grid" style="padding:4px;grid-template-columns:minmax(0,1fr) minmax(0,2fr)"><div class="pc-sk-grid">' + head() + items(5) + '</div>' + card(B('45%', '20px') + '<div style="height:12px"></div>' + B('100%', '46vh') + '<div style="height:12px"></div><div class="pc-sk-row">' + B('120px', '36px') + B('120px', '36px') + '</div>') + '</div>',
        stats: () => '<div class="pc-sk-grid" style="padding:4px"><div class="pc-sk-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' + tile() + tile() + tile() + tile() + '</div><div class="pc-sk-grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">' + card(B('40%', '16px') + '<div style="height:10px"></div>' + B('100%', '220px')) + card(B('40%', '16px') + '<div style="height:10px"></div>' + B('100%', '220px')) + '</div>' + card(Array.from({ length: 5 }, () => trow(5)).join('')) + '</div>',
        calendar: () => '<div class="pc-sk-grid" style="padding:4px">' + head() + card('<div class="pc-sk-grid" style="grid-template-columns:repeat(7,1fr)">' + Array.from({ length: 35 }, () => B('100%', '64px')).join('') + '</div>') + '</div>',
        settings: () => '<div class="pc-sk-grid" style="padding:4px"><div class="pc-sk-row" style="gap:18px;padding:6px 4px">' + B('120px', '18px') + B('140px', '18px') + B('120px', '18px') + '</div><div class="pc-sk-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">' + card(B('90px', '90px', 'round') + '<div style="height:12px"></div>' + Array.from({ length: 5 }, () => B('100%', '34px') + '<div style="height:8px"></div>').join('')) + card(Array.from({ length: 8 }, () => trow(4)).join('')) + '</div></div>',
        table: () => '<div class="pc-sk-grid" style="padding:4px">' + card('<div class="pc-sk-row">' + B('120px', '34px') + B('120px', '34px') + B('120px', '34px') + B('200px', '34px') + '</div>') + card(Array.from({ length: 9 }, () => trow(6)).join('')) + '</div>',
        panel: () => '<div class="pc-sk-grid" style="padding:4px"><div class="pc-sk-row" style="gap:8px">' + B('130px', '30px', 'round') + B('170px', '30px', 'round') + B('150px', '30px', 'round') + '</div><div class="pc-sk-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">' + card(B('50%', '14px') + '<div style="height:8px"></div>' + B('90%', '10px') + '<div style="height:6px"></div>' + B('70%', '10px')) + card(B('50%', '14px') + '<div style="height:8px"></div>' + B('90%', '10px') + '<div style="height:6px"></div>' + B('70%', '10px')) + card(B('50%', '14px') + '<div style="height:8px"></div>' + B('90%', '10px') + '<div style="height:6px"></div>' + B('70%', '10px')) + '</div>' + card(B('100%', '16px') + '<div style="height:10px"></div>' + B('100%', '10px')) + '</div>'
    };
    /** โครงของหน้า/ส่วนข้อมูลตามชนิด (list / queue / stats / calendar / settings / table / panel) */
    SK.html = (kind) => '<div class="pc-sk-fade" role="status" aria-busy="true">' + (HTML[kind] || HTML.list)() + SR() + '</div>';

    const TAB_KIND = { inbox: 'list', mywork: 'list', alldocs: 'list', tasks: 'list', activities: 'list', stats: 'stats', usage: 'stats', calendar: 'calendar', settings: 'settings', admin: 'queue', director: 'queue', admingroup: 'queue', subdirectorgroup: 'queue', subgroupadmin: 'queue', assistantgroup: 'queue', assignee: 'queue' };
    const SUB_KIND = { 'settings-users': 'settings', 'settings-flow': 'list', 'settings-stats': 'stats', 'settings-notify': 'panel', 'settings-history': 'table' };
    const MIN_TAB_MS = 140, MIN_SUB_MS = 110;
    const off = () => { try { return localStorage.getItem('pc-skel') === '0'; } catch (e) { return false; } };

    function clearOverlays() {
        document.querySelectorAll('.pc-sk-ov').forEach((o) => o.remove());
        document.querySelectorAll('.pc-sk-host').forEach((h) => h.classList.remove('pc-sk-host', 'pc-sk-sub'));
    }
    function mount(host, kind, sub) {
        clearOverlays();
        try { document.documentElement.style.setProperty('--pc-sk-bg', getComputedStyle(document.body).backgroundColor || '#f1f5f9'); } catch (e) { /* ข้าม */ }
        host.classList.add('pc-sk-host');
        if (sub) host.classList.add('pc-sk-sub');
        const ov = document.createElement('div');
        ov.className = 'pc-sk-ov';
        ov.innerHTML = SK.html(kind);
        host.appendChild(ov);
        return ov;
    }
    function unmount(ov) {
        if (!ov) return;
        const host = ov.parentElement;
        ov.remove();
        if (host) host.classList.remove('pc-sk-host', 'pc-sk-sub');
    }
    let seq = 0;
    /** สลับหน้า : แสดงโครงทันที -> (เฟรมถัดไป) สลับจริง -> เอาโครงออกเมื่อวาดเสร็จ */
    function go(host, kind, sub, minMs, hideAll, run) {
        const my = ++seq, t0 = performance.now();
        hideAll();
        host.classList.remove('hidden');
        const ov = mount(host, kind, sub);
        requestAnimationFrame(() => setTimeout(() => {
            if (my !== seq) return;
            try { run(); } catch (e) { console.error('[PC] skeleton switch', e); }
            const wait = Math.max(0, minMs - (performance.now() - t0));
            setTimeout(() => { if (my === seq) unmount(ov); }, wait);
        }, 0));
    }
    SK.switchTab = function (name) {
        const el = document.getElementById('tab-' + name);
        if (!el || typeof window.switchTab !== 'function') return window.switchTab && window.switchTab(name);
        go(el, TAB_KIND[name] || 'list', false, MIN_TAB_MS, () => document.querySelectorAll('.tab-content').forEach((e) => e.classList.add('hidden')), () => window.switchTab(name));
    };
    SK.switchSubTab = function (name) {
        const el = document.getElementById('subtab-' + name);
        if (!el || typeof window.switchSubTab !== 'function') return window.switchSubTab && window.switchSubTab(name);
        go(el, SUB_KIND[name] || 'list', true, MIN_SUB_MS, () => document.querySelectorAll('.subtab-content').forEach((e) => e.classList.add('hidden')), () => window.switchSubTab(name));
    };

    /* ดักการคลิกปุ่มแท็บ/แท็บย่อยของผู้ใช้เท่านั้น (การเรียก switchTab จากโค้ดข้างในยังทำงานทันทีเหมือนเดิม จึงไม่กระทบลำดับการทำงานอื่น) */
    const RE_TAB = /^\s*switchTab\(\s*['"]([\w-]+)['"]\s*\)\s*;?\s*$/, RE_SUB = /^\s*switchSubTab\(\s*['"]([\w-]+)['"]\s*\)\s*;?\s*$/;
    document.addEventListener('click', (ev) => {
        if (off() || ev.button) return;
        const el = ev.target.closest('[onclick]'); if (!el) return;
        const src = el.getAttribute('onclick') || '';
        let m = RE_TAB.exec(src);
        if (m) {
            const t = document.getElementById('tab-' + m[1]);
            if (!t || !t.classList.contains('hidden')) return;   // แท็บที่เปิดอยู่แล้ว : ไม่ต้องทำอะไร
            ev.stopImmediatePropagation(); ev.preventDefault();
            SK.switchTab(m[1]);
            return;
        }
        m = RE_SUB.exec(src);
        if (m) {
            const t = document.getElementById('subtab-' + m[1]);
            if (!t || !t.classList.contains('hidden')) return;
            ev.stopImmediatePropagation(); ev.preventDefault();
            SK.switchSubTab(m[1]);
        }
    }, true);
})();
