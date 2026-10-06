
(function () {
    'use strict';
    /* ================= ส่วนแยกข้อความ (ไม่แตะหน้าเว็บ ทดสอบแยกได้) ================= */
    const MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const MON_RE = MONTH_FULL.concat(MONTH_ABBR.map(function (a) { return a.replace(/\./g, '').split('').join('\\.?') + '\\.?'; })).join('|');
    const EXPL = new RegExp('^(\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?\\s*(' + MON_RE + ')\\s*(\\d{2,4})?\\s*[:\\-]?\\s*(.*)$');
    const SEG = /(^|[\s/])(\d{1,2})(?:\s*-\s*(\d{1,2}))?(?=\s+[฀-๿a-zA-Z(])/g;
    const thDigits = function (s) { return String(s || '').replace(/[๐-๙]/g, function (c) { return String(c.charCodeAt(0) - 0x0E50); }); };
    const clean = function (s) {
        return thDigits(s).replace(/[|[\]{}_~`“”"]/g, ' ').replace(/[–—−]/g, '-').replace(/([฀-๿])\s*=\s*(?=[฀-๿])/g, '$1-').replace(/\s+/g, ' ').trim();
    };
    const thaiCount = function (s) { return (String(s).match(/[ก-ฮ]/g) || []).length; };
    const lev = function (a, b) {
        const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
        let prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            const cur = [i];
            for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[n];
    };
    /** ชื่อเดือนล้วน ๆ (ทนต่อตัวอักษรที่ OCR อ่านเพี้ยน) -> 1-12 , ไม่ใช่ -> 0 */
    function monthOfLabel(line) {
        const t = String(line).replace(/[^฀-๿]/g, '');
        if (t.length < 4 || t.length > 12) return 0;
        let best = 0, bd = 99;
        MONTH_FULL.forEach(function (m, i) { const d = lev(t, m); if (d < bd) { bd = d; best = i + 1; } });
        return bd <= Math.max(2, Math.floor(t.length * 0.34)) ? best : 0;
    }
    function monthFromToken(tok) {
        const t = String(tok).replace(/[.\s]/g, '');
        for (let i = 0; i < 12; i++) if (t === MONTH_FULL[i] || t === MONTH_ABBR[i].replace(/\./g, '')) return i + 1;
        return 0;
    }
    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    const dim = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
    const trimTitle = function (s) { return String(s || '').replace(/^[\s/,.;:\-]+/, '').replace(/[\s/,;:\-]+$/, '').replace(/\s+/g, ' ').trim(); };
    /**
     * แยกข้อความที่ OCR ได้เป็นรายการกิจกรรม
     * opt = { startMonth (1-12 : เดือนแรกของปีการศึกษา/ของข้อความ) , startYearBE (พ.ศ. ของเดือนแรก) , mode : 'table' | 'month' }
     * รูปแบบที่รองรับ
     *  - ตารางปฏิทินทั้งปี (คอลัมน์หมายเหตุ) : "4 วันฉัตรมงคล /5 ประชุมครู /6-7 ค่าย PDEL" เลื่อนเดือนอัตโนมัติเมื่อเลขวันที่ลดลง (mode table)
     *  - ปฏิทินรายเดือนที่มีหัวข้อชื่อเดือน : บรรทัด "ตุลาคม 2569" ตามด้วย "12 วันที่ระลึก" (mode month)
     *  - วันที่ระบุครบในบรรทัดเดียว : "12 ส.ค. 69 วันแม่แห่งชาติ" , "12-13 สิงหาคม 2569 อบรม" (ทุกโหมด)
     */
    function parseText(text, opt) {
        opt = opt || {};
        const startMonth = Math.min(12, Math.max(1, Number(opt.startMonth) || 5));
        const startYearBE = Number(opt.startYearBE) || (new Date().getFullYear() + 543);
        const mode = opt.mode === 'month' ? 'month' : 'table';
        const out = [];
        const toCE = function (m, beYear) { return (m < startMonth ? startYearBE + 1 : startYearBE) - 543; };
        const yearFromTok = function (tok, m) {
            if (!tok) return null;
            let n = Number(tok);
            if (tok.length === 2) n += 2500;
            return n >= 2400 ? n - 543 : n;
        };
        let month = startMonth, labelYearBE = null, lastDay = 0, prev = null;
        const lines = String(text || '').split(/\r?\n/);
        lines.forEach(function (raw, li) {
            if (/^\s*###/.test(raw)) { prev = null; return; }
            const line = clean(raw);
            if (!line) return;
            if (/ปฏิทิน|ภาคเรียนที่\s*\d\s*\/\s*25\d\d/.test(line) && !/^\d/.test(line)) return;      // ชื่อเรื่องของปฏิทิน
            // 1) วันที่ระบุครบในบรรทัด
            const ex = EXPL.exec(line);
            if (ex && ex[5] && thaiCount(ex[5]) >= 2) {
                const m = monthFromToken(ex[3]);
                if (m) {
                    const y = yearFromTok(ex[4], m) || toCE(m);
                    let d1 = Number(ex[1]), d2 = ex[2] ? Number(ex[2]) : null;
                    if (d2 !== null && (d2 <= d1 || d2 > 31)) d2 = null;
                    out.push({ y: y, m: m, d1: d1, d2: d2, title: trimTitle(ex[5]), line: li, explicit: true });
                    prev = out[out.length - 1]; lastDay = d1; month = m;
                    return;
                }
            }
            // 2) หัวข้อชื่อเดือน (โหมดรายเดือน)
            const segs = []; let m2; SEG.lastIndex = 0;
            while ((m2 = SEG.exec(line)) !== null) {
                const d1 = Number(m2[2]); let d2 = m2[3] ? Number(m2[3]) : null;
                if (d1 < 1 || d1 > 31) continue;
                if (d2 !== null && (d2 <= d1 || d2 > 31)) d2 = null;
                segs.push({ d1: d1, d2: d2, at: m2.index + m2[1].length, end: m2.index + m2[0].length });
            }
            if (!segs.length) {
                const ml = monthOfLabel(line.replace(/\d+/g, ''));
                if (ml && mode === 'month') {
                    month = ml; lastDay = 0; prev = null;
                    const yy = /(25\d\d|20\d\d)/.exec(line); if (yy) labelYearBE = Number(yy[1]) >= 2400 ? Number(yy[1]) : Number(yy[1]) + 543;
                    return;
                }
                // บรรทัดต่อจากกิจกรรมก่อนหน้า (ข้อความยาวที่ขึ้นบรรทัดใหม่)
                if (prev && thaiCount(line) >= 3) { prev.title = trimTitle(prev.title + ' ' + line); prev.cont = true; }
                return;
            }
            // 3) ข้อความก่อนเลขวันแรกในบรรทัด = ส่วนต่อของกิจกรรมก่อนหน้า
            const lead = trimTitle(line.slice(0, segs[0].at));
            if (lead && prev && thaiCount(lead) >= 3) { prev.title = trimTitle(prev.title + ' ' + lead); prev.cont = true; }
            segs.forEach(function (sg, k) {
                const body = trimTitle(line.slice(sg.end, k + 1 < segs.length ? segs[k + 1].at : line.length));
                if (thaiCount(body) < 2) return;
                if (mode === 'table' && lastDay && sg.d1 < lastDay - 7) month = month % 12 + 1;          // เลขวันที่ลดลงมาก = เริ่มเดือนถัดไป
                lastDay = sg.d1;
                const y = mode === 'month' && labelYearBE ? labelYearBE - 543 : toCE(month);
                out.push({ y: y, m: month, d1: sg.d1, d2: sg.d2, title: body, line: li });
                prev = out[out.length - 1];
            });
        });
        // วันที่ -> YYYY-MM-DD (ตรวจว่ามีอยู่จริง)
        out.forEach(function (r) {
            const days = dim(r.y, r.m);
            r.ok = r.d1 >= 1 && r.d1 <= days;
            r.start = r.y + '-' + pad(r.m) + '-' + pad(Math.min(r.d1, days));
            r.end = r.d2 && r.d2 <= days ? r.y + '-' + pad(r.m) + '-' + pad(r.d2) : '';
            if (!r.ok) r.warn = 'วันที่ ' + r.d1 + ' ไม่มีในเดือนนี้';
        });
        return out;
    }
    window.PCEvImport = { parse: parseText, monthOfLabel: monthOfLabel, clean: clean };

    /* ================= หน้าจอนำเข้า ================= */
    const $ = function (id) { return document.getElementById(id); };
    const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    const S = { pages: [], cur: 0, worker: null, workerP: null, rows: [], busy: false, fileNames: [] };
    const DEFAULT_RECT = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const normKey = function (t, d) { return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase() + '|' + d; };
    const validYmd = function (v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3]; return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= dim(y, mo);
    };
    const toast = function (icon, title) { if (window.Swal) Swal.fire({ icon: icon, title: title, toast: true, position: 'top-end', showConfirmButton: false, timer: 2200 }); };

    function build() {
        if ($('evi')) return;
        const nowBE = new Date().getFullYear() + 543;
        const monthOpts = MONTH_FULL.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i === 4 ? ' selected' : '') + '>' + m + '</option>'; }).join('');
        const el = document.createElement('div');
        el.id = 'evi';
        el.innerHTML =
            '<div class="evi-card" role="dialog" aria-label="นำเข้าปฏิทินกิจกรรมจากไฟล์">' +
            '<div class="evi-h"><i class="fa-solid fa-file-import"></i> นำเข้าปฏิทินกิจกรรมจากไฟล์รูปภาพ / PDF<button type="button" id="evi-x" aria-label="ปิด"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="evi-b">' +
            '<div class="evi-info"><b>ขั้นตอน :</b> 1) เลือกไฟล์ภาพ/PDF → 2) ลากกรอบครอบเฉพาะส่วนที่เป็นข้อความกิจกรรม (เช่น คอลัมน์ "หมายเหตุ" ของปฏิทิน) → 3) กด "อ่านข้อความ" → 4) ตรวจ/แก้ข้อความ แล้วกด "แยกเป็นกิจกรรม" → 5) ตรวจรายการ แล้วนำเข้า<br>ไฟล์ถูกอ่านในเครื่องของคุณ ไม่ถูกอัปโหลดไปที่ใด (ครั้งแรกจะโหลดข้อมูลภาษาไทยของตัวอ่านประมาณ 10 MB) · ผลการอ่านภาพอาจคลาดเคลื่อน กรุณาตรวจทุกรายการก่อนนำเข้า</div>' +
            '<div class="evi-sec"><div class="evi-st">1) เลือกไฟล์</div>' +
            '<div class="evi-drop" id="evi-drop"><i class="fa-solid fa-cloud-arrow-up" style="font-size:26px;color:#7c3aed"></i><div style="font-weight:700;margin-top:4px">ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือก (รูปภาพ หรือ PDF)</div><div class="evi-hint">PDF หลายหน้าได้ (สูงสุด 12 หน้า) · หรือข้ามไปวางข้อความในช่อง "ข้อความที่อ่านได้" ด้านล่างได้เลย</div></div>' +
            '<input type="file" id="evi-file" accept="image/\*,application/pdf,.pdf" multiple hidden>' +
            '<div id="evi-pgbox" hidden>' +
            '<div class="evi-row"><button type="button" class="evi-btn soft sm" id="evi-prev"><i class="fa-solid fa-chevron-left"></i></button><b id="evi-pgno">หน้า 1/1</b><button type="button" class="evi-btn soft sm" id="evi-next"><i class="fa-solid fa-chevron-right"></i></button><span id="evi-fname" class="evi-hint" style="margin:0"></span></div>' +
            '<div class="evi-row"><div class="evi-pg" id="evi-pg"><div class="evi-ov" id="evi-ov"></div><div class="evi-box" id="evi-boxsel"></div></div></div>' +
            '<div class="evi-row"><span class="evi-hint" style="margin:0">ลากบนภาพเพื่อวาดกรอบ :</span><button type="button" class="evi-btn soft sm" data-pre="all">ทั้งหน้า</button><button type="button" class="evi-btn soft sm" data-pre="right">ครึ่งขวา (คอลัมน์หมายเหตุ)</button><button type="button" class="evi-btn soft sm" data-pre="left">ครึ่งซ้าย</button></div>' +
            '</div></div>' +
            '<div class="evi-sec"><div class="evi-st">2) อ่านข้อความจากภาพ</div>' +
            '<div class="evi-row"><button type="button" class="evi-btn" id="evi-ocr" disabled><i class="fa-solid fa-wand-magic-sparkles"></i> อ่านข้อความ (หน้านี้)</button><button type="button" class="evi-btn soft" id="evi-ocrall" disabled>อ่านทุกหน้า</button>' +
            '<label class="evi-l">รูปแบบข้อความในกรอบ<select id="evi-psm"><option value="6">เป็นแถว ๆ (แนะนำ)</option><option value="4">คอลัมน์เดียว</option><option value="3">ไม่แน่ใจ (อัตโนมัติ)</option></select></label></div>' +
            '<div id="evi-prog" hidden><div class="evi-hint" id="evi-progt" style="margin-top:8px"></div><div class="evi-bar"><i id="evi-progb"></i></div></div>' +
            '<div style="margin-top:10px"><label class="evi-l" style="margin-bottom:4px">ข้อความที่อ่านได้ (แก้ไขได้ก่อนแยกเป็นกิจกรรม)</label><textarea id="evi-text" spellcheck="false" placeholder="4 วันฉัตรมงคล /5 ประชุมครูก่อนเปิดภาคเรียน /6 เปิดภาคเรียนที่ 1/69&#10;13 วันพืชมงคล /14-15 ลงทะเบียนเรียนซ้ำ&#10;12 ส.ค. 69 วันแม่แห่งชาติ"></textarea></div></div>' +
            '<div class="evi-sec"><div class="evi-st">3) แยกเป็นกิจกรรม</div>' +
            '<div class="evi-row">' +
            '<label class="evi-l">ปีการศึกษา/ปีของเดือนแรก (พ.ศ.)<input type="number" id="evi-year" value="' + nowBE + '" min="2540" max="2700" style="width:130px"></label>' +
            '<label class="evi-l">เดือนแรกของข้อความ<select id="evi-month">' + monthOpts + '</select></label>' +
            '<label class="evi-l">รูปแบบปฏิทิน<select id="evi-mode"><option value="table">ตารางทั้งปี (เลื่อนเดือนอัตโนมัติ)</option><option value="month">รายเดือน (มีบรรทัดชื่อเดือน)</option></select></label>' +
            '<label class="evi-l">ประเภทกิจกรรม<select id="evi-scope"><option value="school">กิจกรรมของโรงเรียน</option><option value="">ทั่วไป (แสดงเฉพาะในปฏิทินงาน)</option></select></label>' +
            '<button type="button" class="evi-btn" id="evi-parse"><i class="fa-solid fa-list-check"></i> แยกเป็นกิจกรรม</button></div>' +
            '<div class="evi-hint">วันที่ที่ระบุครบในบรรทัด (เช่น "12 ส.ค. 69 ...") จะใช้ตามที่เขียน · ตารางทั้งปี : ระบบเลื่อนไปเดือนถัดไปเมื่อเลขวันที่ลดลง ถ้าเดือนผิดให้ใช้ปุ่ม ▼ ในแถวเพื่อเลื่อนเดือน</div></div>' +
            '<div class="evi-sec" id="evi-res" hidden><div class="evi-st" id="evi-rest">4) ตรวจรายการ</div><div id="evi-sum" class="evi-hint" style="margin:0 0 8px"></div>' +
            '<div class="evi-tw"><table><thead><tr><th style="width:34px"><input type="checkbox" id="evi-all" checked></th><th style="width:150px">วันที่เริ่ม</th><th style="width:150px">ถึงวันที่</th><th>ชื่อกิจกรรม</th><th style="width:110px">สถานะ</th><th style="width:96px"></th></tr></thead><tbody id="evi-body"></tbody></table></div></div>' +
            '</div>' +
            '<div class="evi-f"><span id="evi-foot" class="evi-hint" style="margin:0 auto 0 0"></span><button type="button" class="evi-btn gray" id="evi-close">ปิด</button><button type="button" class="evi-btn" id="evi-go" disabled><i class="fa-solid fa-calendar-plus"></i> นำเข้า</button></div>' +
            '</div>';
        document.body.appendChild(el);
        $('evi-x').onclick = $('evi-close').onclick = close;
        el.addEventListener('mousedown', function (e) { if (e.target === el) { /* ไม่ปิดเมื่อคลิกพื้นหลัง กันทำงานหาย */ } });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('on') && !S.busy) close(); });
        const drop = $('evi-drop'), fi = $('evi-file');
        drop.onclick = function () { fi.click(); };
        fi.onchange = function () { loadFiles(Array.prototype.slice.call(fi.files)); fi.value = ''; };
        ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
        ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
        drop.addEventListener('drop', function (e) { loadFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
        $('evi-prev').onclick = function () { showPage(S.cur - 1); };
        $('evi-next').onclick = function () { showPage(S.cur + 1); };
        el.querySelectorAll('[data-pre]').forEach(function (b) {
            b.onclick = function () {
                const p = S.pages[S.cur]; if (!p) return;
                p.rect = b.dataset.pre === 'right' ? { x0: 0.44, y0: 0.1, x1: 1, y1: 0.97 } : (b.dataset.pre === 'left' ? { x0: 0, y0: 0, x1: 0.5, y1: 1 } : Object.assign({}, DEFAULT_RECT));
                drawRect();
            };
        });
        bindDrag();
        $('evi-ocr').onclick = function () { runOcr([S.cur]); };
        $('evi-ocrall').onclick = function () { runOcr(S.pages.map(function (_, i) { return i; })); };
        $('evi-parse').onclick = doParse;
        $('evi-go').onclick = doImport;
        $('evi-all').onchange = function () { S.rows.forEach(function (r) { r.on = this.checked && r.flag !== 'bad'; }, this); renderRows(); };
        $('evi-body').addEventListener('input', onRowInput);
        $('evi-body').addEventListener('change', onRowInput);
        $('evi-body').addEventListener('click', onRowClick);
    }

    function setProg(txt, pct) {
        const box = $('evi-prog'); if (!box) return;
        box.hidden = txt === null;
        if (txt !== null) { $('evi-progt').textContent = txt; $('evi-progb').style.width = (pct || 0) + '%'; }
    }

    /* ---------- โหลดไฟล์ -> หน้า (canvas) ---------- */
    async function loadFiles(files) {
        files = files.filter(function (f) { return /^image\//.test(f.type) || /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
        if (!files.length) return toast('warning', 'กรุณาเลือกไฟล์รูปภาพหรือ PDF');
        S.busy = true; setProg('กำลังเปิดไฟล์…', 5);
        try {
            const pages = [];
            for (let fi = 0; fi < files.length; fi++) {
                const f = files[fi];
                if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
                    await window.PCLib.load('pdfjs');
                    const pdf = await window.pdfjsLib.getDocument(new Uint8Array(await f.arrayBuffer())).promise;
                    const n = Math.min(pdf.numPages, 12);
                    for (let i = 1; i <= n; i++) {
                        setProg('กำลังแปลง ' + f.name + ' หน้า ' + i + '/' + n + '...', 5 + 80 * ((fi + i / n) / files.length));
                        const pg = await pdf.getPage(i), v1 = pg.getViewport({ scale: 1 });
                        const sc = Math.min(4, Math.max(1.5, 2000 / v1.width)), vp = pg.getViewport({ scale: sc });
                        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
                        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
                        await pg.render({ canvasContext: g, viewport: vp }).promise;
                        pages.push({ canvas: c, name: f.name + (pdf.numPages > 1 ? ' (หน้า ' + i + ')' : ''), rect: Object.assign({}, DEFAULT_RECT) });
                    }
                } else {
                    const url = URL.createObjectURL(f);
                    try {
                        const img = await new Promise(function (ok, no) { const im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { no(new Error('เปิดรูปภาพไม่ได้ : ' + f.name)); }; im.src = url; });
                        const sc = Math.min(1, 4000 / Math.max(img.naturalWidth, img.naturalHeight));
                        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
                        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
                        pages.push({ canvas: c, name: f.name, rect: Object.assign({}, DEFAULT_RECT) });
                    } finally { URL.revokeObjectURL(url); }
                }
            }
            S.pages = pages; S.cur = 0; S.fileNames = files.map(function (f) { return f.name; });
            $('evi-pgbox').hidden = false; $('evi-ocr').disabled = false; $('evi-ocrall').disabled = pages.length < 2;
            $('evi-text').value = '';
            showPage(0);
            setProg(null);
            if (pages.length) toast('success', 'เปิดไฟล์แล้ว ' + pages.length + ' หน้า');
        } catch (e) { setProg(null); if (window.Swal) Swal.fire('เปิดไฟล์ไม่สำเร็จ', (e && e.message) || String(e), 'error'); }
        finally { S.busy = false; }
    }
    function showPage(i) {
        if (!S.pages.length) return;
        S.cur = Math.max(0, Math.min(S.pages.length - 1, i));
        const wrap = $('evi-pg'), p = S.pages[S.cur];
        const old = wrap.querySelector('canvas'); if (old) old.remove();
        wrap.insertBefore(p.canvas, wrap.firstChild);
        $('evi-pgno').textContent = 'หน้า ' + (S.cur + 1) + '/' + S.pages.length;
        $('evi-fname').textContent = p.name;
        drawRect();
    }
    function drawRect() {
        const p = S.pages[S.cur], b = $('evi-boxsel'); if (!p || !b) return;
        const r = p.rect, full = r.x0 <= 0 && r.y0 <= 0 && r.x1 >= 1 && r.y1 >= 1;
        b.style.display = full ? 'none' : 'block';
        b.style.left = (r.x0 * 100) + '%'; b.style.top = (r.y0 * 100) + '%';
        b.style.width = ((r.x1 - r.x0) * 100) + '%'; b.style.height = ((r.y1 - r.y0) * 100) + '%';
    }
    function bindDrag() {
        const ov = $('evi-ov'); let a = null;
        const pos = function (e) {
            const c = $('evi-pg').querySelector('canvas'), r = c.getBoundingClientRect();
            return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
        };
        ov.addEventListener('pointerdown', function (e) { if (!S.pages.length) return; ov.setPointerCapture(e.pointerId); a = pos(e); e.preventDefault(); });
        ov.addEventListener('pointermove', function (e) {
            if (!a) return; const b = pos(e);
            S.pages[S.cur].rect = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
            drawRect();
        });
        const end = function () {
            if (!a) return; a = null;
            const r = S.pages[S.cur].rect;
            if ((r.x1 - r.x0) < 0.03 || (r.y1 - r.y0) < 0.03) { S.pages[S.cur].rect = Object.assign({}, DEFAULT_RECT); drawRect(); }
        };
        ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
    }

    /* ---------- OCR ---------- */
    function cropForOcr(page) {
        const src = page.canvas, r = page.rect;
        const sx = Math.round(r.x0 * src.width), sy = Math.round(r.y0 * src.height);
        const sw = Math.max(20, Math.round((r.x1 - r.x0) * src.width)), sh = Math.max(20, Math.round((r.y1 - r.y0) * src.height));
        const scale = sw < 1500 ? Math.min(3, 1500 / sw) : 1;
        const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.imageSmoothingQuality = 'high'; g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
        // ขาวดำ + ยืดคอนทราสต์ (ช่วยให้อ่านตัวอักษรเล็กได้ดีขึ้น)
        const id = g.getImageData(0, 0, c.width, c.height), d = id.data, hist = new Uint32Array(256);
        for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = v; hist[v]++; }
        const total = c.width * c.height; let acc = 0, lo = 0, hi = 255;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
        acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.25) { hi = v; break; } }   // พื้นกระดาษเป็นส่วนใหญ่ -> ใช้ค่าสว่างของพื้นเป็นขาว
        if (hi - lo < 30) { lo = 0; hi = 255; }
        for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * 255 / (hi - lo))); d[i] = d[i + 1] = d[i + 2] = v; }
        g.putImageData(id, 0, 0);
        return c;
    }
    async function getWorker() {
        if (S.worker) return S.worker;
        if (S.workerP) return S.workerP;
        S.workerP = (async function () {
            await window.PCLib.load('tesseract');
            const w = await window.Tesseract.createWorker('tha+eng', 1, {
                logger: function (m) {
                    if (!m) return; const st = String(m.status || ''), p = Math.round((m.progress || 0) * 100);
                    if (/loading language/i.test(st)) setProg('กำลังโหลดข้อมูลภาษาไทย (ครั้งแรกประมาณ 10 MB) ' + p + '%', 3 + p * 0.2);
                    else if (/loading|initializ/i.test(st)) setProg('กำลังเตรียมตัวอ่านข้อความ…', 2);
                }
            });
            S.worker = w; return w;
        })();
        try { return await S.workerP; } finally { S.workerP = null; }
    }
    function sectionsOf(v) {
        const parts = String(v || '').split(/^### หน้า (\d+)[^\n]*$/m), map = {};
        if (parts.length === 1) { map[1] = parts[0].replace(/^\n+|\n+$/g, ''); return { map: map, multi: false }; }
        for (let i = 1; i < parts.length; i += 2) map[Number(parts[i])] = String(parts[i + 1] || '').replace(/^\n+|\n+$/g, '');
        return { map: map, multi: true };
    }
    function putSection(n, txt) {
        const ta = $('evi-text');
        if (S.pages.length < 2) { ta.value = txt; return; }
        const sec = sectionsOf(ta.value);
        const map = sec.multi ? sec.map : (ta.value.trim() ? { 1: ta.value.trim() } : {});
        map[n] = txt;
        ta.value = Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return '### หน้า ' + k + '\n' + map[k]; }).join('\n\n');
    }
    async function runOcr(list) {
        if (S.busy || !S.pages.length) return;
        S.busy = true; $('evi-ocr').disabled = $('evi-ocrall').disabled = true;
        try {
            setProg('กำลังเตรียมตัวอ่านข้อความ…', 2);
            const w = await getWorker();
            await w.setParameters({ tessedit_pageseg_mode: $('evi-psm').value, preserve_interword_spaces: '1' });
            for (let k = 0; k < list.length; k++) {
                const i = list[k];
                setProg('กำลังอ่านข้อความ หน้า ' + (i + 1) + '/' + S.pages.length + '...', 30 + 65 * (k / list.length));
                const res = await w.recognize(cropForOcr(S.pages[i]));
                putSection(i + 1, String(res.data.text || '').replace(/[ \t]+\n/g, '\n').trim());
            }
            setProg('อ่านเสร็จแล้ว — ตรวจ/แก้ข้อความด้านล่าง แล้วกด "แยกเป็นกิจกรรม"', 100);
            const mt = /ภาคเรียนที่\s*\d\s*\/\s*(25\d\d)/.exec(thDigits($('evi-text').value));
            if (mt) $('evi-year').value = mt[1];
        } catch (e) { setProg(null); if (window.Swal) Swal.fire('อ่านข้อความไม่สำเร็จ', (e && e.message) || String(e), 'error'); }
        finally { S.busy = false; $('evi-ocr').disabled = false; $('evi-ocrall').disabled = S.pages.length < 2; }
    }

    /* ---------- แยกเป็นรายการ + ตรวจรายการ ---------- */
    function existingKeys() {
        const set = {};
        try { Object.keys((window.PC && PC.store && PC.store.events) || {}).forEach(function (k) { const r = PC.store.events[k]; if (r && !r.x && r.d) set[normKey(r.d.title, r.d.startDate || r.d.date)] = 1; }); } catch (e) { /* ข้าม */ }
        return set;
    }
    function flagRows(initial) {
        const ex = existingKeys(), seen = {};
        S.rows.forEach(function (r) {
            const bad = !validYmd(r.start) || !String(r.title || '').trim() || (r.end && (!validYmd(r.end) || r.end < r.start));
            const key = normKey(r.title, r.start);
            r.flag = bad ? 'bad' : (ex[key] ? 'dupEx' : (seen[key] ? 'dupFile' : ''));
            if (!bad) seen[key] = 1;
            if (initial) r.on = !r.flag;
            else if (bad) r.on = false;
        });
    }
    function doParse() {
        const text = $('evi-text').value;
        if (!text.trim()) return toast('warning', 'ยังไม่มีข้อความ — กด "อ่านข้อความ" หรือวางข้อความก่อน');
        const parsed = parseText(text, { startMonth: Number($('evi-month').value), startYearBE: Number($('evi-year').value), mode: $('evi-mode').value });
        S.rows = parsed.map(function (p) { return { start: p.start, end: p.end || '', title: p.title, warn: p.warn || '', cont: !!p.cont, on: true, flag: '' }; });
        flagRows(true);
        $('evi-res').hidden = false;
        renderRows();
        if (!S.rows.length) toast('warning', 'ไม่พบกิจกรรมในข้อความ (แต่ละกิจกรรมต้องขึ้นต้นด้วยเลขวันที่ เช่น "4 วันฉัตรมงคล")');
        else $('evi-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function renderRows() {
        const tb = $('evi-body');
        tb.innerHTML = S.rows.map(function (r, i) {
            const tag = r.flag === 'bad' ? '<span class="evi-tag bad">ข้อมูลไม่ถูกต้อง</span>' : (r.flag === 'dupEx' ? '<span class="evi-tag dup">มีในระบบแล้ว</span>' : (r.flag === 'dupFile' ? '<span class="evi-tag dup">ซ้ำในไฟล์</span>' : '<span class="evi-tag ok">ใหม่</span>'));
            return '<tr data-i="' + i + '" class="' + (r.on ? '' : 'off') + '"><td><input type="checkbox" data-f="on"' + (r.on ? ' checked' : '') + (r.flag === 'bad' ? ' disabled' : '') + '></td>' +
                '<td><input type="date" data-f="start" value="' + esc(r.start) + '"></td><td><input type="date" data-f="end" value="' + esc(r.end) + '"></td>' +
                '<td><input type="text" data-f="title" value="' + esc(r.title) + '" maxlength="300">' + (r.warn ? '<div class="evi-hint" style="margin:2px 0 0;color:#b45309">' + esc(r.warn) + '</div>' : '') + '</td>' +
                '<td>' + tag + '</td>' +
                '<td style="white-space:nowrap"><button type="button" class="evi-btn soft sm" data-act="down" title="เลื่อนเดือนของแถวนี้ลงไปทั้งหมด +1 เดือน">▼ +1</button> <button type="button" class="evi-btn soft sm" data-act="up" title="เลื่อนเดือนของแถวนี้ลงไปทั้งหมด −1 เดือน">▼ −1</button> <button type="button" class="evi-btn gray sm" data-act="del" title="ลบแถว"><i class="fa-solid fa-xmark"></i></button></td></tr>';
        }).join('');
        updateSummary();
    }
    function updateSummary() {
        const on = S.rows.filter(function (r) { return r.on && r.flag !== 'bad'; }).length;
        const dupe = S.rows.filter(function (r) { return r.flag === 'dupEx' || r.flag === 'dupFile'; }).length, bad = S.rows.filter(function (r) { return r.flag === 'bad'; }).length;
        $('evi-sum').innerHTML = 'พบ <b>' + S.rows.length + '</b> รายการ · เลือกนำเข้า <b>' + on + '</b>' + (dupe ? ' · ซ้ำ ' + dupe + ' (ไม่เลือกให้อัตโนมัติ)' : '') + (bad ? ' · <span style="color:#b91c1c">ข้อมูลไม่ถูกต้อง ' + bad + '</span>' : '') + ' — แก้วันที่/ชื่อในช่องได้โดยตรง';
        const go = $('evi-go'); go.disabled = !on; go.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> นำเข้า ' + on + ' กิจกรรม';
    }
    function shiftMonths(from, delta) {
        const sh = function (ymd) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); if (!m) return ymd;
            let y = +m[1], mo = +m[2] + delta; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; }
            return y + '-' + pad(mo) + '-' + pad(Math.min(+m[3], dim(y, mo)));
        };
        for (let i = from; i < S.rows.length; i++) { S.rows[i].start = sh(S.rows[i].start); S.rows[i].end = sh(S.rows[i].end); }
        flagRows(false); renderRows();
    }
    function onRowInput(e) {
        const t = e.target, tr = t.closest('tr'); if (!tr || !t.dataset.f) return;
        const r = S.rows[+tr.dataset.i]; if (!r) return;
        if (t.dataset.f === 'on') { r.on = t.checked; tr.classList.toggle('off', !r.on); updateSummary(); return; }
        r[t.dataset.f] = t.value;
        if (e.type === 'change') { flagRows(false); renderRows(); }
    }
    function onRowClick(e) {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const i = +b.closest('tr').dataset.i;
        if (b.dataset.act === 'del') { S.rows.splice(i, 1); flagRows(false); renderRows(); }
        else shiftMonths(i, b.dataset.act === 'down' ? 1 : -1);
    }

    /* ---------- นำเข้า ---------- */
    async function doImport() {
        const items = S.rows.filter(function (r) { return r.on && r.flag !== 'bad'; }).map(function (r) {
            return { title: String(r.title).trim(), startDate: r.start, endDate: r.end || r.start, scope: $('evi-scope').value, desc: 'นำเข้าจากไฟล์ ' + (S.fileNames.join(', ') || 'ข้อความ') };
        });
        if (!items.length) return;
        if (window.Swal) {
            const ok = await Swal.fire({ icon: 'question', title: 'นำเข้า ' + items.length + ' กิจกรรม?', text: 'กิจกรรมจะถูกเพิ่มในปฏิทิน (ที่ซ้ำกับของเดิมจะถูกข้าม)', showCancelButton: true, confirmButtonText: 'นำเข้า', cancelButtonText: 'ยกเลิก' });
            if (!ok.isConfirmed) return;
        }
        S.busy = true; const go = $('evi-go'); go.disabled = true;
        let added = 0, skipped = 0, invalid = 0; const savedItems = [], savedMeta = {};
        try {
            for (let i = 0; i < items.length; i += 100) {
                go.textContent = 'กำลังนำเข้า ' + Math.min(i + 100, items.length) + '/' + items.length + '...';
                const r = await PC.api('importEvents', { items: items.slice(i, i + 100), skipDuplicates: true }, { retries: 2, timeout: 90000 });
                added += r.added || 0; skipped += r.skipped || 0; invalid += r.invalid || 0;
                (r.items || []).forEach(function (it) { savedItems.push(it); });
                (r.saved || []).forEach(function (sv) { savedMeta[sv.id] = sv; });
            }
            try { if (typeof PC.addEventsLocal === 'function') PC.addEventsLocal(savedItems, savedMeta); } catch (e2) { console.warn('[evi] อัปเดตปฏิทินในหน้าไม่สำเร็จ', e2); }
            close();
            if (window.Swal) Swal.fire({ icon: 'success', title: 'นำเข้าเสร็จแล้ว', html: 'เพิ่มใหม่ <b>' + added + '</b> กิจกรรม' + (skipped ? '<br>ข้ามที่ซ้ำกับของเดิม ' + skipped : '') + (invalid ? '<br>ไม่ถูกต้อง ' + invalid : '') });
        } catch (e) {
            if (window.Swal) Swal.fire('นำเข้าไม่สำเร็จ (ทำไปแล้ว ' + added + ' รายการ)', (e && e.message) || String(e), 'error');
            updateSummary();
        } finally { S.busy = false; }
    }

    function open() {
        if (!(window.PC && PC.token)) return;
        build();
        $('evi').classList.add('on');
        document.body.style.overflow = 'hidden';
    }
    function close() {
        const el = $('evi'); if (!el) return;
        el.classList.remove('on'); document.body.style.overflow = '';
        if (S.worker) { try { S.worker.terminate(); } catch (e) { /* ข้าม */ } S.worker = null; }
    }
    window.PC = window.PC || {};
    PC.openEventImport = open;
})();
