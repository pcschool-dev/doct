
        /* [v46] โหลดไลบรารีใหญ่ที่ใช้นาน ๆ ครั้ง "เมื่อต้องใช้" แทนการโหลดทุกครั้งที่เปิดหน้าเว็บ
           PDF.js (อ่านไฟล์ PDF ตอนลงรับ/เปิดไฟล์แนบ) และ jsPDF (ส่งออก PDF) : โหลดล่วงหน้าเบื้องหลังหลังเปิดหน้าไปแล้วสักพัก เพื่อให้ใช้งานครั้งแรกไม่ต้องรอ
           SheetJS (Excel ~900KB) : โหลดเมื่อกดนำเข้า/ส่งออก Excel เท่านั้น */
        window.PCLib = (function () {
            const CDN = 'https:/\/cdnjs.cloudflare.com/ajax/libs/';
            const SRC = { pdfjs: CDN + 'pdf.js/2.16.105/pdf.min.js', jspdf: CDN + 'jspdf/2.5.1/jspdf.umd.min.js', xlsx: CDN + 'xlsx/0.18.5/xlsx.full.min.js', tesseract: CDN + 'tesseract.js/5.1.1/tesseract.min.js' };
            const READY = { pdfjs: () => window.pdfjsLib, jspdf: () => window.jspdf, xlsx: () => window.XLSX, tesseract: () => window.Tesseract };
            const pending = {};
            function load(name) {
                if (!SRC[name]) return Promise.reject(new Error('ไม่รู้จักไลบรารี ' + name));
                if (READY[name]()) return Promise.resolve();
                if (pending[name]) return pending[name];
                pending[name] = new Promise((ok, no) => {
                    const el = document.createElement('script');
                    el.src = SRC[name];
                    el.onload = () => {
                        if (name === 'pdfjs' && window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.js/2.16.105/pdf.worker.min.js';
                        ok();
                    };
                    el.onerror = () => { delete pending[name]; el.remove(); no(new Error('โหลดไลบรารี ' + name + ' ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')); };
                    document.head.appendChild(el);
                });
                return pending[name];
            }
            // หลังเปิดหน้าไปแล้ว 6 วินาทีค่อยโหลดเตรียมไว้ (ไม่แย่งแบนด์วิดท์ตอนเปิดหน้า/เข้าสู่ระบบ)
            window.addEventListener('load', () => setTimeout(() => { ['pdfjs', 'jspdf'].forEach(n => load(n).catch(() => { /* โหลดตอนใช้งานจริงอีกครั้ง */ })); }, 6000));
            return { load: load };
        })();
        /* [v46] รูปย่อ : รูปที่เก็บใน Google Drive แล้วใช้ลิงก์ lh3.googleusercontent.com/d/<id> ขอให้ Google ย่อขนาดให้ได้ด้วยต่อท้าย =s<พิกเซล>
           (รูปโปรไฟล์เดิมที่เก็บเป็นไฟล์ใหญ่ก็ได้ประโยชน์ทันที ไม่ต้องอัปโหลดใหม่) ลิงก์อื่นคืนค่าเดิม */
        window.pcThumb = function (url, px) {
            try {
                if (typeof url !== 'string') return url;
                const m = /^(https:\/\/lh[0-9]\.googleusercontent\.com\/d\/[\w-]+)$/.exec(url);
                if (!m) return url;
                const dpr = Math.min(2, window.devicePixelRatio || 1);
                return m[1] + '=s' + Math.max(48, Math.min(512, Math.ceil((px || 96) * dpr / 32) * 32));
            } catch (e) { return url; }
        };

        /* ============================================================================
           [v47] 1) ขนาดหน้ากระดาษเริ่มต้น 60% บนคอมพิวเตอร์ ; [v97] iPad/แท็บเล็ต 70% ; มือถือพอดีความกว้าง 100%
                 2) ตราประทับความเห็นของทุกคน : ไม่มีเส้นขอบ / ตัวหนังสือหนาและคมขึ้น / สีน้ำเงินเข้ม
           ============================================================================ */
        window.pcIsDesktop = function () {
            try { return window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches; }
            catch (e) { return window.innerWidth >= 1024; }
        };
        window.PC_ZOOM_DEFAULT = 0.6;
        /* [v97] iPad / แท็บเล็ต : หน้าลงนามเริ่มที่ 70% ; ใช้ท่าทางนิ้วเลื่อนเอกสารขึ้นลงได้ (ดู pcEnableTouchScroll) */
        window.PC_ZOOM_TABLET = 0.7;
        window.pcIsTablet = function () {
            try {
                const ua = navigator.userAgent || '';
                if (/iPad/.test(ua)) return true;
                if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;   // iPadOS ที่รายงานตัวเองเป็น Mac (รวมกรณีต่อคีย์บอร์ด/แทร็กแพด)
                const touchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
                return touchOnly && Math.min(screen.width, screen.height) >= 600;                       // แท็บเล็ตระบบอื่น (จอสัมผัส ไม่มีเมาส์ ด้านสั้นอย่างน้อย 600px)
            } catch (e) { return false; }
        };
        /** ขนาดเริ่มต้นของหน้ากระดาษในหน้าลงนาม (สัดส่วนของความกว้างพอดี) */
        window.pcDefaultFit = function () { return window.pcIsTablet() ? window.PC_ZOOM_TABLET : (window.pcIsDesktop() ? window.PC_ZOOM_DEFAULT : 1); };
        /** [v97] ใช้นิ้วเลื่อนเอกสารขึ้นลง/ซ้ายขวาในหน้าลงนามได้ : นิ้วแตะ "พื้นที่ว่าง" = ให้เบราว์เซอร์เลื่อนหน้า (มีแรงเฉื่อยตามปกติ) ; แตะที่ตรายาง/วัตถุ = ลากย้ายตามเดิม
            (fabric ตั้ง touch-action:none และเรียก preventDefault จึงเลื่อนไม่ได้) ; ปากกา Apple Pencil, โหมดวาด และโหมดมือจับ ยังทำงานเหมือนเดิม */
        window.pcEnableTouchScroll = function (canvas) {
            if (!canvas || !canvas.wrapperEl || canvas.__pcTouchScroll) return;
            canvas.__pcTouchScroll = true;
            try {
                canvas.upperCanvasEl.style.touchAction = 'pan-x pan-y pinch-zoom';
                canvas.lowerCanvasEl.style.touchAction = 'pan-x pan-y pinch-zoom';
            } catch (e) { /* ข้าม */ }
            canvas.wrapperEl.addEventListener('touchstart', function (ev) {
                try {
                    if (canvas.isDrawingMode || canvas.isPanMode) return;                         // วาด/มือจับ : fabric จัดการเอง
                    const t = ev.touches && ev.touches[0];
                    if (!t || ev.touches.length > 1) return;                                       // หลายนิ้ว (ย่อ/ขยาย) : เบราว์เซอร์จัดการ
                    if (t.touchType === 'stylus') return;                                          // Apple Pencil : ใช้เลือก/ย้ายตรายางตามเดิม
                    const target = canvas.findTarget(ev, false);
                    if (target && target !== canvas.backgroundImage && target.selectable !== false) return;   // แตะที่ตรายาง/วัตถุที่ย้ายได้ : ให้ fabric ลากย้าย (ตราของขั้นตอนก่อนหน้าที่ล็อกไว้ = เลื่อนหน้าได้)
                    ev.stopPropagation();                                                          // พื้นที่ว่าง : ไม่ส่งให้ fabric (ไม่ preventDefault) -> เลื่อนหน้าได้
                } catch (e) { /* ข้าม */ }
            }, { capture: true, passive: true });
        };

        /* ---- หน้าลงนาม (fabric canvas) : ปุ่มกลางแถบซูมแสดง % จริง กดสลับ 100% (พอดีความกว้าง) <-> 60% ---- */
        window.pcZoomLabel = function (key) {
            try {
                const c = state.canvases[key];
                if (!c) return;
                const pct = Math.round(c.getZoom() * (c.__fit || 1) * 100);
                document.querySelectorAll('[data-zoom-for="' + key + '"]').forEach(b => { b.textContent = pct + '%'; });
            } catch (e) { /* ข้าม */ }
        };
        window.pcToggleZoom = function (key) {
            const c = state.canvases[key];
            if (!c) return;
            const cur = c.getZoom() * (c.__fit || 1);
            if (Math.abs(cur - 1) < 0.02 && window.pcDefaultFit() !== 1) resetCanvasZoom(key);   // 100% -> ค่าเริ่มต้นของอุปกรณ์ (คอมพิวเตอร์ 60% , iPad 70%)
            else resetCanvasZoom(key, true);                                                    // อื่น ๆ -> 100% พอดีความกว้าง
        };

        /* ---- หน้าต่างดูไฟล์เต็มจอ : ไฟล์ต้นฉบับ / ไฟล์แนบ (ขนาดคิดเป็น % ของความกว้างปกติ ตัวแปร --vz) ---- */
        window.PC_VZ = { pct: 100 };
        window.pcVzDefault = function () { return window.pcIsDesktop() ? 60 : 100; };
        window.pcVzReset = function () { window.PC_VZ.pct = window.pcVzDefault(); };
        window.pcVzApply = function () {
            document.querySelectorAll('.pc-fv-body').forEach(el => el.style.setProperty('--vz', window.PC_VZ.pct / 100));
            const z = document.getElementById('pc-vz-zoom');
            if (z) z.textContent = window.PC_VZ.pct + '%';
        };
        window.pcVz = function (d) {
            const def = window.pcVzDefault();
            window.PC_VZ.pct = d === 0 ? ((window.PC_VZ.pct === 100 && def !== 100) ? def : 100) : Math.min(300, Math.max(30, window.PC_VZ.pct + d));
            window.pcVzApply();
        };
        window.pcVzControls = function () {
            return '<div class="flex items-center gap-1 bg-slate-100 rounded-xl px-1 py-0.5">'
                + '<button type="button" onclick="pcVz(-20)" class="w-7 h-7 rounded-lg hover:bg-white text-slate-600" title="ย่อ"><i class="fa-solid fa-magnifying-glass-minus"></i></button>'
                + '<button type="button" onclick="pcVz(0)" id="pc-vz-zoom" class="px-1.5 h-7 rounded-lg hover:bg-white text-[11px] font-bold text-slate-600" title="สลับระหว่างพอดีความกว้าง (100%) กับ 60%">' + window.PC_VZ.pct + '%</button>'
                + '<button type="button" onclick="pcVz(20)" class="w-7 h-7 rounded-lg hover:bg-white text-slate-600" title="ขยาย"><i class="fa-solid fa-magnifying-glass-plus"></i></button></div>';
        };

        /* ---- ตราประทับความเห็น (กลุ่ม fabric ที่มีกรอบ + ข้อความ + ลายเซ็น) ---- */
        window.PC_STAMP_INK = '#0a2a6c';       // น้ำเงินเข้ม
        window.pcIsCommentStamp = function (g) {
            return !!(g && g.stampName && g.type === 'group' && Array.isArray(g._objects) && g._objects.length > 2
                && g._objects[0] && g._objects[0].type === 'rect' && g._objects.some(o => o.type === 'image'));
        };
        window.pcRestyleStamp = function (g) {
            if (!window.pcIsCommentStamp(g)) return false;
            const INK = window.PC_STAMP_INK, items = g._objects, box = items[0];
            // ไม่มีเส้นขอบ (ทั้งเส้นทึบ เส้นประวิ่ง และสีขอบที่ระบบเคยคืนค่าให้ตอนส่งต่อ)
            box.set({ stroke: '', strokeWidth: 0, strokeDashArray: null });
            g.originalStroke = '';
            if (g.animateBorder && g.animateBorder !== true) { try { clearInterval(g.animateBorder); } catch (e) { /* ข้าม */ } }
            g.animateBorder = true;             // ตัวโหลด/ตัวสร้างเดิมเห็นว่า "มีแอนิเมชันอยู่แล้ว" จึงไม่สร้างตัววิ่งเส้นประซ้ำ (ประหยัด CPU)
            let seenTop = false;
            items.forEach(o => {
                if (o === box || o.type === 'image' || o.type === 'circle') return;
                if (o.type !== 'textbox' && o.type !== 'text' && o.type !== 'i-text') return;
                const f = String(o.fill || '').toLowerCase();
                if (f === '#ffffff' || f === '#fff' || f === 'white') return;          // เลขลำดับสีขาวในวงกลมแดง
                let weight, sw;
                if (o.type === 'textbox' && !seenTop) { seenTop = true; weight = 'bold'; sw = 0.45; }   // บรรทัดแรก (ความเห็นหลัก)
                else if (o.type === 'textbox') { weight = '500'; sw = 0.45; }                           // ข้อความต่อจากบรรทัดแรก (ไม่ใช้ตัวหนาเกิน เพื่อไม่ให้ขึ้นบรรทัดใหม่ทับลายเซ็น)
                else { weight = '600'; sw = 0.3; }                                                      // ชื่อ/ตำแหน่ง/วันที่
                o.set({ fill: INK, stroke: INK, strokeWidth: sw, paintFirst: 'fill', fontWeight: weight, objectCaching: false });
            });
            g.set({ objectCaching: false });
            g.dirty = true;
            return true;
        };
        if (window.fabric && fabric.StaticCanvas && !fabric.__pcStampPatched) {
            fabric.__pcStampPatched = true;
            // ทุกครั้งที่โหลดข้อมูลตรา (เปิดหน้าลงนาม / ย้อนกลับ-ทำซ้ำ / สร้างภาพหนังสือ) ปรับสไตล์ตราของทุกคนก่อนวาด
            const origLoad = fabric.StaticCanvas.prototype.loadFromJSON;
            fabric.StaticCanvas.prototype.loadFromJSON = function (json, callback, reviver) {
                const self = this;
                return origLoad.call(this, json, function () {
                    try { self.getObjects().forEach(window.pcRestyleStamp); } catch (e) { /* ข้าม */ }
                    return callback && callback.apply(this, arguments);
                }, reviver);
            };
            // ตราที่เพิ่งประทับใหม่
            const origAdd = fabric.StaticCanvas.prototype.add;
            fabric.StaticCanvas.prototype.add = function () {
                try { for (let i = 0; i < arguments.length; i++) window.pcRestyleStamp(arguments[i]); } catch (e) { /* ข้าม */ }
                return origAdd.apply(this, arguments);
            };
        }

        /* ============================================================================
           [v48] iPad / แท็บเล็ต : เปิดแอปฝังในหน้าเว็บอื่น (เช่น Google Sites) แล้วหัวเว็บถูกบังด้านบน / ส่วนล่างหลุดจอ / เลื่อนเอกสารไม่ได้
           สาเหตุ : หน้าที่ฝังตั้งความสูง iframe เป็น vh (นับรวมพื้นที่แถบเครื่องมือของเบราว์เซอร์) -> iframe สูงกว่าพื้นที่ที่มองเห็นจริง
                    ส่วนบน/ล่างของแอปจึงอยู่นอกจอ และหน้าต่างเต็มจอ (ดูเอกสาร) ก็สูงเกินจอเช่นกัน
           วิธีแก้ : วัดว่า iframe "มองเห็นจริง" กี่พิกเซล (IntersectionObserver ใช้ได้ข้ามโดเมน) แล้วเลื่อนเนื้อหา/หัวเว็บ/หน้าต่างเต็มจอ
                    ให้อยู่ในส่วนที่มองเห็น ผ่านตัวแปร CSS --pc-top / --pc-bottom / --pc-vh  (เปิดในแท็บตรง ๆ ค่าเป็น 0 ไม่มีผล)
           ============================================================================ */
        (function pcFit() {
            const KEY = 'pc_fit_manual_v1';
            const root = document.documentElement;
            const cur = { t: 0, b: 0, h: 0, auto: { t: 0, b: 0 }, manual: { on: false, t: 0, b: 0 }, measured: false };
            window.PC_FIT = cur;
            if (window.self !== window.top) root.classList.add('pc-embedded');
            const clamp = (v) => Math.max(0, Math.min(300, Math.round(Number(v) || 0)));
            try {
                const m = JSON.parse(localStorage.getItem(KEY) || 'null');
                if (m && typeof m === 'object') cur.manual = { on: !!m.on, t: clamp(m.t), b: clamp(m.b) };
            } catch (e) { /* ข้าม */ }
            function save() { try { localStorage.setItem(KEY, JSON.stringify(cur.manual)); } catch (e) { /* ข้าม */ } }
            function paintPanel() {
                const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
                set('pc-fit-t', cur.t + ' px'); set('pc-fit-b', cur.b + ' px');
                set('pc-fit-auto', 'วัดอัตโนมัติได้: บน ' + cur.auto.t + ' / ล่าง ' + cur.auto.b + ' px' + (cur.measured ? '' : ' (เบราว์เซอร์นี้วัดไม่ได้)'));
                const a = document.getElementById('pc-fit-mode-auto'), m = document.getElementById('pc-fit-mode-manual');
                if (a && m) { a.style.background = cur.manual.on ? '#fff' : '#2563eb'; a.style.color = cur.manual.on ? '#475569' : '#fff'; m.style.background = cur.manual.on ? '#2563eb' : '#fff'; m.style.color = cur.manual.on ? '#fff' : '#475569'; }
            }
            function refresh() {
                const man = cur.manual.on;
                const t = man ? cur.manual.t : cur.auto.t, b = man ? cur.manual.b : cur.auto.b;
                cur.t = t; cur.b = b; cur.h = Math.max(200, window.innerHeight - t - b);
                root.style.setProperty('--pc-top', t + 'px');
                root.style.setProperty('--pc-bottom', b + 'px');
                if (t || b) root.style.setProperty('--pc-vh', cur.h + 'px'); else root.style.removeProperty('--pc-vh');
                try { if (location.hash.indexOf('pcfit-debug') >= 0) parent.postMessage({ pcfit: { t: t, b: b, h: cur.h, auto: cur.auto, measured: cur.measured } }, '*'); } catch (e) { /* ใช้ทดสอบเท่านั้น */ }
                paintPanel();
            }
            // ปรับเอง : ใช้เมื่อเบราว์เซอร์วัดพื้นที่มองเห็นให้ไม่ได้ (ตั้งในหน้า "ตั้งค่าข้อมูลผู้ใช้งาน")
            cur.setMode = function (manual) { cur.manual.on = !!manual; if (manual && !cur.manual.t && !cur.manual.b) { cur.manual.t = cur.auto.t; cur.manual.b = cur.auto.b; } save(); refresh(); };
            cur.step = function (which, d) { cur.manual.on = true; cur.manual[which] = clamp(cur.manual[which] + d); save(); refresh(); };
            cur.panelHtml = function () {
                const embedded = window.self !== window.top, touch = (navigator.maxTouchPoints || 0) > 1;
                if (!embedded && !touch) return '';
                const btn = 'width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-weight:800;color:#334155;cursor:pointer';
                const mode = 'flex:1;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:700;cursor:pointer';
                const row = (lb, id, key) => '<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span style="flex:1;font-size:11px;font-weight:700;color:#475569">' + lb + '</span>'
                    + '<button type="button" style="' + btn + '" onclick="PC_FIT.step(\'' + key + '\',-10)">−</button>'
                    + '<span id="' + id + '" style="min-width:52px;text-align:center;font-size:12px;font-weight:800;color:#0f172a">0 px</span>'
                    + '<button type="button" style="' + btn + '" onclick="PC_FIT.step(\'' + key + '\',10)">+</button></div>';
                return '<div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">'
                    + '<div style="font-size:11px;font-weight:800;color:#334155"><i class="fa-solid fa-tablet-screen-button"></i> การแสดงผลบนแท็บเล็ต / หน้าเว็บที่ฝังแอป</div>'
                    + '<div style="font-size:10.5px;color:#64748b;margin-top:2px">ถ้าหัวเว็บถูกบังด้านบน หรือส่วนล่างหลุดจอ ให้กด "กำหนดเอง" แล้วเพิ่มค่า "เว้นด้านบน/ล่าง" จนเห็นครบ</div>'
                    + '<div style="display:flex;gap:6px;margin-top:8px"><button type="button" id="pc-fit-mode-auto" style="' + mode + '" onclick="PC_FIT.setMode(false)">อัตโนมัติ</button><button type="button" id="pc-fit-mode-manual" style="' + mode + '" onclick="PC_FIT.setMode(true)">กำหนดเอง</button></div>'
                    + row('เว้นด้านบน', 'pc-fit-t', 't') + row('เว้นด้านล่าง', 'pc-fit-b', 'b')
                    + '<div id="pc-fit-auto" style="font-size:10px;color:#94a3b8;margin-top:6px"></div></div>';
            };
            cur.paintPanel = paintPanel;

            function observe() {
                if (window.self === window.top || !('IntersectionObserver' in window)) return;   // เปิดตรง ๆ ในแท็บ ไม่ต้องวัด
                const probe = document.createElement('div');
                probe.id = 'pc-vis-probe';
                probe.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:2px;pointer-events:none;opacity:0;z-index:-1';
                document.body.appendChild(probe);
                const io = new IntersectionObserver((entries) => {
                    const e = entries[entries.length - 1];
                    if (!e || !e.isIntersecting) return;
                    const H = e.boundingClientRect.height;
                    if (!H) return;
                    const t = Math.max(0, Math.round(e.intersectionRect.top - e.boundingClientRect.top));
                    const b = Math.max(0, Math.round(e.boundingClientRect.bottom - e.intersectionRect.bottom));
                    if (t + b > H * 0.7) return;                                          // ค่าผิดปกติ ไม่ใช้
                    cur.measured = true;
                    if (Math.abs(t - cur.auto.t) < 3 && Math.abs(b - cur.auto.b) < 3) return;   // ขยับน้อยกว่า 3px ไม่ต้องจัดใหม่ (กันสั่น)
                    cur.auto.t = t; cur.auto.b = b;
                    refresh();
                }, { threshold: Array.from({ length: 201 }, (_, i) => i / 200) });
                io.observe(probe);
            }
            function start() { refresh(); observe(); window.addEventListener('resize', refresh); }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
        })();

        /* หน้าต่าง SweetAlert2 เต็มจอ (ดูเอกสาร/ไฟล์ต้นฉบับ/ไฟล์แนบ) บน iOS : SweetAlert2 ล็อกการปัดนิ้ว (preventDefault) ทุกที่ที่ไม่ใช่กล่องเลื่อนได้
           -> ในหน้าที่ฝังอยู่ใน iframe การเลื่อนหน้าเอกสารจึงถูกบล็อก ; หน้าต่างเต็มจอไม่มีพื้นหลังให้กันอยู่แล้ว จึงปลดล็อกการปัดนิ้วออก */
        (function pcSwalTouch() {
            const unlock = (c) => {
                if (!c || c.__pcTouch) return;
                if (!c.querySelector('.pc-full-modal')) return;
                c.__pcTouch = true;
                c.ontouchstart = null;
                c.ontouchmove = null;
            };
            const mo = new MutationObserver((list) => {
                list.forEach(m => m.addedNodes.forEach(n => {
                    if (n.nodeType !== 1) return;
                    if (n.classList && n.classList.contains('swal2-container')) unlock(n);
                    else if (n.querySelectorAll) n.querySelectorAll('.swal2-container').forEach(unlock);
                }));
            });
            const go = () => mo.observe(document.body, { childList: true });
            if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
        })();

        /* ============================================================================
           [v50] แอปถูกฝังใน iframe (Google Sites) แล้วส่วนบนของแอปอยู่เหนือจอ : ให้แอป "พาตัวเองเข้ามาในจอ"
           การวัดพื้นที่ที่มองเห็น (IntersectionObserver) และการตั้งค่าเอง ต้องอาศัยเบราว์เซอร์/ผู้ใช้ -> ไม่เสถียรบน iPad
           วิธีนี้ใช้ scrollIntoView ซึ่งเลื่อนหน้าแม่ (หน้า Google Sites) ให้อัตโนมัติเมื่อ
             1) เปิดแอป / เข้าสู่ระบบสำเร็จ : เลื่อนให้ส่วนบนสุดของแอป (แถบเมนู) ขึ้นมาอยู่ที่ขอบบนของจอ
             2) เปิดหน้าต่าง/โมดอล : เลื่อนให้หน้าต่างอยู่กึ่งกลางส่วนที่มองเห็น
           เปิดแอปตรง ๆ ในแท็บ (ไม่ใช่ iframe) ไม่ทำงานส่วนนี้
           ============================================================================ */
        (function pcReveal() {
            if (window.self === window.top) return;
            const dbg = location.hash.indexOf('pcfit-debug') >= 0;
            const log = (m) => { if (dbg) { try { parent.postMessage({ pcreveal: m }, '*'); } catch (e) { /* ข้าม */ } } };
            function anchor() {
                let a = document.getElementById('pc-top-anchor');
                if (!a) {
                    a = document.createElement('div');
                    a.id = 'pc-top-anchor';
                    a.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;opacity:0';
                    document.body.appendChild(a);
                }
                return a;
            }
            function revealTop(why) {
                try { window.scrollTo(0, 0); anchor().scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' }); log('top:' + why); } catch (e) { /* ข้าม */ }
            }
            let lastModal = 0;
            function revealModal(el, why) {
                if (!el || Date.now() - lastModal < 250) return;
                lastModal = Date.now();
                try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); log('modal:' + why); } catch (e) { /* ข้าม */ }
            }
            window.pcRevealTop = revealTop;
            function start() {
                setTimeout(() => revealTop('load'), 700);
                // เข้าสู่ระบบสำเร็จ (แถบเมนูเพิ่งแสดง) -> พาส่วนบนเข้าจออีกครั้ง
                const nav = document.getElementById('main-navbar');
                if (nav) new MutationObserver(() => { if (!nav.classList.contains('hidden')) setTimeout(() => revealTop('login'), 400); }).observe(nav, { attributes: true, attributeFilter: ['class'] });
                // หน้าต่าง SweetAlert2 / โมดอลที่เขียนเอง (ซ่อนด้วยคลาส hidden)
                new MutationObserver((list) => {
                    for (const m of list) {
                        if (m.type === 'childList') {
                            m.addedNodes.forEach(n => {
                                if (n.nodeType !== 1) return;
                                const c = n.classList && n.classList.contains('swal2-container') ? n : (n.querySelector && n.querySelector('.swal2-container'));
                                if (c) setTimeout(() => revealModal(c.querySelector('.swal2-popup') || c, 'swal'), 60);
                            });
                        } else if (m.type === 'attributes') {
                            const t = m.target;
                            if (t.nodeType === 1 && t.classList.contains('fixed') && t.classList.contains('inset-0') && !t.classList.contains('hidden') && /(^|\s)hidden(\s|$)/.test(m.oldValue || '')) {
                                setTimeout(() => revealModal(t.firstElementChild || t, 'modal'), 60);
                            }
                        }
                    }
                }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
                if (dbg && location.hash.indexOf('pcfit-modal') >= 0) setTimeout(() => { try { Swal.fire({ title: 'ทดสอบโมดอล', html: '<div style="height:120px">x</div>' }); } catch (e) { /* ข้าม */ } }, 2500);
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
        })();
    