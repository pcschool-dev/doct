
/* ============================================================================
   [ต.ค. 2569] ส่วนรหัสผ่านตามแนวทาง pcschool-pro-ui
   - pcPwUI : แถบความแข็งแรง + รายการกติกาที่ติ๊กเขียวระหว่างพิมพ์ + ปุ่มตา (.pcf-eye) ใช้ร่วมทุกหน้าต่างตั้งรหัสผ่าน
     กติกาตรงกับเซิร์ฟเวอร์ (pwRuleError_) ; หน้าเว็บแค่บอกล่วงหน้า เซิร์ฟเวอร์ตรวจซ้ำเสมอ
   - pcForgot : หน้าต่างตั้งรหัสผ่านใหม่ 3 ขั้น (แทน openForgotPasswordModal / requestOTP / submitOTP เดิม)
     ไม่บอกว่าอีเมลมี/ไม่มีบัญชี ; ข้อความผิดอยู่ใต้ช่อง ; รหัสผิดล้างช่องทันที (ห้ามหน่วง : คนพิมพ์ต่อเร็วจะโดนลบ)
   หมายเหตุ : Google ตัดคอมเมนต์ตอนส่งหน้าเว็บและตัดผิดในสตริงที่มีเครื่องหมายทับสองตัว จึงไม่เขียนลิงก์เต็มในสตริงของส่วนนี้
   ============================================================================ */
(function () {
  var COMMON = ['123456', '654321', '123123', '112233', '121212', '000000', '111111', '123321', '12345678', '123456789', '1234567890',
    '87654321', '11111111', '00000000', '12341234', 'password', 'passw0rd', 'password1', 'qwerty', 'qwerty123', 'abc123', 'abcd1234',
    'a1234567', 'iloveyou', 'admin', 'admin123', 'admin1234', 'welcome', 'welcome1', 'school', 'teacher', 'pcschool', 'pakchong', 'p@ssw0rd'];
  var RULES = [
    { t: 'อย่างน้อย 8 ตัว', f: function (v) { return v.length >= 8; } },
    { t: 'มีตัวอักษรผสม (ไม่ใช่ตัวเลขล้วน)', f: function (v) { return /\D/.test(v); } },
    { t: 'ไม่ใช่ตัวซ้ำ หรือรหัสที่ใช้กันทั่วไป', f: function (v) { return !!v && !/^(.)\1+$/.test(v) && COMMON.indexOf(v.toLowerCase()) < 0; } }
  ];
  function strength(v) {
    if (!v) return 0;
    var ok = RULES.every(function (r) { return r.f(v); });
    if (!ok) return 1;
    var s = 2;
    if (v.length >= 12) s++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v) || /[^A-Za-z0-9]/.test(v)) s++;
    return Math.min(4, s);
  }
  var LABEL = ['', 'อ่อนมาก', 'พอใช้', 'ดี', 'ดีมาก'];
  window.pcPwUI = {
    /** HTML แถบ + รายการกติกา ใต้ช่อง id */
    block: function (id) {
      return '<div class="pcf-meter" id="' + id + 'Meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>' +
        '<ul class="pcf-rules" id="' + id + 'Rules">' + RULES.map(function (r) { return '<li>' + r.t + '</li>'; }).join('') + '</ul>';
    },
    bind: function (id) {
      var inp = document.getElementById(id);
      if (!inp || inp.dataset.pcPwBound) return;
      inp.dataset.pcPwBound = '1';
      var upd = function () {
        var v = inp.value || '', m = document.getElementById(id + 'Meter'), ul = document.getElementById(id + 'Rules');
        if (m) { var s = strength(v); m.setAttribute('data-s', String(s)); m.querySelector('span').textContent = LABEL[s]; }
        if (ul) Array.prototype.forEach.call(ul.children, function (li, i) { li.classList.toggle('is-ok', RULES[i].f(v)); });
      };
      inp.addEventListener('input', upd);
      upd();
    }
  };
  /* ปุ่มตา : ผูกครั้งเดียวที่ document (ใช้ได้กับหน้าต่าง SweetAlert ที่สร้างทีหลังด้วย) */
  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('.pcf-eye') : null;
    if (!b) return;
    var inp = document.getElementById(b.getAttribute('data-for'));
    if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', show ? 'true' : 'false');
    b.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    var ic = b.querySelector('i'); if (ic) ic.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    inp.focus();
  }, true);

  /* ---------------------------------------------------------------- pcForgot */
  var $ = function (id) { return document.getElementById(id); };
  var TTL = 600, WAIT = 60;
  var st = { email: '', pw: '', end: 0, tick: 0, waitEnd: 0, busy: false, userId: '', dead: '' };
  function digits(s) {
    return String(s || '').replace(/[๐-๙]/g, function (c) { return String(c.charCodeAt(0) - 0x0E50); })
      .replace(/[０-９]/g, function (c) { return String(c.charCodeAt(0) - 0xFF10); }).replace(/\D/g, '');
  }
  function call(action, payload) {
    if (!window.PC || typeof PC.api !== 'function') return Promise.reject(new Error('ระบบยังโหลดไม่เสร็จ รอสักครู่แล้วลองใหม่'));
    return PC.api(action, payload, { retries: 0, noAuthRedirect: true, timeout: 30000 });
  }
  function fieldErr(id, msg) {
    var inp = $(id), p = $(id + 'Err');
    if (!inp || !p) return;
    if (msg) {
      p.textContent = '';
      var ic = document.createElement('i'); ic.className = 'fa-solid fa-circle-exclamation'; ic.style.marginTop = '3px'; ic.setAttribute('aria-hidden', 'true');
      var tx = document.createElement('span'); tx.textContent = msg;
      p.appendChild(ic); p.appendChild(tx); p.hidden = false; inp.setAttribute('aria-invalid', 'true');
    } else { p.hidden = true; p.textContent = ''; inp.removeAttribute('aria-invalid'); }
  }
  function status(n, msg, tone) { var el = $('pcfStatus' + n); if (!el) return; el.textContent = msg || ''; el.className = 'pcf-status' + (msg ? ' is-' + (tone || 'info') : ''); }
  function step(n) {
    $('pcfStep1').hidden = n !== 1; $('pcfStep2').hidden = n !== 2; $('pcfStep3').hidden = n !== 3;
    $('pcfS1').className = n === 1 ? 'is-cur' : 'is-done';
    $('pcfS2').className = n === 2 ? 'is-cur' : (n === 3 ? 'is-done' : '');
    $('pcfTitle').textContent = n === 3 ? 'เรียบร้อยแล้ว' : 'ตั้งรหัสผ่านใหม่';
  }
  function busyBtn(btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.busy = '1'; btn.dataset.txt = btn.textContent; btn.textContent = text; btn.disabled = true; }
    else { delete btn.dataset.busy; if (btn.dataset.txt) btn.textContent = btn.dataset.txt; btn.disabled = false; }
  }
  function stopTimers() { clearInterval(st.tick); st.tick = 0; }
  function fmt(sec) { sec = Math.max(0, sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function startTimers() {
    stopTimers();
    st.end = Date.now() + TTL * 1000; st.dead = '';
    st.waitEnd = Date.now() + WAIT * 1000;
    var run = function () {
      var left = Math.round((st.end - Date.now()) / 1000);
      $('pcfTimer').textContent = fmt(left);
      $('pcfTimerBox').classList.toggle('is-low', left < 60);
      var w = Math.round((st.waitEnd - Date.now()) / 1000), rb = $('pcfResend');
      if (!rb.dataset.busy) { rb.disabled = w > 0; rb.textContent = w > 0 ? 'ส่งรหัสใหม่ (' + w + ')' : 'ส่งรหัสใหม่'; }
      if (left <= 0) {
        $('pcfTimerBox').hidden = true;
        $('pcfCode').disabled = true; $('pcfVerify').disabled = true;
        status(2, st.dead || 'รหัสหมดอายุแล้ว กด "ส่งรหัสใหม่"', 'bad');
        if (w <= 0) { stopTimers(); rb.disabled = false; rb.textContent = 'ส่งรหัสใหม่'; }
      }
    };
    $('pcfTimerBox').hidden = false; $('pcfCode').disabled = false; $('pcfVerify').disabled = false;
    run();
    st.tick = setInterval(run, 1000);
  }
  function paintOtp() {
    var inp = $('pcfCode'), v = digits(inp.value).slice(0, 6);
    if (inp.value !== v) inp.value = v;
    var cells = $('pcfOtp').querySelectorAll('.pcf-otp-cell');
    Array.prototype.forEach.call(cells, function (c, i) {
      c.textContent = v[i] || ''; c.classList.toggle('has', !!v[i]); c.classList.toggle('is-cur', i === Math.min(v.length, 5));
    });
    return v;
  }
  function otpBad() {
    var box = $('pcfOtp');
    $('pcfCode').value = ''; paintOtp();
    box.classList.remove('is-bad'); void box.offsetWidth; box.classList.add('is-bad');
    $('pcfCode').focus();
  }

  var api = {
    open: function () {
      var m = $('pcForgot'); if (!m) return;
      m.hidden = false; step(1); status(1, ''); fieldErr('pcfEmail'); fieldErr('pcfPw');
      if (window.PC && typeof PC.gwReport === 'function') PC.gwReport();   /* ซ่อนปุ่ม Google ของหน้าครอบที่ลอยทับ */
      $('pcfPw').value = ''; window.pcPwUI.bind('pcfPw'); $('pcfPw').dispatchEvent(new Event('input'));
      setTimeout(function () { $('pcfEmail').focus(); }, 50);
    },
    close: function () {
      if (st.busy) return;
      stopTimers();
      var m = $('pcForgot'); if (m) m.hidden = true;
      if (window.PC && typeof PC.gwReport === 'function') PC.gwReport();
      $('pcfPw').value = ''; $('pcfCode').value = ''; st.pw = '';   /* ไม่เก็บรหัสค้างในหน้า */
    },
    back: function () { stopTimers(); status(2, ''); step(1); $('pcfEmail').focus(); },
    send: async function (isResend) {
      if (st.busy) return;
      var email = isResend ? st.email : String($('pcfEmail').value || '').trim().toLowerCase();
      var pw = isResend ? st.pw : String($('pcfPw').value || '');
      if (!isResend) {
        fieldErr('pcfEmail'); fieldErr('pcfPw'); status(1, '');
        var bad = false;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { fieldErr('pcfEmail', email ? 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@pcschool.ac.th' : 'กรอกอีเมลที่ลงทะเบียนไว้ในระบบ'); bad = true; }
        var pwBad = window.pcPwRule ? window.pcPwRule(pw, email.split('@')[0]) : (pw ? null : 'ตั้งรหัสผ่านใหม่');
        if (pwBad) { fieldErr('pcfPw', pwBad); bad = true; }
        if (bad) { ($('pcfEmail').getAttribute('aria-invalid') ? $('pcfEmail') : $('pcfPw')).focus(); return; }
      }
      st.busy = true;
      var btn = isResend ? $('pcfResend') : $('pcfSend');
      busyBtn(btn, true, 'กำลังส่ง…');
      try {
        await call('requestOtp', { email: email, newPassword: pw });
        st.email = email; st.pw = pw;
        $('pcfTo').textContent = email;
        step(2); $('pcfCode').value = ''; paintOtp(); $('pcfOtp').classList.remove('is-bad', 'is-ok');
        status(2, isResend ? 'ส่งรหัสใหม่แล้ว รหัสเดิมใช้ไม่ได้' : '', isResend ? 'ok' : 'info');
        startTimers();
        setTimeout(function () { $('pcfCode').focus(); }, 50);
      } catch (e) {
        var msg = (e && e.message) || 'ส่งไม่สำเร็จ เน็ตอาจหลุด ลองกดส่งอีกครั้ง — ข้อมูลที่กรอกยังอยู่';
        if (isResend) status(2, msg, 'bad');
        else if (e && e.code === 'VALIDATION' && /อีเมล/.test(msg)) { fieldErr('pcfEmail', msg); $('pcfEmail').focus(); }
        else if (e && e.code === 'VALIDATION') { fieldErr('pcfPw', msg); $('pcfPw').focus(); }
        else status(1, msg, 'bad');
      } finally {
        st.busy = false; busyBtn(btn, false);
        if (st.tick) { var w0 = Math.round((st.waitEnd - Date.now()) / 1000), rb0 = $('pcfResend'); if (w0 > 0) { rb0.disabled = true; rb0.textContent = 'ส่งรหัสใหม่ (' + w0 + ')'; } }
      }
    },
    resend: function () { return api.send(true); },
    verify: async function () {
      if (st.busy) return;
      var code = paintOtp();
      if (code.length !== 6) { status(2, 'กรอกรหัสยืนยันให้ครบ 6 หลัก', 'bad'); $('pcfCode').focus(); return; }
      st.busy = true;
      $('pcfOtp').setAttribute('aria-busy', 'true'); busyBtn($('pcfVerify'), true, 'กำลังตรวจรหัส…');
      status(2, 'กำลังตรวจรหัส…', 'info');
      try {
        var out = await call('verifyOtp', { email: st.email, otp: code });
        stopTimers();
        $('pcfOtp').classList.add('is-ok');
        st.userId = (out && out.userId) || ''; st.pw = '';
        status(2, '');
        step(3);
      } catch (e) {
        var msg = (e && e.message) || 'ตรวจรหัสไม่สำเร็จ เน็ตอาจหลุด ลองอีกครั้ง';
        status(2, msg, 'bad');
        otpBad();
        if (e && e.code === 'EXPIRED') { st.dead = msg; st.end = Date.now(); }
      } finally {
        st.busy = false; $('pcfOtp').removeAttribute('aria-busy'); busyBtn($('pcfVerify'), false);
      }
    },
    finish: function () {
      var uid = st.userId;
      api.close();
      if (window.PC && typeof PC.openPwSection === 'function') PC.openPwSection();
      var u = $('login-userid'), p = $('login-password');
      if (u && uid) u.value = uid;
      if (p) { p.value = ''; setTimeout(function () { p.focus(); }, 80); }
      if (window.PC && typeof PC.toast === 'function') PC.toast('success', 'กรอกรหัสผ่านใหม่เพื่อเข้าสู่ระบบ');
    }
  };
  window.pcForgot = api;
  /* [ต.ค. 2569] ลืมรหัสผ่าน : เปิดการเชื่อมต่อบัญชีผู้ใช้กลางแล้ว (authConfig.center) -> ไปหน้าระบบกลาง พร้อมชื่อผู้ใช้ที่พิมพ์ไว้
     (ยืนยันตัวตนด้วย Google / LINE / อีเมลโรงเรียน, บอกชื่อผู้ใช้ทุกระบบ, ตั้งรหัสครั้งเดียวได้หลายระบบ)
     ยังไม่เปิด = หน้าต่างของระบบนี้ (pcForgot) — ทางสำรองเมื่อระบบกลางยังไม่ตั้งค่า */
  window.openForgotPasswordModal = function () {
    var cfg = (window.PC && typeof PC.getAuthCfg === 'function') ? PC.getAuthCfg() : null;
    var url = cfg && typeof cfg.center === 'string' && /^https:/.test(cfg.center) ? cfg.center : '';
    if (!url) { api.open(); return; }
    var uEl = $('login-userid'), u = uEl ? String(uEl.value || '').trim() : '';
    if (u) url += '&u=' + encodeURIComponent(u);
    if (window.PC && typeof PC.gwGoTop === 'function') PC.gwGoTop(url); else location.href = url;
  };
  /* กลับจากตั้งรหัสที่บัญชีผู้ใช้กลาง : ?acctlogin=<ตั๋วใช้ครั้งเดียว> -> เข้าสู่ระบบให้เลย (เซสชันไม่จดจำ) ; คืน true ถ้าจัดการแล้ว */
  PC.handleAcctLogin = function () {
    var t = '';
    try { t = new URLSearchParams(location.search).get('acctlogin') || ''; } catch (e) { t = ''; }
    if (!t) return false;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ข้าม */ }
    (async function () {
      try {
        var res = await call('acctLogin', { ticket: t });
        await PC.completeLogin(res, { remember: false });
        if (typeof PC.toast === 'function') PC.toast('success', 'ตั้งรหัสผ่านใหม่และเข้าสู่ระบบแล้ว');
      } catch (e) {
        if (typeof PC.openPwSection === 'function') PC.openPwSection();
        if (window.Swal) Swal.fire({ icon: 'info', title: 'เข้าสู่ระบบด้วยรหัสผ่านที่เพิ่งตั้ง', text: (e && e.message) || 'ลิงก์นี้ใช้ไม่ได้แล้ว', width: 'min(420px, 94vw)', confirmButtonText: 'เข้าใจแล้ว' });
      }
    })();
    return true;
  };
  window.closeForgotPasswordModal = api.close;

  function init() {
    var ui = $('pcfPwUi'); if (ui) ui.innerHTML = window.pcPwUI.block('pcfPw');
    var code = $('pcfCode'), box = $('pcfOtp');
    if (code) {
      code.addEventListener('input', function () {
        box.classList.remove('is-bad', 'is-ok');
        var v = paintOtp();
        if (v.length === 6) api.verify();   /* ครบ 6 หลัก ตรวจเอง ไม่ต้องกดปุ่ม */
      });
      code.addEventListener('focus', function () { box.classList.add('is-focus'); paintOtp(); });
      code.addEventListener('blur', function () { box.classList.remove('is-focus'); });
    }
    ['pcfEmail', 'pcfPw'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('input', function () { fieldErr(id); }); });
    var em = $('pcfEmail');
    if (em) em.addEventListener('blur', function () {
      var v = String(em.value || '').trim();
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) fieldErr('pcfEmail', 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@pcschool.ac.th');
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && $('pcForgot') && !$('pcForgot').hidden) api.close();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
