
(function () {
    'use strict';
    /* ที่มา : ภาพหนังสือ (currentImage) เป็นภาพต้นฉบับ ส่วนตราประทับเก็บแยกใน canvasState แล้ววาดทับตอนเปิดดู
       เซิร์ฟเวอร์วาดตราเองไม่ได้ จึงให้เบราว์เซอร์ของผู้ที่ประทับตราสร้างภาพที่มีตราตอน "ส่งต่อ" แล้วเก็บไว้ในหนังสือ
         stampedImage = ภาพทุกหน้าพร้อมตรา (กว้างไม่เกิน 1100px , JPEG)
         stampedCover = ภาพหน้า 1 พร้อมตรา (เฉพาะหนังสือที่ภาพยาวหลายหน้าต่อกัน และตรวจพบแถบคั่นหน้าชัดเจน)
       ถ้าสร้างไม่สำเร็จ (เช่น ภาพมาจากต่างโดเมนทำให้ canvas ถูกล็อก) จะข้ามเงียบ ๆ ไม่กระทบการส่งต่อ -> แจ้งเตือนใช้ภาพต้นฉบับแทน */
    const GAP = [226, 232, 240];            // สีแถบคั่นหน้าที่ระบบใช้ตอนต่อภาพ PDF หลายหน้า (#e2e8f0)
    const MAX_W = 1100, QUALITY = 0.72, TALL = 1.9;

    /** หาตำแหน่งเริ่มแถบคั่นหน้า (หน่วยพิกเซลของภาพต้นฉบับ) ; -1 = ไม่พบ */
    function findPageGap(bg) {
        const el = bg.getElement ? bg.getElement() : bg._element;
        if (!el) return -1;
        const nw = el.naturalWidth || el.width, nh = el.naturalHeight || el.height;
        if (!nw || !nh) return -1;
        const tw = Math.min(240, nw), sc = tw / nw, th = Math.max(1, Math.round(nh * sc));
        const c = document.createElement('canvas');
        c.width = tw; c.height = th;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(el, 0, 0, tw, th);
        const data = cx.getImageData(0, 0, tw, th).data;
        const isGapRow = (y) => {
            for (let x = 0; x < tw; x += 2) {
                const i = (y * tw + x) * 4;
                if (Math.abs(data[i] - GAP[0]) > 14 || Math.abs(data[i + 1] - GAP[1]) > 14 || Math.abs(data[i + 2] - GAP[2]) > 14) return false;
            }
            return true;
        };
        for (let y = Math.floor(th * 0.25); y < Math.floor(th * 0.75); y++) {
            if (isGapRow(y)) return Math.max(0, (y - 1) / sc);
        }
        return -1;
    }

    /** canvas = ผืนผ้าใบ fabric ที่ประทับตราเรียบร้อยแล้ว (ขนาด 100% ของภาพพื้นหลัง) ; doc = หนังสือ -> ใส่ doc.stampedImage / doc.stampedCover */
    window.pcStampShot = function (canvas, doc) {
        if (!canvas || !doc) return;
        const bg = canvas.backgroundImage;
        const cw = canvas.getWidth(), ch = canvas.getHeight();
        if (!bg || !(cw > 0) || !(ch > 0)) return;
        const m = Math.min(bg.width || cw, MAX_W) / cw;   // ความละเอียดเท่าภาพต้นฉบับ (ไม่เกิน 1100px) แม้ผืนผ้าใบถูกย่อตามหน้าจอ
        canvas.renderAll();
        const full = canvas.toDataURL({ format: 'jpeg', quality: QUALITY, multiplier: m });
        let cover = '';
        if (ch / cw >= TALL) {
            try {
                const gap = findPageGap(bg);
                if (gap > 0) {
                    const h1 = Math.round((bg.top || 0) + gap * (bg.scaleY || 1));
                    if (h1 > cw * 0.5 && h1 < ch * 0.9) cover = canvas.toDataURL({ format: 'jpeg', quality: QUALITY, multiplier: m, left: 0, top: 0, width: cw, height: h1 });
                }
            } catch (e) { cover = ''; }
        }
        doc.stampedImage = full;
        doc.stampedCover = cover;
    };

    /* [v78] สร้างภาพที่มีตราจาก "ข้อมูลตราที่บันทึกไว้" (canvasState) ไม่ต้องมีผืนผ้าใบเปิดอยู่ -> ใช้กับหนังสือที่ส่งต่อไปก่อน v76 หรือสร้างตอนส่งต่อไม่สำเร็จ */
    function loadImg(url) {
        return new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('โหลดภาพไม่ได้'));
            im.src = url;
        });
    }
    function gapRow(data, w, h) {
        const isGap = (y) => {
            for (let x = 0; x < w; x += 2) {
                const i = (y * w + x) * 4;
                if (Math.abs(data[i] - GAP[0]) > 14 || Math.abs(data[i + 1] - GAP[1]) > 14 || Math.abs(data[i + 2] - GAP[2]) > 14) return false;
            }
            return true;
        };
        for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y++) if (isGap(y)) return y;
        return -1;
    }
    /** คืน true เมื่อสร้างและใส่ doc.stampedImage / doc.stampedCover สำเร็จ */
    window.pcStampShotFromDoc = async function (docId) {
        if (!window.PC || !PC.prepareDocImage || !window.pcViewImg) return false;
        const doc = await PC.prepareDocImage(docId);
        if (!doc) throw new Error('โหลดข้อมูลตราหรือภาพจาก Google Drive ไม่สำเร็จ');
        if (typeof doc.canvasState !== 'string' || doc.canvasState.charAt(0) !== '{') throw new Error('ไม่มีข้อมูลตราประทับ');
        const url = window.pcViewImg(doc);
        if (!url || url.indexOf('data:image') !== 0 || url === doc.currentImage) throw new Error('สร้างภาพจากข้อมูลตราไม่ได้ (ข้อมูลตราไม่มีภาพพื้นหลังหรือไม่ครบ)');   // ได้ภาพต้นฉบับกลับมา
        const im = await loadImg(url);
        const nw = im.naturalWidth, nh = im.naturalHeight;
        if (!nw || !nh) throw new Error('ภาพที่สร้างว่างเปล่า');
        const w = Math.min(nw, MAX_W), h = Math.round(nh * w / nw);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(im, 0, 0, w, h);
        const full = c.toDataURL('image/jpeg', QUALITY);
        let cover = '';
        if (h / w >= TALL) {
            try {
                const y = gapRow(cx.getImageData(0, 0, w, h).data, w, h);
                const h1 = y - 2;
                if (y > 0 && h1 > w * 0.5 && h1 < h * 0.9) {
                    const c2 = document.createElement('canvas');
                    c2.width = w; c2.height = h1;
                    c2.getContext('2d').drawImage(c, 0, 0, w, h1, 0, 0, w, h1);
                    cover = c2.toDataURL('image/jpeg', QUALITY);
                }
            } catch (e) { cover = ''; }
        }
        doc.stampedImage = full;
        doc.stampedCover = cover;
        return true;
    };

    /** สร้างภาพที่มีตราให้หนังสือที่อยู่ระหว่างดำเนินการ (ขั้นตอน 2-98) ซึ่งยังไม่มี ; ข้ามหนังสือลับ (ไม่ส่งภาพทางแจ้งเตือนอยู่แล้ว) */
    const BF_FAILED = new Set();   // หนังสือที่สร้างไม่สำเร็จในรอบการใช้งานนี้ (ไม่ลองซ้ำอัตโนมัติ ; กดปุ่มเองจะลองใหม่)
    /** opt = { max : จำนวนสูงสุดต่อครั้ง , retry : ลองหนังสือที่เคยไม่สำเร็จซ้ำ } -> { total, ok, fail, reasons } */
    PC.backfillStampedImages = async function (onProgress, opt) {
        opt = opt || {};
        if (opt.retry) BF_FAILED.clear();
        let list = (typeof state !== 'undefined' && state.documentQueue ? state.documentQueue : []).filter((d) => d && Number(d.stage) >= 2 && Number(d.stage) < 99
            && (!d.secrecy || d.secrecy === 'normal') && !d.stampedImage && d.canvasState && !BF_FAILED.has(d.id));
        if (opt.max) list = list.slice(0, opt.max);
        let ok = 0, fail = 0;
        const reasons = {};
        for (let i = 0; i < list.length; i++) {
            try { if (await window.pcStampShotFromDoc(list[i].id)) ok++; else throw new Error('สร้างไม่สำเร็จ'); }
            catch (e) { fail++; BF_FAILED.add(list[i].id); const r = String((e && e.message) || e); reasons[r] = (reasons[r] || 0) + 1; console.warn('[PC] backfill', list[i].id, e); }
            if (onProgress) onProgress(i + 1, list.length, fail);
            if (ok && ok % 5 === 0 && PC.docSync && PC.docSync.schedule) PC.docSync.schedule(300);
        }
        if (ok && PC.docSync && PC.docSync.schedule) PC.docSync.schedule(300);
        return { total: list.length, ok: ok, fail: fail, reasons: reasons };
    };

    /* ผู้ดูแล/ธุรการที่เปิดระบบค้างไว้ : สร้างภาพที่มีตราให้หนังสือเดิมเบื้องหลังเอง (ครั้งละไม่เกิน 4 ฉบับ ทุก ~90 วินาที) ไม่ต้องกดปุ่ม */
    let bfBusy = false;
    setInterval(async () => {
        try {
            if (bfBusy || !window.PC || !PC.token || !PC.user || (PC.user.role !== 'ADMIN' && PC.user.role !== 'Administrative')) return;
            if (document.visibilityState !== 'visible' || (PC.docSync && PC.docSync.running)) return;
            bfBusy = true;
            const rs = await PC.backfillStampedImages(null, { max: 4 });
            if (rs.ok && PC.toast) PC.toast('success', 'สร้างภาพหนังสือที่มีตราสำหรับข้อความแจ้งเตือน ' + rs.ok + ' ฉบับ');
        } catch (e) { console.warn('[PC] auto backfill', e); }
        finally { bfBusy = false; }
    }, 90000);
})();
