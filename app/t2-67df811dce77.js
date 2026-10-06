
        // State Management 
        let state = {
            user: { id: '', role: '', name: '', email: '', image: '' },
            canvases: {},
            documentQueue: [], 
            activeDocIds: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 65: null, 7: null, 8: null },
            assignments: [], // เก็บข้อมูลประกาศ/งาน
            calendarEvents: [], // เพิ่มตัวแปรเก็บกิจกรรมปฏิทินที่สร้างใหม่
            showHiddenAnnouncements: false,
            replyingTo: {}
        };
        const REACTION_EMOJIS = { 'like': '👍', 'love': '❤️', 'haha': '😆', 'wow': '😯', 'sad': '😢', 'angry': '😡' };
		
		// บังคับแทนที่ค่า textBaseline เพื่อแก้บั๊กแจ้งเตือนของ Fabric.js
		fabric.Text.prototype.textBaseline = 'alphabetic';
		fabric.Textbox.prototype.textBaseline = 'alphabetic';
		
		// บังคับแทนที่ค่า textBaseline เพื่อแก้บั๊กแจ้งเตือนของ Fabric.js
		if (window.fabric) {
			fabric.Text.prototype.textBaseline = 'alphabetic';
			fabric.IText.prototype.textBaseline = 'alphabetic';
			fabric.Textbox.prototype.textBaseline = 'alphabetic';
		}

        let sigPads = {};
        let storedSignatures = {}; 
        let currentThaiYear = new Date().getFullYear() + 543;
        let defaultRooms = []; // ย้ายมาเป็น Global Variable
		
		
		// ==========================================
        // ฟังก์ชันควบคุมตัวเลขแจ้งเตือน ข้อความ/กิจกรรม
        // ==========================================
        function updateActivitiesBadge(count) {
            const navBadge = document.getElementById('nav-message-badge');
            const tabBadge = document.getElementById('activities-tab-badge');
            
            if (count > 0) {
                if (navBadge) { navBadge.innerText = count; navBadge.classList.remove('hidden'); }
                if (tabBadge) { tabBadge.innerText = count; tabBadge.classList.remove('hidden'); }
            } else {
                if (navBadge) navBadge.classList.add('hidden');
                if (tabBadge) tabBadge.classList.add('hidden');
            }
        }
		
		
		// ==========================================
        // ตัวแปรและฟังก์ชันระบบ Pagination
        // ==========================================
        let alldocsCurrentPage = 1;
        let alldocsShowAll = false;
        let alldocsItemsPerPage = 10; // เพิ่มตัวแปรสำหรับ Dropdown
        let inboxCurrentPage = 1;
        let inboxShowAll = false;

        function changePage(type, page) {
            if (type === 'alldocs') { alldocsCurrentPage = page; renderAllDocsList(); }
            if (type === 'inbox') { inboxCurrentPage = page; renderInboxList(); }
        }

        function toggleShowAll(type, showAll) {
            if (type === 'alldocs') { alldocsShowAll = showAll; alldocsCurrentPage = 1; renderAllDocsList(); }
            if (type === 'inbox') { inboxShowAll = showAll; inboxCurrentPage = 1; renderInboxList(); }
        }
		
		
		// ฟังก์ชันรับค่าจาก Dropdown เปลี่ยนจำนวนหน้า
        function changeItemsPerPage(val) {
            if (val === 'all') {
                alldocsShowAll = true; // เปิดโหมดแสดงทั้งหมด
            } else {
                alldocsItemsPerPage = parseInt(val);
                alldocsShowAll = false; // ปิดโหมดแสดงทั้งหมดเพื่อใช้การแบ่งหน้า
            }
            alldocsCurrentPage = 1; // กลับไปหน้าแรกเสมอเมื่อเปลี่ยนจำนวนแสดงผล
            renderAllDocsList();
        }

        // ฟังก์ชันสร้างกล่องควบคุม Pagination และ Dropdown ใต้บรรทัด ทะเบียนหนังสือรับ
        function renderAllDocsControls(totalPages) {
            const ctrl = document.getElementById('alldocs-controls');
            if (!ctrl) return;

            let totalItems = (window.currentAllDocsFiltered || []).length;

            // เงื่อนไข: แสดงแถบ Pagination เมื่อมีรายการหนังสือ 5 รายการขึ้นไป (ถ้าน้อยกว่า 5 รายการ ให้ซ่อน)
            if (totalItems < 2) {
                ctrl.innerHTML = '';
                ctrl.classList.add('hidden');
                return;
            }
            ctrl.classList.remove('hidden');

            let currentPage = alldocsCurrentPage;
            let isShowAll = alldocsShowAll;

            // ตัวเลือก Dropdown แสดงรายการ
            let selectDropdownHtml = `
                <div class="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                    <span>แสดง</span>
                    <select onchange="changeItemsPerPage(this.value)" class="px-2 py-1 border border-slate-300 rounded-lg bg-white text-xs font-bold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 shadow-xs">
                        <option value="5" ${!isShowAll && alldocsItemsPerPage === 5 ? 'selected' : ''}>5</option>
                        <option value="10" ${!isShowAll && alldocsItemsPerPage === 10 ? 'selected' : ''}>10</option>
                        <option value="20" ${!isShowAll && alldocsItemsPerPage === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${!isShowAll && alldocsItemsPerPage === 50 ? 'selected' : ''}>50</option>
                        <option value="all" ${isShowAll ? 'selected' : ''}>ทั้งหมด</option>
                    </select>
                    <span>รายการ</span>
                </div>
            `;

            if (isShowAll) {
                ctrl.innerHTML = `
                    <div class="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm w-full gap-2 mb-4">
                        ${selectDropdownHtml}
                        <button onclick="toggleShowAll('alldocs', false)" class="text-blue-600 text-xs font-bold hover:underline">ย้อนกลับไปแสดงแบบแบ่งหน้า</button>
                    </div>
                `;
                return;
            }

            // ปุ่มตัวเลขหน้า 1, 2, ...
            let pageButtonsHtml = '';
            for (let i = 1; i <= totalPages; i++) {
                let activeClass = i === currentPage ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                pageButtonsHtml += `<button onclick="changePage('alldocs', ${i})" class="w-8 h-8 rounded-lg text-xs font-bold transition shadow-sm ${activeClass}">${i}</button>`;
            }

            ctrl.innerHTML = `
                <div class="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm w-full gap-2 mb-4">
                    <!-- ฝั่งซ้าย: Dropdown แสดงจำนวนรายการ + ข้อความบอกหน้า -->
                    <div class="flex items-center gap-3">
                        ${selectDropdownHtml}
                        <span class="text-slate-300">|</span>
                        <span class="text-xs text-slate-500 font-bold">หน้า ${currentPage} จาก ${totalPages}</span>
                    </div>

                    <!-- ฝั่งขวา: ปุ่มตัวเลขหน้า และ ปุ่มแสดงทั้งหมด -->
                    <div class="flex items-center gap-3">
                        <div class="flex gap-1 flex-wrap justify-center">
                            ${pageButtonsHtml}
                        </div>
                        <button onclick="toggleShowAll('alldocs', true)" class="text-blue-600 text-xs font-bold hover:underline">แสดงทั้งหมด</button>
                    </div>
                </div>
            `;
        }

        // ฟังก์ชันสำหรับปุ่ม Copy / Excel / Print (เพิ่มคอลัมน์กลุ่มบริหาร, กลุ่มงาน, ผู้รับผิดชอบ และใส่ ' นำหน้าทะเบียนรับ)
        function exportAllDocs(type) {
            let items = window.currentAllDocsFiltered || [];
            if(items.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลสำหรับส่งออก', 'warning');

            // 1. กำหนดหัวตาราง 11 คอลัมน์ เรียงต่อจาก "ถึง"
            let header = ['ลำดับ', 'ทะเบียนรับ', 'ที่', 'ลงวันที่', 'เรื่อง', 'จาก', 'ถึง', 'กลุ่มบริหาร', 'กลุ่มงาน', 'ผู้รับผิดชอบ', 'สถานะ'];
            
            const bannerEl = document.getElementById('banner-room-name');
            const currentRoomName = bannerEl ? bannerEl.innerText : '';
            const isMainGroup = currentRoomName.includes('กลุ่มบริหาร');

            // 2. แปลงข้อมูลแต่ละแถว
            let data = items.map((doc, idx) => {
                // หาเลขทะเบียนรับตามสิทธิ์ของห้อง
                let recNo = doc.receiveNo || '-';
                if (currentRoomName.includes('กลุ่มงาน') && doc.subgroupReceiveNo) recNo = doc.subgroupReceiveNo;
                else if (isMainGroup && doc.groupReceiveNo) recNo = doc.groupReceiveNo;

                // ข้อ 2: จัดรูปแบบเลขทะเบียนรับเป็นข้อความ โดยใส่เครื่องหมาย ' นำหน้า (เช่น '1/2569)
                let recNoFormatted = (recNo && recNo !== '-') ? (String(recNo).startsWith("'") ? recNo : `'${recNo}`) : '-';

                // ข้อ 1.1: ดึงกลุ่มบริหาร จากข้อ 10. หมวดหมู่หนังสือ (doc.category)
                let mainGroup = '-';
                if (doc.category && Array.isArray(doc.category) && doc.category.length > 0) {
                    mainGroup = doc.category.join(', ');
                } else if (typeof doc.category === 'string' && doc.category.trim()) {
                    mainGroup = doc.category.trim();
                } else if (doc.assignedGroups && doc.assignedGroups.length > 0) {
                    mainGroup = doc.assignedGroups.join(', ');
                }

                // ข้อ 1.2: ดึงกลุ่มงานย่อย (doc.subGroups)
                let subGroup = '-';
                if (doc.subGroups && Array.isArray(doc.subGroups) && doc.subGroups.length > 0) {
                    subGroup = doc.subGroups.join(', ');
                } else if (typeof doc.subGroups === 'string' && doc.subGroups.trim()) {
                    subGroup = doc.subGroups.trim();
                }

                // ข้อ 1.3: ดึงผู้รับผิดชอบ (doc.assigneeName)
                let assignee = doc.assigneeName || doc.assignee || '-';

                let status = doc.stage === 99 ? 'เสร็จสิ้น' : 'กำลังดำเนินการ';

                return [
                    idx + 1,
                    recNoFormatted,
                    doc.docNo || '-',
                    doc.docDate || '-',
                    doc.subject || doc.title || '-',
                    doc.sender || '-',
                    doc.recipient || '-',
                    mainGroup,
                    subGroup,
                    assignee,
                    status
                ];
            });

            // 3. จัดการส่งออกตามประเภทที่เลือก
            if (type === 'copy') {
                let text = header.join('\t') + '\n' + data.map(row => row.join('\t')).join('\n');
                navigator.clipboard.writeText(text).then(() => {
                    Swal.fire({ icon: 'success', title: 'คัดลอกข้อมูลลงคลิปบอร์ดแล้ว', text: 'คอลัมน์ทะเบียนรับมีเครื่องหมาย \' เพื่อคงรูปแบบข้อความใน Excel', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                });
            } else if (type === 'excel') {
                let csvContent = "\uFEFF" + header.join(',') + '\n' + data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
                let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                let url = URL.createObjectURL(blob);
                let link = document.createElement('a');
                link.href = url;
                link.download = 'ทะเบียนหนังสือรับ.csv';
                link.click();
            } else if (type === 'print') {
                let printWin = window.open('', '_blank');
                let tableHtml = '<table style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 11px; text-align: left;" border="1">';
                tableHtml += '<thead style="background:#f1f5f9;"><tr>' + header.map(h => `<th style="padding:6px 8px; white-space: nowrap;">${h}</th>`).join('') + '</tr></thead>';
                tableHtml += '<tbody>' + data.map(row => '<tr>' + row.map((cell, cIdx) => {
                    // สำหรับหน้าพิมพ์ ตัดเครื่องหมาย ' ออกเพื่อให้ดูเป็นทางการ สวยงามบนหน้ากระดาษ
                    let displayVal = (cIdx === 1 && typeof cell === 'string' && cell.startsWith("'")) ? cell.substring(1) : cell;
                    return `<td style="padding:6px 8px;">${displayVal}</td>`;
                }).join('') + '</tr>').join('') + '</tbody></table>';
                
                // กำหนด @page size: landscape เพื่อให้พิมพ์แนวนอนพอดีกระดาษ A4
                printWin.document.write(`
                    <html>
                        <head>
                            <title>พิมพ์ทะเบียนหนังสือรับ</title>
                            <style>
                                @page { size: landscape; margin: 10mm; }
                                body { font-family: 'Sarabun', sans-serif; padding: 10px; }
                                th, td { border: 1px solid #cbd5e1; }
                            </style>
                        </head>
                        <body>
                            <h2 style="text-align: center; margin-bottom: 12px; font-size: 16px;">ทะเบียนหนังสือรับ</h2>
                            ${tableHtml}
                        </body>
                    </html>
                `);
                printWin.document.close();
                printWin.focus();
                setTimeout(() => { printWin.print(); printWin.close(); }, 250);
            }
        }

		
		
		

        function buildPaginationUI(type, currentPage, totalPages, isShowAll) {
            if (isShowAll) {
                return `<div class="mt-4 flex justify-center w-full col-span-full"><button onclick="toggleShowAll('${type}', false)" class="text-blue-600 text-sm hover:underline bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">ย้อนกลับไปแสดงแบบแบ่งหน้า</button></div>`;
            }
            if (totalPages <= 1) return '';
            
            let html = `<div class="mt-6 flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm w-full col-span-full">`;
            html += `<span class="text-xs text-slate-500 font-bold">หน้า ${currentPage} จาก ${totalPages}</span>`;
            html += `<div class="flex gap-1 flex-wrap justify-center">`;
            for (let i = 1; i <= totalPages; i++) {
                let activeClass = i === currentPage ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                html += `<button onclick="changePage('${type}', ${i})" class="w-8 h-8 rounded-lg text-xs font-bold transition shadow-sm ${activeClass}">${i}</button>`;
            }
            html += `</div>`;
            html += `<button onclick="toggleShowAll('${type}', true)" class="text-blue-600 text-xs font-bold hover:underline">แสดงทั้งหมด</button>`;
            html += `</div>`;
            return html;
        }

        const thaiDigits = { '0':'๐', '1':'๑', '2':'๒', '3':'๓', '4':'๔', '5':'๕', '6':'๖', '7':'๗', '8':'๘', '9':'๙' };
        function toThaiNum(str) {
            if (!str) return '';
            return str.toString().split('').map(char => thaiDigits[char] || char).join('');
        }
        function getThaiDate() {
            const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
            const d = new Date();
            return `${toThaiNum(d.getDate().toString())} / ${months[d.getMonth()]} / ${toThaiNum((d.getFullYear() + 543).toString())}`;
        }

			 /* [v40 ข้อ 3] จำรหัสผ่านไว้ใน localStorage ตราบใดที่ยังติ๊ก "จำรหัสผ่าน/การเข้าสู่ระบบ"
			    - เก็บเฉพาะเมื่อเข้าสู่ระบบสำเร็จ , เอาเครื่องหมายออก = ลบรหัสผ่านที่จำไว้ทันที
			    - เป็นเพียงการแปลงรหัส (base64) ไม่ใช่การเข้ารหัส : ใครเปิด DevTools ของเครื่องนี้ก็อ่านได้ ควรใช้กับเครื่องส่วนตัวเท่านั้น */
			 const SAVED_PW_KEY = 'pc_saved_pw_v1';
			 window.pcSavePassword = function (pw) {
				 try { localStorage.setItem(SAVED_PW_KEY, btoa(unescape(encodeURIComponent(String(pw))))); } catch (e) { /* ข้าม */ }
			 };
			 window.pcForgetPassword = function () {
				 try { localStorage.removeItem(SAVED_PW_KEY); } catch (e) { /* ข้าม */ }
			 };
			 /* ใส่รหัสผู้ใช้ + รหัสผ่านที่จำไว้กลับลงฟอร์ม (เรียกตอนเปิด/รีเฟรชหน้า และตอนออกจากระบบ) */
			 window.pcRestoreLogin = function () {
				 try {
					 if (localStorage.getItem('savedRememberMe') !== 'true') return;
					 const idInput = document.getElementById('login-userid');
					 const pwInput = document.getElementById('login-password');
					 const remCb = document.getElementById('rememberMe');
					 const savedId = localStorage.getItem('savedUserId');
					 if (savedId && idInput) idInput.value = savedId;
					 if (remCb) remCb.checked = true;
					 const raw = localStorage.getItem(SAVED_PW_KEY);
					 if (raw && pwInput) pwInput.value = decodeURIComponent(escape(atob(raw)));
				 } catch (e) { /* ข้าม */ }
			 };
			 window.pcRememberToggle = function (cb) {
				 if (cb && cb.checked) return;
				 // เอาเครื่องหมายออก -> ลืมทั้งรหัสผู้ใช้/รหัสผ่านที่จำไว้ในเครื่องนี้
				 window.pcForgetPassword();
				 try { localStorage.removeItem('savedUserId'); localStorage.removeItem('savedRememberMe'); } catch (e) { /* ข้าม */ }
			 };

			 window.onload = () => {
					if(document.getElementById('receiveYear')) document.getElementById('receiveYear').value = currentThaiYear;

					// [ข้อ 17/19] กู้คืนรหัสผู้ใช้ที่เคยบันทึกไว้ (ไม่มีช่องบทบาทแล้ว) + [v40] รหัสผ่านที่จำไว้
					window.pcRestoreLogin();

					// สร้างโจทย์ Captcha ใหม่เสมอเมื่อเปิดหน้าเว็บ
					generateCaptcha();
					
					
					defaultRooms = [
						{ id: 'ROOM_00', name: 'ห้องสารบรรณกลาง', color: 'from-slate-700 to-slate-900' },
						{ id: 'ROOM_01', name: 'กลุ่มบริหารวิชาการ', color: 'from-rose-500 to-red-600' },
						{ id: 'ROOM_02', name: 'กลุ่มงานการจัดการศึกษา', color: 'from-rose-400 to-rose-500' },
						{ id: 'ROOM_03', name: 'กลุ่มงานพัฒนาโครงการพิเศษ', color: 'from-rose-400 to-rose-500' },
						{ id: 'ROOM_04', name: 'กลุ่มบริหารงบประมาณ', color: 'from-emerald-600 to-teal-700' },
						{ id: 'ROOM_05', name: 'กลุ่มงานอำนวยการ', color: 'from-emerald-500 to-teal-600' },
						{ id: 'ROOM_06', name: 'กลุ่มงานแผนงาน การเงิน พัสดุและสินทรัพย์', color: 'from-emerald-500 to-teal-600' },
						{ id: 'ROOM_07', name: 'กลุ่มบริหารงานบุคคล', color: 'from-blue-600 to-indigo-700' },
						{ id: 'ROOM_08', name: 'กลุ่มงานบุคลากร', color: 'from-blue-500 to-indigo-600' },
						{ id: 'ROOM_09', name: 'กลุ่มงานกิจการนักเรียน', color: 'from-blue-500 to-indigo-600' },
						{ id: 'ROOM_10', name: 'กลุ่มบริหารทั่วไป', color: 'from-amber-500 to-orange-600' },
						{ id: 'ROOM_11', name: 'กลุ่มงานอาคารสถานที่ฯ', color: 'from-amber-400 to-orange-500' },
						{ id: 'ROOM_12', name: 'กลุ่มงานชุมชนและภาคีเครือข่าย', color: 'from-amber-400 to-orange-500' }
					];
					
					// เพิ่มคำสั่งดึงวันหยุดตรงนี้ ให้ทำงานตอนเปิดเว็บ
					loadThaiHolidays(); 
					// ----------------------------------------

				};

				

        // ==========================================
        // Modal สร้างห้อง (Admin)
        // ==========================================
        function openCreateRoomModal() {
            const roomCards = document.querySelectorAll('#rooms-grid .room-id-span');
            let maxId = 0;
            roomCards.forEach(span => {
                const num = parseInt(span.innerText.replace('ROOM_', ''));
                if(!isNaN(num) && num > maxId) maxId = num;
            });
            
            if(!document.getElementById('create-room-id').value.trim()) {
                const nextId = 'ROOM_' + String(maxId + 1).padStart(2, '0');
                document.getElementById('create-room-id').value = nextId;
            }

            document.getElementById('modal-create-room').classList.remove('hidden');
        }
        
        function closeCreateRoomModal() {
            document.getElementById('create-room-id').value = ""; // เคลียร์ ID เวลาปิด 
            document.getElementById('modal-create-room').classList.add('hidden');
        }

        function handleCreateRoom(e) {
            e.preventDefault();
            const rId = document.getElementById('create-room-id').value.trim().toUpperCase();
            const rName = document.getElementById('create-room-name').value.trim();
            const rColor = document.getElementById('create-room-color').value;
            
            // บันทึกห้องเข้าสู่ Global Array แล้ววาดใหม่
            defaultRooms.push({ id: rId, name: rName, color: rColor });
            renderDashboardRooms();

            closeCreateRoomModal();
            Swal.fire({ icon: 'success', title: 'ดำเนินการเรียบร้อย', showConfirmButton: false, timer: 1500 });
            e.target.reset();
        }

        function deleteRoom(btn) {
            Swal.fire({
                title: 'ยืนยันการลบ?',
                text: "คุณต้องการลบห้องหนังสือนี้ใช่หรือไม่",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'ใช่, ลบเลย',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    const card = btn.closest('.room-card');
                    const rId = card.querySelector('.room-id-span').innerText;
                    
                    // อัปเดต Array เอารหัสห้องที่เลือกลบออก และวาดใหม่
                    defaultRooms = defaultRooms.filter(r => r.id !== rId);
                    renderDashboardRooms();
                    
                    Swal.fire({ icon: 'success', title: 'ลบห้องเรียบร้อย', showConfirmButton: false, timer: 1500 });
                }
            });
        }

        function editRoom(btn) {
            const card = btn.closest('.room-card');
            const rId = card.querySelector('.room-id-span').innerText;
            const rName = card.querySelector('.room-name-span').innerText;
            
            document.getElementById('create-room-id').value = rId;
            document.getElementById('create-room-name').value = rName;
            
            // ลบการ์ดเดิมออก ก่อนให้เปิดสร้างใหม่(เป็นทริคอัปเดตง่ายๆ)
            card.remove(); 
            document.getElementById('modal-create-room').classList.remove('hidden');
        }

        // ==========================================
        // ระบบซูม Canvas
        // ==========================================
        function zoomCanvas(canvasKey, factor) { zoomCanvasRaw(canvasKey, factor); if (window.pcZoomLabel) pcZoomLabel(canvasKey); }
        function zoomCanvasRaw(canvasKey, factor) {
            let canvas = state.canvases[canvasKey];
            if (!canvas) return;
            let zoom = canvas.getZoom();
            zoom = zoom + factor;
            if (zoom > 3) zoom = 3;
            if (zoom < 0.5) zoom = 0.2;
            
            canvas.setZoom(zoom);
            
            // ปรับขยายขนาดกรอบ Canvas ให้สัมพันธ์กับระยะ Zoom เพื่อไม่ให้ภาพถูกตัด
            if (canvas.backgroundImage) {
                const bg = canvas.backgroundImage;
                canvas.setWidth(bg.width * bg.scaleX * zoom);
                canvas.setHeight(bg.height * bg.scaleY * zoom);
            }
            
            canvas.requestRenderAll();
        }


		// ==========================================
		// ระบบรีเซ็ตและปรับขนาดหน้ากระดาษเป็น 100% พอดีจอ (รองรับ iPad)
		// ==========================================
		function resetCanvasZoom(canvasKey, full) { resetCanvasZoomRaw(canvasKey, full); if (window.pcZoomLabel) pcZoomLabel(canvasKey); }
		/* [v47] full === true : พอดีความกว้าง 100% ; ไม่ระบุ : ค่าเริ่มต้น (คอมพิวเตอร์ 60% , อุปกรณ์อื่น 100%) */
		function resetCanvasZoomRaw(canvasKey, full) {
			let canvas = state.canvases[canvasKey];
			if (!canvas || !canvas.backgroundImage) return;

			const wrapper = canvas.wrapperEl ? canvas.wrapperEl.parentElement : null;
			if (!wrapper) return;

			// หาความกว้างหน้าจอผู้ใช้
			const fitFactor = full === true ? 1 : ((window.pcDefaultFit && pcDefaultFit()) || 1);   // [v97] คอมพิวเตอร์ 60% , iPad/แท็บเล็ต 70% , มือถือ 100%
				canvas.__fit = fitFactor;
				const containerWidth = (wrapper.clientWidth > 0 ? (wrapper.clientWidth - 24) : 700) * fitFactor; 
			const img = canvas.backgroundImage;
			
			// คำนวณความกว้างเดิมของภาพพื้นหลังเพื่อใช้เป็นฐานในการเทียบสัดส่วน
			const oldWidth = img.width * img.scaleX;
			const scaleRatio = containerWidth / img.width;
			
			// อัตราส่วนที่ต้องใช้ย่อ/ขยายตรายางและวัตถุต่างๆ
			const objScale = containerWidth / oldWidth;

			// ปรับสเกลและพิกัดของตรายางทุกชิ้นบนหน้ากระดาษ (ทำเฉพาะเมื่อขนาดหน้าจอเปลี่ยนไป)
			if (Math.abs(containerWidth - oldWidth) > 1) {
				canvas.getObjects().forEach(obj => {
					obj.scaleX = (obj.scaleX || 1) * objScale;
					obj.scaleY = (obj.scaleY || 1) * objScale;
					obj.left = obj.left * objScale;
					obj.top = obj.top * objScale;
					obj.setCoords();
				});
			}
			
			// รีเซ็ตการซูม และปรับกระดาษให้พอดีหน้าจอ
			canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
			canvas.setZoom(1);
			canvas.setWidth(containerWidth);
			canvas.setHeight(img.height * scaleRatio);
			
			canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
				scaleX: scaleRatio,
				scaleY: scaleRatio,
				originX: 'left',
				originY: 'top'
			});
			
			canvas.requestRenderAll();
			wrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		}
		
		// ==========================================
        // ระบบ Toolbar แท็บธุรการ และ วาดรูป
        // ==========================================
        function toggleToolbar(role = '') {
            const suffix = role ? `-${role}` : '';
            const tools = document.getElementById(`toolbar-tools${suffix}`);
            const icon = document.getElementById(`toolbar-icon${suffix}`);
            if(!tools || !icon) return;
            if (tools.classList.contains('hidden')) {
                tools.classList.remove('hidden');
                icon.classList.remove('fa-plus'); icon.classList.add('fa-minus');
            } else {
                tools.classList.add('hidden');
                icon.classList.remove('fa-minus'); icon.classList.add('fa-plus');
            }
        }


        // ฟังก์ชันตรวจสอบและย่อแถบอัตโนมัติเมื่อเปิดบนจอเล็ก
        function autoCollapseSidebars() {
            const isSmallScreen = window.innerWidth <= 1024; // iPad หรือเล็กกว่า
            const stages = [1, 4, 5, 6, 65, 7, 8];
            
            stages.forEach(stage => {
                const sidebarId = stage === 1 && !document.getElementById('sidebar-1') ? 'admin-sidebar' : `sidebar-${stage}`;
                const sidebar = document.getElementById(sidebarId);
                if (sidebar) {
                    const isExpanded = sidebar.classList.contains('lg:w-64') || sidebar.classList.contains('w-full');
                    if (isSmallScreen && isExpanded) {
                        toggleSidebar(stage); // จอเล็ก สั่งย่อ
                    } else if (!isSmallScreen && !isExpanded) {
                        toggleSidebar(stage); // จอใหญ่ สั่งขยาย
                    }
                }
            });
        }

        // ดักจับเหตุการณ์โหลดหน้าจอหรือหมุน/ย่อขยายหน้าต่าง
        window.addEventListener('resize', autoCollapseSidebars);
        window.addEventListener('DOMContentLoaded', autoCollapseSidebars);

        function deleteActiveAdminDoc() {
            let activeId = state.activeDocIds[1];
            if(!activeId) return Swal.fire('แจ้งเตือน', 'ไม่มีเอกสารที่กำลังเลือกอยู่', 'warning');
            
            Swal.fire({
                title: 'ยืนยันการลบ?',
                text: "ต้องการลบเอกสารนี้ออกจากคิวธุรการใช่หรือไม่",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'ใช่, ลบเลย'
            }).then((result) => {
                if (result.isConfirmed) {
                    deleteDoc(activeId, 1);
                    Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', showConfirmButton: false, timer: 1000 });
                }
            });
        }


        // ระบบบันทึกประวัติวาดเขียน สำหรับ Undo/Redo (แยกความจำแต่ละแท็บ)
        let canvasHistory = {};
        let historyIndex = {};

        function saveCanvasState(canvas) {
            if (!canvas || !canvas.lowerCanvasEl) return;
            let key = canvas.lowerCanvasEl.id; 
            if(!canvasHistory[key]) { canvasHistory[key] = []; historyIndex[key] = -1; }
            
            if(historyIndex[key] < canvasHistory[key].length - 1) {
                canvasHistory[key] = canvasHistory[key].slice(0, historyIndex[key] + 1);
            }
            // บันทึกสถานะรวมถึง properties พิเศษ
            canvasHistory[key].push(JSON.stringify(canvas.toJSON(['id', 'stampName', 'isCurrentStep', 'selectable', 'evented', 'originalFill', 'originalStroke', 'stampColor'])));
            historyIndex[key] = canvasHistory[key].length - 1;
        }

        
		function undoCanvas(canvasKey) {
			disablePanMode(canvasKey);
			let canvas = state.canvases[canvasKey];
			if (canvasHistory[canvasKey] && historyIndex[canvasKey] > 0 && canvas) {
				historyIndex[canvasKey]--;
				canvas.loadFromJSON(canvasHistory[canvasKey][historyIndex[canvasKey]], function () {
					forceResetToSelectMode(canvasKey);
					
					// 1. กู้คืนแอนิเมชันเส้นประของตรายางปัจจุบัน (ถ้ามี)
					canvas.getObjects().forEach(obj => {
						if (obj.isCurrentStep && !obj.animateBorder) {
							if (obj.item && obj.item(0)) {
								obj.item(0).set({ strokeDashArray: [5, 5] });
								let offset = 0;
								obj.animateBorder = setInterval(() => {
									if (obj.item && obj.item(0)) {
										obj.item(0).set({ strokeDashOffset: offset-- });
										canvas.requestRenderAll();
									} else {
										clearInterval(obj.animateBorder);
									}
								}, 50);
							}
						}
					});

					// 2. ปรับขนาดหน้ากระดาษและขยายวัตถุให้พอดีจอ 100% ทันที
					resetCanvasZoom(canvasKey);
				}, function (o, object) {
					if (o.stampName) object.stampName = o.stampName;
					if (o.isCurrentStep !== undefined) object.isCurrentStep = o.isCurrentStep;
					if (o.stampColor) object.stampColor = o.stampColor;
					if (o.originalFill) object.originalFill = o.originalFill;
					if (o.originalStroke) object.originalStroke = o.originalStroke;
				});
			}
		}

		function redoCanvas(canvasKey) {
			disablePanMode(canvasKey);
			let canvas = state.canvases[canvasKey];
			if (canvasHistory[canvasKey] && historyIndex[canvasKey] < canvasHistory[canvasKey].length - 1 && canvas) {
				historyIndex[canvasKey]++;
				canvas.loadFromJSON(canvasHistory[canvasKey][historyIndex[canvasKey]], function () {
					forceResetToSelectMode(canvasKey);
					
					// 1. กู้คืนแอนิเมชันเส้นประของตรายางปัจจุบัน (ถ้ามี)
					canvas.getObjects().forEach(obj => {
						if (obj.isCurrentStep && !obj.animateBorder) {
							if (obj.item && obj.item(0)) {
								obj.item(0).set({ strokeDashArray: [5, 5] });
								let offset = 0;
								obj.animateBorder = setInterval(() => {
									if (obj.item && obj.item(0)) {
										obj.item(0).set({ strokeDashOffset: offset-- });
										canvas.requestRenderAll();
									} else {
										clearInterval(obj.animateBorder);
									}
								}, 50);
							}
						}
					});

					// 2. ปรับขนาดหน้ากระดาษและขยายวัตถุให้พอดีจอ 100% ทันที
					resetCanvasZoom(canvasKey);
				}, function (o, object) {
					if (o.stampName) object.stampName = o.stampName;
					if (o.isCurrentStep !== undefined) object.isCurrentStep = o.isCurrentStep;
					if (o.stampColor) object.stampColor = o.stampColor;
					if (o.originalFill) object.originalFill = o.originalFill;
					if (o.originalStroke) object.originalStroke = o.originalStroke;
				});
			}
		}
		
	




        function toggleDrawMode(mode, btnElement, canvasKey = 'canvas-admin') {
			let canvas = state.canvases[canvasKey];
			if(!canvas) return;

			disablePanMode(canvasKey);

			document.querySelectorAll('.draw-tool-btn').forEach(btn => {
				btn.classList.remove('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200', 'ring-emerald-400');
			});

			canvas.discardActiveObject();

			if (mode === 'select') {
				canvas.isDrawingMode = false;
				canvas.selection = true;
				canvas.currentDrawMode = 'select';
				canvas.defaultCursor = 'default';
				if(btnElement) btnElement.classList.add('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
				canvas.requestRenderAll();
				return;
			}


			if (canvas.textMouseDown) {
				canvas.off('mouse:down', canvas.textMouseDown);
				canvas.textMouseDown = null;
			}

			// 5. บันทึกโหมดที่เลือก และใส่กรอบสีที่ปุ่มทันทีในคลิกแรก
			canvas.currentDrawMode = mode;
			if(btnElement) {
				btnElement.classList.add('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
			}
			
			if (mode === 'text') {
				canvas.isDrawingMode = false;
				canvas.selection = false;
				canvas.defaultCursor = 'text';

				canvas.textMouseDown = function(o) {
					if (canvas.currentDrawMode !== 'text') return;
					
					// 1. ถอด Event การคลิกสร้างข้อความออกทันที (ป้องกันไม่ให้คลิกครั้งหน้าสร้างกล่องซ้อนกัน)
					canvas.off('mouse:down', canvas.textMouseDown);
					canvas.textMouseDown = null;

					let pointer = canvas.getPointer(o.e);
					
					// 2. สร้างกล่องข้อความ
					let textObj = new fabric.Textbox("ข้อความ...", {
						left: pointer.x,
						top: pointer.y - (textSettings.fontSize / 2),
						width: 150,
						fontSize: textSettings.fontSize,
						fontFamily: textSettings.fontFamily,
						fill: textSettings.colorHex,
						fontWeight: textSettings.isBold ? 'bold' : 'normal',
						transparentCorners: false,
						cornerColor: '#3b82f6',
						borderColor: '#3b82f6',
						editingBorderColor: '#3b82f6',
						padding: 4,
						isCurrentStep: true,
						stampName: 'กล่องข้อความ' // ฝังชื่อให้ระบบมองว่าเป็นตรายางชิ้นหนึ่ง (ลบ/ดึงกลับ/ส่งต่อ ได้ปกติ)
					});
					
					canvas.add(textObj);
					canvas.setActiveObject(textObj);
					
					// 3. เข้าโหมดพิมพ์ทันที และคลุมดำคำว่า "ข้อความ..." ไว้ให้ผู้ใช้พิมพ์ทับได้เลย
					textObj.enterEditing();
					textObj.selectAll();
					
					canvas.requestRenderAll();
					saveCanvasState(canvas);

					// 4. สลับเครื่องมือกลับเป็น "โหมดลูกศร (Select)" โดยอัตโนมัติ 
					// เพื่อให้เมาส์สามารถคลิกลาก, ย่อขยาย, หรือขยับตำแหน่งกล่องข้อความได้ทันที
					canvas.currentDrawMode = 'select';
					canvas.selection = true;
					canvas.defaultCursor = 'default';
					
					// อัปเดตสีปุ่มบน Toolbar ให้กลับไปไฮไลต์ที่ปุ่มลูกศร
					document.querySelectorAll('.draw-tool-btn').forEach(btn => {
						btn.classList.remove('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200', 'ring-emerald-400');
					});
					const selectBtn = document.querySelector(`button[onclick*="'select'"][onclick*="'${canvasKey}'"]`);
					if (selectBtn) {
						selectBtn.classList.add('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
					}
				};
				canvas.on('mouse:down', canvas.textMouseDown);
				} else {
				canvas.isDrawingMode = true;
				canvas.selection = false;

				if(mode === 'highlight') {
					canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
					canvas.freeDrawingBrush.color = typeof getHighlightRgba === 'function' ? getHighlightRgba() : "rgba(253, 224, 71, 0.5)"; 
					canvas.freeDrawingBrush.width = (typeof highlightSettings !== 'undefined' && highlightSettings.size) ? highlightSettings.size : 26;
				} else if (mode === 'redline') {
					canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
					canvas.freeDrawingBrush.color = typeof getRedlineRgba === 'function' ? getRedlineRgba() : "rgba(220, 38, 38, 1)"; 
					canvas.freeDrawingBrush.width = (typeof redlineSettings !== 'undefined' && redlineSettings.size) ? redlineSettings.size : 4;
				} else if (mode === 'eraser') {
					canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
					canvas.freeDrawingBrush.color = typeof getEraserRgba === 'function' ? getEraserRgba() : "rgba(255, 255, 255, 1)"; 
					canvas.freeDrawingBrush.width = (typeof eraserSettings !== 'undefined' && eraserSettings.size) ? eraserSettings.size : 20;
				}

				canvas.off('path:created'); 
				canvas.on('path:created', function() { saveCanvasState(canvas); });
				if(!canvasHistory[canvasKey] || canvasHistory[canvasKey].length === 0) saveCanvasState(canvas);
			}

			canvas.requestRenderAll();
		}
		
		
		// ==========================================
		// เมนูป๊อปอัปปรับแต่งปากกาไฮไลท์ (คลิกขวาที่ปุ่มไฮไลท์)
		// ==========================================
		function openHighlightSettings(e, canvasKey, btnElement) {
			e.preventDefault(); // ป้องกันเมนูคลิกขวาเดิมของเบราว์เซอร์

			// ลบป๊อปอัปเดิมออกก่อนถ้ามีเปิดค้างอยู่
			let oldPopup = document.getElementById('highlight-settings-popup');
			if (oldPopup) oldPopup.remove();

			const popup = document.createElement('div');
			popup.id = 'highlight-settings-popup';
			popup.className = 'fixed z-50 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200 text-slate-800 w-64 text-xs select-none';
			
			// คำนวณพิกัดให้ป๊อปอัปแสดงอยู่ใต้ปุ่มที่คลิก
			const rect = btnElement.getBoundingClientRect();
			let top = rect.bottom + 8;
			let left = rect.left - 100;
			if (left < 10) left = 10;
			if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;

			const presetColors = ['#fde047', '#86efac', '#93c5fd', '#f472b6', '#fdba74', '#c084fc'];

			popup.innerHTML = `
				<div class="flex justify-between items-center mb-3 pb-1 border-b border-slate-200">
					<span class="font-bold text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-sliders text-amber-500"></i> ตั้งค่าปากกาไฮไลท์</span>
					<button onclick="document.getElementById('highlight-settings-popup').remove()" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-xmark"></i></button>
				</div>
				
				<!-- แถบ Preview -->
				<div class="mb-3 p-2 bg-slate-100 rounded-lg border flex flex-col items-center justify-center">
					<span class="text-[10px] text-slate-400 mb-1">ตัวอย่างเส้นไฮไลท์</span>
					<div id="hl-preview-box" class="w-full flex items-center justify-center h-10 overflow-hidden relative bg-white rounded border border-slate-200">
						<span class="text-slate-800 font-bold text-xs relative z-10">ข้อความตัวอย่างราชการ</span>
						<div id="hl-preview-line" class="absolute w-4/5 rounded pointer-events-none"></div>
					</div>
				</div>

				<!-- 1. เลือกสี -->
				<div class="mb-3">
					<label class="block text-[11px] font-bold text-slate-600 mb-1.5">โทนสี</label>
					<div class="flex items-center gap-1.5 flex-wrap mb-2">
						${presetColors.map(c => `
							<button type="button" onclick="setHlColor('${c}', '${canvasKey}')" class="w-6 h-6 rounded-full border-2 transition shadow-xs ${highlightSettings.colorHex === c ? 'border-slate-800 scale-110' : 'border-white'}" style="background-color: ${c};"></button>
						`).join('')}
						<input type="color" id="hl-custom-color" value="${highlightSettings.colorHex}" onchange="setHlColor(this.value, '${canvasKey}')" class="w-6 h-6 rounded-full cursor-pointer border-0 p-0 bg-transparent" title="เลือกสีอื่นๆ">
					</div>
				</div>

				<!-- 2. ปรับความเข้ม-จาง (Opacity) -->
				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ความเข้ม-จาง</span>
						<span id="hl-opacity-val" class="text-amber-600 font-mono">${Math.round(highlightSettings.opacity * 100)}%</span>
					</div>
					<input type="range" min="0.1" max="0.9" step="0.05" value="${highlightSettings.opacity}" oninput="updateHlOpacity(this.value, '${canvasKey}')" class="w-full accent-amber-500 cursor-pointer">
				</div>

				<!-- 3. ปรับความสูง / ขนาดปากกา -->
				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ความสูงของแถบสี (ความหนา)</span>
						<span id="hl-size-val" class="text-amber-600 font-mono">${highlightSettings.size}px</span>
					</div>
					<input type="range" min="15" max="50" step="1" value="${highlightSettings.size}" oninput="updateHlSize(this.value, '${canvasKey}')" class="w-full accent-amber-500 cursor-pointer">
				</div>

				<button onclick="document.getElementById('highlight-settings-popup').remove()" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow transition">เสร็จสิ้น</button>
			`;

			document.body.appendChild(popup);
			updateHlPreview();

			// ปิดป๊อปอัปเมื่อคลิกนอกกรอบ
			setTimeout(() => {
				const closeOnClickOutside = (evt) => {
					if (!popup.contains(evt.target) && evt.target !== btnElement) {
						popup.remove();
						document.removeEventListener('mousedown', closeOnClickOutside);
					}
				};
				document.addEventListener('mousedown', closeOnClickOutside);
			}, 100);
		}

		// ฟังก์ชันอัปเดตสีและพรีวิว
		function updateHlPreview() {
			const line = document.getElementById('hl-preview-line');
			if (line) {
				line.style.backgroundColor = getHighlightRgba();
				line.style.height = `${Math.min(highlightSettings.size, 32)}px`;
			}
		}

		function syncCurrentBrush(canvasKey) {
			let canvas = state.canvases[canvasKey];
			if (canvas && canvas.isDrawingMode && canvas.currentDrawMode === 'highlight') {
				canvas.freeDrawingBrush.color = getHighlightRgba();
				canvas.freeDrawingBrush.width = highlightSettings.size;
			}
		}

		function setHlColor(hex, canvasKey) {
			highlightSettings.colorHex = hex;
			updateHlPreview();
			syncCurrentBrush(canvasKey);
			let popup = document.getElementById('highlight-settings-popup');
			if (popup) {
				popup.querySelectorAll('button[onclick*="setHlColor"]').forEach(b => {
					b.classList.remove('border-slate-800', 'scale-110');
					if (b.style.backgroundColor.includes(hex) || b.getAttribute('onclick').includes(hex)) {
						b.classList.add('border-slate-800', 'scale-110');
					}
				});
			}
		}

		function updateHlOpacity(val, canvasKey) {
			highlightSettings.opacity = parseFloat(val);
			const txt = document.getElementById('hl-opacity-val');
			if (txt) txt.innerText = `${Math.round(highlightSettings.opacity * 100)}%`;
			updateHlPreview();
			syncCurrentBrush(canvasKey);
		}

		function updateHlSize(val, canvasKey) {
			highlightSettings.size = parseInt(val, 10);
			const txt = document.getElementById('hl-size-val');
			if (txt) txt.innerText = `${highlightSettings.size}px`;
			updateHlPreview();
			syncCurrentBrush(canvasKey);
		}
		
		

        function viewFullDocument() {
            Swal.fire('เปิดหนังสือฉบับเต็ม', 'ระบบจะเปิดไฟล์ต้นฉบับให้ท่านตรวจสอบในหน้าต่างใหม่', 'info');
        }

        function viewAttachments() {
            Swal.fire('เอกสารแนบ', 'แสดงรายการเอกสารแนบทั้งหมดของหนังสือฉบับนี้', 'info');
        }

		// ==========================================
        // ระบบจัดการและตรวจจับช่องลายเซ็น (พร้อมระบบป้องกัน ID ผิดพลาด)
        // ==========================================
        function setupSigCanvas(canvasId) {
			let canvas = document.getElementById(canvasId);
			if (!canvas) return null;
			
			// 🛡️ ระบบป้องกัน: หากเผลอใส่ ID ของลายเซ็นไว้ที่ <div> ให้ดึง <canvas> ที่อยู่ข้างในมาใช้แทน
			if (canvas.tagName !== 'CANVAS') {
				let innerCanvas = canvas.querySelector('canvas');
				if (innerCanvas) {
					canvas = innerCanvas;
				} else {
					console.warn('ไม่พบแท็ก <canvas> สำหรับลายเซ็น: ' + canvasId);
					return null;
				}
			}

			const ctx = canvas.getContext("2d");
			
			let isDrawing = false;
			let hideTimer = null;
			let hasDrawn = false;
			const role = canvasId.replace('sig-', ''); 

			/* [ข้อ 29] วาดลายเซ็นที่ความละเอียดสูงกว่าที่แสดงจริง 2-3 เท่า (Retina/HiDPI)
			   ทำให้ลายเซ็นที่นำไปประทับบนหนังสือคมชัดและหนาขึ้นอย่างชัดเจน
			   หมายเหตุ: getPos() หารด้วย canvas.width/rect.width อยู่แล้ว จึงไม่ต้องแก้ตำแหน่งเมาส์ */
			const SIG_SCALE = Math.max(2, Math.min(3, window.devicePixelRatio || 2));
			const resize = () => {
				const rect = canvas.getBoundingClientRect();
				const cssW = rect.width > 0 ? rect.width : (canvas.parentElement.clientWidth || 300);
				const cssH = rect.height > 0 ? rect.height : 96;
				canvas.width = Math.round(cssW * SIG_SCALE);
				canvas.height = Math.round(cssH * SIG_SCALE);
				ctx.lineWidth = 3.4 * SIG_SCALE;     // หนาขึ้นเล็กน้อยเมื่อเทียบกับของเดิม
				ctx.lineJoin = "round";
				ctx.lineCap = "round"; 
				ctx.strokeStyle = "#1a4b8c";
			};
			
			const getPos = (e) => {
				const rect = canvas.getBoundingClientRect();
				const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
				const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
				const scaleX = canvas.width / rect.width;
				const scaleY = canvas.height / rect.height;
				return { 
					x: (clientX - rect.left) * scaleX, 
					y: (clientY - rect.top) * scaleY 
				};
			};
			
			const startDraw = (e) => { 
				e.preventDefault(); 
				isDrawing = true; 
				if (hideTimer) clearTimeout(hideTimer);
				const pos = getPos(e); 
				ctx.beginPath(); 
				ctx.moveTo(pos.x, pos.y); 
			};
			
			const drawing = (e) => { 
				if (!isDrawing) return; 
				e.preventDefault(); 
				const pos = getPos(e); 
				ctx.lineTo(pos.x, pos.y); 
				ctx.stroke(); 
				hasDrawn = true;
				updateSigUIState(role, true);
			};
			
			const stopDraw = () => { 
				if (!isDrawing) return; 
				isDrawing = false; 
				
				hideTimer = setTimeout(() => {
					const panel = document.getElementById(`panel-${role}`);
					if (panel && !panel.classList.contains('hidden')) {
						toggleWorkspacePanel(role);
					}
				}, 1000);
			};
			
			canvas.addEventListener("mousedown", startDraw); canvas.addEventListener("mousemove", drawing);
			canvas.addEventListener("mouseup", stopDraw); canvas.addEventListener("mouseout", stopDraw);
			canvas.addEventListener("touchstart", startDraw, { passive: false }); canvas.addEventListener("touchmove", drawing, { passive: false }); canvas.addEventListener("touchend", stopDraw);
			
			resize();

			return { 
				resize, 
				clear: () => {
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					hasDrawn = false;
					if (hideTimer) clearTimeout(hideTimer);
					updateSigUIState(role, false);
				}, 
				isEmpty: () => !hasDrawn, 
				setHasSignature: (status) => {
					hasDrawn = status;
					updateSigUIState(role, status);
				},
				getBase64: () => canvas.toDataURL("image/png") 
			};
		}

		// ฟังก์ชันอัปเดตสีกรอบและป้าย Badge แจ้งเตือนสถานะลายเซ็น
		function updateSigUIState(role, hasSignature) {
			const badge = document.getElementById(`sig-badge-${role}`);
			const box = document.getElementById(`sig-box-${role}`) || document.getElementById(`sig-${role}`)?.parentElement;
			
			if (badge) {
				if (hasSignature) {
					badge.className = 'text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 transition-all';
					badge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600"></i> ลงลายเซ็นแล้ว';
				} else {
					badge.className = 'text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1 transition-all';
					badge.innerHTML = '<i class="fa-solid fa-circle-exclamation text-rose-500"></i> ยังไม่มีลายเซ็น';
				}
			}

			if (box) {
				if (hasSignature) {
					box.classList.remove('border-slate-300', 'border-rose-400', 'ring-2', 'ring-rose-200');
					box.classList.add('border-emerald-400', 'bg-emerald-50/10');
				} else {
					box.classList.remove('border-emerald-400', 'bg-emerald-50/10');
					box.classList.add('border-slate-300');
				}
			}
		}

        function saveSignature(role) {
            let pad = sigPads[role];
            if (!pad || pad.isEmpty()) return Swal.fire("แจ้งเตือน", "กรุณาวาดลายเซ็นก่อนบันทึก", "warning");
            storedSignatures[role] = pad.getBase64();
            Swal.fire({ icon: 'success', title: 'บันทึกลายเซ็นสำเร็จ', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        }

        function useStoredSignature(role) {
			if (!storedSignatures[role]) return Swal.fire("แจ้งเตือน", "ยังไม่มีลายเซ็นที่บันทึกไว้", "warning");
			const img = new Image();
			img.onload = () => {
				const canvas = document.getElementById(`sig-${role}`);
				const ctx = canvas.getContext('2d');
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				const ratio = Math.min(canvas.height / img.height, canvas.width / img.width);
				const cx = (canvas.width - img.width*ratio) / 2;
				const cy = (canvas.height - img.height*ratio) / 2;  
				ctx.drawImage(img, 0, 0, img.width, img.height, cx, cy, img.width*ratio, img.height*ratio);

				// แจ้งระบบว่าช่องมีลายเซ็นแล้ว
				if (sigPads[role]) sigPads[role].setHasSignature(true);
			};
			img.src = storedSignatures[role];
			Swal.fire({ icon: 'success', title: 'ดึงลายเซ็นเดิมมาใช้แล้ว', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
			
			// เพิ่ม: หน่วงเวลา 1 วินาที แล้วซ่อนฟอร์มอัตโนมัติ
			setTimeout(() => {
				const panel = document.getElementById(`panel-${role}`);
				if (panel && !panel.classList.contains('hidden')) {
					toggleWorkspacePanel(role);
				}
			}, 1000);
		}
		
		
		// ==========================================
		// ฟังก์ชันอัปโหลดไฟล์ภาพลายเซ็น (.png)
		// ==========================================
		function uploadSignatureImage(event, role) {
			const file = event.target.files && event.target.files[0];
			if (!file) return;

			if (file.type !== 'image/png') {
				Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ภาพลายเซ็นนามสกุล .png เท่านั้น', 'warning');
				event.target.value = '';
				return;
			}

			const reader = new FileReader();
			reader.onload = function(e) {
				const img = new Image();
				img.onload = function() {
					const canvas = document.getElementById(`sig-${role}`);
					if (!canvas) return;
					const ctx = canvas.getContext('2d');
					ctx.clearRect(0, 0, canvas.width, canvas.height);

					// ปรับสเกลให้อยู่กึ่งกลางกล่องลายเซ็นพอดี
					const ratio = Math.min((canvas.height - 10) / img.height, (canvas.width - 20) / img.width);
					const cx = (canvas.width - img.width * ratio) / 2;
					const cy = (canvas.height - img.height * ratio) / 2;
					ctx.drawImage(img, 0, 0, img.width, img.height, cx, cy, img.width * ratio, img.height * ratio);

					// บันทึกเก็บไว้เป็นลายเซ็นเดิมอัตโนมัติ
					 storedSignatures[role] = canvas.toDataURL('image/png');
					 if (sigPads[role]) sigPads[role].setHasSignature(true);

					Swal.fire({
						icon: 'success',
						title: 'อัปโหลดลายเซ็นเรียบร้อย',
						toast: true,
						position: 'top-end',
						showConfirmButton: false,
						timer: 1500
					});

					// หน่วงเวลา 1 วินาที แล้วซ่อนฟอร์มอัตโนมัติตามมาตรฐานระบบ
					setTimeout(() => {
						const panel = document.getElementById(`panel-${role}`);
						if (panel && !panel.classList.contains('hidden')) {
							toggleWorkspacePanel(role);
						}
					}, 1000);
				};
				img.src = e.target.result;
			};
			reader.readAsDataURL(file);
			event.target.value = ''; // ล้างค่าเผื่อเลือกไฟล์ชื่อเดิมซ้ำ
		}

        function getCanvasKey(stage) {
            if(stage === 1) return 'canvas-admin';
            if(stage === 2) return 'canvas-assistant';
            if(stage === 3) return 'canvas-subdirector';
            if(stage === 4) return 'canvas-director';
            if(stage === 5) return 'canvas-admingroup';
            if(stage === 6) return 'canvas-subdirectorgroup';
            if(stage === 7) return 'canvas-assistantgroup';
            if(stage === 8) return 'canvas-assignee';
			if(stage === 65) return 'canvas-subgroupadmin';
            return null;
        }

        function processSingleFile(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                if (file.type === "application/pdf") {
                    reader.onload = async function(e) {
                        try { await PCLib.load('pdfjs'); } catch (err) { resolve(""); return; }   // [v46]
                        const typedarray = new Uint8Array(e.target.result);
                        pdfjsLib.getDocument(typedarray).promise.then(async function(pdf) {
                            // ดึงจำนวนหน้าสูงสุด 2 หน้า
                            const numPages = Math.min(pdf.numPages, 2);
                            let totalHeight = 0;
                            let maxWidth = 0;
                            const pageData = [];

                            // วนลูปดึงข้อมูลแต่ละหน้า
                            for(let i = 1; i <= numPages; i++) {
                                const page = await pdf.getPage(i);
                                const viewport = page.getViewport({ scale: 1.8 });   // [v35 ข้อ 3] เดิม 2.0 : A4 กว้าง ~1,070 px ยังซูมอ่านตัวหนังสือเล็กได้ชัด
                                pageData.push({ page, viewport });
                                totalHeight += viewport.height;
                                if(viewport.width > maxWidth) maxWidth = viewport.width;
                            }

                            // สร้าง Canvas หลักที่รวมความสูงของ 2 หน้า
                            const pageGap = 20; // กำหนดระยะห่างระหว่างหน้า 20px
							const tempCanvas = document.createElement('canvas');
							const context = tempCanvas.getContext('2d');
							tempCanvas.width = maxWidth;
							tempCanvas.height = totalHeight + (pageGap * (numPages - 1)); // เพิ่มความสูงเผื่อระยะห่าง

							// เทสีพื้นหลังเป็นสีเทาอ่อนเพื่อให้เห็นระยะห่างระหว่างหน้าชัดเจน
							context.fillStyle = "#e2e8f0";
							context.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

							let currentY = 0;
							// วาดแต่ละหน้าลงบน Canvas หลักเรียงต่อกัน
							for(let i = 0; i < pageData.length; i++) {
								const { page, viewport } = pageData[i];
								const pageCanvas = document.createElement('canvas');
								pageCanvas.width = viewport.width;
								pageCanvas.height = viewport.height;
								const pageCtx = pageCanvas.getContext('2d');
								
								await page.render({ canvasContext: pageCtx, viewport: viewport }).promise;
								context.drawImage(pageCanvas, 0, currentY);
								currentY += viewport.height + pageGap; // บวกระยะห่างเพิ่มเข้าไปในแนวแกน Y
							}
                            
                            resolve(tempCanvas.toDataURL('image/jpeg', 0.76));   // [v26 ข้อ 3] JPEG , [v35 ข้อ 3] คุณภาพ 0.76 (เดิม 0.85) ไฟล์เล็กลงราว 40% ตัวหนังสือยังคม
                        }).catch(() => resolve(""));
                    };
                    reader.readAsArrayBuffer(file);
                } else {
                    // [v26 ข้อ 3] รูปถ่าย/สแกนขนาดใหญ่ : ย่อด้านยาวไม่เกิน 2400px และบีบอัดเป็น JPEG ก่อนอัปโหลด (อ่านชัดเหมือนเดิม ไฟล์เล็กลงมาก)
                    reader.onload = function(e) {
                        const src = e.target.result;
                        if (!/^data:image\/(png|jpe?g|webp|bmp)/i.test(src) || file.size < 250000) { resolve(src); return; }
                        const img = new Image();
                        img.onload = function () {
                            try {
                                const scale = Math.min(1, 2000 / Math.max(img.width, img.height));   // [v35 ข้อ 3] เดิม 2400
                                const c = document.createElement('canvas');
                                c.width = Math.round(img.width * scale);
                                c.height = Math.round(img.height * scale);
                                const cx = c.getContext('2d');
                                cx.fillStyle = '#ffffff';
                                cx.fillRect(0, 0, c.width, c.height);
                                cx.drawImage(img, 0, 0, c.width, c.height);
                                const out = c.toDataURL('image/jpeg', 0.78);                         // [v35 ข้อ 3] เดิม 0.85
                                resolve(out.length < src.length ? out : src);
                            } catch (err) { resolve(src); }
                        };
                        img.onerror = function () { resolve(src); };
                        img.src = src;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }



        // ตัดฟังก์ชัน checkYearReset ออก แล้วปรับปรุง autoRunReceiveNumbers ใหม่
        function autoRunReceiveNumbers() {
            let currentYear = new Date().getFullYear() + 543;
            let maxCount = 0;
            
            // 0. โหลดเลขเริ่มที่ผู้ใช้ตั้งไว้
            let customCentral = localStorage.getItem('start-no-central');
            if (customCentral && customCentral.includes('/' + currentYear)) {
                let cNum = parseInt(customCentral.split('/')[0], 10);
                if (!isNaN(cNum) && cNum > 0) maxCount = cNum - 1; 
            }
            
            // 1. หาเลขรับสูงสุดเฉพาะจากคิวที่ผ่านธุรการไปแล้ว (stage 2 ถึง 5)
            state.documentQueue.filter(d => d.stage > 1).forEach(d => {
                if (d.receiveNo && d.receiveNo.includes('/' + currentYear)) {
                    let num = parseInt(d.receiveNo.split('/')[0]);
                    if (num > maxCount) maxCount = num;
                }
            });
            
            // 2. รันเลขใหม่ให้คิวธุรการทั้งหมด โดยยึดลำดับจากบนลงล่าง (รองรับการลากสลับคิว)
            state.documentQueue.filter(d => d.stage === 1).forEach((item) => {
                maxCount++;
                item.receiveNo = `${maxCount}/${currentYear}`;
            });
            
            // 3. อัปเดตช่อง input
            if (state.activeDocIds[1]) {
                let currentDoc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
                let recInput = document.getElementById("admin-receive-no");
                if (currentDoc && recInput) {
                    recInput.value = currentDoc.receiveNo;
                }
            }
            renderAllQueues();
        }
		
		
		function updateActiveDocPriority(val) {
            if(!state.activeDocIds[1]) return;
            let doc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
            if(doc) { doc.priority = parseInt(val); renderQueueList(1, 'queue-list-1'); }
        }
		// ฟังก์ชันดึงเอกสารที่กำลังเปิดใช้งานอยู่ในปัจจุบัน
        function getActiveDoc(stage = 1) {
            if (!state || !state.documentQueue) return null;
            let activeId = (state.activeDocIds && state.activeDocIds[stage]) ? state.activeDocIds[stage] : state.activeDocId;
            return state.documentQueue.find(d => d.id === activeId) || state.documentQueue[0] || null;
        }

		// ฟังก์ชันอัปเดตข้อมูลเอกสารแบบเรียลไทม์
        function updateActiveDocField(field, value, stage = 1) {
            let doc = getActiveDoc(stage);
            if (doc) {
                doc[field] = value;
                if (field === 'subject') {
                    doc.title = value; // ซิงค์ title ให้ตรงกับ subject เสมอ
                }
            }
        }

        // ฟังก์ชันอัปเดตหมวดหมู่หนังสือ (ข้อ 9) ลงในเอกสารปัจจุบันแบบเรียลไทม์
        function updateActiveDocCategories() {
            let doc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
            if (!doc) return;
            let checkedBoxes = document.querySelectorAll('.admin-category-checkbox:checked');
            doc.category = Array.from(checkedBoxes).map(cb => cb.value);
        }		
		

        // ==========================================
        // ฟังก์ชันจัดการอัปโหลดเอกสารเข้าสู่ระบบ (ธุรการกลาง)
        // ==========================================
        async function handleFileUpload(eventOrFiles) {
            let files = eventOrFiles.target ? eventOrFiles.target.files : eventOrFiles;
            if (!files || files.length === 0) return;

            // [ข้อ 13] ใช้ progress overlay แบบ % แทน loading เดิม (มีจำนวนไฟล์จริงจึงคำนวณ % ได้)
            showProgress('กำลังอัปโหลดเอกสาร', 'เตรียมประมวลผลไฟล์ ' + files.length + ' รายการ');

            let firstDocId = null;

            for (let i = 0; i < files.length; i++) {
                let file = files[i];
                let docId = 'doc_' + Date.now() + '_' + i;
                if (!firstDocId) firstDocId = docId;

                updateProgress(Math.round((i / files.length) * 92), 'ไฟล์ ' + (i + 1) + ' / ' + files.length + ' : ' + file.name);   // [ข้อ 13]
                let cleanedTitle = file.name.replace(/\.[^/.]+$/, ""); // ตัดนามสกุลไฟล์ออก
                let originalBase64 = "";
                let imgDataUrl = "";

                try {
                    if (file.type === "application/pdf") {
						// เรียกใช้ฟังก์ชัน processSingleFile ที่มีอยู่แล้วในการแปลง PDF เป็นภาพ
						imgDataUrl = await processSingleFile(file);
						originalBase64 = await new Promise((resolve) => {
							let reader = new FileReader();
							reader.onload = e => resolve(e.target.result);
							reader.readAsDataURL(file);
						});
					} else {
                        imgDataUrl = await new Promise((resolve) => {
                            let reader = new FileReader();
                            reader.onload = e => resolve(e.target.result);
                            reader.readAsDataURL(file);
                        });
                        originalBase64 = imgDataUrl;
                    }
                } catch (err) {
                    console.error("Error reading file:", err);
                    continue;
                }

                // สร้าง Object ข้อมูลหนังสือ พร้อมตั้งค่าเริ่มต้นตามที่กำหนด
                let docObj = {
                    id: docId,
                    title: cleanedTitle,
                    subject: cleanedTitle,
                    receiveNo: "",
                    docNo: "ศธ 04306/", // ค่าเริ่มต้นช่อง 2. ที่
                    docDate: typeof formatThaiDateFull === 'function' ? formatThaiDateFull(new Date()) : getThaiDate(), // ค่าเริ่มต้นช่อง 3. วันที่ปัจจุบัน
                    sender: "สำนักงานเขตพื้นที่การศึกษามัธยมศึกษานครราชสีมา", // ค่าเริ่มต้นช่อง 5. จาก
                    recipient: "ผู้อำนวยการโรงเรียนปากช่อง", // ค่าเริ่มต้นช่อง 6. ถึง
                    currentImage: imgDataUrl,
                    originalFile: { name: file.name, type: file.type, content: originalBase64 },
                    attachments: [],
                    priority: 1,
                    category: [],
                    description: "",
                    stage: 1,
                    lastUpdated: `${getThaiDate()}, เวลา ${toThaiNum(new Date().getHours().toString().padStart(2, '0'))}.${toThaiNum(new Date().getMinutes().toString().padStart(2, '0'))} น.`
                };

                state.documentQueue.push(docObj);
            }

            // รันเลขรับอัตโนมัติ และอัปเดตคิวงานทุกห้อง
            if (typeof autoRunReceiveNumbers === 'function') {
                autoRunReceiveNumbers();
            }
            renderAllQueues();

            // สั่งเลือกเอกสารฉบับแรกขึ้นมาแสดงบน Canvas ทันที
            if (firstDocId) {
                selectDoc(firstDocId, 1);
            }

            // ล้างค่า File Input เพื่อให้สามารถเลือกไฟล์เดิมซ้ำได้ในครั้งต่อไป
            if (eventOrFiles.target) eventOrFiles.target.value = "";

            hideProgress();   // [ข้อ 13] ปิด progress overlay
            Swal.close();

            // โฟกัสและวางเคอร์เซอร์กระพริบต่อท้ายข้อความในช่อง "2. ที่" อัตโนมัติทันที
            setTimeout(() => {
                const elDocNo = document.getElementById('admin-doc-no');
                if (elDocNo) {
                    elDocNo.focus();
                    const len = elDocNo.value.length;
                    elDocNo.setSelectionRange(len, len);
                }
                
                // สั่งให้ปุ่ม 100% ทำงานอัตโนมัติเมื่ออัปโหลดและกางฟอร์มเสร็จ
                if (typeof resetCanvasZoom === 'function') {
                    resetCanvasZoom('canvas-admin');
                }
            }, 400); 
        }
		
		
		
		
		// ==========================================
        // 1. ฟังก์ชันแปลงเลขไทยเป็นเลขอารบิก
        // ==========================================
        function toArabicNum(str) {
            if (!str) return '';
            const thDigits = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
            return str.toString().replace(/[๐-๙]/g, ch => thDigits[ch] || ch);
        }

        // ==========================================
        // 2. ฟังก์ชันทำให้ SweetAlert2 ลากย้ายตำแหน่งได้ (Draggable Modal)
        // ==========================================
        function makeSwalDraggable() {
            const popup = Swal.getPopup();
            const title = Swal.getTitle();
            if (!popup || !title) return;

            title.style.cursor = 'move';
            title.style.userSelect = 'none';

            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            title.onmousedown = function(e) {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
                document.onmousemove = function(e) {
                    e.preventDefault();
                    pos1 = pos3 - e.clientX;
                    pos2 = pos4 - e.clientY;
                    pos3 = e.clientX;
                    pos4 = e.clientY;
                    popup.style.position = 'fixed';
                    popup.style.margin = '0';
                    popup.style.transform = 'none'; // ยกเลิก transform เพื่อไม่ให้เด้ง
                    popup.style.top = Math.max(10, popup.offsetTop - pos2) + "px";
                    popup.style.left = Math.max(10, popup.offsetLeft - pos1) + "px";
                };
            };
        }



        // ==========================================
        // ฟังก์ชันอัปโหลดไฟล์แนบ (แก้ให้อ่านข้อมูลไฟล์ Base64 เก็บไว้)
        // ==========================================
        window.handleAttachmentsUpload = async function(event) {
            if (!state.activeDocIds[1]) {
                Swal.fire('แจ้งเตือน', 'กรุณาเลือกหนังสือหลักในคิวก่อนอัปโหลดไฟล์แนบ', 'warning');
                event.target.value = "";
                return;
            }
            const doc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
            const files = event.target.files;

            showProgress('กำลังอัปโหลดไฟล์แนบ', files.length + ' ไฟล์');   // [ข้อ 13]

            for(let i=0; i < files.length; i++) {
                let file = files[i];
                // ใช้ FileReader แปลงไฟล์เป็น Base64 URL เพื่อเก็บไว้ Preview
                let dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
                doc.attachments.push({ name: file.name, type: file.type, content: dataUrl });
                updateProgress(Math.round(((i + 1) / files.length) * 100), file.name);   // [ข้อ 13]
            }

            hideProgress();   // [ข้อ 13]
            Swal.close();
            Swal.fire({ icon: 'success', title: 'เพิ่มไฟล์แนบสำเร็จ', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
            event.target.value = "";
            renderAllQueues();
        };
		
		

        let draggedIndex = null;
        function dragStart(e, index) { draggedIndex = index; e.dataTransfer.effectAllowed = "move"; }
        function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
        function dragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
        function drop(e, index) {
            e.preventDefault(); e.currentTarget.classList.remove('drag-over');
            if (draggedIndex === null || draggedIndex === index) return;
            
            let adminDocs = state.documentQueue.filter(d => d.stage === 1);
            let draggedId = adminDocs[draggedIndex].id;
            let targetId = adminDocs[index].id;
            
            let globalDragIdx = state.documentQueue.findIndex(d => d.id === draggedId);
            let globalDropIdx = state.documentQueue.findIndex(d => d.id === targetId);

            const draggedItem = state.documentQueue.splice(globalDragIdx, 1)[0];
            state.documentQueue.splice(globalDropIdx, 0, draggedItem);
            
            autoRunReceiveNumbers(); 
        }

        function deleteDoc(id, stage) {
            state.documentQueue = state.documentQueue.filter(d => d.id !== id);
            if(state.activeDocIds[stage] === id) {
                state.activeDocIds[stage] = null;
                const canvas = state.canvases[getCanvasKey(stage)];
                if(canvas) canvas.clear();
            }
            if(stage === 1) autoRunReceiveNumbers();
            else renderAllQueues();
        }

        // =========================================================================
		// 3. ฟังก์ชันเรนเดอร์คิวงานทั้งหมด (renderAllQueues)
		// =========================================================================
		// ฟังก์ชันช่วยเรนเดอร์คิวงานราย Stage เข้าสู่ Container ปลายทาง
		function renderQueue(stage) {
			if (typeof renderQueueList === 'function') {
				renderQueueList(stage, `queue-list-${stage}`);
			}
		}

		function renderAllQueues() {
			// วนลูปเรนเดอร์คิวของทุกขั้นตอน
			const stages = [1, 4, 5, 6, 65, 7, 8];
			stages.forEach(stage => {
				renderQueue(stage);
			});

			// อัปเดตหน้ารายการกล่องหนังสือเข้า และทะเบียนหนังสือรับ
			if (typeof renderInboxList === 'function') renderInboxList();
			if (typeof renderAllDocsList === 'function') renderAllDocsList();
		}
		

        function renderQueueList(stage, containerId) {
            const qList = document.getElementById(containerId);
            if (!qList) return;
            
            const currentRoomName = document.getElementById('banner-room-name').innerText;
            const normalizedRoom = currentRoomName.replace(/ฯ/g, '').trim();
            
            let items = state.documentQueue.filter(d => d.stage === stage);

            // [v23 ข้อ 14] คิวผู้รับผิดชอบ (8) : แสดงหนังสือที่มอบหมายให้ "ฉัน" (ทุกห้อง) ไม่แสดงของคนอื่น
            if (stage === 8 && typeof window.pcStage8Visible === 'function') {
                items = items.filter(doc => window.pcStage8Visible(doc, normalizedRoom, currentRoomName));
            } else
            // กรองคิวงานให้ตรงกับห้องที่เปิดอยู่ (ไม่ให้ข้ามห้อง)
            if (currentRoomName !== 'ห้องสารบรรณกลาง') {
                items = items.filter(doc => {
                    if (stage === 5 || stage === 6) {
                        // คิวธุรการกลุ่ม (5) และ รองกลุ่ม (6) ดึงข้อมูลจาก กลุ่มบริหาร
                        if (!doc.assignedGroups || doc.assignedGroups.length === 0) return false;
                        return doc.assignedGroups.some(g => {
                            let ng = g.replace(/ฯ/g, '').trim();
                            return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
                        });
                    } else if (stage === 65 || stage === 7 || stage === 8) {
                        // คิวธุรการกลุ่มงาน (65), ผู้ช่วยกลุ่ม (7) และ ผู้รับผิดชอบ (8) ดึงข้อมูลจาก กลุ่มงานย่อย
                        if (!doc.subGroups || doc.subGroups.length === 0) return false;
                        return doc.subGroups.some(g => {
                            let ng = g.replace(/ฯ/g, '').trim();
                            return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
                        });
                    }
                    return true;
                });
            }
            
            // ล้างค่า Canvas เสมอ หากเอกสารที่เคยเลือกไว้ ไม่ได้อยู่ในคิวของห้องนี้
            if (state.activeDocIds[stage] && !items.some(d => d.id === state.activeDocIds[stage])) {
                state.activeDocIds[stage] = null;
                const canvas = state.canvases[getCanvasKey(stage)];
                if (canvas) canvas.clear();
            }

            // 1. ปิดการแสดงกล่องสีเหลืองที่ซ้ำซ้อนออก
            // updateQueueCounterBadge(stage, items.length, qList);
            const oldBadge = document.getElementById(`queue-count-badge-${stage}`);
            if (oldBadge) oldBadge.remove();

            // 2. อัปเดตตัวเลขคิวงานที่แสดงอยู่ระหว่างลูกศร (เช่น 2/5 หรือ 0/0)
            let counterEl = document.getElementById(`queue-counter-${stage}`);
            if (counterEl) {
                let activeIdx = items.findIndex(d => d.id === state.activeDocIds[stage]);
                counterEl.innerText = items.length > 0 ? `${(activeIdx >= 0 ? activeIdx : 0) + 1}/${items.length}` : `0/0`;
				//counterEl.innerText = items.length > 0 ? items.length : '0';
            }

            // หากไม่มีเอกสารในคิว
            if (items.length === 0) {
                qList.innerHTML = '<div class="text-sm font-medium text-slate-400 text-left py-2 w-full pl-2">ไม่มีเอกสารในคิว</div>';
                return;
            }

            if(stage > 1) {
                items.sort((a,b) => b.priority - a.priority);
            }

            qList.innerHTML = items.map((doc, index) => {
                // สีพื้นหลังการ์ดแบบเต็ม
                let bgPriority = 'bg-white border-slate-200';
                if(doc.priority == 4) bgPriority = 'bg-rose-50 border-rose-300';
                else if(doc.priority == 3) bgPriority = 'bg-orange-50 border-orange-300';
                else if(doc.priority == 2) bgPriority = 'bg-amber-50 border-amber-300';

                const isActive = state.activeDocIds[stage] === doc.id ? 'ring-2 ring-inset ring-blue-500 shadow-md border-transparent' : 'hover:opacity-80';
                
                let badge = '';
                let miniBg = 'bg-slate-200 text-slate-600';
                
                if(doc.priority == 4) {
                    badge = '<span class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">ด่วนที่สุด</span>';
                    miniBg = 'bg-rose-600 text-white';
                } else if(doc.priority == 3) {
                    badge = '<span class="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">ด่วนมาก</span>';
                    miniBg = 'bg-orange-50 text-white';
                } else if(doc.priority == 2) {
                    badge = '<span class="bg-amber-400 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">ด่วน</span>';
                    miniBg = 'bg-amber-400 text-white';
                } else {
                    badge = '<span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">ปกติ</span>';
                }

                const miniActive = state.activeDocIds[stage] === doc.id ? 'ring-2 ring-blue-600 scale-105 shadow-sm' : '';
                let attachIcon = doc.attachments && doc.attachments.length > 0 ? '<i class="fa-solid fa-paperclip text-blue-500 ml-1"></i>' : '';
                let dragAttr = stage === 1 ? `draggable="true" ondragstart="dragStart(event, ${index})" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${index})"` : '';
                let delBtn = `<button onclick="event.stopPropagation(); deleteDoc('${doc.id}', ${stage})" class="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition z-10"><i class="fa-solid fa-xmark"></i></button>`;
                let deadlineBadge = doc.deadline ? `<div class="text-[9px] text-purple-600 mt-0.5"><i class="fa-solid fa-calendar-day"></i> กำหนด: ${new Date(doc.deadline).toLocaleDateString('th-TH', {day:'numeric', month:'short', year:'2-digit'})}</div>` : '';

                // กำหนดเลขรับให้ตรงตามบทบาทของห้อง
                let displayRecNo = doc.receiveNo || 'รอระบุ';
                if ((stage === 5 || stage === 6) && doc.groupReceiveNo) {
                    displayRecNo = doc.groupReceiveNo;
                } else if ((stage === 65 || stage === 7 || stage === 8) && (doc.subgroupReceiveNo || doc.groupReceiveNo)) {
                    displayRecNo = doc.subgroupReceiveNo || doc.groupReceiveNo;
                }

                return `
                    <div ${dragAttr} onclick="selectDoc('${doc.id}', ${stage})" class="relative cursor-pointer transition w-auto shrink-0">
                        
                        <!-- 1. การ์ดแบบเต็ม (แสดงเฉพาะจอคอม xl ขึ้นไป) -->
                        <div class="doc-full-detail relative p-3 border rounded-xl transition w-[260px] ${bgPriority} ${isActive}">
                            ${delBtn}
                            <div class="flex justify-between items-start mb-1.5 pr-4">
                                <div class="text-xs font-bold text-blue-700">เลขรับ: ${displayRecNo}${deadlineBadge}</div>
                                ${badge}
                            </div>
                            <div class="text-slate-600 text-xs truncate pr-5" title="${doc.title}">${doc.title} ${attachIcon}</div>
                        </div>

                        <!-- 2. ไอคอนตัวเลขย่อ -->
                        <div class="doc-mini-icon hidden m-1 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all hover:opacity-80 cursor-pointer ${miniBg} ${miniActive}" title="ลำดับที่ ${index + 1} | ${displayRecNo} - ${doc.title}">
                            ${index + 1}
                        </div>

                    </div>
                `;
            }).join('');
        }

        // =========================================================================
        // ฟังก์ชันสร้างและอัปเดตกล่องบอกจำนวนคงเหลือ ใต้ข้อความหัวข้อคิว
        // =========================================================================
        function updateQueueCounterBadge(stage, count, qList) {
            let countBadge = document.getElementById(`queue-count-badge-${stage}`);
            
            if (!countBadge && qList) {
                // ค้นหา Header หัวข้อคิวที่อยู่เหนือกล่องรายการ qList
                let container = qList.closest('.flex-col') || qList.parentElement;
                let headings = container ? container.querySelectorAll('h1, h2, h3, h4, h5, div, span, p') : [];
                let targetHeader = null;
                
                for (let h of headings) {
                    let txt = h.innerText ? h.innerText.trim() : '';
                    if (h.children.length <= 1 && (txt.includes('คิวรอสั่งการ') || txt.includes('คิวรอลงนาม') || txt.includes('คิวรอลงรับ') || txt.includes('คิวงาน') || txt.includes('คิวเอกสาร'))) {
                        targetHeader = h;
                        break;
                    }
                }
                
                countBadge = document.createElement('div');
                countBadge.id = `queue-count-badge-${stage}`;
                countBadge.className = 'mt-1 mb-2';

                if (targetHeader) {
                    targetHeader.parentNode.insertBefore(countBadge, targetHeader.nextSibling);
                } else if (qList.previousElementSibling) {
                    qList.parentNode.insertBefore(countBadge, qList);
                } else {
                    qList.parentNode.insertBefore(countBadge, qList);
                }
            }

            if (countBadge) {
                let label = (stage === 4) ? 'รอสั่งการ' : ([1, 5, 65].includes(stage) ? 'รอลงรับ' : 'รอลงนาม');
                countBadge.innerHTML = `
                    <div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-300 rounded-lg text-xs font-bold text-amber-900 shadow-xs">
                        <span class="flex h-2 w-2 relative">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span>${label}:</span>
                        <span class="bg-amber-500 text-white px-2 py-0.5 rounded-md text-xs font-black shadow-inner tracking-wide">${count}</span>
                        <span>ฉบับ</span>
                    </div>
                `;
            }
        }

		
		// ฟังก์ชันสร้างปุ่มสถานะ ดึงชื่อลำดับปัจจุบันตรงตามที่แสดงในไทม์ไลน์
		function getCurrentStepBadge(doc) {
			if (doc.stage === 99) {
				return `<button type="button" onclick="showSignatureTimeline('${doc.id}')" class="bg-emerald-100 text-emerald-800 hover:text-emerald-900 hover:bg-emerald-200 px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-emerald-300 whitespace-nowrap cursor-pointer transition">
					<i class="fa-solid fa-circle-check text-emerald-600"></i> ลงนามครบ
				</button>`;
			}

			let mainGroup = (doc.assignedGroups && doc.assignedGroups.length > 0) ? doc.assignedGroups[0] : '';
			let subGroup = (doc.subGroups && doc.subGroups.length > 0) ? doc.subGroups[0] : '';
			let assignee = doc.assigneeName || 'ผู้รับผิดชอบ';

			// ดึงชื่อลำดับขั้นตอนที่กำลังดำเนินการอยู่ ให้ตรงกับ stagesDef ของไทม์ไลน์
			let currentStepName = 'รอดำเนินการ';
			switch (doc.stage) {
				case 1:
					currentStepName = 'ธุรการกลาง';
					break;
				case 4:
					currentStepName = 'ผอ.';
					break;
				case 5:
					currentStepName = mainGroup ? `ธุรการ${mainGroup}` : 'ธุรการกลุ่ม';
					break;
				case 6:
					currentStepName = mainGroup ? `รอง ผอ.${mainGroup}` : 'รอง ผอ.กลุ่ม';
					break;
				case 65:
					currentStepName = subGroup ? `ธุรการ${subGroup}` : 'ธุรการกลุ่มงาน';
					break;
				case 7:
					currentStepName = subGroup ? `ผช. ผอ.${subGroup}` : 'ผช.กลุ่มงาน';
					break;
				case 8:
					currentStepName = assignee;
					break;
			}

			return `<span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-indigo-200 whitespace-nowrap">
				<i class="fa-solid fa-arrow-right-long text-indigo-500"></i>
				<span class="font-bold">${currentStepName}</span>
			</span>`;
		}
		
		
		
		// =========================================================================
		// ฟังก์ชันแสดงรายการกล่องหนังสือเข้า (renderInboxList)
		// =========================================================================
		function renderInboxList() {
			const list = document.getElementById('inbox-list');
			if (!list) return;
			
			const currentRoomName = document.getElementById('banner-room-name').innerText;
			const normalizedRoom = currentRoomName.replace(/ฯ/g, '').trim();
			const isCentral = (currentRoomName === 'ห้องสารบรรณกลาง');
			const userRole = state.user.role;
			
			/* [ข้อ 11] แก้บั๊ก "หนังสือไปโผล่ในกล่องของคนที่ไม่ใช่บทบาทตามการส่งต่อ"
			   สาเหตุเดิม : ทุกสาขามี else ปิดท้ายที่คืน "ทุก stage ของห้องนั้น"
			                ทำให้ผู้ใช้ที่บทบาทไม่ตรง (เช่น ครูผู้รับผิดชอบที่เข้าห้องสารบรรณกลาง)
			                เห็นหนังสือ stage 1 และ 4 ไปด้วย
			   วิธีแก้    : จับคู่ stage กับบทบาทแบบตายตัว ใครไม่ตรงคือไม่เห็น
			                ยกเว้น ADMIN (บทบาทจริงในฐานข้อมูล) ที่ดูได้ทุกขั้นตอนเพื่อการตรวจสอบ
			   เพิ่มเติม  : ถ้ามีการกำหนด "สิทธิ์การลงนาม" (ข้อ 5) จะใช้เป็นตัวกรองอีกชั้น */
			const isRealAdmin = (window.PC && PC.user) ? (PC.user.role === 'ADMIN') : (userRole === 'ADMIN');
			const STAGE_BY_ROLE = {
				Administrative: [1],
				Director: [4], ActingDirector: [4],
				AdminGroup: [5, 65],
				SubdirectorGroup: [6],
				AssistantGroup: [7],
				Assignee: [8]
			};
			const mySignKeys = (window.PC && PC.user && Array.isArray(PC.user.signRoles)) ? PC.user.signRoles : [];
			const SIGNKEY_STAGE = { admin: 1, director: 4, admingroup: 5, subdirectorgroup: 6, subgroupadmin: 65, assistantgroup: 7, assignee: 8 };
			const allowedStages = isRealAdmin
				? [1, 4, 5, 6, 65, 7, 8]
				: (mySignKeys.length
					? mySignKeys.map(k => SIGNKEY_STAGE[k]).filter(v => v)
					: (STAGE_BY_ROLE[userRole] || []));

			let items = state.documentQueue.filter(doc => {
				if (doc.stage === 99) return false;
				// [v23 ข้อ 14] หนังสือที่ ผช.กลุ่ม มอบหมายให้ "ฉัน" เข้ากล่องหนังสือเข้าของฉันเสมอ (ทุกห้อง ทุกบทบาท)
				if (Number(doc.stage) === 8 && typeof window.pcAssignedToMe === 'function') {
					if (window.pcAssignedToMe(doc)) return true;
					if (!isRealAdmin && window.pcAssignedToOthers(doc)) return false;   // มอบให้คนอื่น -> ไม่แสดง
				}
				if (!allowedStages.includes(Number(doc.stage))) return false;

				if (isCentral) {
					// ห้องสารบรรณกลางดูแลเฉพาะขั้นตอน 1 (ลงรับ) และ 4 (ผอ. สั่งการ)
					return Number(doc.stage) === 1 || Number(doc.stage) === 4;
				} else if (currentRoomName.includes('กลุ่มบริหาร')) {
					if (![5, 6].includes(Number(doc.stage))) return false;
					return !!(doc.assignedGroups && doc.assignedGroups.some(g => {
						let ng = g.replace(/ฯ/g, '').trim();
						return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
					}));
				} else {
					if (![65, 7, 8].includes(Number(doc.stage))) return false;
					return !!(doc.subGroups && doc.subGroups.some(g => {
						let ng = g.replace(/ฯ/g, '').trim();
						return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
					}));
				}
			});

			if (isCentral) {
				items = groupDocsForCentral(items);
			}
            
            // เรียกฟังก์ชันอัปเดตจำนวนแจ้งเตือนที่ปุ่ม Inbox และกระดิ่ง
            if (typeof updateNotificationBadges === 'function') {
                updateNotificationBadges(items.length, items.map(d => d.id));   // [v33] ส่งรหัสหนังสือ -> ดังเฉพาะฉบับใหม่จริง
            }
			
			if (items.length === 0) {
				list.innerHTML = '<div class="text-center p-6 text-slate-400 border rounded-xl">ไม่มีเอกสารรอดำเนินการในกล่องเข้า</div>';
				return;
			}

			// จัดเรียงตามความเร่งด่วน และเลขรับของกลุ่มตนเอง
			items.sort((a, b) => {
				if (b.priority !== a.priority) return b.priority - a.priority;
				let getNum = (d) => {
					let r = isCentral ? d.receiveNo : (currentRoomName.includes('กลุ่มบริหาร') ? (d.groupReceiveNo || d.receiveNo) : (d.subgroupReceiveNo || d.groupReceiveNo || d.receiveNo));
					return parseInt((r || '0').split('/')[0]) || 0;
				};
				return getNum(b) - getNum(a);
			});
			
			let itemsPerPage = 10;
			let totalItems = items.length;
			let totalPages = Math.ceil(totalItems / itemsPerPage);
			let displayItems = items;

			if (!inboxShowAll) {
				let start = (inboxCurrentPage - 1) * itemsPerPage;
				displayItems = items.slice(start, start + itemsPerPage);
			}

			let html = displayItems.map((doc, index) => {
				let mainGroup = doc.assignedGroups && doc.assignedGroups.length > 0 ? doc.assignedGroups.join(', ') : '';
				let subGroup = doc.subGroups && doc.subGroups.length > 0 ? doc.subGroups.join(', ') : '';
				let assignee = doc.assigneeName || 'ผู้รับผิดชอบระบบ';

				// แยกเลขรับตามสิทธิ์ของห้อง
				let displayRecNo = '-';
				let regNoTitle = 'ทะเบียนรับ';
				let centralRef = doc.receiveNo ? ` (กลาง: ${doc.receiveNo})` : '';

				if (isCentral) {
					displayRecNo = doc.receiveNo || 'รอรับ';
					regNoTitle = 'ทะเบียนรับ';
				} else if (currentRoomName.includes('กลุ่มบริหาร')) {
					regNoTitle = 'รับกลุ่มบริหาร';
					displayRecNo = doc.groupReceiveNo || 'รอลงรับ';
				} else {
					regNoTitle = 'รับกลุ่มงาน';
					displayRecNo = doc.subgroupReceiveNo || 'รอลงรับ';
				}

				let regNoMain = displayRecNo.split('/')[0] || '-';
				let regNoYear = displayRecNo.split('/')[1] || '';

				let receiverTitle = 'ธุรการกลาง';
				if (isCentral) {
					receiverTitle = doc.adminReceiver || 'ธุรการกลาง';
				} else if (currentRoomName.includes('กลุ่มบริหาร')) {
					receiverTitle = doc.groupReceiver || (mainGroup ? 'ธุรการ' + mainGroup : 'ธุรการ' + currentRoomName);
				} else {
					receiverTitle = doc.subgroupReceiver || (subGroup ? 'ธุรการ' + subGroup : 'ธุรการ' + currentRoomName);
				}
				
				let subjectText = doc.subject || doc.title;
				let senderText = doc.sender || "ไม่ได้ระบุหน่วยงานผู้ส่ง";
				let recipientText = doc.recipient || 'ผู้อำนวยการโรงเรียนปากช่อง';
				let forwardTag = getForwardedGroupsTag(doc, currentRoomName);

				let fullDateTime = doc.lastUpdated ? toArabicNum(doc.lastUpdated) : toArabicNum(getThaiDate());
				if (!fullDateTime.includes('เวลา')) {
					fullDateTime += ` เวลา ${new Date().toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.`;
				}
				fullDateTime = toArabicNum(fullDateTime);

				let badge = '';
				if(doc.priority == 4) badge = '<span class="bg-rose-600 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm whitespace-nowrap">ด่วนที่สุด</span>';
				else if(doc.priority == 3) badge = '<span class="bg-orange-500 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm whitespace-nowrap">ด่วนมาก</span>';
				else if(doc.priority == 2) badge = '<span class="bg-amber-400 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm whitespace-nowrap">ด่วน</span>';
				// [ข้อ 14] แปะป้ายชั้นความลับต่อท้ายป้ายความเร่งด่วน (ซ่อนถ้าเป็น "ทั่วไป")
				if (typeof secrecyBadge === 'function') badge += ' ' + secrecyBadge(doc);

				let recNoBadge = '';
				if (displayRecNo === 'รอลงรับ' || displayRecNo === 'รอรับ') {
					recNoBadge = `<span class="bg-amber-100 text-amber-800 px-3 py-1 rounded-md text-[11px] font-bold shadow-sm whitespace-nowrap border border-amber-300">รอลงรับ${isCentral ? '' : centralRef}</span>`;
				} else {
					recNoBadge = `<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-md text-[11px] font-bold shadow-sm whitespace-nowrap border border-blue-300">รับที่ ${displayRecNo}${isCentral ? '' : centralRef}</span>`;
				}

				let docInfoBadge = `<span class="bg-slate-100 text-slate-700 px-3 py-1 rounded-md text-[11px] font-bold shadow-sm whitespace-nowrap border border-slate-300">ที่ ${doc.docNo || '-'} ลงวันที่ ${doc.docDate || 'ไม่ได้ระบุ'}</span>`;

				let waitRoleText = 'รอดำเนินการ';
				if (doc.stage === 1) waitRoleText = 'รอธุรการกลาง ลงรับ';
				else if (doc.stage === 4) waitRoleText = 'รอ ผอ. ลงนาม';
				else if (doc.stage === 5) waitRoleText = `รอธุรการ${mainGroup || 'กลุ่มบริหาร'} ลงรับ`;
				else if (doc.stage === 6) waitRoleText = `รอ รอง ผอ.${mainGroup || 'กลุ่มบริหาร'} ลงนาม`;
				else if (doc.stage === 65) waitRoleText = `รอธุรการ${subGroup || 'กลุ่มงาน'} ลงรับ`;
				else if (doc.stage === 7) waitRoleText = `รอ ผช. ผอ.${subGroup || 'กลุ่มงาน'} ลงนาม`;
				else if (doc.stage === 8) waitRoleText = `รอ ${assignee} ปฏิบัติงาน`;

				let statusBadge = `<span class="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-amber-200 whitespace-nowrap"><i class="fa-solid fa-clock-rotate-left text-amber-500"></i> ${waitRoleText}</span>`;

				let assignedMain = (doc.assignedGroups && doc.assignedGroups.length > 0) ? doc.assignedGroups[0] : '';
				let assignedSub = (doc.subGroups && doc.subGroups.length > 0) ? doc.subGroups[0] : '';
				let assignedPerson = doc.assigneeName ? doc.assigneeName : 'ผู้รับผิดชอบ';

				const stagesDef = [
					{ id: 1, name: 'ธุรการกลาง' },
					{ id: 4, name: 'ผอ.' },
					{ id: 5, name: assignedMain ? `ธุรการ${assignedMain}` : 'ธุรการกลุ่ม' },
					{ id: 6, name: assignedMain ? `รอง ผอ.${assignedMain}` : 'รอง ผอ.กลุ่ม' },
					{ id: 65, name: assignedSub ? `ธุรการ${assignedSub}` : 'ธุรการกลุ่มงาน' },
					{ id: 7, name: assignedSub ? `ผช.${assignedSub}` : 'ผช.กลุ่มงาน' },
					{ id: 8, name: assignedPerson },
					{ id: 99, name: 'เสร็จสิ้น' }
				];

				let currentReader = stagesDef.find(s => s.id === doc.stage)?.name || 'เสร็จสิ้น';
				// [v28 ข้อ 3] แสดงว่าผู้รับขั้นตอนปัจจุบันเปิดอ่านแล้วหรือยัง (window.pcReadBadge) , ไม่มี -> ปุ่มเดิม
				let readersBtnHtml = typeof window.pcReadBadge === 'function' ? window.pcReadBadge(doc, currentReader) : `<button onclick="Swal.fire('สถานะ', 'รอเปิดอ่านโดย: ${currentReader}', 'info')" class="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-indigo-200"><i class="fa-solid fa-book-open"></i> ผู้เปิดอ่าน: ${currentReader}</button>`;

				let attachIcon = doc.attachments && doc.attachments.length > 0
					? `<button onclick="previewAttachments('${doc.id}')" class="bg-slate-100 text-slate-700 hover:bg-slate-200 transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-slate-300"><i class="fa-solid fa-paperclip"></i> ไฟล์แนบ</button>`
					: '';

				let recallBtnHtml = '';
				let canRecall = false;
				let targetStage = 1;

				let userTitle = userTitleForMatch();   // [ข้อ 12] รวมทุกกลุ่มงานที่ผู้ใช้สังกัด
				let isMainMatch = doc.assignedGroups && doc.assignedGroups.some(g => userTitle.includes(g.replace(/ฯ/g, '').trim()));
				let isSubMatch = doc.subGroups && doc.subGroups.some(g => userTitle.includes(g.replace(/ฯ/g, '').trim()));

				let prevStageId = getPrevActiveStage(doc.stage); // คำนวณขั้นตอนที่แล้ว
				if (userRole === 'Administrative' && prevStageId === 1) { canRecall = true; targetStage = 1; }
				else if (['Director', 'ActingDirector'].includes(userRole) && prevStageId === 4) { canRecall = true; targetStage = 4; }
				else if (userRole === 'AdminGroup' && prevStageId === 5 && isMainMatch) { canRecall = true; targetStage = 5; }
				else if (userRole === 'SubdirectorGroup' && prevStageId === 6 && isMainMatch) { canRecall = true; targetStage = 6; }
				else if (userRole === 'AdminGroup' && prevStageId === 65 && isSubMatch) { canRecall = true; targetStage = 65; }
				else if (userRole === 'AssistantGroup' && prevStageId === 7 && isSubMatch) { canRecall = true; targetStage = 7; }
				else if (userRole === 'ADMIN' && doc.stage > 1) { 
					canRecall = true; 
					targetStage = prevStageId; 
				}

				if (canRecall) {
					recallBtnHtml = `<button onclick="recallDocument('${doc.id}', ${targetStage})" class="bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-rose-200"><i class="fa-solid fa-rotate-left"></i> ดึงเรื่องกลับ</button>`;
				}

				let viewFileBtnHtml = `<button onclick="viewMainDocument('${doc.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-100 transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-blue-200"><i class="fa-solid fa-file-image"></i> ดูไฟล์หนังสือ</button>`;

				let canSign = false;
				if (state.user.role === 'ADMIN') canSign = true;
				else if (['Administrative'].includes(state.user.role) && doc.stage === 1) canSign = true;
				else if (['Director', 'ActingDirector'].includes(state.user.role) && doc.stage === 4) canSign = true;
				else if (['AdminGroup'].includes(state.user.role) && doc.stage === 5 && isMainMatch) canSign = true;
				else if (['SubdirectorGroup'].includes(state.user.role) && doc.stage === 6 && isMainMatch) canSign = true;
				else if (['AdminGroup'].includes(state.user.role) && doc.stage === 65 && isSubMatch) canSign = true;
				else if (['AssistantGroup'].includes(state.user.role) && doc.stage === 7 && isSubMatch) canSign = true;
				else if (['Assignee'].includes(state.user.role) && doc.stage === 8) canSign = true;
				// [ชุด 3 ข้อ 7] ใช้กติกาเดียวกับปุ่มลงนาม (รวมสิทธิ์ลงนามรายบุคคล) เพื่อให้ปุ่มแสดงตรงกับที่เปิดได้จริง
				if (window.PC && typeof PC.signTabForDoc === 'function') canSign = !!PC.signTabForDoc(doc);

				let signBtnHtml = '';
				if (canSign && doc.stage !== 99) {
					signBtnHtml = `<button onclick="goToSign('${doc.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-indigo-700"><i class="fa-solid fa-pen-nib"></i> ลงนาม</button>`;
				}

				let catArray = (doc.category && doc.category.length > 0) ? doc.category : (mainGroup ? [mainGroup] : ['ทั่วไป']);
				if (!Array.isArray(catArray)) catArray = [catArray];

				let firstCat = catArray[0] || 'ทั่วไป';
				let cardBgColor = 'bg-slate-50/30';
				
				// กำหนดสถานะและสีพื้นหลังการ์ด
				const isCompleted = (doc.stage === 99);
				if (isCompleted) {
					cardBgColor = 'bg-emerald-50/50';
				} else {
					if (firstCat.includes('วิชาการ')) cardBgColor = 'bg-rose-50/40';
					else if (firstCat.includes('งบประมาณ')) cardBgColor = 'bg-emerald-50/40';
					else if (firstCat.includes('บุคคล')) cardBgColor = 'bg-blue-50/40';
					else if (firstCat.includes('ทั่วไป')) cardBgColor = 'bg-amber-50/40';
				}

				// กำหนดสีแถบด้านซ้ายและตัวหนังสือ
				const leftBg = isCompleted ? 'bg-emerald-600' : 'bg-amber-400';
				const leftHeaderBg = isCompleted ? 'bg-emerald-800 text-white' : 'bg-amber-500 text-amber-950';
				const leftNumberColor = isCompleted ? 'text-white' : 'text-amber-950';
				const leftYearColor = isCompleted ? 'text-emerald-100' : 'text-amber-900';

				// ปุ่มกระพริบ (Blinking Bubble) แสดงสถานะหนังสือ
				const statusBubbleHtml = isCompleted
					? `<div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 text-emerald-800 text-[8px] sm:text-[9px] font-bold shadow-xs mb-1">
						<span class="relative flex h-1.5 w-1.5 shrink-0">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-600"></span>
						</span>
						<span class="whitespace-nowrap">ลงนามครบ</span>
					   </div>`
					: `<div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/85 text-amber-950 border border-amber-300/60 text-[8px] sm:text-[9px] font-bold shadow-xs mb-1">
						<span class="relative flex h-1.5 w-1.5 shrink-0">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-600"></span>
						</span>
						<span class="whitespace-nowrap">กำลังดำเนินการ</span>
					   </div>`;

				let docCategoryBadges = catArray.map(cat => {
					let badgeColor = 'bg-slate-700';
					if (cat.includes('วิชาการ')) badgeColor = 'bg-rose-600';
					else if (cat.includes('งบประมาณ')) badgeColor = 'bg-emerald-600';
					else if (cat.includes('บุคคล')) badgeColor = 'bg-blue-600';
					else if (cat.includes('ทั่วไป')) badgeColor = 'bg-amber-600';
					return `<span class="${badgeColor} text-white px-3 py-1.5 rounded-md text-[10px] font-bold shadow-sm">${cat}</span>`;
				}).join('');

				let timelineHtml = `<div id="tl-${doc.id}" class="hidden flex items-start w-full mt-2.5 pt-3 border-t border-slate-200/60 overflow-x-auto no-scrollbar pb-2 transition-all duration-300">`;
				stagesDef.forEach((st, idx) => {
					let currentStageIndex = stagesDef.findIndex(s => s.id === doc.stage);
					let isCurrent = doc.stage === st.id;
					let isPassed = idx < currentStageIndex || doc.stage === 99;

					let dotColor = isCurrent ? 'bg-red-500' : (isPassed ? 'bg-emerald-500' : 'bg-slate-300');
					let textColor = isCurrent ? 'text-slate-900 font-bold' : (isPassed ? 'text-slate-800 font-bold' : 'text-slate-400');

					let dotHtml = isCurrent
						? `<span class="relative flex h-3.5 w-3.5 shrink-0"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span></span>`
						: `<div class="w-3 h-3 rounded-full shrink-0 ${dotColor}"></div>`;

					let stepSubtext = '';
					if (isCurrent || isPassed) {
						let timeToShow = doc.stepTimes && doc.stepTimes[st.id] ? toArabicNum(doc.stepTimes[st.id]) : (isCurrent ? fullDateTime : '');
						if (timeToShow) {
							stepSubtext = `<div class="text-[9px] text-slate-500 font-medium whitespace-nowrap text-center leading-tight mt-1">${timeToShow.split(', เวลา ').join('<br>เวลา ')}</div>`;
						}
					}

					timelineHtml += `
						<div class="flex flex-col items-center min-w-[55px] relative">
							<div class="h-4 flex items-center justify-center">${dotHtml}</div>
							<span class="text-[9px] mt-1 whitespace-nowrap ${textColor}">${st.name}</span>
							${stepSubtext}
						</div>
					`;

					if (idx < stagesDef.length - 1) {
						let lineColor = isPassed && !isCurrent ? 'bg-emerald-400' : 'bg-slate-200';
						timelineHtml += `<div class="flex-1 h-0.5 mx-1 ${lineColor} min-w-[20px] mt-2"></div>`;
					}
				});
				timelineHtml += `</div>`;

				return `
					<div class="flex flex-row bg-white border ${isCompleted ? 'border-green-400' : 'border-slate-200'} rounded-2xl hover:shadow-md transition mb-3 overflow-hidden relative">
						<div class="w-[85px] sm:w-[100px] ${leftBg} flex flex-col shrink-0 text-center shadow-md z-10 transition-colors">
							<div class="${leftHeaderBg} py-1.5 text-[9px] font-bold uppercase tracking-wider shadow-sm px-1 truncate" title="${regNoTitle}">
								${regNoTitle}
							</div>
							<div class="flex-1 flex flex-col justify-center items-center p-1">
								${statusBubbleHtml}
								<span class="${regNoMain === 'รอลงรับ' || regNoMain === 'รอรับ' ? 'text-xl sm:text-2xl' : 'text-4xl sm:text-5xl'} font-extrabold leading-none mb-1 ${leftNumberColor}">${regNoMain}</span>
								<span class="text-xs sm:text-sm font-bold ${leftYearColor}">${regNoYear}</span>
							</div>
						</div>

						<div class="p-3 flex-1 relative flex flex-col min-w-0 ${cardBgColor}">
							<div class="absolute top-3 right-3 text-right hidden sm:flex gap-2 z-20">
								${docCategoryBadges}
							</div>

							<div class="flex items-center gap-2 flex-wrap pr-0 sm:pr-40">
								${recNoBadge}
								${docInfoBadge}
								${badge}
								${attachIcon}
							</div>

							<div class="text-[15px] font-bold text-slate-800 mt-1.5 leading-snug">
								${subjectText}
							</div>

							<div class="text-[11.5px] text-slate-600 mt-1 flex items-start gap-2 flex-wrap">
								<i class="fa-regular fa-paper-plane mt-0.5 text-sky-500 shrink-0 text-sm"></i>
								<span class="flex items-center flex-wrap"><strong class="text-slate-700">จาก:</strong>&nbsp;${senderText}&nbsp;&bull;&nbsp;<strong class="text-slate-700">ถึง:</strong>&nbsp;${recipientText}${forwardTag}</span>
							</div>

							<div class="text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 mt-1.5 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
								<div class="flex items-center gap-2 flex-wrap w-full">
									<span class="flex items-center gap-1.5"><i class="fa-regular fa-calendar text-amber-500 text-sm"></i> รับเมื่อ ${fullDateTime}</span>
									<span class="flex items-center gap-1.5 sm:border-r sm:border-slate-200 sm:pr-4 sm:mr-1"><i class="fa-regular fa-user text-purple-500 text-sm"></i> ${receiverTitle}</span>

									<div class="flex items-center flex-wrap gap-1.5 mt-1 sm:mt-0">
										${readersBtnHtml}
										${viewFileBtnHtml}
										${statusBadge}
										${signBtnHtml}
										${recallBtnHtml}
										<button onclick="const el = document.getElementById('tl-${doc.id}'); el.classList.toggle('hidden'); this.innerHTML = el.classList.contains('hidden') ? '<i class=\\'fa-solid fa-clock-rotate-left\\'></i> แสดงไทม์ไลน์' : '<i class=\\'fa-solid fa-clock-rotate-left\\'></i> ซ่อนไทม์ไลน์';" class="text-blue-500 hover:text-blue-700 font-bold flex items-center gap-1 transition text-[10px] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded border border-blue-100">
											<i class="fa-solid fa-clock-rotate-left"></i> แสดงไทม์ไลน์
										</button>
									</div>
								</div>
							</div>

							${timelineHtml}
						</div>
					</div>
				`;
			}).join('');

			html += buildPaginationUI('inbox', inboxCurrentPage, totalPages, inboxShowAll);
			list.innerHTML = html;
		}

		
		
		// =========================================================================
		// ฟังก์ชันแสดงรายการทะเบียนหนังสือรับ (renderAllDocsList)
		// =========================================================================
		function renderAllDocsList() {
			const list = document.getElementById('alldocs-list');
			if (!list) return;
			
			const currentRoomName = document.getElementById('banner-room-name').innerText;
			const normalizedRoom = currentRoomName.replace(/ฯ/g, '').trim();
			const isCentral = (currentRoomName === 'ห้องสารบรรณกลาง');
			const isMainGroup = currentRoomName.includes('กลุ่มบริหาร');
			const userRole = state.user.role;

			// 1. คัดกรองหนังสือตามสิทธิ์ของแต่ละห้อง
			// [ชุด 3 ข้อ 4] แหล่งข้อมูล = หนังสือในระบบ หรือคลังรายปีที่เลือก (ปุ่ม "ย้อนหลัง")
			const regSource = (typeof window.registrySource === 'function') ? window.registrySource() : state.documentQueue;
			let items = regSource.filter(doc => {
				if (isCentral) {
					if (['Director', 'ActingDirector'].includes(userRole)) {
						return Boolean(doc.receiveNo && (doc.stage >= 5 || doc.stage === 99));
					} else {
						return Boolean(doc.receiveNo && (doc.stage >= 4 || doc.stage === 99));
					}
				} else if (isMainGroup) {
					let isMainMatch = doc.assignedGroups && doc.assignedGroups.some(g => {
						let ng = g.replace(/ฯ/g, '').trim();
						return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
					});
					let isReceivedOrSigned = doc.groupReceiveNo || doc.stage >= 6 || doc.stepTimes?.[5] || doc.stage === 99;
					return isMainMatch && isReceivedOrSigned;
				} else {
					let isSubMatch = doc.subGroups && doc.subGroups.some(g => {
						let ng = g.replace(/ฯ/g, '').trim();
						return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
					});
					let isReceivedOrSigned = doc.subgroupReceiveNo || doc.stage >= 7 || doc.stepTimes?.[65] || doc.stage === 99;
					return isSubMatch && isReceivedOrSigned;
				}
			});

			// 2. รวบเอกสารฉบับเดียวกันให้แสดงเพียงการ์ดเดียว:
			// - ห้องสารบรรณกลาง
			// - กลุ่มบริหาร... (ทั้ง ธุรการกลุ่มบริหาร และ รอง ผอ. กลุ่มบริหาร)
			if (isCentral || isMainGroup) {
				let map = new Map();
				items.forEach(doc => {
					let key = doc.rootDocId || doc.groupReceiveNo || doc.receiveNo || doc.id;
					if (!map.has(key)) {
						map.set(key, doc);
					}
				});
				items = Array.from(map.values());
			} else {
				// [v23 ข้อ 14] ห้องกลุ่มงาน : ฉบับที่แยกให้ผู้รับผิดชอบแต่ละคน รวมเป็นการ์ดเดียว
				// (ถ้ายังมีผู้รับผิดชอบที่ยังไม่ลงรับ ให้แสดงฉบับที่ยังดำเนินการอยู่ -> "ลงนามครบ" เมื่อทุกคนลงรับแล้ว)
				let map = new Map();
				items.forEach(doc => {
					let key = (doc.rootDocId || doc.id) + '|' + ((doc.subGroups || [])[0] || '') + '|' + (doc.subgroupReceiveNo || '');
					let cur = map.get(key);
					if (!cur || (Number(cur.stage) === 99 && Number(doc.stage) !== 99)) map.set(key, doc);
				});
				items = Array.from(map.values());
			}

			// [ชุด 3 ข้อ 4] กรองช่วงเวลา (วันนี้/เดือนนี้/ปีนี้/ทั้งหมด) + สถานะ + คำค้น
			if (typeof window.registryPostFilter === 'function') items = window.registryPostFilter(items);

			window.currentAllDocsFiltered = items; // อัปเดตรายการหนังสือทันที

			if(items.length === 0) {
				const ctrl = document.getElementById('alldocs-controls');
				if (ctrl) ctrl.innerHTML = ''; // ล้างแถบ pagination ทันทีหากไม่มีเอกสาร
				list.innerHTML = `
					<div class="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center">
						<i class="fa-solid fa-folder-open text-4xl text-slate-300 mb-3"></i>
						<h4 class="font-bold text-slate-500">ยังไม่มีหนังสือที่ลงรับในห้องนี้</h4>
						<p class="text-xs text-slate-400 mt-1">หนังสือที่ผ่านการลงรับหรือลงนามแล้วจะแสดงในทะเบียนนี้</p>
					</div>`;
				return;
			}

			// 3. จัดเรียงตามเลขทะเบียนรับของกลุ่มตนเอง (ล่าสุด/เลขมากสุด ไว้บนสุด)
			items.sort((a, b) => {
				let getNum = (d) => {
					let r = isCentral ? d.receiveNo : (isMainGroup ? (d.groupReceiveNo || d.receiveNo) : (d.subgroupReceiveNo || d.groupReceiveNo || d.receiveNo));
					return parseInt((r || '0').split('/')[0]) || 0;
				};
				
				let numA = getNum(a);
				let numB = getNum(b);
				
				if (numB !== numA) {
					return numB - numA;
				}
				return b.priority - a.priority;
			});

			// 4. ระบบแบ่งหน้า Pagination (รับค่าจาก Dropdown ค่าเริ่มต้น 10 การ์ด)
			let itemsPerPage = alldocsItemsPerPage || 10;
			let totalItems = items.length;
			let totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
			if (alldocsCurrentPage > totalPages) alldocsCurrentPage = 1; // ป้องกันหน้าค้างเกินขอบเขต
			let displayItems = items;

			if (!alldocsShowAll) {
				let start = (alldocsCurrentPage - 1) * itemsPerPage;
				displayItems = items.slice(start, start + itemsPerPage);
			} else if (items.length > 300) {
				// [ชุด 3 ข้อ 4] "แสดงทั้งหมด" วาดสูงสุด 300 การ์ด (หลายพันการ์ดทำให้เบราว์เซอร์ค้าง) — ใช้ตัวกรอง/ค้นหาเพื่อหาเรื่องที่ต้องการ
				displayItems = items.slice(0, 300);
			}

			// 5. เรนเดอร์การ์ดรายการหนังสือ
			let html = displayItems.map((doc, index) => {
				let displayRecNo = doc.receiveNo || '-';
				let regNoTitle = 'ทะเบียนรับ';
				let centralRef = doc.receiveNo ? ` (กลาง: ${doc.receiveNo})` : '';

				if (currentRoomName.includes('กลุ่มงาน') && doc.subgroupReceiveNo) {
					displayRecNo = doc.subgroupReceiveNo;
					regNoTitle = 'รับกลุ่มงาน';
				} else if (isMainGroup && doc.groupReceiveNo) {
					displayRecNo = doc.groupReceiveNo;
					regNoTitle = 'รับกลุ่มบริหาร';
				}

				let regNoMain = displayRecNo.split('/')[0] || '-';
				let regNoYear = displayRecNo.split('/')[1] || '';

				let mainGroup = doc.assignedGroups && doc.assignedGroups.length > 0 ? doc.assignedGroups.join(', ') : '';
				let subGroup = doc.subGroups && doc.subGroups.length > 0 ? doc.subGroups.join(', ') : '';
				let assignee = doc.assigneeName || 'ผู้รับผิดชอบระบบ';

				let receiverTitle = 'ธุรการกลาง';
				if (isCentral) {
					receiverTitle = doc.adminReceiver || 'ธุรการกลาง';
				} else if (isMainGroup) {
					receiverTitle = doc.groupReceiver || (mainGroup ? 'ธุรการ' + mainGroup : 'ธุรการ' + currentRoomName);
				} else {
					receiverTitle = doc.subgroupReceiver || (subGroup ? 'ธุรการ' + subGroup : 'ธุรการ' + currentRoomName);
				}

				let subjectText = doc.subject || doc.title;
				let senderText = doc.sender || "ไม่ได้ระบุหน่วยงานผู้ส่ง";
				let recipientText = doc.recipient || 'ผู้อำนวยการโรงเรียนปากช่อง';
				let forwardTag = getForwardedGroupsTag(doc, currentRoomName);

				let fullDateTime = doc.lastUpdated ? toArabicNum(doc.lastUpdated) : toArabicNum(getThaiDate());
				if (!fullDateTime.includes('เวลา')) {
					fullDateTime += ` เวลา ${new Date().toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.`;
				}
				fullDateTime = toArabicNum(fullDateTime);

				let badge = '';
				if(doc.priority == 4) badge = '<span class="bg-rose-600 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm whitespace-nowrap">ด่วนที่สุด</span>';
				else if(doc.priority == 3) badge = '<span class="bg-orange-500 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm whitespace-nowrap">ด่วนมาก</span>';
				else if(doc.priority == 2) badge = '<span class="bg-amber-400 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm whitespace-nowrap">ด่วน</span>';
				// [ข้อ 14] แปะป้ายชั้นความลับต่อท้ายป้ายความเร่งด่วน (ซ่อนถ้าเป็น "ทั่วไป")
				if (typeof secrecyBadge === 'function') badge += ' ' + secrecyBadge(doc);

				let recNoBadge = `<span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-md text-[11px] font-bold shadow-sm whitespace-nowrap border border-emerald-300">รับที่ ${displayRecNo}${isCentral ? '' : centralRef}</span>`;
				let docInfoBadge = `<span class="bg-slate-100 text-slate-700 px-3 py-1 rounded-md text-[11px] font-bold shadow-sm whitespace-nowrap border border-slate-300">ที่ ${doc.docNo || '-'} ลงวันที่ ${doc.docDate || 'ไม่ได้ระบุ'}</span>`;

				let statusBadge = '';
				if (doc.stage === 99) {
					// [v23 ข้อ 16] กดที่ "ลงนามครบ" -> โมดอลความเห็นของทุกคนตามลำดับเวลา
					statusBadge = `<button type="button" onclick="showSignatureTimeline('${doc.id}')" title="ดูความเห็นของทุกขั้นตอน" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-emerald-300 whitespace-nowrap cursor-pointer transition"><i class="fa-solid fa-circle-check text-emerald-600"></i> ลงนามครบ <i class="fa-solid fa-comments text-emerald-500"></i></button>`;
				} else {
					let lastActor = 'ธุรการกลาง';
					let nextActor = 'ผอ.';

					let rootKey = doc.rootDocId || doc.id;
					let siblings = state.documentQueue.filter(d => 
						(d.rootDocId && (d.rootDocId === rootKey || d.rootDocId === doc.id)) ||
						d.id === rootKey ||
						(doc.receiveNo && d.receiveNo === doc.receiveNo)
					);
					if (siblings.length === 0) siblings = [doc];

					if (doc.stage === 4) {
						lastActor = 'ธุรการกลาง (ลงรับ)';
						nextActor = 'ผอ.';
					} else if (doc.stage === 5) {
						lastActor = 'ผอ. (สั่งการ)';
						let allMainGroups = [];
						siblings.forEach(s => {
							let mList = s.assignedGroups || [];
							mList.forEach(g => {
								let cleanG = g.replace(/ฯ/g, '').trim();
								if (!allMainGroups.includes(cleanG)) allMainGroups.push(cleanG);
							});
						});
						if (allMainGroups.length > 0) {
							nextActor = allMainGroups.map(g => `ธุรการ${g}`).join('&');
						} else {
							nextActor = mainGroup ? `ธุรการ${mainGroup}` : 'ธุรการกลุ่มบริหาร';
						}
					} else if (doc.stage === 6) {
						lastActor = mainGroup ? `ธุรการ${mainGroup} (ลงรับ)` : 'ธุรการกลุ่ม';
						nextActor = mainGroup ? `รอง ผอ.${mainGroup}` : 'รอง ผอ.กลุ่ม';
					} else if (doc.stage === 65) {
						lastActor = mainGroup ? `รอง ผอ.${mainGroup} (สั่งการ)` : 'รอง ผอ.กลุ่ม';
						let allSubGroups = [];
						siblings.forEach(s => {
							let sList = s.subGroups || [];
							sList.forEach(sg => {
								let cleanSg = sg.replace(/ฯ/g, '').trim();
								if (!allSubGroups.includes(cleanSg)) allSubGroups.push(cleanSg);
							});
						});
						if (allSubGroups.length > 0) {
							nextActor = allSubGroups.map(sg => `ธุรการ${sg}`).join('&');
						} else {
							nextActor = subGroup ? `ธุรการ${subGroup}` : 'ธุรการกลุ่มงาน';
						}
					} else if (doc.stage === 7) {
						lastActor = subGroup ? `ธุรการ${subGroup} (ลงรับ)` : 'ธุรการกลุ่มงาน';
						nextActor = subGroup ? `ผช. ผอ.${subGroup}` : 'ผช.กลุ่มงาน';
					} else if (doc.stage === 8) {
						lastActor = subGroup ? `ผช. ผอ.${subGroup} (ลงนาม)` : 'ผช.กลุ่มงาน';
						nextActor = assignee;
					}

					statusBadge = `<span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-indigo-200 whitespace-nowrap">
						<span>${lastActor}</span>
						<i class="fa-solid fa-arrow-right text-[9px] text-indigo-400 mx-0.5"></i>
						<span class="text-indigo-900 font-bold">${nextActor}</span>
					</span>`;
				}

				let recallBtnHtml = '';
				let canRecall = false;
				let targetStage = 1;

				let userTitle = userTitleForMatch();   // [ข้อ 12] รวมทุกกลุ่มงานที่ผู้ใช้สังกัด
				let isMainMatch = doc.assignedGroups && doc.assignedGroups.some(g => userTitle.includes(g.replace(/ฯ/g, '').trim()));
				let isSubMatch = doc.subGroups && doc.subGroups.some(g => userTitle.includes(g.replace(/ฯ/g, '').trim()));

				let prevStageId = getPrevActiveStage(doc.stage); // คำนวณขั้นตอนที่แล้วแบบไดนามิก
				if (userRole === 'Administrative' && prevStageId === 1) { canRecall = true; targetStage = 1; }
				else if (['Director', 'ActingDirector'].includes(userRole) && prevStageId === 4) { canRecall = true; targetStage = 4; }
				else if (userRole === 'AdminGroup' && prevStageId === 5 && isMainMatch) { canRecall = true; targetStage = 5; }
				else if (userRole === 'SubdirectorGroup' && prevStageId === 6 && isMainMatch) { canRecall = true; targetStage = 6; }
				else if (userRole === 'AdminGroup' && prevStageId === 65 && isSubMatch) { canRecall = true; targetStage = 65; }
				else if (userRole === 'AssistantGroup' && prevStageId === 7 && isSubMatch) { canRecall = true; targetStage = 7; }
				else if (userRole === 'ADMIN' && doc.stage > 1) { 
					canRecall = true; 
					targetStage = prevStageId; 
				}

				if (canRecall) {
					recallBtnHtml = `<button onclick="recallDocument('${doc.id}', ${targetStage})" class="bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-rose-200"><i class="fa-solid fa-rotate-left"></i> ดึงเรื่องกลับ</button>`;
				}

				let attachIcon = doc.attachments && doc.attachments.length > 0
					? `<button onclick="previewAttachments('${doc.id}')" class="bg-slate-100 text-slate-700 hover:bg-slate-200 transition px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm flex items-center gap-1 border border-slate-300"><i class="fa-solid fa-paperclip"></i> ไฟล์แนบ (${doc.attachments.length})</button>`
					: '';

				let viewFileBtnHtml = `<button onclick="viewFinalDocument('${doc.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white transition px-3 py-1.5 rounded-md text-[11px] font-bold shadow-sm flex items-center gap-1"><i class="fa-solid fa-file-invoice"></i> เปิดดูเอกสาร</button>`;

				let catArray = (doc.category && doc.category.length > 0) ? doc.category : (mainGroup ? [mainGroup] : ['ทั่วไป']);
				if (!Array.isArray(catArray)) catArray = [catArray];

				let firstCat = catArray[0] || 'ทั่วไป';
				let cardBgColor = 'bg-slate-50/30';
				
				// กำหนดสถานะและสีพื้นหลังการ์ด
				const isCompleted = (doc.stage === 99);
				if (isCompleted) {
					cardBgColor = 'bg-emerald-50/50';
				} else {
					if (firstCat.includes('วิชาการ')) cardBgColor = 'bg-rose-50/40';
					else if (firstCat.includes('งบประมาณ')) cardBgColor = 'bg-emerald-50/40';
					else if (firstCat.includes('บุคคล')) cardBgColor = 'bg-blue-50/40';
					else if (firstCat.includes('ทั่วไป')) cardBgColor = 'bg-amber-50/40';
				}

				// กำหนดสีแถบด้านซ้ายและตัวหนังสือ
				const leftBg = isCompleted ? 'bg-emerald-600' : 'bg-amber-400';
				const leftHeaderBg = isCompleted ? 'bg-emerald-800 text-white' : 'bg-amber-500 text-amber-950';
				const leftNumberColor = isCompleted ? 'text-white' : 'text-amber-950';
				const leftYearColor = isCompleted ? 'text-emerald-100' : 'text-amber-900';

				// ปุ่มกระพริบ (Blinking Bubble) แสดงสถานะหนังสือ
				const statusBubbleHtml = isCompleted
					? `<div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 text-emerald-800 text-[8px] sm:text-[9px] font-bold shadow-xs mb-1">
						<span class="relative flex h-1.5 w-1.5 shrink-0">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-600"></span>
						</span>
						<span class="whitespace-nowrap">ลงนามครบ</span>
					   </div>`
					: `<div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/85 text-amber-950 border border-amber-300/60 text-[8px] sm:text-[9px] font-bold shadow-xs mb-1">
						<span class="relative flex h-1.5 w-1.5 shrink-0">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-600"></span>
						</span>
						<span class="whitespace-nowrap">กำลังดำเนินการ</span>
					   </div>`;

				let docCategoryBadges = catArray.map(cat => {
					let badgeColor = 'bg-slate-700';
					if (cat.includes('วิชาการ')) badgeColor = 'bg-rose-600';
					else if (cat.includes('งบประมาณ')) badgeColor = 'bg-emerald-600';
					else if (cat.includes('บุคคล')) badgeColor = 'bg-blue-600';
					else if (cat.includes('ทั่วไป')) badgeColor = 'bg-amber-600';
					return `<span class="${badgeColor} text-white px-3 py-1.5 rounded-md text-[10px] font-bold shadow-sm">${cat}</span>`;
				}).join('');

				const stagesDef = [
					{ id: 1, name: 'ธุรการกลาง' },
					{ id: 4, name: 'ผอ.' },
					{ id: 5, name: mainGroup ? `ธุรการ${mainGroup}` : 'ธุรการกลุ่ม' },
					{ id: 6, name: mainGroup ? `รอง ผอ.${mainGroup}` : 'รอง ผอ.กลุ่ม' },
					{ id: 65, name: subGroup ? `ธุรการ${subGroup}` : 'ธุรการกลุ่มงาน' },
					{ id: 7, name: subGroup ? `ผช.${subGroup}` : 'ผช.กลุ่มงาน' },
					{ id: 8, name: assignee },
					{ id: 99, name: 'เสร็จสิ้น' }
				];

				let timelineHtml = `<div id="tl-all-${doc.id}" class="hidden flex items-start w-full mt-2.5 pt-3 border-t border-slate-200/60 overflow-x-auto no-scrollbar pb-2 transition-all duration-300">`;
				stagesDef.forEach((st, idx) => {
					let currentStageIndex = stagesDef.findIndex(s => s.id === doc.stage);
					let isCurrent = doc.stage === st.id;
					let isPassed = idx < currentStageIndex || doc.stage === 99;

					let dotColor = isCurrent ? 'bg-red-500' : (isPassed ? 'bg-emerald-500' : 'bg-slate-300');
					let textColor = isCurrent ? 'text-slate-900 font-bold' : (isPassed ? 'text-slate-800 font-bold' : 'text-slate-400');

					let dotHtml = isCurrent
						? `<span class="relative flex h-3.5 w-3.5 shrink-0"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span></span>`
						: `<div class="w-3 h-3 rounded-full shrink-0 ${dotColor}"></div>`;

					let stepSubtext = '';
					if (isCurrent || isPassed) {
						let timeToShow = doc.stepTimes && doc.stepTimes[st.id] ? toArabicNum(doc.stepTimes[st.id]) : (isCurrent ? fullDateTime : '');
						if (timeToShow) {
							stepSubtext = `<div class="text-[9px] text-slate-500 font-medium whitespace-nowrap text-center leading-tight mt-1">${timeToShow.split(', เวลา ').join('<br>เวลา ')}</div>`;
						}
					}

					timelineHtml += `
						<div class="flex flex-col items-center min-w-[55px] relative">
							<div class="h-4 flex items-center justify-center">${dotHtml}</div>
							<span class="text-[9px] mt-1 whitespace-nowrap ${textColor}">${st.name}</span>
							${stepSubtext}
						</div>
					`;

					if (idx < stagesDef.length - 1) {
						let lineColor = isPassed && !isCurrent ? 'bg-emerald-400' : 'bg-slate-200';
						timelineHtml += `<div class="flex-1 h-0.5 mx-1 ${lineColor} min-w-[20px] mt-2"></div>`;
					}
				});
				timelineHtml += `</div>`;

				return `
					<div class="flex flex-row bg-white border ${isCompleted ? 'border-green-400' : 'border-slate-200'} rounded-2xl hover:shadow-md transition mb-3 overflow-hidden relative">
						<div class="w-[85px] sm:w-[100px] ${leftBg} flex flex-col shrink-0 text-center shadow-md z-10 transition-colors">
							<div class="${leftHeaderBg} py-1.5 text-[9px] font-bold uppercase tracking-wider shadow-sm px-1 truncate" title="${regNoTitle}">
								${regNoTitle}
							</div>
							<div class="flex-1 flex flex-col justify-center items-center p-1">
								${statusBubbleHtml}
								<span class="text-4xl sm:text-5xl font-extrabold leading-none mb-1 ${leftNumberColor}">${regNoMain}</span>
								<span class="text-xs sm:text-sm font-bold ${leftYearColor}">${regNoYear}</span>
							</div>
						</div>

						<div class="p-3 flex-1 relative flex flex-col min-w-0 ${cardBgColor}">
							<div class="absolute top-3 right-3 text-right hidden sm:flex gap-2 z-20">
								${docCategoryBadges}
							</div>

							<div class="flex items-center gap-2 flex-wrap pr-0 sm:pr-40">
								${recNoBadge}
								${docInfoBadge}
								${badge}
								${attachIcon}
							</div>

							<div class="text-[15px] font-bold text-slate-800 mt-1.5 leading-snug">
								${subjectText}
							</div>

							<div class="text-[11.5px] text-slate-600 mt-1 flex items-start gap-2 flex-wrap">
								<i class="fa-regular fa-paper-plane mt-0.5 text-sky-500 shrink-0 text-sm"></i>
								<span class="flex items-center flex-wrap"><strong class="text-slate-700">จาก:</strong>&nbsp;${senderText}&nbsp;&bull;&nbsp;<strong class="text-slate-700">ถึง:</strong>&nbsp;${recipientText}${forwardTag}</span>
							</div>

							<div class="text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 mt-1.5 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
								<div class="flex items-center gap-2 flex-wrap w-full">
									<span class="flex items-center gap-1.5"><i class="fa-regular fa-calendar text-amber-500 text-sm"></i> รับเมื่อ ${fullDateTime}</span>
									<span class="flex items-center gap-1.5 sm:border-r sm:border-slate-200 sm:pr-4 sm:mr-1"><i class="fa-regular fa-user text-purple-500 text-sm"></i> ${receiverTitle}</span>

									<div class="flex items-center flex-wrap gap-1.5 mt-1 sm:mt-0">
										${typeof window.pcReceiverChip === 'function' ? window.pcReceiverChip(doc, isCentral ? 'central' : (isMainGroup ? 'main' : 'sub')) : ''}
										${typeof window.pcReadBadge === 'function' ? window.pcReadBadge(doc) : ''}
										${viewFileBtnHtml}
										${statusBadge}
										${recallBtnHtml}
										<button onclick="const el = document.getElementById('tl-all-${doc.id}'); el.classList.toggle('hidden'); this.innerHTML = el.classList.contains('hidden') ? '<i class=\\'fa-solid fa-clock-rotate-left\\'></i> แสดงไทม์ไลน์' : '<i class=\\'fa-solid fa-clock-rotate-left\\'></i> ซ่อนไทม์ไลน์';" class="text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1 transition text-[10px] bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded border border-emerald-200">
											<i class="fa-solid fa-clock-rotate-left"></i> แสดงไทม์ไลน์
										</button>
									</div>
								</div>
							</div>

							${timelineHtml}
						</div>
					</div>
				`;
			}).join('');

			window.currentAllDocsFiltered = items; // เก็บข้อมูลหนังสือทั้งหมดในห้องนี้ไว้สำหรับการทำ Export 

			// อัปเดต HTML ตาราง
			list.innerHTML = html;
            
            // เรียกใช้ฟังก์ชันสร้างกล่องควบคุม (Control Bar) ไว้ด้านบน
            if (typeof renderAllDocsControls === 'function') {
                renderAllDocsControls(totalPages);
            }
		}
		

        
        // ฟังก์ชันสำหรับเปิดดูหนังสือในหน้าทะเบียน (พร้อม Scroll เลื่อนอ่าน และกลุ่มปุ่มเครื่องมือ)
        function viewFinalDocument(docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if(doc && doc.currentImage) {
                // เช็คว่ามีไฟล์แนบหรือไม่ เพื่อแสดง/ซ่อนปุ่มดูเอกสารแนบ
                let attachBtnHtml = doc.attachments && doc.attachments.length > 0 
                    ? `<button onclick="viewFinalAttachments('${doc.id}')" class="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-purple-500/40 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-paperclip"></i> ไฟล์แนบ</button>` 
                    : '';

                Swal.fire({
                    title: '<span class="text-lg font-bold">เอกสารเลขรับ: ' + (doc.receiveNo || '-') + '</span>',
                    html: `
                        <div class="max-h-[55vh] overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-100 mb-4">
                            <img src="${pcViewImg(doc)}" class="w-full">
                        </div>
                        <div class="flex flex-wrap sm:flex-nowrap justify-center gap-2">
                            ${attachBtnHtml}
                            <button onclick="shareFinalDoc('${doc.id}')" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/40 transition flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-share-nodes"></i> แชร์
                            </button>
                            <button onclick="downloadFinalDoc('${doc.id}')" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/40 transition flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-download"></i> รูปภาพ
                            </button>
                            <button onclick="printFinalDoc('${doc.id}')" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/40 transition flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-print"></i> พิมพ์
                            </button>
                            <button onclick="exportFinalPdf('${doc.id}')" class="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-rose-500/40 transition flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-file-pdf"></i> ไฟล์ PDF
                            </button>
                        </div>
                    `,
                   width: '800px',
                    showConfirmButton: false,
                    showCloseButton: true,
                    customClass: {
                        popup: 'doc-viewer-modal'
                    }
                });
            }
        }

        // ==========================================
		// ฟังก์ชันเลือกหนังสือ (รองรับการจำสถานะตรายางแบบแก้ได้)
		// ==========================================
		function selectDoc(docId, stage) {
			disablePanMode(getCanvasKey(stage)); // ยกเลิกโหมดมือจับเมื่อเปลี่ยนเอกสาร
			// 1. บันทึกสถานะ Canvas เดิมลงเอกสารก่อนหน้า ป้องกันตรายางหรือรอยขีดเขียนหาย
			let currentActiveId = state.activeDocIds[stage];
			if (currentActiveId) {
				let oldDoc = state.documentQueue.find(d => d.id === currentActiveId);
				let currentCanvas = state.canvases[getCanvasKey(stage)];
				
					if (oldDoc && currentCanvas) {
					currentCanvas.discardActiveObject();
                    
                    // คืนค่าขนาด Canvas เป็น 100% ก่อนบันทึกภาพ เพื่อให้พิกัดตรงกันเสมอ
                    if (currentCanvas.backgroundImage) {
                        const bg = currentCanvas.backgroundImage;
                        currentCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
                        currentCanvas.setWidth(bg.width * bg.scaleX);
                        currentCanvas.setHeight(bg.height * bg.scaleY);
                    }
                    
					currentCanvas.renderAll();
				
				
					// เก็บสถานะ Object ทั้งหมดแบบแยกชิ้น
					const newState = JSON.stringify(currentCanvas.toJSON(['id', 'stampName', 'isCurrentStep', 'selectable', 'evented', 'originalFill', 'originalStroke', 'stampColor']));
					// [v26 ข้อ 4] ถ้าตรา/รอยเขียนไม่เปลี่ยน (ต่างแค่เส้นประกระพริบ) ไม่ต้องบันทึกใหม่ -> ไม่อัปโหลดไป Drive ซ้ำทุกครั้งที่เปิดหน้าลงนาม
					// [v27] ไม่ถ่ายภาพหน้ากระดาษแล้ว : เก็บเฉพาะข้อมูลตรา (ไม่กี่ KB) ภาพพร้อมตราจะสร้างตอนเปิดดู/พิมพ์ (pcDocImage)
					const sameState = !!(oldDoc.canvasState && typeof window.pcCanvasSig === 'function' &&
						window.pcCanvasSig(oldDoc.canvasState) === window.pcCanvasSig(newState));
					if (!sameState) oldDoc.canvasState = newState;
				}
			}

			state.activeDocIds[stage] = docId;
			
			// ** ต้องประกาศตัวแปร doc ตรงนี้ก่อนเรียกใช้ข้อมูลเสมอ **
			const doc = state.documentQueue.find(d => d.id === docId);
			if (!doc) return;

			// 2. เติมข้อมูลลงฟอร์มตาม Stage
			if (stage === 1) {
				let elRecNo = document.getElementById('admin-receive-no'); 
				if (elRecNo) elRecNo.value = doc.receiveNo || '';

				if (!doc.docNo) doc.docNo = 'ศธ 04306/';
				let elDocNo = document.getElementById('admin-doc-no'); 
				if (elDocNo) elDocNo.value = doc.docNo;
				
				// ข้อมูลลงวันที่ (ประกาศ let elDate เพื่อป้องกัน ReferenceError)
				if (!doc.docDate) {
					doc.docDate = typeof formatThaiDateFull === 'function' ? formatThaiDateFull(new Date()) : getThaiDate();
				}
				let elDate = document.getElementById('admin-doc-date');
				if (elDate) elDate.value = doc.docDate;
				if (window.docDatePicker) {
					window.docDatePicker.setDate(new Date(), false);
					if (window.docDatePicker.altInput) window.docDatePicker.altInput.value = doc.docDate;
				}
				
				let elSubj = document.getElementById('admin-subject'); 
				if (elSubj) elSubj.value = doc.subject || doc.title || '';
				
				let popover = document.getElementById('admin-subject-popover'); 
				if (popover) popover.innerText = doc.subject || doc.title || '...';
				
				if (!doc.sender) doc.sender = 'สำนักงานเขตพื้นที่การศึกษามัธยมศึกษานครราชสีมา';
				let elSender = document.getElementById('admin-sender'); 
				if (elSender) elSender.value = doc.sender;
				
				if (!doc.recipient) doc.recipient = 'ผู้อำนวยการโรงเรียนปากช่อง';
				let elRecipient = document.getElementById('admin-recipient'); 
				if (elRecipient) elRecipient.value = doc.recipient;
				
				let radios = document.getElementsByName('priority');
				if (radios.length > 0) {
					let pValue = doc.priority || 1;
					radios.forEach(r => { r.checked = (r.value == pValue); });
				}

				// โหลดข้อมูลปุ่ม Checkbox หมวดหมู่หนังสือ
				let catCheckboxes = document.querySelectorAll('.admin-category-checkbox');
				if (catCheckboxes.length > 0) {
					let catValues = doc.category || [];
					if (!Array.isArray(catValues)) catValues = [catValues]; 
					catCheckboxes.forEach(cb => { 
						cb.checked = catValues.includes(cb.value); 
					});
				}

				if (window.deadlinePicker) {
					if (doc.deadline) window.deadlinePicker.setDate(doc.deadline, false);
					else window.deadlinePicker.clear();
				}
			} else if (stage === 4) {
                // เคลียร์ Checkbox เดิมทั้งหมดก่อน แล้วติ๊กตามที่ระบุใน doc เท่านั้น
                const dirCheckboxes = document.querySelectorAll('.director-group-checkbox');
                dirCheckboxes.forEach(cb => {
                    cb.checked = doc.assignedGroups ? doc.assignedGroups.includes(cb.value) : false;
                });
                let commentEl = document.getElementById('director-comment');
                if (commentEl) commentEl.value = doc.directorComment || 'ทราบ/มอบ';
            } else if (stage === 6) {
				document.querySelectorAll('.subdirector-group-checkbox').forEach(cb => cb.checked = false);
				const txt = document.getElementById('subdirectorgroup-comment'); if (txt) txt.value = 'เรียน ผู้ช่วยกลุ่ม\n- พิจารณาดำเนินการตามเสนอ';
			} else if (stage === 5) {
				const roomName = document.getElementById('banner-room-name').innerText;
				const txt = document.getElementById('admingroup-comment');
				if (txt) txt.value = txt.value.replace(/^.*/, `เรียน รอง ผอ. ${roomName}`);
			} else if (stage === 65) {
				const roomName = document.getElementById('banner-room-name').innerText;
				const txt = document.getElementById('subgroupadmin-comment');
				if (txt) txt.value = txt.value.replace(/^.*/, `เรียน ผช.ผอ. ${roomName}`);
				
				let infoRec = document.getElementById('info-rec-no'); 
				if (infoRec) infoRec.innerText = doc.receiveNo || '-';
				
				let infoDoc = document.getElementById('info-doc-no'); 
				if (infoDoc) infoDoc.innerText = doc.docNo || '-';
				
				let infoDocDate = document.getElementById('info-doc-date'); 
				if (infoDocDate) infoDocDate.innerText = doc.docDate || '-';
				
				let infoSubj = document.getElementById('info-subject'); 
				if (infoSubj) infoSubj.innerText = doc.subject || doc.title || '-';
				
				// ดึงชื่อกลุ่มบริหาร หรือหมวดหมู่มาแสดงที่ป้ายสีดำ
				let infoCat = document.getElementById('info-category');
				if (infoCat) {
					let catText = (doc.category && doc.category.length > 0) ? doc.category[0] : (doc.assignedGroups && doc.assignedGroups.length > 0 ? doc.assignedGroups[0] : 'ทั่วไป');
					infoCat.innerText = catText;
				}
				
				// ดึงเวลาที่ธุรการกลางลงรับมาแสดง
				let infoRecDate = document.getElementById('info-receive-date');
				if (infoRecDate) {
					let recTime = (doc.stepTimes && doc.stepTimes[1]) ? doc.stepTimes[1] : (doc.lastUpdated || '-');
					infoRecDate.innerText = toArabicNum(recTime);
				}
				
				// ดึงชื่อผู้ที่กดลงรับ
				let infoReceiver = document.getElementById('info-receiver');
				if (infoReceiver) {
					infoReceiver.innerText = doc.adminReceiver || 'ธุรการกลาง';
				}
			}

			renderQueueList(stage, `queue-list-${stage}`);

			// 3. วาด Canvas
			initFabricCanvas(getCanvasKey(stage));
			let canvas = state.canvases[getCanvasKey(stage)];
			
			if (canvas) {
				canvas.clear();
				if (doc.canvasState) {
					// โหลดจากประวัติ JSON วัตถุที่ประทับไว้จะยังขยับ/แก้ไข/ลบ ได้
					canvas.loadFromJSON(doc.canvasState, function() {
						// เพิ่มบรรทัดนี้ เพื่อบังคับอัปเดตพิกัดวัตถุทั้งหมดให้แม่นยำ
                        canvas.getObjects().forEach(obj => obj.setCoords());
						
						// --- จัดการเงาและแอนิเมชันของตรายาง ---
						canvas.getObjects().forEach(obj => {
							if (obj.stampName) {
								obj.set('shadow', null);
								if (obj.item && obj.item(0)) {
									obj.item(0).set('shadow', null);
								}
							}

							if (obj.isCurrentStep && !obj.animateBorder) {
								obj.item(0).set({ strokeDashArray: [5, 5] });
								let offset = 0;
								obj.animateBorder = setInterval(() => {
									if (obj.item && obj.item(0)) {
										obj.item(0).set({ strokeDashOffset: offset-- });
										canvas.requestRenderAll();
									} else {
										clearInterval(obj.animateBorder);
									}
								}, 50);
							}
						});
						
						canvas.renderAll();
						// หน่วงเวลา 150ms ให้เบราว์เซอร์วาดกรอบสีเทาให้เสร็จก่อนสั่งซูม 100%
						setTimeout(() => { resetCanvasZoom(getCanvasKey(stage)); }, 150);
						
					}, function(o, object) {
						// กู้คืนคุณสมบัติพิเศษของตรายาง
						if (o.stampName) object.stampName = o.stampName;
						if (o.isCurrentStep !== undefined) object.isCurrentStep = o.isCurrentStep;
						if (o.stampColor) object.stampColor = o.stampColor;
						if (o.originalFill) object.originalFill = o.originalFill;
						if (o.originalStroke) object.originalStroke = o.originalStroke;
					});
				} else if (doc.currentImage) {
					// โหลดภาพปกติ (กรณีเปิดครั้งแรก)
					fabric.Image.fromURL(doc.currentImage, function(img) {
						const wrapper = canvas.wrapperEl.parentElement;
						const containerWidth = wrapper.clientWidth > 0 ? wrapper.clientWidth - 40 : 700;
						
						const scaleRatio = containerWidth / img.width;
						canvas.setWidth(containerWidth);
						canvas.setHeight(img.height * scaleRatio);
						
						canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), { 
                            scaleX: scaleRatio, 
                            scaleY: scaleRatio,
                            originX: 'left',
                            originY: 'top'
                        });
                        canvas.renderAll();

						// หน่วงเวลา 150ms ก่อนสั่งซูมและบันทึกประวัติ
						setTimeout(() => { 
							let key = getCanvasKey(stage);
							resetCanvasZoom(key); 
							
							canvasHistory[key] = [];
							historyIndex[key] = -1;
							saveCanvasState(canvas);
						}, 150);
					});
				}
			}
			
			// เปิดฟอร์มการทำงานอัตโนมัติเมื่อเอกสารถูกเลือกหรือเลื่อนคิว
			const stageMapForPanel = {1:'admin', 4:'director', 5:'admingroup', 6:'subdirectorgroup', 65:'subgroupadmin', 7:'assistantgroup', 8:'assignee'};
			const tabName = stageMapForPanel[stage];
			if (tabName) {
				const panel = document.getElementById(`panel-${tabName}`);
				if (panel && panel.classList.contains('hidden')) {
					toggleWorkspacePanel(tabName);
				}
			}
			
			// [แก้ไข] ข้ามการแทรกกล่องข้อมูลซ้ำซ้อนสำหรับธุรการกลุ่มงาน (Stage 65)
			if (stage !== 65 && typeof renderWorkspaceDocInfo === 'function') {
				renderWorkspaceDocInfo(doc, stage);
			}

		// --- โค้ดที่เพิ่มใหม่: โฟกัสช่อง 2. ที่ และเลื่อนฟอร์มขึ้นบนสุด ---
            if (stage === 1) {
                setTimeout(() => {
                    const panel = document.getElementById('panel-admin');
                    const elDocNo = document.getElementById('admin-doc-no');
                    
                    if (panel && !panel.classList.contains('hidden')) {
                        // 1. เลื่อน Scrollbar ของแถบฟอร์มไปด้านบนสุด (เห็นช่อง 1-4 ชัดเจน)
                        panel.scrollTo({ top: 0, behavior: 'smooth' });
                        
                        // 2. วางเคอร์เซอร์ และดันไปท้ายสุดของข้อความแบบไม่ให้จอกระตุก
                        if (elDocNo) {
                            elDocNo.focus({ preventScroll: true });
                            const len = elDocNo.value.length;
                            elDocNo.setSelectionRange(len, len);
                        }
                    }
                }, 400); // หน่วงเวลา 400ms เพื่อรอให้แผงฟอร์มเปิดและวาดหน้าจอเสร็จก่อน
            }
		} // <-- ปิดฟังก์ชัน selectDoc

        
		
		// =========================================================================
		// ฟังก์ชันตัวช่วย: ดึงแท็กกลุ่มงาน และรวบการ์ดฉบับเดียวกันในห้องสารบรรณกลาง
		// =========================================================================
		// ฟังก์ชันสร้างปุ่ม/ข้อความแสดงกลุ่มงานที่ส่งต่อท้าย "ถึง: ผู้อำนวยการโรงเรียนปากช่อง"
        function getForwardedGroupsTag(doc, roomContext) {
            // ป้องกัน TypeError: ตรวจสอบว่าเป็น String หรือไม่ หากเป็น Boolean หรือไม่มีค่า ให้ดึงจากแบนเนอร์โดยตรง
            let currentRoomName = '';
            if (typeof roomContext === 'string') {
                currentRoomName = roomContext;
            } else {
                let bannerEl = document.getElementById('banner-room-name');
                currentRoomName = bannerEl ? bannerEl.innerText : '';
            }

            let isCentral = (currentRoomName === 'ห้องสารบรรณกลาง') || (roomContext === true);
            let isMainGroup = currentRoomName.includes('กลุ่มบริหาร');

            // 1. ค้นหาเอกสารพี่น้องทั้งหมดที่แตกสาขาจากต้นขั้วเดียวกัน
            let rootKey = doc.rootDocId || doc.id;
            let siblings = state.documentQueue.filter(d => 
                (d.rootDocId && (d.rootDocId === rootKey || d.rootDocId === doc.id)) ||
                d.id === rootKey ||
                (doc.receiveNo && d.receiveNo === doc.receiveNo)
            );

            if (siblings.length === 0) siblings = [doc];

            // 2. รวบรวมกลุ่มบริหาร -> กลุ่มงานย่อย
            let groupMap = new Map();          // กลุ่มบริหาร -> Map(กลุ่มงาน -> Set(ชื่อผู้รับผิดชอบ))
            // [v28 ข้อ 4] หนังสือที่ดำเนินการเสร็จสิ้น : เติมชื่อผู้รับผิดชอบต่อท้ายกลุ่มงาน (กลุ่มบริหาร|กลุ่มงาน|ชื่อ)
            const isDone = Number(doc.stage) === 99;
            const addTo = (mg, sg, who) => {
                if (!groupMap.has(mg)) groupMap.set(mg, new Map());
                const m = groupMap.get(mg);
                if (!m.has(sg)) m.set(sg, new Set());
                who.forEach(n => m.get(sg).add(n));
            };

            siblings.forEach(d => {
                let mGroups = (d.assignedGroups && d.assignedGroups.length > 0) ? d.assignedGroups : [];
                let sGroups = (d.subGroups && d.subGroups.length > 0) ? d.subGroups : [];
                const who = (isDone && Number(d.stage) === 99 && d.assigneeName)
                    ? String(d.assigneeName).split(/\s*,\s*/).map(s => s.trim()).filter(Boolean) : [];

                if (mGroups.length > 0) {
                    mGroups.forEach(mg => {
                        if (sGroups.length) sGroups.forEach(sg => addTo(mg, sg, who));
                        else addTo(mg, '', who);
                    });
                } else if (sGroups.length > 0) {
                    sGroups.forEach(sg => addTo('', sg, who));
                }
            });

            // 3. จัดกลุ่มข้อความ: เชื่อมกลุ่มงานย่อยด้วย &
            let results = [];
            groupMap.forEach((subMap, mainGrp) => {
                const parts = [];
                subMap.forEach((names, sg) => {
                    const nameText = Array.from(names).join(', ');
                    if (sg && nameText) parts.push(sg + '|' + nameText);
                    else if (sg) parts.push(sg);
                    else if (nameText) parts.push(nameText);
                });
                let subText = parts.join('&');

                if (mainGrp && subText) {
                    results.push(`${mainGrp}|${subText}`);
                } else if (mainGrp) {
                    results.push(mainGrp);
                } else if (subText) {
                    results.push(subText);
                }
            });

            if (results.length === 0) return '';

            let displayText = results.join(', ');
            return `<span class="inline-flex items-center ml-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm leading-normal"><i class="fa-solid fa-arrow-right-long mr-1 text-[9px] text-indigo-500"></i>${displayText}</span>`;
        }
		
		

		function groupDocsForCentral(items) {
			let map = new Map();
			items.forEach(doc => {
				let key = doc.rootDocId || doc.receiveNo || doc.id;
				if (!map.has(key)) {
					map.set(key, doc);
				}
			});
			return Array.from(map.values());
		}

		// =========================================================================
		// 1. ฟังก์ชันส่งจากธุรการไป ผอ. (forwardDocToDirector)
		// =========================================================================
		// ส่งจากธุรการไป ผอ. (เปิดคิวฉบับถัดไปอัตโนมัติ + รีเซ็ตฟอร์ม + ขยาย Canvas + เปิดฟอร์ม)
        function forwardDocToDirector(currentStage) {
			let activeId = state.activeDocIds[currentStage];
			if(!activeId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสาร', 'warning');
			
			// บังคับกรอกข้อมูลส่วนงานธุรการให้ครบถ้วน
			if (currentStage === 1) {
				const recNo = (document.getElementById('admin-receive-no')?.value || '').trim();
				const docNo = (document.getElementById('admin-doc-no')?.value || '').trim();
				const docDate = (window.docDatePicker?.altInput ? window.docDatePicker.altInput.value : document.getElementById('admin-doc-date')?.value || '').trim();
				const subject = (document.getElementById('admin-subject')?.value || '').trim();
				const sender = (document.getElementById('admin-sender')?.value || '').trim();
				const recipient = (document.getElementById('admin-recipient')?.value || '').trim();
				const priorityChecked = document.querySelector('input[name="priority"]:checked');
				const catCheckboxes = document.querySelectorAll('.admin-category-checkbox:checked');

				let missing = [];
				if (!recNo) missing.push("1. เลขรับหนังสือ");
				if (!docNo) missing.push("2. ที่ (เลขที่หนังสือ)");
				if (!docDate) missing.push("3. ลงวันที่ (ในหนังสือ)");
				if (!subject) missing.push("4. เรื่อง");
				if (!sender) missing.push("5. จาก (หน่วยงานต้นทาง)");
				if (!recipient) missing.push("6. ถึง (ผู้รับในหนังสือ)");
				if (!priorityChecked) missing.push("7. ความเร่งด่วน");
				if (catCheckboxes.length === 0) missing.push("10. หมวดหมู่หนังสือ (เลือกอย่างน้อย 1 กลุ่ม)");

				if (missing.length > 0) {
					return Swal.fire({
						icon: 'warning',
						title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
						html: `<div class="text-left text-xs text-slate-700 p-2"><p class="mb-2 font-bold text-rose-600">ช่องที่ยังไม่สมบูรณ์:</p><ul class="list-disc pl-5 space-y-1">${missing.map(m => `<li>${m}</li>`).join('')}</ul></div>`,
						confirmButtonText: 'กลับไปกรอกให้ครบ',
						confirmButtonColor: '#2563eb'
					});
				}
			}

			let canvasKey = getCanvasKey(currentStage);
			let canvas = state.canvases[canvasKey];

			if (canvas) {
				let hasStamp = canvas.getObjects().some(obj => obj.stampName && obj.isCurrentStep === true);
				if (!hasStamp) {
					return Swal.fire({
						icon: 'warning',
						title: 'ยังไม่ได้ประทับตรารับ',
						text: 'กรุณากดปุ่มประทับตรารับหนังสือก่อนบันทึกและส่งเสนอ ผอ.',
						confirmButtonText: 'กลับไปประทับตรา',
						confirmButtonColor: '#2563eb'
					});
				}
			}
			
			
			// ตรวจสอบการซ้อนทับของตราประทับ
			if (canvas && canvas.overlappedStamp) {
				return Swal.fire({
					icon: 'warning',
					title: 'ตราประทับวางซ้อนทับกัน',
					text: `ตราประทับซ้อนกับของ "${canvas.overlappedStamp}" กรุณาเลื่อนตำแหน่งก่อนส่งเสนอ ผอ.`,
					confirmButtonText: 'กลับไปเลื่อนตรา',
					confirmButtonColor: '#ef4444'
				});
			}
			

			let doc = state.documentQueue.find(d => d.id === activeId);

			if(canvas && doc) {
				// บันทึกหมวดหมู่หนังสือ (ข้อ 9) ลงใน Object ของเอกสารให้สมบูรณ์ก่อนส่งต่อ
				let checkedCats = document.querySelectorAll('.admin-category-checkbox:checked');
				doc.category = Array.from(checkedCats).map(cb => cb.value);

				canvas.discardActiveObject();
                
                // คืนค่าขนาด Canvas เป็น 100% ก่อนส่งต่อ
                if (canvas.backgroundImage) {
                    const bg = canvas.backgroundImage;
                    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
                    canvas.setWidth(bg.width * bg.scaleX);
                    canvas.setHeight(bg.height * bg.scaleY);
                }

				canvas.renderAll();
				
				if (!doc.imageHistory) doc.imageHistory = [];
				doc.imageHistory.push(doc.currentImage);
				
				// เก็บประวัติ Canvas ก่อนส่งต่อ เผื่อกรณีดึงเรื่องกลับ
				if (!doc.canvasStateHistory) doc.canvasStateHistory = [];
				doc.canvasStateHistory.push(doc.canvasState);
				
				
				// เปลี่ยนตราประทับเป็นพื้นหลังโปร่งใส และใช้เส้นขอบตามสีดั้งเดิม
				canvas.getObjects().forEach(obj => {
					if (obj.stampName && obj.isCurrentStep) {
						if (obj.animateBorder) clearInterval(obj.animateBorder);
						obj.isCurrentStep = false;
						obj.selectable = false;
						obj.evented = true;
						if (obj.item && obj.item(0)) {
							obj.item(0).set({ 
								fill: 'rgba(255, 255, 255, 0.75)', // แก้เป็นสีขาวทึบแสง 75%
								stroke: obj.originalStroke, 
								strokeDashArray: null,
								shadow: null 
							});
						}
					}
				});
				
				// [v27] ไม่ถ่ายภาพหน้ากระดาษตอนส่งต่อ (currentImage = ภาพต้นฉบับเดิม) ภาพพร้อมตราสร้างจาก canvasState ตอนเปิดดู/พิมพ์
				// [v76] สร้างภาพหนังสือที่มีตราประทับไว้ใช้ในข้อความแจ้งเตือน Telegram/LINE (ไม่สำเร็จก็ข้าม ไม่กระทบการส่งต่อ)
				try { if (window.pcStampShot) window.pcStampShot(canvas, doc); } catch (eShot) { console.warn('[PC] ภาพที่มีตราไม่สำเร็จ :', eShot); }
                // เก็บรักษาสถานะ Canvas ไว้ เพื่อให้ระบบวาดกรอบและป้ายชื่อของขั้นตอนก่อนหน้าได้
                doc.canvasState = JSON.stringify(canvas.toJSON(['id', 'stampName', 'isCurrentStep', 'selectable', 'evented', 'originalFill', 'originalStroke', 'stampColor']));
				
				
				doc.stage = getNextActiveStage(1); // แก้ไข: ค้นหาด่านต่อไปที่ตั้งค่าไว้แบบไดนามิก
				const d = new Date();
				const timeStr = `${getThaiDate()}, เวลา ${toThaiNum(d.getHours().toString().padStart(2, '0'))}.${toThaiNum(d.getMinutes().toString().padStart(2, '0'))} น.`;
				doc.lastUpdated = timeStr;

				if (!doc.stepTimes) doc.stepTimes = {};
				if (!doc.stepTimes[currentStage]) doc.stepTimes[currentStage] = timeStr;
				doc.stepTimes[doc.stage] = timeStr;
			}

			// ล้างสถานะฉบับเดิมที่ส่งไปแล้ว
			state.activeDocIds[currentStage] = null;
			if(canvas) canvas.clear();
			renderAllQueues();
			
			// ตรวจสอบหนังสือที่เหลืออยู่ในคิวของธุรการกลาง (Stage 1) และเลือกคิวแรกสุดเสมอ
			let remainingDocs = state.documentQueue.filter(d => d.stage === 1);

			if (remainingDocs.length > 0) {
				// =============================================================
				// กรณีที่ 1: ยังมีหนังสือในคิวธุรการกลาง -> เปิดฉบับถัดไปอัตโนมัติ
				// =============================================================
				let nextDoc = remainingDocs[0];
				
				// 1. ดึงหนังสือฉบับถัดไปขึ้นมาแสดงบนหน้าจอ
				selectDoc(nextDoc.id, 1);

				// 2. เปิดแผงฟอร์มด้านข้างโดยอัตโนมัติ (หากถูกปิด/ซ่อนอยู่)
				const adminPanel = document.getElementById('panel-admin');
				if (adminPanel && adminPanel.classList.contains('hidden')) {
					adminPanel.classList.remove('hidden');
					const textBtn = document.getElementById('text-toggle-admin');
					if (textBtn) textBtn.innerText = "ฟอร์ม";
				}

				// 3. ปรับขนาด Canvas ให้พอดีหน้าจอ
				setTimeout(() => {
					resetCanvasZoom(canvasKey);
				}, 200);


				Swal.fire({
					icon: 'success',
					title: 'ส่งเสนอ ผอ. เรียบร้อย',
					html: `<div class="text-xs text-slate-600 mt-1">กำลังเปิดเอกสารฉบับถัดไป<br><span class="font-bold text-indigo-600">(คงเหลือ ${remainingDocs.length} ฉบับ)</span></div>`,
					showConfirmButton: false,
					timer: 1300,
					returnFocus: false, // <-- [เพิ่มบรรทัดนี้] ห้าม SweetAlert แย่งโฟกัสกลับไปที่ปุ่ม
					didClose: () => {   // <-- [แก้ตรงนี้] เปลี่ยนจาก willClose เป็น didClose
						const elDocNo = document.getElementById('admin-doc-no');
						if (elDocNo) {
							elDocNo.focus({ preventScroll: true });
							const len = elDocNo.value.length;
							elDocNo.setSelectionRange(len, len);
						}
					}
				});
				
				
			} else {
				// =============================================================
				// กรณีที่ 2: ดำเนินการครบทุกฉบับแล้ว -> ปิด Modal และกลับสู่ Inbox
				// =============================================================
				closeWorkspaceModal('admin', 'inbox');
				switchTab('inbox');
				if (typeof renderInboxList === 'function') renderInboxList();

				Swal.fire({
					icon: 'success',
					title: 'ส่งเสนอ ผอ. เรียบร้อย',
					html: `<div class="text-xs text-slate-600 mt-1">กำลังเปิดเอกสารฉบับถัดไป<br><span class="font-bold text-indigo-600">(คงเหลือ ${remainingDocs.length} ฉบับ)</span></div>`,
					showConfirmButton: false,
					timer: 1300,
					returnFocus: false, // <-- [เพิ่มบรรทัดนี้] ห้าม SweetAlert แย่งโฟกัสกลับไปที่ปุ่ม
					didClose: () => {   // <-- [แก้ตรงนี้] เปลี่ยนจาก willClose เป็น didClose
						// เมื่อ Pop-up แจ้งเตือนปิดลง ให้ดึงโฟกัสและเคอร์เซอร์กลับมาที่ช่อง 2
						const elDocNo = document.getElementById('admin-doc-no');
						if (elDocNo) {
							elDocNo.focus({ preventScroll: true });
							const len = elDocNo.value.length;
							elDocNo.setSelectionRange(len, len);
						}
					}
				});
			}
		}
		
		

		// =========================================================================
		// 2. ฟังก์ชันส่งเอกสารตามลำดับขั้นตอนปกติ (forwardDoc)
		// =========================================================================
		// ฟังก์ชันส่งเอกสารตามลำดับขั้นตอน (รองรับการเปิดคิวถัดไปอัตโนมัติ)
		function forwardDoc(currentStage) {
			let activeId = state.activeDocIds[currentStage];
			if (!activeId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารที่ต้องการบันทึกและส่งต่อ', 'warning');

			// --- ดักจับการส่งต่อของ ผอ. (Stage 4) และ รอง ผอ. (Stage 6) ---
			if (currentStage === 4) {
				let checkboxes = document.querySelectorAll('.director-group-checkbox:checked');
				if (checkboxes.length === 0) {
					return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มบริหารที่ต้องการมอบหมายงานครับ', 'warning');
				}
			} else if (currentStage === 6) {
				let subCheckboxes = document.querySelectorAll('.subdirector-group-checkbox:checked');
				if (subCheckboxes.length === 0) {
					return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มงานย่อยที่ต้องการมอบหมาย อย่างน้อย 1 กลุ่ม ก่อนส่งต่อครับ', 'warning');
				}
			}

			let canvasKey = getCanvasKey(currentStage);
			let canvas = state.canvases[canvasKey];

			// --- บังคับให้ผู้ใช้ทุกคน (ผอ., รอง ผอ., ผช.ผอ., ธุรการ, ผู้รับผิดชอบ) ต้องประทับตราในรอบของตนเอง ---
			if ([4, 5, 6, 65, 7, 8].includes(currentStage) && canvas) {
				let hasCurrentStamp = canvas.getObjects().some(obj => obj.stampName && obj.isCurrentStep === true);
				if (!hasCurrentStamp) {
					return Swal.fire({
						icon: 'warning',
						title: 'ยังไม่ได้ประทับตราความเห็น',
						text: 'กรุณาวาดลายเซ็นและกดปุ่มประทับตราลงบนเอกสารก่อนบันทึกและส่งต่อครับ',
						confirmButtonText: 'กลับไปประทับตรา',
						confirmButtonColor: '#4f46e5'
					});
				}
			}
			
			// ตรวจสอบการซ้อนทับของตราประทับ
			if (canvas && canvas.overlappedStamp) {
				return Swal.fire({
					icon: 'warning',
					title: 'ตราประทับวางซ้อนทับกัน',
					text: `ตราประทับซ้อนกับของ "${canvas.overlappedStamp}" กรุณาเลื่อนตำแหน่งก่อนส่งต่อ`,
					confirmButtonText: 'กลับไปเลื่อนตรา',
					confirmButtonColor: '#ef4444'
				});
			}

			let doc = state.documentQueue.find(d => d.id === activeId);

			if (canvas && doc) {
				canvas.discardActiveObject();
                
                // คืนค่าขนาด Canvas เป็น 100% ก่อนส่งต่อ
                if (canvas.backgroundImage) {
                    const bg = canvas.backgroundImage;
                    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
                    canvas.setWidth(bg.width * bg.scaleX);
                    canvas.setHeight(bg.height * bg.scaleY);
                }

				canvas.renderAll();
				
				if (!doc.imageHistory) doc.imageHistory = [];
				doc.imageHistory.push(doc.currentImage);
				
				// เก็บประวัติ Canvas ก่อนส่งต่อ เผื่อกรณีดึงเรื่องกลับ
				if (!doc.canvasStateHistory) doc.canvasStateHistory = [];
				doc.canvasStateHistory.push(doc.canvasState);
				
				// เคลียร์เส้นประแอนิเมชัน และคืนค่าสีเส้นขอบเดิม
				canvas.getObjects().forEach(obj => {
					if (obj.stampName && obj.isCurrentStep) {
						if (obj.animateBorder) clearInterval(obj.animateBorder);
						obj.isCurrentStep = false;
						obj.selectable = false; 
						obj.evented = true; 
						if (obj.item && obj.item(0)) {
							obj.item(0).set({ 
								fill: 'rgba(255, 255, 255, 0.75)', // แก้เป็นสีขาวทึบแสง 75%
								stroke: obj.originalStroke, 
								strokeDashArray: null,
								shadow: null 
							});
						}
					}
				});
				
				// [v27] ไม่ถ่ายภาพหน้ากระดาษตอนส่งต่อ (currentImage = ภาพต้นฉบับเดิม) ภาพพร้อมตราสร้างจาก canvasState ตอนเปิดดู/พิมพ์
				// [v76] สร้างภาพหนังสือที่มีตราประทับไว้ใช้ในข้อความแจ้งเตือน Telegram/LINE (ไม่สำเร็จก็ข้าม ไม่กระทบการส่งต่อ)
				try { if (window.pcStampShot) window.pcStampShot(canvas, doc); } catch (eShot) { console.warn('[PC] ภาพที่มีตราไม่สำเร็จ :', eShot); }
                // เก็บรักษาสถานะ Canvas ไว้ เพื่อให้ระบบวาดกรอบและป้ายชื่อของขั้นตอนก่อนหน้าได้
                doc.canvasState = JSON.stringify(canvas.toJSON(['id', 'stampName', 'isCurrentStep', 'selectable', 'evented', 'originalFill', 'originalStroke', 'stampColor']));

				const d = new Date();
				const timeStr = `${getThaiDate()}, เวลา ${toThaiNum(d.getHours().toString().padStart(2, '0'))}.${toThaiNum(d.getMinutes().toString().padStart(2, '0'))} น.`;
				doc.lastUpdated = timeStr;
				if (!doc.stepTimes) doc.stepTimes = {};
				doc.stepTimes[currentStage] = timeStr;
				
				// จัดการลำดับการส่งต่อ (Routing Logic) แบบไดนามิกอิงตามตั้งค่าระบบ
				let nextStage = getNextActiveStage(currentStage);

				if (currentStage === 4) {
					let checkboxes = document.querySelectorAll('.director-group-checkbox:checked');
					let assignedGroups = Array.from(checkboxes).map(cb => cb.value);
					
					if (assignedGroups.length > 0) {
						if (!doc.rootDocId) doc.rootDocId = doc.id;
						doc.assignedGroups = [assignedGroups[0]]; 
						doc.stage = nextStage; 
						doc.stepTimes[nextStage] = timeStr; 
						
						for (let i = 1; i < assignedGroups.length; i++) {
							let clonedDoc = JSON.parse(JSON.stringify(doc));
							clonedDoc.id = 'doc_' + Date.now() + '_c' + i;
							clonedDoc.rootDocId = doc.rootDocId;
							clonedDoc.assignedGroups = [assignedGroups[i]];
							state.documentQueue.push(clonedDoc);
						}
					}
				} else if (currentStage === 6) {
					let subCheckboxes = document.querySelectorAll('.subdirector-group-checkbox:checked');
					let subGroups = Array.from(subCheckboxes).map(cb => cb.value);
					
					if (subGroups.length > 0) {
						if (!doc.rootDocId) doc.rootDocId = doc.id;
						doc.subGroups = [subGroups[0]];
						doc.stage = nextStage; 
						doc.stepTimes[nextStage] = timeStr; 
						
						for (let i = 1; i < subGroups.length; i++) {
							let clonedDoc = JSON.parse(JSON.stringify(doc));
							clonedDoc.id = 'doc_' + Date.now() + '_s' + i;
							clonedDoc.rootDocId = doc.rootDocId;
							clonedDoc.subGroups = [subGroups[i]];
							if (!clonedDoc.stepTimes) clonedDoc.stepTimes = {};
							clonedDoc.stepTimes[nextStage] = timeStr;
							state.documentQueue.push(clonedDoc);
						}
					} else {
						doc.stage = nextStage; 
						doc.stepTimes[nextStage] = timeStr;
					}
				} else if (currentStage === 8) {
					doc.stage = 99; // ขั้นตอนผู้รับผิดชอบ จะจบที่ 99 เสมอ
					doc.actionStatus = document.getElementById('assignee-comment')?.value || 'เสร็จสิ้นการปฏิบัติงาน';
					doc.stepTimes[8] = timeStr;
					doc.stepTimes[99] = timeStr;
					doc.doneAt = Date.now();   // [v23 ข้อ 2] เวลาที่ผู้รับผิดชอบลงรับ (ใช้กรอง วันนี้/เดือนนี้/ปีนี้ ในงานของฉัน)
				} else {
					doc.stage = nextStage; // สำหรับด่าน 5, 65, 7 ส่งต่อไปด่านที่ตั้งค่าไว้
					doc.stepTimes[nextStage] = timeStr;
					if (currentStage === 7) {
						// [ข้อ 28] ใช้รายชื่อผู้รับผิดชอบที่ติ๊กเลือกไว้จริง (เลือกได้หลายคน)
						const picked7 = (typeof getSelectedAssignees === 'function') ? getSelectedAssignees('assignee-picker-assistantgroup') : [];
						const nowMs = Date.now();
						if (picked7.length) {
							/* [v23 ข้อ 14] แยกหนังสือ 1 ฉบับต่อผู้รับผิดชอบ 1 คน (แบบเดียวกับการแยกกลุ่มของ ผอ./รอง ผอ.)
							   -> หนังสือเข้ากล่องหนังสือเข้า + งานของฉัน ของแต่ละคน และลงรับ/ประทับตราได้อิสระไม่ทับกัน */
							if (!doc.rootDocId) doc.rootDocId = doc.id;
							doc.assigneeAll = picked7.map(p => p.name).join(', ');
							doc.assignedAt = nowMs;
							doc.assigneeName = picked7[0].name;
							doc.assigneeIds = [picked7[0].id];
							for (let i = 1; i < picked7.length; i++) {
								let clonedDoc = JSON.parse(JSON.stringify(doc));
								clonedDoc.id = 'doc_' + nowMs + '_a' + i;
								clonedDoc.rootDocId = doc.rootDocId;
								clonedDoc.assigneeName = picked7[i].name;
								clonedDoc.assigneeIds = [picked7[i].id];
								clonedDoc.announced = true;          // ประชาสัมพันธ์ครั้งเดียวจากฉบับหลักพอ
								state.documentQueue.push(clonedDoc);
							}
						}
						doc.assigneeName = doc.assigneeName || 'ยังไม่ระบุผู้รับผิดชอบ';
					}
				}
			}

			// ล้างสถานะการเลือกของเอกสารที่เพิ่งส่งไป
			state.activeDocIds[currentStage] = null;
			if (canvas) canvas.clear();
			renderAllQueues();

			// ค้นหาเอกสารฉบับถัดไปที่ยังรออยู่ในคิวของขั้นตอนนี้ และเรียงลำดับใหม่
			let remainingDocs = state.documentQueue.filter(d => d.stage === currentStage);
			if (currentStage > 1) remainingDocs.sort((a,b) => b.priority - a.priority);

			const currentRoomName = document.getElementById('banner-room-name').innerText;
			const normalizedRoom = currentRoomName.replace(/ฯ/g, '').trim();

			if (currentStage === 8 && typeof window.pcStage8Visible === 'function') {
				remainingDocs = remainingDocs.filter(doc => window.pcStage8Visible(doc, normalizedRoom, currentRoomName));   // [v23 ข้อ 14]
			} else if (currentRoomName !== 'ห้องสารบรรณกลาง') {
				remainingDocs = remainingDocs.filter(doc => {
					if (currentStage === 5 || currentStage === 6) {
						if (!doc.assignedGroups || doc.assignedGroups.length === 0) return false;
						return doc.assignedGroups.some(g => normalizedRoom.includes(g.replace(/ฯ/g, '').trim()) || g.replace(/ฯ/g, '').trim().includes(normalizedRoom));
					} else if (currentStage === 65 || currentStage === 7 || currentStage === 8) {
						if (!doc.subGroups || doc.subGroups.length === 0) return false;
						return doc.subGroups.some(g => normalizedRoom.includes(g.replace(/ฯ/g, '').trim()) || g.replace(/ฯ/g, '').trim().includes(normalizedRoom));
					}
					return true;
				});
			}

			if (remainingDocs.length > 0) {
				// =============================================================
				// กรณีที่ 1: ยังมีหนังสือในคิว -> เปิดฉบับถัดไปอัตโนมัติทันที
				// =============================================================
				let nextDoc = remainingDocs[0];
				
				selectDoc(nextDoc.id, currentStage);
				
				setTimeout(() => {
					resetCanvasZoom(canvasKey);
				}, 200);

				Swal.fire({
					icon: 'success',
					title: 'ส่งต่อเอกสารเรียบร้อย',
					html: `<div class="text-xs text-slate-600 mt-1">กำลังเปิดเอกสารฉบับถัดไปในคิว<br><span class="font-bold text-indigo-600">(คงเหลืออีก ${remainingDocs.length} ฉบับ)</span></div>`,
					showConfirmButton: false,
					timer: 1300
				});
			} else {
				// =============================================================
				// กรณีที่ 2: ดำเนินการครบทุกฉบับแล้ว -> ปิดโมดอลและเปิดหน้า Inbox
				// =============================================================
				const stageToTab = {1:'admin', 4:'director', 5:'admingroup', 6:'subdirectorgroup', 65:'subgroupadmin', 7:'assistantgroup', 8:'assignee'};
				const targetTab = 'inbox';

				closeWorkspaceModal(stageToTab[currentStage], targetTab);
				switchTab(targetTab);
				if (typeof renderInboxList === 'function') renderInboxList();

				let txt = (currentStage === 4 || currentStage === 8) ? 'บันทึกข้อมูลเสร็จสิ้น' : 'ส่งต่อเอกสารเรียบร้อยแล้ว';
				Swal.fire({
					icon: 'success',
					title: txt,
					text: 'ดำเนินการครบทุกฉบับในคิวแล้ว ระบบนำกลับสู่กล่องหนังสือเข้า',
					showConfirmButton: false,
					timer: 1600
				});
			}
		}
		
		
		function initFabricCanvas(canvasId) {
			if(!state.canvases[canvasId]){
				const canvasEl = document.getElementById(canvasId);
				if(canvasEl){
					const wrapper = canvasEl.parentElement;
					const w = wrapper.clientWidth > 0 ? wrapper.clientWidth - 40 : 750;
					const h = wrapper.clientHeight > 0 ? wrapper.clientHeight : 500;
					canvasEl.width = w;
					canvasEl.height = h;
					state.canvases[canvasId] = new fabric.Canvas(canvasId, { backgroundColor: '#ffffff' });
						try { if (window.pcEnableTouchScroll) pcEnableTouchScroll(state.canvases[canvasId]); } catch (eTs) { /* ข้าม */ }   // [v97] นิ้วเลื่อนเอกสารได้ (iPad)
					
					if (canvasId === 'canvas-admin' && state.documentQueue.length > 0 && state.activeDocIds[1]) {
						selectDoc(state.activeDocIds[1], 1);
					} else {
						const text = new fabric.Text("พื้นที่แสดงเอกสาร / ประทับตรา", { 
							left: w / 2, top: h / 2, originX: 'center', originY: 'center', fontSize: 20, fill: '#94a3b8', fontFamily: 'Sarabun' 
						});
						state.canvases[canvasId].add(text);
					}

					// ==========================================
					// 1. ระบบ Tooltip ลอยตัว (ปรับตำแหน่งแนบชิดปลายเมาส์)
					// ==========================================
					if (!document.getElementById('canvas-tooltip')) {
						let tooltip = document.createElement('div');
						tooltip.id = 'canvas-tooltip';
						tooltip.className = 'hidden fixed z-[150] text-white text-[11px] px-2.5 py-1 rounded-lg shadow-xl pointer-events-none font-bold tracking-wide border border-white/20 transition-opacity duration-150';
						document.body.appendChild(tooltip);
					}

					// Event เมื่อเมาส์ชี้บนตรายาง
					state.canvases[canvasId].on('mouse:over', function(e) {
						if (e.target && e.target.stampName) {
							let tooltip = document.getElementById('canvas-tooltip');
							tooltip.innerHTML = '<i class="fa-solid fa-stamp mr-1 text-white/70"></i> ' + e.target.stampName;
							
							let bgColor = e.target.isCurrentStep ? '#ef4444' : (e.target.stampColor || '#1e293b');
							tooltip.style.backgroundColor = bgColor;
							
							// ตำแหน่งขวาเยื้องลงล่างจากปลายเคอร์เซอร์เพียง 8px
							tooltip.style.left = (e.e.clientX + 8) + 'px';
							tooltip.style.top = (e.e.clientY + 8) + 'px';
							tooltip.classList.remove('hidden');
						}
					});

					// Event ให้ Tooltip วิ่งตามเมาส์อย่างแม่นยำ
					state.canvases[canvasId].on('mouse:move', function(e) {
						 if (e.target && e.target.stampName) {
							 let tooltip = document.getElementById('canvas-tooltip');
							 tooltip.style.left = (e.e.clientX + 8) + 'px';
							 tooltip.style.top = (e.e.clientY + 8) + 'px';
						 }
					});

					// Event ปิด Tooltip ทันทีเมื่อเลื่อนเมาส์ออกจากตรายาง
					state.canvases[canvasId].on('mouse:out', function(e) {
						let tooltip = document.getElementById('canvas-tooltip');
						if (tooltip) {
							tooltip.classList.add('hidden');
						}
					});
					
					// ป้องกัน Memory Leak ลบ Interval ทิ้งเมื่อผู้ใช้ลบตรายาง
					state.canvases[canvasId].on('object:removed', function(e) {
						if (e.target && e.target.animateBorder) {
							clearInterval(e.target.animateBorder);
						}
					});

					// ==========================================
					// ระบบดีดตราประทับกลับอัตโนมัติ (Rubber-Band Snap-back)
					// ==========================================

					// 1. บันทึกตำแหน่งที่ปลอดภัยก่อนเริ่มจับลาก
					state.canvases[canvasId].on('mouse:down', function(e) {
						if (e.target && e.target.stampName && e.target.isCurrentStep) {
							if (e.target.lastSafeLeft === undefined) {
								e.target.lastSafeLeft = e.target.left;
								e.target.lastSafeTop = e.target.top;
							}
						}
					});

					// 2. เมื่อผู้ใช้ปล่อยเมาส์ (วางตราประทับ)
					state.canvases[canvasId].on('object:modified', function(e) {
						let obj = e.target;
						if (obj && obj.stampName && obj.isCurrentStep) {
							
							let previousStamps = state.canvases[canvasId].getObjects().filter(o => o.stampName && !o.isCurrentStep);
							let isOverlapping = false;
							let isOutOfBounds = false;
							let overlapName = "";

							obj.setCoords();
							// ใช้ getBoundingRect(true, true) เพื่อดึงพิกัดจริงบนกระดาษ ไม่ว่าจะซูมอยู่หรือไม่
							let curRect = obj.getBoundingRect(true, true);

							// --- กฎข้อ 1: ตรวจสอบขอบเขตกั้นไม่ให้หลุดกระดาษ (Boundary Check) ---
							let bg = state.canvases[canvasId].backgroundImage;
							let paperW = bg ? bg.width * bg.scaleX : state.canvases[canvasId].width;
							let paperH = bg ? bg.height * bg.scaleY : state.canvases[canvasId].height;

							// ถ้าหลุดซ้าย, บน, ขวา, หรือล่าง
							if (curRect.left < 0 || curRect.top < 0 || 
								curRect.left + curRect.width > paperW || 
								curRect.top + curRect.height > paperH) {
								isOutOfBounds = true;
							}

							// --- กฎข้อ 2: ตรวจสอบการทับซ้อนกับตราคนอื่น (Overlap Check) ---
							if (!isOutOfBounds) {
								for (let prev of previousStamps) {
									prev.setCoords(); 
									let prevRect = prev.getBoundingRect(true, true);

									if (!(curRect.left > prevRect.left + prevRect.width + 5 || 
										  curRect.left + curRect.width + 5 < prevRect.left || 
										  curRect.top > prevRect.top + prevRect.height + 5 || 
										  curRect.top + curRect.height + 5 < prevRect.top)) {
										isOverlapping = true;
										overlapName = prev.stampName || "ตราประทับเดิม";
										break;
									}
								}
							}

							// หากทำผิดกฎข้อใดข้อหนึ่ง ให้ดีดกลับที่เดิม
							if (isOutOfBounds || isOverlapping) {
								let alertTitle = isOutOfBounds ? 'หลุดขอบกระดาษ' : 'ตำแหน่งทับซ้อน';
								let alertText = isOutOfBounds 
									? 'ไม่สามารถวางตราประทับเกินขอบเขตของหน้ากระดาษได้ ระบบจะดึงกลับไปยังตำแหน่งเดิม' 
									: `ไม่สามารถวางทับตราประทับของ "${overlapName}" ได้ ระบบจะดึงกลับไปยังตำแหน่งเดิม`;

								Swal.fire({
									icon: 'error',
									title: alertTitle,
									text: alertText,
									timer: 2000,
									showConfirmButton: false,
									backdrop: `rgba(0,0,0,0.4)`
								});

								obj.animate({ left: obj.lastSafeLeft, top: obj.lastSafeTop }, {
									duration: 300,
									onChange: state.canvases[canvasId].renderAll.bind(state.canvases[canvasId]),
									easing: fabric.util.ease.easeOutBounce,
									onComplete: function() { obj.setCoords(); }
								});
							} else {
								// หากปล่อยในที่ว่างในขอบกระดาษสำเร็จ ให้จำพิกัดใหม่เป็นจุดปลอดภัย
								obj.lastSafeLeft = obj.left;
								obj.lastSafeTop = obj.top;
							}
							// --- [เพิ่มโค้ดบรรทัดนี้] อัปเดตสถานะป้ายเตือนและปลดล็อคปุ่มส่งต่ออัตโนมัติ ---
							checkStampOverlap(state.canvases[canvasId], false);
						}
					});

					// ==========================================
					// 2. ระบบวาดกรอบและป้ายชื่อจำลองให้ตราประทับที่ผ่านมาแล้ว (เลียนแบบ OCR)
					// ==========================================
					if (!state.canvases[canvasId].stampLabelEventAdded) {
						state.canvases[canvasId].on('after:render', function() {
							let canvas = state.canvases[canvasId];
							let ctx = canvas.contextContainer; // วาดบนจอเท่านั้น ไม่ลงไฟล์ภาพ
							
							canvas.getObjects().forEach(obj => {
								// ตรวจสอบว่าเป็นตรายางของขั้นตอนที่ผ่านมาแล้ว
								if (obj.stampName && !obj.isCurrentStep) {
									let bound = obj.getBoundingRect();
									let color = obj.stampColor || '#0891b2'; // ดึงสีดั้งเดิมของตรายางนั้นๆ
									
									// วาดสีพื้นหลังแบบโปร่งแสงบางๆ
									ctx.fillStyle = color;
									ctx.globalAlpha = 0.08; 
									ctx.fillRect(bound.left, bound.top, bound.width, bound.height);
									
									// วาดเส้นขอบแบบทึบ (ไม่มีเงา)
									ctx.globalAlpha = 1.0;
									ctx.strokeStyle = color;
									ctx.lineWidth = 2;
									ctx.strokeRect(bound.left, bound.top, bound.width, bound.height);

									// วาดป้ายชื่อ (Tab) บอกตำแหน่งผู้ลงนาม
									ctx.font = "bold 11px Sarabun, sans-serif";
									let text = "🏷️ " + obj.stampName;
									let textWidth = ctx.measureText(text).width;
									
									// คำนวณตำแหน่งป้าย (ถ้าตรายางอยู่ชิดขอบบนสุด ให้ย้ายป้ายมาไว้ด้านล่างแทน)
									let labelTop = bound.top - 22;
									let labelTextY = bound.top - 6;
									if (labelTop < 0) { 
										labelTop = bound.top + bound.height; 
										labelTextY = labelTop + 16;
									}
									
									// วาดกล่องป้ายชื่อ
									ctx.fillStyle = color;
									ctx.fillRect(bound.left, labelTop, textWidth + 16, 22);
									
									// วาดตัวหนังสือในป้าย
									ctx.fillStyle = "white";
									ctx.fillText(text, bound.left + 8, labelTextY);
								}
							});
						});
						state.canvases[canvasId].stampLabelEventAdded = true;
					}

					// ==========================================
					// 3. กำหนด Signature Pad ตาม Tab
					// ==========================================
					if (canvasId === 'canvas-admin' && !sigPads['admin']) sigPads['admin'] = setupSigCanvas('sig-admin');
					if (canvasId === 'canvas-assistant' && !sigPads['assistant']) sigPads['assistant'] = setupSigCanvas('sig-assistant');
					if (canvasId === 'canvas-subdirector' && !sigPads['subdirector']) sigPads['subdirector'] = setupSigCanvas('sig-subdirector');
					if (canvasId === 'canvas-director' && !sigPads['director']) sigPads['director'] = setupSigCanvas('sig-director');
					
					if (canvasId === 'canvas-admingroup' && !sigPads['admingroup']) sigPads['admingroup'] = setupSigCanvas('sig-admingroup');
					if (canvasId === 'canvas-subgroupadmin' && !sigPads['subgroupadmin']) sigPads['subgroupadmin'] = setupSigCanvas('sig-subgroupadmin'); 
					if (canvasId === 'canvas-subdirectorgroup' && !sigPads['subdirectorgroup']) sigPads['subdirectorgroup'] = setupSigCanvas('sig-subdirectorgroup');
					if (canvasId === 'canvas-assistantgroup' && !sigPads['assistantgroup']) sigPads['assistantgroup'] = setupSigCanvas('sig-assistantgroup');
					if (canvasId === 'canvas-assignee' && !sigPads['assignee']) sigPads['assignee'] = setupSigCanvas('sig-assignee');
				}
			}
		}


        // ==========================================
        // Auth & Navigation
        // ==========================================
        /* [ข้อ 12] ข้อความที่ใช้เทียบ "กลุ่มงานของฉัน" กับกลุ่มที่ระบุในหนังสือ
           เดิมใช้ state.user.title อย่างเดียว ทำให้ผู้ใช้ที่สังกัดหลายกลุ่มงาน
           จับคู่ได้แค่กลุ่มแรก -> ตอนนี้รวมทุกกลุ่มใน state.user.groups ด้วย */
        function userTitleForMatch() {
            const t = (state.user && state.user.title) || '';
            const gs = (state.user && Array.isArray(state.user.groups)) ? state.user.groups : [];
            return (t + ' | ' + gs.join(' | ')).replace(/\u0e2f/g, '');
        }

        function renderDashboardRooms() {
            const grid = document.getElementById('rooms-grid');
            const role = state.user.role;
            const title = state.user.title; // ชื่อเต็มที่เลือกจาก Dropdown
            
            let allowedRooms = [];
            let showAll = false;

            if (title === 'ผู้ดูแลระบบ (ADMIN)' || title === 'ผอ.' || title === 'รักษาการ ผอ.') {
                showAll = true;
            } else if (title === 'ธุรการกลาง') {
                allowedRooms = ['ห้องสารบรรณกลาง'];
            } else if (title === 'รอง ผอ. กลุ่มบริหารวิชาการ') {
                allowedRooms = ['กลุ่มบริหารวิชาการ', 'กลุ่มงานการจัดการศึกษา', 'กลุ่มงานพัฒนาโครงการพิเศษ'];
            } else if (title === 'รอง ผอ. กลุ่มบริหารงบประมาณ') {
                allowedRooms = ['กลุ่มบริหารงบประมาณ', 'กลุ่มงานอำนวยการ', 'กลุ่มงานแผนงาน การเงิน พัสดุและสินทรัพย์'];
            } else if (title === 'รอง ผอ. กลุ่มบริหารงานบุคคล') {
                allowedRooms = ['กลุ่มบริหารงานบุคคล', 'กลุ่มงานบุคลากร', 'กลุ่มงานกิจการนักเรียน'];
            } else if (title === 'รอง ผอ. กลุ่มบริหารทั่วไป') {
                allowedRooms = ['กลุ่มบริหารทั่วไป', 'กลุ่มงานอาคารสถานที่ฯ', 'กลุ่มงานชุมชนและภาคีเครือข่าย'];
            } else if (title.includes('ผช. ผอ.')) {
                allowedRooms = [title.replace('ผช. ผอ. ', '').trim()];
            } else if (title.includes('ธุรการกลุ่มบริหาร')) {
                allowedRooms = [title.replace('ธุรการ', '').trim()];
            } else if (title.includes('ธุรการกลุ่มงาน')) {
                allowedRooms = [title.replace('ธุรการ', '').trim()];
            } else if (title === 'ผู้รับผิดชอบ (ครู)') {
                // จำลองห้องกลุ่มงานสำหรับครู เนื่องจากตัวอย่างไม่มีระบบล็อคอิน DB
                allowedRooms = ['กลุ่มงานการจัดการศึกษา']; 
            }

            const filteredRooms = showAll ? defaultRooms : defaultRooms.filter(r => allowedRooms.includes(r.name));

            grid.innerHTML = filteredRooms.map(r => `
                <div class="room-card bg-gradient-to-br ${r.color} rounded-3xl p-6 text-white shadow-lg hover:-translate-y-1 transition cursor-pointer relative overflow-hidden group" data-id="${r.id}">
                    <div class="absolute top-4 right-4 z-10 flex gap-2 admin-controls ${role === 'ADMIN' ? '' : 'hidden'}">
                        <button onclick="event.stopPropagation(); editRoom(this)" class="w-8 h-8 bg-white/30 hover:bg-white/50 rounded-full flex items-center justify-center backdrop-blur-sm transition" title="แก้ไข"><i class="fa-solid fa-pen text-xs"></i></button>
                        <button onclick="event.stopPropagation(); deleteRoom(this)" class="w-8 h-8 bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center backdrop-blur-sm transition" title="ลบ"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                    <div onclick="openRoom('${r.id}', '${r.name}')" class="w-full h-full">
                        <div class="absolute -right-4 -bottom-4 opacity-20 text-7xl"><i class="fa-solid fa-folder-tree"></i></div>
                        <span class="room-id-span bg-white/20 text-xs font-semibold px-3 py-1 rounded-full mb-3 inline-block">${r.id}</span>
                        <h3 class="room-name-span text-xl font-bold mb-1 pr-6">${r.name}</h3>
                        <p class="text-xs text-white/80 mt-4">คลิกเพื่อเข้าสู่ห้อง &gt;</p>
                    </div>
                </div>
            `).join('');
            
            return filteredRooms; // ส่งค่ากลับไปตรวจสอบจำนวนห้อง
        }

        // 1. เพิ่มตารางฐานข้อมูลผู้ใช้งาน (จับคู่รหัสกับชื่อ-สกุล)
        const userDatabase = {
            '9307': 'นายสมชาย เรียนดี',
            'admin_01': 'นายสมชาย ใจดี',
            'admin': 'ผู้ดูแลระบบ'
            // เพิ่มรหัสและชื่อผู้ใช้งานอื่นๆ ตามต้องการที่นี่
        };

		/* [ข้อ 17] ฟังก์ชัน handleLogin เดิม (โหมดสาธิตออฟไลน์ + อ่านค่าจาก select#login-role)
		   ถูกยกเลิกแล้ว เพราะ:
		     1) หน้า login ไม่มีช่องเลือกบทบาทอีกต่อไป (บทบาทมาจากชีต Users)
		     2) เดิมมีการเก็บรหัสผ่านไว้ใน localStorage ('savedUserPass') ซึ่งไม่ปลอดภัย
		   ตัวจริงคือ window.handleLogin ในสคริปต์ PC ด้านล่าง (ยิง API 'login' จริง) */
		function handleLogin(e) {
			if (e) e.preventDefault();
			try { localStorage.removeItem('savedUserPass'); } catch (err) { /* ข้าม */ }
			if (window.PC) { /* window.handleLogin ของสคริปต์ PC จะถูกใช้แทนเสมอ */ }
		}

        function logout() {
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
            }).then((result) => {
                if (result.isConfirmed) {
                    // เคลียร์ข้อมูลผู้ใช้งาน
                    state.user = { id: '', role: '', name: '' };

                    // สลับมุมมองกลับไปยังหน้า Login
                    document.getElementById('view-room').classList.add('hidden');
                    document.getElementById('view-dashboard').classList.add('hidden');
                    document.getElementById('main-navbar').classList.add('hidden');
                    document.getElementById('view-login').classList.remove('hidden');
                    document.getElementById('global-footer').style.display = 'none';

                    // ล้างค่ารหัสผู้ใช้งานในฟอร์ม Login
                    const loginIdInput = document.getElementById('login-userid');
                    if (loginIdInput) loginIdInput.value = '';

                    // แจ้งเตือนสั้นๆ ก่อนเข้าสู่หน้าล็อกอิน
                    Swal.fire({
                        icon: 'success',
                        title: 'ออกจากระบบเรียบร้อย',
                        showConfirmButton: false,
                        timer: 1200
                    });
                }
            });
        }

        function goBack() {
            if(!document.getElementById('view-room').classList.contains('hidden')){
                const availableRooms = renderDashboardRooms();
                if (availableRooms.length === 1) {
                    // หากมีแค่ 1 ห้อง การกดปุ่มกลับจะถือเป็นการ Logout ทันที
                    logout();
                } else {
                    // ถ้ามีหลายห้อง ให้ถอยกลับมาหน้า Dashboard
                    document.getElementById('view-room').classList.add('hidden');
                    document.getElementById('view-dashboard').classList.remove('hidden');
                    //document.getElementById('nav-title').innerText = "หน้าหลัก";
                }
            } else if(!document.getElementById('view-dashboard').classList.contains('hidden')) {
                logout();
            }
        }

        function openRoom(roomId, roomName) {
			document.getElementById('view-dashboard').classList.add('hidden');
			document.getElementById('view-room').classList.remove('hidden');
			document.getElementById('banner-room-id').innerText = roomId;
			document.getElementById('banner-room-id').classList.toggle('hidden', !(state.user && state.user.role === 'ADMIN'));   // [ต.ค. 2569] รหัสห้องแสดงเฉพาะผู้ดูแลระบบ (โค้ดอื่นยังอ่าน innerText ได้)
			document.getElementById('banner-room-name').innerText = roomName;
			
			// ดึงชื่อและตำแหน่งผู้ใช้งานจากระบบมาแสดง
			// [v30 ข้อ 5] ข้อความวิ่ง : ใส่ชื่อผู้ใช้
			const mq = document.getElementById('marquee-msg');
			if (mq) mq.innerText = `ยินดีต้อนรับ ${state.user.name || ''} เข้าสู่ระบบรับหนังสือราชการ โรงเรียนปากช่อง :: ออกแบบและพัฒนาโดย KT | Tanasarn Sirak`;
			const welcomeMsg = document.getElementById('banner-welcome-msg');
			if (welcomeMsg) {
				// [v30 ข้อ 3/4] แสดงชื่อ + ตำแหน่งจากคอลัมน์ position ในชีต Users (ไม่มี -> ใช้ชื่อบทบาทเดิม)
				const pos = String(state.user.position || state.user.title || '').trim();
				// [v32 ข้อ 2] ยินดีต้อนรับคุณ ชื่อ ตำแหน่ง (คอลัมน์ position ในชีต Users)
				welcomeMsg.innerText = `ยินดีต้อนรับคุณ ${state.user.name}${pos ? ' ตำแหน่ง ' + pos.replace(/^ตำแหน่ง\s*/, '') : ''}`;
			}
			//document.getElementById('nav-title').innerText = roomName;

			const adminGroupTxt = document.getElementById('admingroup-comment');
			if (adminGroupTxt) adminGroupTxt.value = `เรียน รอง ผอ. ${roomName}\n- ตรวจสอบความถูกต้องแล้ว เห็นควรพิจารณา`;

			const subGroupAdminTxt = document.getElementById('subgroupadmin-comment');
			if (subGroupAdminTxt) subGroupAdminTxt.value = `เรียน ผช.ผอ. ${roomName}\n- ตรวจสอบความถูกต้องแล้ว เห็นควรพิจารณา`;

			applyRolePermissions();
			renderAllQueues(); // [เพิ่มบรรทัดนี้] สั่งคำนวณและวาดคิวงาน/Inbox ใหม่ทันทีเมื่อเข้าห้อง
			renderAssignmentsList(); // วาดการ์ดกิจกรรม
			switchTab('activities');
		}

        function applyRolePermissions() {
            const role = state.user.role;
            const allTabs = document.querySelectorAll('.tab-btn');
            allTabs.forEach(btn => btn.classList.add('hidden'));

            // แท็บพื้นฐานที่ทุกคนมองเห็น
            document.getElementById('tab-btn-activities').classList.remove('hidden');
			
			// โชว์ปุ่มสร้างประกาศเฉพาะ ADMIN และระดับบริหาร
            const btnAnnounce = document.getElementById('btn-create-announcement');
            if (btnAnnounce) {
                if (['ADMIN', 'Director', 'SubdirectorGroup', 'AdminGroup', 'AssistantGroup'].includes(role)) {
                    btnAnnounce.classList.remove('hidden');
                } else {
                    btnAnnounce.classList.add('hidden');
                }
            }
			
			
            document.getElementById('tab-btn-alldocs').classList.remove('hidden');
            document.getElementById('tab-btn-calendar').classList.remove('hidden'); 
            document.getElementById('tab-btn-inbox').classList.remove('hidden'); 

            // ดึงชื่อห้องปัจจุบันเพื่อตรวจสอบเงื่อนไข
            const currentRoomName = document.getElementById('banner-room-name').innerText;

            // แท็บตั้งค่าระบบให้แสดงเฉพาะ ADMIN
            if (role === 'ADMIN') {
                document.getElementById('tab-btn-settings').classList.remove('hidden');
            }
            
            // ให้ Assignee (ผู้รับผิดชอบ) เห็นแท็บงานของฉัน
            if (role === 'Assignee') { 
                document.getElementById('tab-btn-mywork').classList.remove('hidden'); 
            }
            
            // แท็บธุรการกลาง (แสดงเฉพาะห้องสารบรรณกลาง)
			if (['ADMIN', 'Administrative'].includes(role) && currentRoomName === 'ห้องสารบรรณกลาง') {
				// ลบคำสั่งโชว์แท็บออก (ยังคงคลาส hidden ไว้) เพราะเราจะเข้าผ่านปุ่มลงทะเบียนใน Inbox แทน
				initFabricCanvas('canvas-admin');
			}
            
            // แท็บ ผอ. (แสดงเฉพาะห้องสารบรรณกลาง)
            if (['ADMIN', 'Director', 'ActingDirector'].includes(role) && currentRoomName === 'ห้องสารบรรณกลาง') {
                //document.getElementById('tab-btn-director').classList.remove('hidden');
                initFabricCanvas('canvas-director');
            }
            
            // แท็บ ธุรการ 4 กลุ่ม (แสดงเฉพาะห้องกลุ่มบริหาร)
            if (['ADMIN', 'AdminGroup'].includes(role) && currentRoomName.includes('กลุ่มบริหาร')) {
                //document.getElementById('tab-btn-admingroup').classList.remove('hidden');
                initFabricCanvas('canvas-admingroup');
            }
            
            // แท็บ รอง 4 กลุ่ม (แสดงเฉพาะห้องกลุ่มบริหาร)
            if (['ADMIN', 'SubdirectorGroup'].includes(role) && currentRoomName.includes('กลุ่มบริหาร')) {
                //document.getElementById('tab-btn-subdirectorgroup').classList.remove('hidden');
                initFabricCanvas('canvas-subdirectorgroup');
                renderSubdirectorCheckboxes(currentRoomName);
            }

            // แท็บ ธุรการกลุ่มงาน (แสดงเฉพาะห้องกลุ่มงาน)
            if (['ADMIN', 'AdminGroup'].includes(role) && currentRoomName.includes('กลุ่มงาน')) {
                //document.getElementById('tab-btn-subgroupadmin').classList.remove('hidden');
                initFabricCanvas('canvas-subgroupadmin');
            }
            
            // แท็บ ผู้ช่วยกลุ่ม (แสดงเฉพาะห้องกลุ่มงาน)
            if (['ADMIN', 'AssistantGroup'].includes(role) && currentRoomName.includes('กลุ่มงาน')) {
                //document.getElementById('tab-btn-assistantgroup').classList.remove('hidden');
                initFabricCanvas('canvas-assistantgroup');
                // [ข้อ 28] เตรียม list checkbox รายชื่อผู้รับผิดชอบไว้ล่วงหน้า
                if (typeof renderAssigneeCheckboxList === 'function') renderAssigneeCheckboxList('assignee-picker-assistantgroup', currentRoomName);
            }
            
            // แท็บ ผู้รับผิดชอบ (แสดงเฉพาะห้องกลุ่มงาน)
            if (['ADMIN', 'Assignee'].includes(role) && currentRoomName.includes('กลุ่มงาน')) {
                //document.getElementById('tab-btn-assignee').classList.remove('hidden');
                initFabricCanvas('canvas-assignee');
            }
			
			let btnReg = document.getElementById('btn-register-doc');
			if (btnReg) {
				if (['ADMIN', 'Administrative'].includes(role) && currentRoomName === 'ห้องสารบรรณกลาง') {
					btnReg.classList.remove('hidden'); btnReg.classList.add('flex');
				} else {
					btnReg.classList.add('hidden'); btnReg.classList.remove('flex');
				}
			}
			
			
        }
		
		
		
		// ==========================================
        // Sub-tabs ของหน้าตั้งค่าระบบ (Settings)
        // ==========================================
        function switchSubTab(subTabId) {
            // ซ่อนเนื้อหาทั้งหมด
            document.querySelectorAll('.subtab-content').forEach(el => el.classList.add('hidden'));
            // ล้างสไตล์ปุ่มทั้งหมด
            document.querySelectorAll('.subtab-btn').forEach(el => {
                el.classList.remove('border-blue-600', 'text-blue-600');
                el.classList.add('border-transparent', 'text-slate-500');
            });
            // แสดงแท็บที่เลือก
            document.getElementById('subtab-' + subTabId).classList.remove('hidden');
            document.getElementById('subtab-btn-' + subTabId).classList.add('border-blue-600', 'text-blue-600');
            document.getElementById('subtab-btn-' + subTabId).classList.remove('border-transparent', 'text-slate-500');

            // หากเปิดแท็บตั้งค่า Flow ให้รันสคริปต์ลากวาง
            if(subTabId === 'settings-flow') {
                renderFlowList();
            }
            if (subTabId === 'settings-notify' && window.PC && typeof PC.renderNotifySettings === 'function') PC.renderNotifySettings();   // [v81]
            if (subTabId === 'settings-history' && window.PC && typeof PC.renderNotifyHistory === 'function') PC.renderNotifyHistory();   // [v82]
        }

        // ==========================================
        // ระบบ Flow Routing Settings (ลากสลับหรือเปิด/ปิด)
        // ==========================================
        let currentFlowSteps = [
            { id: 1, name: 'ธุรการกลาง (ลงรับหนังสือ)', required: true, active: true },
            { id: 4, name: 'ผอ. / รักษาการ ผอ. (สั่งการ)', required: false, active: true },
            { id: 5, name: 'ธุรการ 4 กลุ่มบริหาร (ลงรับ)', required: false, active: true },
            { id: 6, name: 'รอง ผอ. 4 กลุ่มบริหาร (มอบหมาย)', required: false, active: true },
            { id: 65, name: 'ธุรการกลุ่มงาน (ลงรับ)', required: false, active: true },
            { id: 7, name: 'ผู้ช่วยกลุ่มงาน (มอบหมาย)', required: false, active: true },
            { id: 8, name: 'ผู้รับผิดชอบ/ครู (ปฏิบัติงาน)', required: true, active: true }
        ];
		
		
		
		// ==========================================
        // ฟังก์ชันคำนวณลำดับ Flow แบบอัตโนมัติ (Dynamic Routing)
        // ==========================================
        function getNextActiveStage(currentStageId) {
            let currentIndex = currentFlowSteps.findIndex(s => s.id === currentStageId);
            if (currentIndex === -1) return 99; // หากไม่พบ หรือเป็นขั้นตอนสุดท้ายให้ส่งไป 99 (เสร็จสิ้น)
            // วิ่งหาด่านถัดไปที่ active
            for (let i = currentIndex + 1; i < currentFlowSteps.length; i++) {
                if (currentFlowSteps[i].active) return currentFlowSteps[i].id;
            }
            return 99; // ถ้าปิดหมดจนจบ ให้จบงาน
        }

        function getPrevActiveStage(currentStageId) {
            if (currentStageId === 99) {
                // หากถึง 99 แล้ว ให้หาด่านสุดท้ายที่เปิดอยู่เพื่อดึงเรื่องกลับ
                for (let i = currentFlowSteps.length - 1; i >= 0; i--) {
                    if (currentFlowSteps[i].active) return currentFlowSteps[i].id;
                }
                return 8; // ค่าเริ่มต้นผู้รับผิดชอบ
            }
            let currentIndex = currentFlowSteps.findIndex(s => s.id === currentStageId);
            if (currentIndex <= 0) return 1; // กลับไปธุรการกลาง
            // วิ่งถอยหลังหาด่านก่อนหน้าที่เปิดอยู่
            for (let i = currentIndex - 1; i >= 0; i--) {
                if (currentFlowSteps[i].active) return currentFlowSteps[i].id;
            }
            return 1;
        }
		
		

        let draggedFlowIndex = null;
        function dragFlowStart(e, index) { draggedFlowIndex = index; e.dataTransfer.effectAllowed = "move"; }
        function dragFlowOver(e) { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50', 'ring-2', 'ring-blue-200'); }
        function dragFlowLeave(e) { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50', 'ring-2', 'ring-blue-200'); }
        function dropFlow(e, index) {
            e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50', 'ring-2', 'ring-blue-200');
            if (draggedFlowIndex === null || draggedFlowIndex === index) return;
            const item = currentFlowSteps.splice(draggedFlowIndex, 1)[0];
            currentFlowSteps.splice(index, 0, item);
            renderFlowList();
        }

        function toggleFlowActive(index) {
            if (currentFlowSteps[index].required) {
                Swal.fire({icon: 'error', title: 'ไม่สามารถปิดได้', text: 'ขั้นตอนนี้เป็นขั้นตอนบังคับของระบบ (สารบรรณ และ ผู้รับผิดชอบต้องมีเสมอ)'});
                return;
            }
            currentFlowSteps[index].active = !currentFlowSteps[index].active;
            renderFlowList();
        }

        function renderFlowList() {
            const list = document.getElementById('flow-sortable-list');
            if(!list) return;
            list.innerHTML = currentFlowSteps.map((step, index) => `
                <div draggable="true" ondragstart="dragFlowStart(event, ${index})" ondragover="dragFlowOver(event)" ondragleave="dragFlowLeave(event)" ondrop="dropFlow(event, ${index})" 
                    class="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl cursor-move transition hover:shadow-md">
                    <div class="flex items-center gap-4">
                        <i class="fa-solid fa-grip-vertical text-slate-300 text-lg hover:text-slate-500 transition"></i>
                        <div class="w-8 h-8 rounded-full ${step.active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'} flex items-center justify-center text-xs font-bold shadow-sm">${index + 1}</div>
                        <span class="font-bold text-sm ${step.active ? 'text-slate-700' : 'text-slate-400 line-through'}">${step.name}</span>
                        ${step.required ? '<span class="text-[10px] bg-rose-100 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-lg font-bold">บังคับเปิด</span>' : ''}
                    </div>
                    <label class="relative inline-flex items-center ${step.required ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}">
                        <input type="checkbox" class="sr-only peer" ${step.active ? 'checked' : ''} onchange="toggleFlowActive(${index})" ${step.required ? 'disabled' : ''}>
                        <div class="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>
            `).join('');
        }
		
		
		// ==========================================
        // ระบบตั้งค่าเลขทะเบียนหนังสือรับเริ่มต้น
        // ==========================================
        const regInputMap = {
            'central': 'start-no-central',
            'กลุ่มบริหารวิชาการ': 'start-no-academic',
            'กลุ่มบริหารงบประมาณ': 'start-no-budget',
            'กลุ่มบริหารงานบุคคล': 'start-no-personnel',
            'กลุ่มบริหารทั่วไป': 'start-no-general',
            'กลุ่มงานการจัดการศึกษา': 'start-no-edu',
            'กลุ่มงานพัฒนาโครงการพิเศษ': 'start-no-proj',
            'กลุ่มงานอำนวยการ': 'start-no-direct',
            'กลุ่มงานแผนงาน การเงิน พัสดุและสินทรัพย์': 'start-no-finance',
            'กลุ่มงานบุคลากร': 'start-no-staff',
            'กลุ่มงานกิจการนักเรียน': 'start-no-student',
            'กลุ่มงานอาคารสถานที่': 'start-no-build',
            'กลุ่มงานชุมชนและภาคีเครือข่าย': 'start-no-net'
        };

        function saveReceiveNumberSettings() {
            Object.values(regInputMap).forEach(id => {
                const el = document.getElementById(id);
                if(el && el.value.trim()) {
                    localStorage.setItem(id, el.value.trim());
                } else {
                    localStorage.removeItem(id);
                }
            });
            Swal.fire({icon: 'success', title: 'บันทึกสำเร็จ', text: 'ตั้งค่าเลขทะเบียนหนังสือรับเรียบร้อยแล้ว', showConfirmButton: false, timer: 1500});
        }

        function loadReceiveNumberSettings() {
            Object.values(regInputMap).forEach(id => {
                const el = document.getElementById(id);
                const val = localStorage.getItem(id);
                if(el && val) el.value = val;
            });
        }

        // แทรกการดึงข้อมูลเมื่อคลิกเปิดแท็บ "ตั้งค่า Flow หนังสือ" (subtab-settings-flow)
        const originalSwitchSubTab = switchSubTab;
        switchSubTab = function(subTabId) {
            originalSwitchSubTab(subTabId);
            if(subTabId === 'settings-flow') loadReceiveNumberSettings();
        };
		
		

        function switchTab(tabName) {
            if (tabName === 'inbox' && typeof stopNotificationSound === 'function') {
                stopNotificationSound();
            }
			
			// เพิ่มเงื่อนไขระงับเสียงปฏิทินเมื่อเปิดแท็บปฏิทิน
            if (tabName === 'calendar' && typeof stopCalendarSound === 'function') {
                stopCalendarSound();
            }
			
			// เพิ่มเงื่อนไข: เมื่อผู้ใช้กดเข้ามาที่แท็บกิจกรรม ให้ล้างการแจ้งเตือน
            if (tabName === 'activities' && typeof updateActivitiesBadge === 'function') {
                updateActivitiesBadge(0);
            }
			
			
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(el => {
                el.classList.remove('bg-blue-600', 'text-white');
                el.classList.add('bg-slate-200', 'text-slate-600');
            });

            document.getElementById(`tab-${tabName}`).classList.remove('hidden');
            
            const activeBtn = document.getElementById(`tab-btn-${tabName}`);
            if(activeBtn) {
                activeBtn.classList.remove('bg-slate-200', 'text-slate-600');
                activeBtn.classList.add('bg-blue-600', 'text-white');
            }

            if (['admin', 'assistant', 'subdirector', 'director', 'admingroup', 'subdirectorgroup', 'assistantgroup', 'assignee', 'subgroupadmin'].includes(tabName)) {
                if (sigPads[tabName]) { setTimeout(() => sigPads[tabName].resize(), 50); }
                renderAllQueues(); 
            }
        }


		// ==========================================
		// ฟังก์ชันช่วยหาตำแหน่งที่ปลอดภัย ไม่ทับซ้อนและไม่ตกขอบกระดาษ
		// ==========================================
		function ensureSafeStampPlacement(canvas, stampObj) {
			const previousStamps = canvas.getObjects().filter(o => o.stampName && !o.isCurrentStep);
			let safe = false;
			let limit = 40; // เพิ่มจำนวนรอบการค้นหาให้มากขึ้น

			let bg = canvas.backgroundImage;
			let paperW = bg ? bg.width * bg.scaleX : canvas.width;
			let paperH = bg ? bg.height * bg.scaleY : canvas.height;

			while (!safe && limit > 0) {
				stampObj.setCoords();
				let curRect = stampObj.getBoundingRect(true, true);
				let overlap = false;

				for (let prev of previousStamps) {
					prev.setCoords();
					let pRect = prev.getBoundingRect(true, true);
					
					// เช็คว่ากรอบสี่เหลี่ยมทับกันหรือไม่
					if (!(curRect.left > pRect.left + pRect.width + 5 || 
						  curRect.left + curRect.width + 5 < pRect.left || 
						  curRect.top > pRect.top + pRect.height + 5 || 
						  curRect.top + curRect.height + 5 < pRect.top)) {
						overlap = true;
						break;
					}
				}

				if (overlap) {
					// [จุดที่แก้ไข] เปลี่ยนให้ขยับ "ขึ้นบน" 50px (หนีจากขอบล่างที่มักจะเต็ม)
					stampObj.top -= 50; 
					
					// หากขยับขึ้นจนทะลุขอบกระดาษด้านบน ให้ย้ายขยับไปทางขวา แล้วเริ่มหาจากด้านล่างใหม่
					if (stampObj.top < 0) {
						stampObj.top = paperH - (stampObj.height * stampObj.scaleY) - 20; 
						stampObj.left += 40; 
					}
					limit--;
				} else {
					safe = true;
				}
			}
			
			// ตรวจสอบขั้นสุดท้าย: บังคับไม่ให้หลุดขอบกระดาษ
			stampObj.setCoords();
			let finalRect = stampObj.getBoundingRect(true, true);
			if (finalRect.left < 0) stampObj.left += Math.abs(finalRect.left) + 10;
			if (finalRect.top < 0) stampObj.top += Math.abs(finalRect.top) + 10;
			if (finalRect.left + finalRect.width > paperW) stampObj.left -= (finalRect.left + finalRect.width - paperW) + 10;
			if (finalRect.top + finalRect.height > paperH) stampObj.top -= (finalRect.top + finalRect.height - paperH) + 10;

			// บันทึกตำแหน่งที่ปลอดภัยตั้งต้น
			stampObj.lastSafeLeft = stampObj.left;
			stampObj.lastSafeTop = stampObj.top;
		}


        // ==========================================
        // ระบบประทับตรายาง
        // ==========================================
		function applyAdminStamp() {
			let canvas = state.canvases['canvas-admin'];
			if (!canvas) return;
			if (!state.activeDocIds[1]) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารที่ต้องการประทับก่อน', 'warning');

			let recNumStr = document.getElementById("admin-receive-no").value || "ยังไม่ระบุเลขรับ";
			let recNumArabic = toArabicNum(recNumStr);
			
			let doc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
			if (doc) doc.adminReceiver = state.user.name || state.user.title || 'ธุรการกลาง';   // [v23 ข้อ 10]

			const d = new Date();
			const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
			const dateStrArabic = `${toArabicNum(d.getDate().toString())} / ${months[d.getMonth()]} / ${toArabicNum((d.getFullYear() + 543).toString())}`;
			const timeStrArabic = `${toArabicNum(d.getHours().toString().padStart(2, '0'))}.${toArabicNum(d.getMinutes().toString().padStart(2, '0'))} น.`;
			const blueColor = '#1e3a8a';

			// กรอบพื้นหลังสีแดงโปร่งแสงขณะกำลังประทับตรา (isCurrentStep)
			const rect = new fabric.Rect({ 
				width: 240, 
				height: 120, 
				fill: 'rgba(254, 226, 226, 0.95)', 
				stroke: '#ef4444', 
				strokeWidth: 3.5, 
				rx: 5, 
				ry: 5, 
				originX: 'center', 
				originY: 'center' 
			});

			const title = new fabric.Text("โรงเรียนปากช่อง", { 
				fontSize: 20, 
				fontFamily: 'Sarabun', 
				fontWeight: 'bold', 
				fill: blueColor, 
				originX: 'center', 
				originY: 'center', 
				top: -35 
			});

			const text1 = new fabric.Text(`เลขรับ: ${recNumArabic}`, { 
				fontSize: 16, 
				fontFamily: 'Sarabun', 
				fontWeight: 'bold', 
				fill: blueColor, 
				originX: 'left', 
				originY: 'center', 
				left: -95, 
				top: -5 
			});

			const text2 = new fabric.Text(`วันที่: ${dateStrArabic}`, { 
				fontSize: 16, 
				fontFamily: 'Sarabun', 
				fontWeight: 'bold', 
				fill: blueColor, 
				originX: 'left', 
				originY: 'center', 
				left: -95, 
				top: 20 
			});

			const text3 = new fabric.Text(`เวลา: ${timeStrArabic}`, { 
				fontSize: 16, 
				fontFamily: 'Sarabun', 
				fontWeight: 'bold', 
				fill: blueColor, 
				originX: 'left', 
				originY: 'center', 
				left: -95, 
				top: 45 
			});

			let stampGroup = new fabric.Group([rect, title, text1, text2, text3], { 
				left: canvas.width - 150, 
				top: 120, 
				originX: 'center', 
				originY: 'center', 
				cornerColor: '#ef4444', 
				borderColor: '#ef4444', 
				transparentCorners: false,
				stampName: 'ธุรการกลาง ลงรับ', 
				isCurrentStep: true,
				originalFill: 'rgba(255, 255, 255, 0.75)', 
				originalStroke: blueColor,
				stampColor: blueColor
			});
			
			ensureSafeStampPlacement(canvas, stampGroup); 
			canvas.add(stampGroup); 
			canvas.setActiveObject(stampGroup);
			
			// เพิ่มคำสั่งนี้: ตรวจสอบการทับซ้อนทันทีที่ตรายางวางลงกระดาษ
			checkStampOverlap(canvas, true);
			
			
			// แอนิเมชันเส้นประวิ่ง
			stampGroup.item(0).set({ strokeDashArray: [5, 5] });
			let offset = 0;
			stampGroup.animateBorder = setInterval(() => {
				if (stampGroup.item && stampGroup.item(0)) {
					stampGroup.item(0).set({ strokeDashOffset: offset-- });
					canvas.requestRenderAll();
				} else {
					clearInterval(stampGroup.animateBorder);
				}
			}, 50);
			
			focusOnObject(canvas, stampGroup);
			saveCanvasState(canvas);

			// ซ่อนฟอร์มหลังจากประทับตรา
			if (typeof autoHidePanelAfterStamp === 'function') {
				autoHidePanelAfterStamp(1);
			}
		}

        function applyProposalStamp() {
            let canvas = state.canvases['canvas-admin'];
            if (!canvas) return;
            if(!state.activeDocIds[1]) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารก่อน', 'warning');

            let pad = sigPads['admin'];
            if (!pad || pad.isEmpty()) return Swal.fire("ข้อผิดพลาด", "กรุณาวาดลายเซ็นด้านขวามือก่อนประทับตราครับ", "warning");

            let sigData = pad.getBase64();
            let descStr = document.getElementById("admin-description").value.trim() || "........................................................";
            const blueColor = '#1e3a8a';

            let proposalText = `เรียน ผู้อำนวยการโรงเรียนปากช่อง\n                 1. เพื่อโปรดทราบ\n                 2. ${descStr}`;

            const textObj = new fabric.Textbox(proposalText, { width: 350, fontSize: 16, fontFamily: 'Sarabun', fontWeight: 'bold', fill: blueColor, lineHeight: 1.3, originX: 'center', originY: 'top', top: 0 });

            fabric.Image.fromURL(sigData, function(sigImg) {
                sigImg.scaleToWidth(110);
                sigImg.set({ originX: 'center', originY: 'top', top: textObj.height + 10 });
                
                const nameObj = new fabric.Text(`( นางสาวธุรการ ลงรับ )\nเจ้าหน้าที่งานสารบรรณ\n${getThaiDate()}`, { fontSize: 14, fontFamily: 'Sarabun', fill: blueColor, originX: 'center', originY: 'top', top: sigImg.top + sigImg.getScaledHeight() + 5, textAlign: 'center', lineHeight: 1.2 });
                const box = new fabric.Rect({ width: 370, height: nameObj.top + nameObj.height + 10, fill: 'transparent', originX: 'center', originY: 'top', top: -10 });
                
                const vpt = canvas.getVpCenter();
                let group = new fabric.Group([box, textObj, sigImg, nameObj], { left: vpt.x, top: vpt.y, originX: 'center', originY: 'center', cornerColor: blueColor, borderColor: blueColor, transparentCorners: false });
                
                canvas.add(group); canvas.setActiveObject(group); canvas.renderAll();
            });
        }

        function deleteSelectedStamp(stageNum) {
            let canvas = state.canvases[getCanvasKey(stageNum)];
            if (!canvas) return;
            const activeObject = canvas.getActiveObject();
            if (activeObject) {
                canvas.remove(activeObject); canvas.discardActiveObject(); canvas.renderAll(); saveCanvasState(canvas);
            } else { Swal.fire('แจ้งเตือน', 'กรุณาคลิกเลือกตรายางบนเอกสารที่ต้องการลบก่อน', 'warning'); }
        }


		// ==========================================
		// ระบบตรวจสอบตราประทับซ้อนทับ (Collision Detection) แบบคำนวณพิกัดจริง
		// ==========================================
		function checkStampOverlap(canvas, showPopup = false) {
			if (!canvas) return;
			const canvasKey = canvas.lowerCanvasEl ? canvas.lowerCanvasEl.id : '';
			if (!canvasKey) return;

			// ค้นหาตราประทับปัจจุบัน (ที่กำลังลากวาง) และตราประทับก่อนหน้าทั้งหมด
			const currentStamp = canvas.getObjects().find(o => o.stampName && o.isCurrentStep);
			const previousStamps = canvas.getObjects().filter(o => o.stampName && !o.isCurrentStep);

			let overlappedStampName = null;

			if (currentStamp && previousStamps.length > 0) {
				// ใช้ getBoundingRect เพื่อดึงพิกัดกรอบที่แน่นอน 100% แทนฟังก์ชันเดิมที่เกิดบั๊ก
				let curRect = currentStamp.getBoundingRect(true, true);
				
				for (let prev of previousStamps) {
					let prevRect = prev.getBoundingRect(true, true);
					
					// คำนวณการทับซ้อนแบบ X/Y (AABB Collision)
					if (!(curRect.left > prevRect.left + prevRect.width || 
						  curRect.left + curRect.width < prevRect.left || 
						  curRect.top > prevRect.top + prevRect.height || 
						  curRect.top + curRect.height < prevRect.top)) {
						overlappedStampName = prev.stampName || 'ตราประทับก่อนหน้า';
						break;
					}
				}
			}

			canvas.overlappedStamp = overlappedStampName;

			// 1. แสดง/ซ่อน ป้ายเตือนลอยตัวด้านบนกระดาษแบบไม่ขัดจังหวะการลาก
			let alertBox = document.getElementById(`overlap-alert-${canvasKey}`);
			const rightContainer = canvas.wrapperEl ? canvas.wrapperEl.closest('.bg-slate-300') : null;

			if (overlappedStampName) {
				if (!alertBox && rightContainer) {
					alertBox = document.createElement('div');
					alertBox.id = `overlap-alert-${canvasKey}`;
					alertBox.className = 'absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-rose-600/90 hover:bg-rose-600 text-white px-4 py-2 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 border border-rose-300 pointer-events-none transition-all duration-200';
					rightContainer.appendChild(alertBox);
				}
				if (alertBox) {
					alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-300 text-sm"></i> ตราประทับวางซ้อนทับกับ: <span class="underline">${overlappedStampName}</span> (กรุณาเลื่อนหลบ)`;
					alertBox.classList.remove('hidden');
				}

				// ไฮไลท์กรอบตราประทับปัจจุบันเป็นสีแดงเข้มเพื่อเตือน
				if (currentStamp.item && currentStamp.item(0)) {
					currentStamp.item(0).set({ stroke: '#b91c1c', strokeWidth: 3 });
					canvas.requestRenderAll();
				}

				// --- [เพิ่มใหม่] แจ้งเตือน Popup เมื่อกดปุ่มแล้วทับซ้อน ---
				if (showPopup) {
					Swal.fire({
						icon: 'warning',
						title: 'ตำแหน่งทับซ้อน',
						text: `ตราประทับวางซ้อนทับกับ "${overlappedStampName}" กรุณาใช้เมาส์ลากจัดตำแหน่งใหม่ให้เหมาะสม`,
						confirmButtonText: 'กลับไปเลื่อนตรา',
						confirmButtonColor: '#ef4444'
					});
				}

			} else {
				if (alertBox) alertBox.classList.add('hidden');
				if (currentStamp && currentStamp.item && currentStamp.item(0)) {
					// คืนค่าสีเดิมเมื่อเลื่อนหลบพ้นแล้ว
					let originalColor = currentStamp.stampColor || '#ef4444';
					currentStamp.item(0).set((window.pcIsCommentStamp && pcIsCommentStamp(currentStamp)) ? { stroke: '', strokeWidth: 0 } : { stroke: originalColor, strokeWidth: 2 });   // [v47] ตราความเห็นไม่มีเส้นขอบ
					canvas.requestRenderAll();
				}
			}

			// 2. ปรับสถานะปุ่มส่งต่อบน Toolbar
			updateForwardBtnStatus(canvasKey, !!overlappedStampName);
		}




		function updateForwardBtnStatus(canvasKey, isOverlapping) {
			const role = canvasKey.replace('canvas-', '');
			const toolbar = document.getElementById(`${role}-toolbar`);
			if (!toolbar) return;

			const fwdBtn = toolbar.querySelector('button[onclick*="forwardDoc"]');
			if (!fwdBtn) return;

			if (isOverlapping) {
				fwdBtn.classList.add('opacity-40', 'cursor-not-allowed', 'ring-2', 'ring-rose-400');
				fwdBtn.setAttribute('data-disabled', 'true');
			} else {
				fwdBtn.classList.remove('opacity-40', 'cursor-not-allowed', 'ring-2', 'ring-rose-400');
				fwdBtn.removeAttribute('data-disabled');
			}
		}
		
		
		
		
		function applyCommentStamp(canvasKey, inputId, sigPadKey, colorHex, titleName, positionName) {
			let canvas = state.canvases[canvasKey];
			if (!canvas) return;
			
			const stageMap = {
				'admin': 1, 'assistant': 2, 'subdirector': 3, 'director': 4,
				'admingroup': 5, 'subgroupadmin': 65, 'subdirectorgroup': 6, 'assistantgroup': 7, 'assignee': 8
			};
			
			let currentStage = stageMap[sigPadKey] || 1;
			if(!state.activeDocIds[currentStage]) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารด้านซ้ายมือก่อนครับ', 'warning');

			// [ข้อ 5] ตรวจสิทธิ์การลงนามของผู้ใช้คนนี้ก่อนเสมอ
			if (window.PC && typeof PC.canSign === 'function' && !PC.canSign(sigPadKey)) {
				return Swal.fire('ไม่มีสิทธิ์ลงนาม', 'บัญชีของท่านไม่ได้รับสิทธิ์ลงนาม/ประทับตราในขั้นตอนนี้<br><span class="text-xs text-slate-500">ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์</span>', 'warning');
			}

			// [ข้อ 24] label บนตราประทับ = ชื่อ/ตำแหน่งของผู้ใช้ที่กำลังประทับจริง (ไม่ใช่ชื่อตัวอย่างที่ hard-code ไว้)
			// [ข้อ 25] stepOrder = ลำดับที่ของขั้นตอนนี้ใน Flow (ใช้แสดงเป็นตัวเลขหน้า label)
			let stepOrder = 1;
			if (typeof window.stampIdentity === 'function') {
				const _who = window.stampIdentity(sigPadKey);
				titleName = _who.name || titleName;
				positionName = _who.position || positionName;
				stepOrder = _who.order || 1;
			}
			
			let pad = sigPads[sigPadKey];
			if (!pad || pad.isEmpty()) {
				// 1. ค้นหากรอบช่องลายเซ็น
				const sigBox = document.getElementById(`sig-box-${sigPadKey}`) || document.getElementById(`sig-${sigPadKey}`)?.parentElement;
				const panel = document.getElementById(`panel-${sigPadKey}`);
				
				// หากฟอร์มถูกซ่อนอยู่ ให้กางฟอร์มออกมาก่อน
				if (panel && panel.classList.contains('hidden')) {
					toggleWorkspacePanel(sigPadKey);
				}

				// 2. เลื่อนหน้าจอไปที่ช่องลายเซ็น พร้อมใส่เอฟเฟกต์กระพริบเตือนสีแดง
				if (sigBox) {
					sigBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
					sigBox.classList.remove('border-slate-300', 'border-emerald-400');
					sigBox.classList.add('border-rose-500', 'ring-4', 'ring-rose-200');
					setTimeout(() => {
						sigBox.classList.remove('ring-4', 'ring-rose-200');
					}, 2000);
				}

				// 3. แจ้งเตือน SweetAlert2 แบบระบุวิธีแก้ไขชัดเจน
				return Swal.fire({
					icon: 'warning',
					title: 'ยังไม่ได้ลงลายเซ็น',
					html: `<div class="text-xs text-slate-600 mt-1 leading-relaxed">
							กรุณาดำเนินการอย่างใดอย่างหนึ่งในช่องลายเซ็น:<br>
							<span class="font-bold text-slate-800">1. วาดลายเซ็น</span> ในกรอบ<br>
							<span class="font-bold text-slate-800">2. กดปุ่ม "ใช้เดิม"</span> (หากเคยบันทึกไว้)<br>
							<span class="font-bold text-slate-800">3. กดปุ่ม "อัปโหลด"</span> ไฟล์ภาพ .png
						   </div>`,
					confirmButtonText: 'ไปลงลายเซ็น',
					confirmButtonColor: '#e11d48'
				});
			}

			let sigData = pad.getBase64();
			let commentText = document.getElementById(inputId).value;
			
			let lines = commentText.split('\n');
			let firstLineText = lines[0] || '';
			let restOfText = lines.slice(1).join('\n') || '';

			const textTop = new fabric.Textbox(firstLineText, { width: 280, fontSize: 16, fontFamily: 'Sarabun', fontWeight: 'bold', fill: colorHex, originX: 'center', originY: 'top', top: 0, textAlign: 'left', lineHeight: 1.2 });
			
			let groupItems = [textTop];
			let totalTextHeight = textTop.height;

			if (restOfText) {
				const textDesc = new fabric.Textbox(restOfText, { width: 280, fontSize: 16, fontFamily: 'Sarabun', fontWeight: 'normal', fill: colorHex, originX: 'center', originY: 'top', top: textTop.height + 2, textAlign: 'left', lineHeight: 1.2 });
				totalTextHeight += textDesc.height + 2;
				groupItems.push(textDesc);
			}

			fabric.Image.fromURL(sigData, function(sigImg) {
				// [ข้อ 29] ขยายลายเซ็นให้ใหญ่ขึ้น (110 -> 160) และคมชัดขึ้น
				//          (ช่องลายเซ็นถูกปรับให้วาดที่ความละเอียด 2-3 เท่า ดู setupSigCanvas)
				sigImg.scaleToWidth(160);
				sigImg.set({
					originX: 'center', originY: 'top', top: totalTextHeight + 5,
					imageSmoothing: true,
					objectCaching: false          // ไม่ใช้แคชภาพ -> คมทุกระดับการซูม
				});
				groupItems.push(sigImg);

				// กำหนดวันที่ภาษาไทยแบบเลขอารบิก เช่น 5 / ก.ย. / 2569
				const d = new Date();
				const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
				const dateStrArabic = `${d.getDate()} / ${months[d.getMonth()]} / ${d.getFullYear() + 543}`;

				const nameObj = new fabric.Text(`( ${titleName} )\n${positionName}\n${dateStrArabic}`, { fontSize: 14, fontFamily: 'Sarabun', fill: colorHex, originX: 'center', originY: 'top', top: sigImg.top + sigImg.getScaledHeight(), textAlign: 'center', lineHeight: 1.2 });
				groupItems.push(nameObj);

				// [ข้อ 25] ตัวเลขลำดับขั้นตอน (รูปแบบเดียวกับ badge แจ้งเตือนหนังสือเข้า) วางไว้หน้าชื่อผู้ลงนาม
				const badgeR = 13;
				const badgeLeft = -(nameObj.width / 2) - badgeR - 8;
				const badgeTop = nameObj.top + badgeR + 2;
				const badgeCircle = new fabric.Circle({
					radius: badgeR, fill: '#dc2626', stroke: '#ffffff', strokeWidth: 2,
					originX: 'center', originY: 'center', left: badgeLeft, top: badgeTop
				});
				const badgeText = new fabric.Text(String(stepOrder), {
					fontSize: 15, fontFamily: 'Sarabun', fontWeight: 'bold', fill: '#ffffff',
					originX: 'center', originY: 'center', left: badgeLeft, top: badgeTop
				});
				groupItems.push(badgeCircle, badgeText);

				const box = new fabric.Rect({ width: 300, height: nameObj.top + nameObj.height + 10, fill: 'rgba(254, 226, 226, 0.95)', stroke: '#ef4444', strokeWidth: 2, rx: 8, ry: 8, originX: 'center', originY: 'top', top: -10 });
				groupItems.unshift(box);

				// =========================================================================
				// คำนวณพิกัดส่วนท้ายของหน้าที่ 1
				// =========================================================================
				const stampHeight = box.height;
				// คำนวณความสูงของหน้าที่ 1 อิงตามอัตราส่วนกระดาษ A4 (กว้าง x 1.414) หรือความสูงทั้งหมดถ้ามีหน้าเดียว
				const page1Height = Math.min(canvas.height, canvas.width * 1.414);
				
				// ตำแหน่งตั้งต้น (จะถูกคำนวณใหม่ด้วย computeStampPlacement หลังสร้างกลุ่ม)
				const targetLeft = canvas.width / 2;
				const targetTop = Math.max(stampHeight / 2 + 20, page1Height - (stampHeight / 2) - 45);

				let group = new fabric.Group(groupItems, { 
					left: targetLeft, 
					top: targetTop, 
					originX: 'center', 
					originY: 'center', 
					cornerColor: '#ef4444', 
					borderColor: '#ef4444', 
					transparentCorners: false,
					stampName: positionName,
					isCurrentStep: true,
					originalFill: 'rgba(255, 255, 255, 0.75)',
					originalStroke: colorHex,
					stampColor: colorHex
				});
				
				// [ข้อ 26 + 27] คำนวณตำแหน่งอัตโนมัติ :
				//   1) ตำแหน่งที่ผู้ใช้เคยลากไว้ของขั้นตอนนี้  2) ต่อจากตราสั่งการของ ผอ.  3) ค่าเริ่มต้น
				if (typeof window.computeStampPlacement === 'function') {
					const pos = window.computeStampPlacement(canvas, group, sigPadKey);
					group.set({ left: pos.left, top: pos.top });
					group.setCoords();
					group.__placedFrom = pos.from;
				}
				ensureSafeStampPlacement(canvas, group);
				canvas.add(group); 
				canvas.setActiveObject(group); 
				// [ข้อ 27] จำตำแหน่งที่ผู้ใช้ลากไว้ เพื่อให้ครั้งต่อไปวางตรงนั้นทันที
				if (typeof window.bindStampMemory === 'function') window.bindStampMemory(canvas, group, sigPadKey);
				
				// เพิ่มคำสั่งนี้: ตรวจสอบการทับซ้อนทันทีที่ตรายางวางลงกระดาษ
				checkStampOverlap(canvas, true);
				
				
				// สั่งแอนิเมชันให้เส้นประวิ่ง
				if (!group.animateBorder) group.item(0).set({ strokeDashArray: [5, 5] });   // [v47] ตราความเห็นไม่มีเส้นขอบ จึงไม่ต้องวิ่งเส้นประ
					let offset = 0;
					if (!group.animateBorder) group.animateBorder = setInterval(() => {
					if (group.item && group.item(0)) {
						group.item(0).set({ strokeDashOffset: offset-- });
						canvas.requestRenderAll();
					} else {
						clearInterval(group.animateBorder);
					}
				}, 50);
				
				// เลื่อนหน้าจอ (Smooth Scroll) ลงมาโฟกัสที่ตำแหน่งตรายางอัตโนมัติ
				focusOnObject(canvas, group);
				saveCanvasState(canvas);
				
				// เพิ่มคำสั่งนี้: ซ่อนฟอร์มหลังจากประทับตราเสร็จอัตโนมัติ
				if (typeof autoHidePanelAfterStamp === 'function') {
					autoHidePanelAfterStamp(currentStage);
				}
					
				
			});
		}
		

        function applyAssistantStamp() { applyCommentStamp('canvas-assistant', 'assistant-comment', 'assistant', '#1e3a8a', 'นายผู้ช่วย ตั้งใจทำงาน', 'ผู้ช่วยผู้อำนวยการ'); }
        function applySubdirectorStamp() { applyCommentStamp('canvas-subdirector', 'subdirector-comment', 'subdirector', '#1e3a8a', 'นางสาวรอง ดีเด่น', 'รองผู้อำนวยการสถานศึกษา'); }
        function applyDirectorStamp() { 
            let checkedBoxes = document.querySelectorAll('.director-group-checkbox:checked');
            if (checkedBoxes.length === 0) {
                return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มบริหารเพื่อมอบหมายงาน อย่างน้อย 1 กลุ่ม ก่อนประทับตราสั่งการครับ', 'warning');
            }
            applyCommentStamp('canvas-director', 'director-comment', 'director', '#1e3a8a', 'นายสมชาย ใจดี', 'ผู้อำนวยการสถานศึกษา'); 
        }
        
        function applyAssigneeStamp() { applyCommentStamp('canvas-assignee', 'assignee-comment', 'assignee', '#1e3a8a', 'ผู้รับผิดชอบงาน', 'ผู้รับผิดชอบ'); }
		
		
		// ==========================================
        // ระบบประทับตรายาง สำหรับกลุ่มงานต่างๆ (Stage 5-7)
        // ==========================================

        /* [v23 ข้อ 8/9] เลขรับกลุ่มบริหาร / กลุ่มงาน
           ตัวจริงออกโดยเซิร์ฟเวอร์ (allocReceiveNo -> ชีต "ปี_ธุรการ...") ดูสคริปต์ v23 ด้านล่าง
           ฟังก์ชันนี้เป็น "ทางสำรอง" กรณีเชื่อมต่อเซิร์ฟเวอร์ไม่ได้เท่านั้น
           สาเหตุเลขกระโดดเดิม (รับฉบับแรกแต่ได้เลข 9) :
             1) ตัวนับใน localStorage ของแต่ละเครื่องเพิ่มทุกครั้งที่ถูกเรียก และไม่เคยรีเซ็ต
             2) เลขรับกลุ่มงานนับรวมเลขของ "ทุกกลุ่มงาน" (ไม่ได้กรองเฉพาะกลุ่มตนเอง)
           แก้ : นับจากหนังสือของกลุ่มตนเองในปีปฏิทินปัจจุบันเท่านั้น + เลขเริ่มต้นที่ผู้ดูแลระบบตั้งไว้ */
        function pcLocalNextReceiveNo(roomName, field, groupsField) {
            const cleanRoom = String(roomName || '').replace(/ฯ/g, '').trim();
            const thaiYear = new Date().getFullYear() + 543;
            let maxNum = 0;
            state.documentQueue.forEach(d => {
                const mine = Array.isArray(d[groupsField]) && d[groupsField].some(g => {
                    const ng = String(g).replace(/ฯ/g, '').trim();
                    return ng === cleanRoom || cleanRoom.includes(ng) || ng.includes(cleanRoom);
                });
                const v = String(d[field] || '');
                if (!mine || v.indexOf('/' + thaiYear) === -1) return;
                const num = parseInt(v.split('/')[0], 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            });
            let startKey = regInputMap[roomName] || regInputMap[cleanRoom];
            if (!startKey) {
                for (const [k, v] of Object.entries(regInputMap)) {
                    const nk = k.replace(/ฯ/g, '').trim();
                    if (nk === cleanRoom || cleanRoom.includes(nk)) { startKey = v; break; }
                }
            }
            const startStr = startKey ? (localStorage.getItem(startKey) || '') : '';
            if (startStr.indexOf('/' + thaiYear) !== -1) {
                const s = parseInt(startStr.split('/')[0], 10);
                if (!isNaN(s) && s > 0) maxNum = Math.max(maxNum, s - 1);
            }
            return `${maxNum + 1}/${thaiYear}`;
        }

        // รันเลขรับกลุ่มบริหาร (ทางสำรอง) แยกตามกลุ่มและปีปฏิทิน
		function generateGroupReceiveNo(roomName) {
			return pcLocalNextReceiveNo(roomName, 'groupReceiveNo', 'assignedGroups');
		}

		// รันเลขรับกลุ่มงานย่อย (ทางสำรอง) แยกตามกลุ่มงานและปีปฏิทิน
		function generateSubgroupReceiveNo(roomName) {
			return pcLocalNextReceiveNo(roomName, 'subgroupReceiveNo', 'subGroups');
		}

        // ==========================================
        // 1. ประทับตรารับ (ธุรการกลุ่มบริหาร)
        // ==========================================
        // ตรารับสำหรับธุรการกลุ่มบริหาร (Stage 5) - มุมบนซ้าย พร้อมโฟกัสหน้าจอ
		function applyAdminGroupReceiveStamp(canvasKey = 'canvas-admingroup') {
			let canvas = state.canvases[canvasKey];
			if (!canvas) return;

			let activeId = state.activeDocIds[5];
			if (!activeId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารก่อนครับ', 'warning');

			let doc = state.documentQueue.find(d => d.id === activeId);
			if (!doc) return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลเอกสาร', 'error');

			const roomName = document.getElementById('banner-room-name').innerText;
			// [v23 ข้อ 10] ผู้รับ = ชื่อ-สกุลของธุรการกลุ่มที่ลงรับจริง (เช่น นางสาวอัญชลี อุดมฤทธิ์)
			doc.groupReceiver = state.user.name || state.user.title || ('ธุรการ' + roomName);

			let existing = canvas.getObjects().find(o => o.stampName === 'ตรารับกลุ่มบริหาร');
			if (existing) {
				canvas.setActiveObject(existing);
				canvas.renderAll();
				focusOnObject(canvas, existing);
				// เลื่อน Scrollbar ของพื้นที่แสดงเอกสารไปที่มุมบนซ้าย
				const wrapper = canvas.wrapperEl ? canvas.wrapperEl.closest('.overflow-auto, .overflow-y-auto') : null;
				if (wrapper) wrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
				return;
			}

			if (!doc.groupReceiveNo) {
				doc.groupReceiveNo = generateGroupReceiveNo(roomName);
			}
			
			let groupReceiveNo = doc.groupReceiveNo;
			let d = new Date();
			let dateStr = `${toArabicNum(d.getDate())} ${getThaiMonthName(d.getMonth())} ${toArabicNum(d.getFullYear() + 543)}`;
			let timeStr = `${toArabicNum(d.getHours().toString().padStart(2, '0'))}.${toArabicNum(d.getMinutes().toString().padStart(2, '0'))} น.`;

			// กล่องพื้นหลัง (กว้าง 250px)
			let box = new fabric.Rect({
				width: 250, height: 115, fill: 'rgba(254, 243, 199, 0.9)',
				stroke: '#ef4444', strokeWidth: 2, strokeDashArray: [6, 6], rx: 6, ry: 6,
				originX: 'center', originY: 'top', left: 0, top: 0
			});

			// 1. ชื่อกลุ่ม: กึ่งกลาง
			let t1 = new fabric.Text(roomName, { 
				fontSize: 13, fontFamily: 'Sarabun', fontWeight: 'bold', fill: '#059669', 
				originX: 'center', left: 0, top: 8 
			});
			// 2-5. ข้อความชิดซ้ายตรงแนวเดียวกัน
			let t2 = new fabric.Text(`เลขรับ: ${groupReceiveNo}`, { 
				fontSize: 12.5, fontFamily: 'Sarabun', fontWeight: 'bold', fill: '#059669', 
				originX: 'left', left: -100, top: 29 
			});
			let t3 = new fabric.Text(`วันที่: ${dateStr}`, { 
				fontSize: 12, fontFamily: 'Sarabun', fill: '#059669', 
				originX: 'left', left: -100, top: 49 
			});
			let t4 = new fabric.Text(`เวลา: ${timeStr}`, { 
				fontSize: 12, fontFamily: 'Sarabun', fill: '#059669', 
				originX: 'left', left: -100, top: 69 
			});
			let t5 = new fabric.Text(`ผู้รับ: ${doc.groupReceiver}`, { 
				fontSize: 12, fontFamily: 'Sarabun', fill: '#059669', 
				originX: 'left', left: -100, top: 89 
			});

			// กำหนดตำแหน่งให้อยู่ที่ "มุมบนซ้าย" (left: 150 = เว้นระยะจากขอบซ้าย 25px, top: 40)
			let stampGroup = new fabric.Group([box, t1, t2, t3, t4, t5], {
				left: 150, top: 40, originX: 'center', originY: 'top',
				cornerColor: '#ef4444', borderColor: '#ef4444', transparentCorners: false,
				stampName: 'ตรารับกลุ่มบริหาร', isCurrentStep: true,
				originalFill: 'rgba(254, 243, 199, 0.9)', originalStroke: '#059669', stampColor: '#059669'
			});

			ensureSafeStampPlacement(canvas, stampGroup);
			canvas.add(stampGroup);
			canvas.setActiveObject(stampGroup);
			
			// เพิ่มคำสั่งนี้: ตรวจสอบการทับซ้อนทันทีที่ตรายางวางลงกระดาษ
			checkStampOverlap(canvas, true);
			

			// ลูปแอนิเมชันเส้นประวิ่ง
			let offset = 0;
			stampGroup.animateBorder = setInterval(() => {
				if (stampGroup.item && stampGroup.item(0)) {
					stampGroup.item(0).set({ strokeDashOffset: offset-- });
					canvas.requestRenderAll();
				} else {
					clearInterval(stampGroup.animateBorder);
				}
			}, 50);

			canvas.renderAll();
			
			// โฟกัสและเลื่อนหน้าจอไปที่มุมบนซ้ายของหนังสือ
			focusOnObject(canvas, stampGroup);
			const wrapper = canvas.wrapperEl ? canvas.wrapperEl.closest('.overflow-auto, .overflow-y-auto') : null;
			if (wrapper) wrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

			saveCanvasState(canvas);
		}

        // ==========================================
		// 2. ประทับตรารับ (ธุรการกลุ่มงาน) - วางต่อจากตราเดิมที่มุมบนซ้าย
		// ==========================================
		function applySubgroupAdminReceiveStamp(canvasKey = 'canvas-subgroupadmin') {
			let canvas = state.canvases[canvasKey];
			if (!canvas) return;

			let activeId = state.activeDocIds[65];
			if (!activeId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารก่อนครับ', 'warning');

			let doc = state.documentQueue.find(d => d.id === activeId);
			if (!doc) return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลเอกสาร', 'error');

			const roomName = document.getElementById('banner-room-name').innerText;
			// [v23 ข้อ 10] ผู้รับ = ชื่อ-สกุลของธุรการกลุ่มงานที่ลงรับจริง
			doc.subgroupReceiver = state.user.name || state.user.title || ('ธุรการ' + roomName);

			let existing = canvas.getObjects().find(o => o.stampName === 'ตรารับกลุ่มงาน');
			if (existing) {
				canvas.setActiveObject(existing);
				canvas.renderAll();
				focusOnObject(canvas, existing);
				const wrapper = canvas.wrapperEl ? canvas.wrapperEl.closest('.overflow-auto, .overflow-y-auto') : null;
				if (wrapper) wrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
				return;
			}

			if (!doc.subgroupReceiveNo) {
				doc.subgroupReceiveNo = generateSubgroupReceiveNo(roomName);
			}
			
			let subgroupReceiveNo = doc.subgroupReceiveNo;
			let d = new Date();
			let dateStr = `${toArabicNum(d.getDate())} ${getThaiMonthName(d.getMonth())} ${toArabicNum(d.getFullYear() + 543)}`;
			let timeStr = `${toArabicNum(d.getHours().toString().padStart(2, '0'))}.${toArabicNum(d.getMinutes().toString().padStart(2, '0'))} น.`;

			// กล่องพื้นหลัง (กว้าง 250px, สูง 115px)
			let box = new fabric.Rect({
				width: 250, height: 115, fill: 'rgba(254, 243, 199, 0.9)',
				stroke: '#ef4444', strokeWidth: 2, strokeDashArray: [6, 6], rx: 6, ry: 6,
				originX: 'center', originY: 'top', left: 0, top: 0
			});

			// ข้อความภายในตราประทับ
			let t1 = new fabric.Text(roomName, { 
				fontSize: 13, fontFamily: 'Sarabun', fontWeight: 'bold', fill: '#0891b2', 
				originX: 'center', left: 0, top: 8 
			});
			let t2 = new fabric.Text(`เลขรับ: ${subgroupReceiveNo}`, { 
				fontSize: 12.5, fontFamily: 'Sarabun', fontWeight: 'bold', fill: '#0891b2', 
				originX: 'left', left: -100, top: 29 
			});
			let t3 = new fabric.Text(`วันที่: ${dateStr}`, { 
				fontSize: 12, fontFamily: 'Sarabun', fill: '#0891b2', 
				originX: 'left', left: -100, top: 49 
			});
			let t4 = new fabric.Text(`เวลา: ${timeStr}`, { 
				fontSize: 12, fontFamily: 'Sarabun', fill: '#0891b2', 
				originX: 'left', left: -100, top: 69 
			});
			let t5 = new fabric.Text(`ผู้รับ: ${doc.subgroupReceiver}`, { 
				fontSize: 12, fontFamily: 'Sarabun', fill: '#0891b2', 
				originX: 'left', left: -100, top: 89 
			});

			// --- [คำนวณตำแหน่งวางต่อจากตราเดิมที่มุมบนซ้าย] ---
			let startLeft = 150; // originX กึ่งกลางกล่อง (250px / 2 = เว้นขอบซ้าย 25px)
			let startTop = 40;  // ค่าเริ่มต้นกรณีไม่มีตราเดิมอยู่ก่อน

			// ตรวจหาตราประทับที่มีอยู่เดิมในโซนมุมบนซ้าย (เช่น ตรารับกลุ่มบริหาร)
			const previousTopLeftStamps = canvas.getObjects().filter(o => {
				if (!o.stampName || o.isCurrentStep) return false;
				let r = o.getBoundingRect(true, true);
				return r.left < (canvas.width * 0.5) && r.top < (canvas.height * 0.5);
			});

			if (previousTopLeftStamps.length > 0) {
				let maxBottom = 0;
				previousTopLeftStamps.forEach(s => {
					let r = s.getBoundingRect(true, true);
					if (r.top + r.height > maxBottom) {
						maxBottom = r.top + r.height;
					}
				});
				// วางต่อลงมาด้านล่างตราเดิม เว้นระยะห่าง 12px
				startTop = maxBottom + 12;
			}

			let stampGroup = new fabric.Group([box, t1, t2, t3, t4, t5], {
				left: startLeft, 
				top: startTop, 
				originX: 'center', 
				originY: 'top',
				cornerColor: '#ef4444', 
				borderColor: '#ef4444', 
				transparentCorners: false,
				stampName: 'ตรารับกลุ่มงาน', 
				isCurrentStep: true,
				originalFill: 'rgba(254, 243, 199, 0.9)', 
				originalStroke: '#0891b2', 
				stampColor: '#0891b2'
			});

			ensureSafeStampPlacement(canvas, stampGroup);
			canvas.add(stampGroup);
			canvas.setActiveObject(stampGroup);
			
			// ตรวจสอบการทับซ้อนและแจ้งเตือน
			checkStampOverlap(canvas, true);

			// แอนิเมชันเส้นประวิ่ง
			let offset = 0;
			stampGroup.animateBorder = setInterval(() => {
				if (stampGroup.item && stampGroup.item(0)) {
					stampGroup.item(0).set({ strokeDashOffset: offset-- });
					canvas.requestRenderAll();
				} else {
					clearInterval(stampGroup.animateBorder);
				}
			}, 50);

			canvas.renderAll();
			
			// โฟกัสและเลื่อนหน้าจอไปยังมุมบนซ้ายของเอกสาร
			focusOnObject(canvas, stampGroup);
			const wrapper = canvas.wrapperEl ? canvas.wrapperEl.closest('.overflow-auto, .overflow-y-auto') : null;
			if (wrapper) {
				setTimeout(() => {
					wrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
				}, 50);
			}

			saveCanvasState(canvas);
		}
		

        // ประทับเสนอ (ธุรการกลุ่มบริหาร)
        function applyAdminGroupProposalStamp() { 
            const roomName = document.getElementById('banner-room-name').innerText;
            applyCommentStamp('canvas-admingroup', 'admingroup-comment', 'admingroup', '#1e3a8a', 'ธุรการกลุ่ม', `เจ้าหน้าที่ธุรการ${roomName}`); 
        }

        // ประทับเสนอ (ธุรการกลุ่มงาน)
        function applySubgroupAdminProposalStamp() { 
            const roomName = document.getElementById('banner-room-name').innerText;
            applyCommentStamp('canvas-subgroupadmin', 'subgroupadmin-comment', 'subgroupadmin', '#1e3a8a', 'ธุรการกลุ่มงาน', `เจ้าหน้าที่ธุรการ${roomName}`); 
        }

        // 3. ประทับมอบหมาย (รองกลุ่ม) ดึงชื่อกลุ่มบริหารมาใส่ใต้ชื่อ
        function applySubdirectorGroupStamp() { 
            let checkedBoxes = document.querySelectorAll('.subdirector-group-checkbox:checked');
            if (checkedBoxes.length === 0) {
                return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มงานย่อยที่ต้องการมอบหมาย อย่างน้อย 1 กลุ่ม ก่อนประทับตราครับ', 'warning');
            }
            const roomName = document.getElementById('banner-room-name').innerText;
            applyCommentStamp('canvas-subdirectorgroup', 'subdirectorgroup-comment', 'subdirectorgroup', '#1e3a8a', 'รองผู้อำนวยการ', `รองผู้อำนวยการ${roomName}`); 
        }

        // 4. ประทับมอบหมาย (ผู้ช่วยกลุ่ม) ดึงชื่อกลุ่มงานมาใส่ใต้ชื่อ
        function applyAssistantGroupStamp() { 
            const roomName = document.getElementById('banner-room-name').innerText;

            // [ข้อ 28] ต้องเลือกผู้รับผิดชอบอย่างน้อย 1 คน แล้วนำชื่อไปต่อท้ายความเห็น
            const picked = (typeof getSelectedAssignees === 'function') ? getSelectedAssignees('assignee-picker-assistantgroup') : [];
            if (!picked.length) {
                if (typeof renderAssigneeCheckboxList === 'function') renderAssigneeCheckboxList('assignee-picker-assistantgroup', roomName);
                return Swal.fire('แจ้งเตือน', 'กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน ก่อนประทับตรามอบหมายครับ', 'warning');
            }
            const names = picked.map(p => p.name).join(', ');
            const ta = document.getElementById('assistantgroup-comment');
            if (ta) {
                const base = ta.value.split('\n').filter(l => l.indexOf('- มอบหมาย: ') !== 0).join('\n').trim();
                ta.value = (base ? base + '\n' : '') + '- มอบหมาย: ' + names;
            }
            // เก็บผู้รับผิดชอบลงหนังสือฉบับที่กำลังทำงานอยู่
            const doc = state.documentQueue.find(d => d.id === state.activeDocIds[7]);
            if (doc) {
                doc.assigneeName = names;
                doc.assigneeIds = picked.map(p => p.id);
            }

            applyCommentStamp('canvas-assistantgroup', 'assistantgroup-comment', 'assistantgroup', '#1e3a8a', 'ผู้ช่วยผู้อำนวยการ', `ผช.ผอ. ${roomName}`); 
        }

        // ==========================================
        // ระบบข้อสั่งการด่วน (Auto-Text Textarea)
        // ==========================================

        // ข้อ 6: อัปเดตข้อความเมื่อ ผอ. กด Checkbox มอบหมาย
        function updateDirectorComment() {
            let checkedBoxes = document.querySelectorAll('.director-group-checkbox:checked');
            let text = "ทราบ/ มอบ"; // เปลี่ยนบรรทัดแรก
            if (checkedBoxes.length > 0) {
                let groups = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
                text += `\n☑ ${groups}`; // ใช้ Checkbox แทน -
            }
            document.getElementById('director-comment').value = text;
        }

        function updateSubdirectorGroupComment() {
            let checkedBoxes = document.querySelectorAll('.subdirector-group-checkbox:checked');
            let text = "ทราบ/ มอบ"; // เปลี่ยนบรรทัดแรก
            if (checkedBoxes.length > 0) {
                let groups = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
                text += `\n☑ ${groups}`; // ใช้ Checkbox แทน -
            }
            document.getElementById('subdirectorgroup-comment').value = text;
        }
		
		function loadAssistantCommands() {
            let cmds = JSON.parse(localStorage.getItem('assistantCmds') || '[]');
            if(cmds.length === 0) cmds = ["ดำเนินการ"]; 
            
            // 1. สร้างปุ่มข้อสั่งการด้านล่าง
            const container = document.getElementById('assistant-cmd-list');
            if(container) {
                container.innerHTML = cmds.map(c => `
                    <button type="button" onclick="setAssistantCommand('${c}')" class="px-2 py-1.5 rounded-md text-[10px] font-bold border border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-600 hover:text-white transition shadow-sm">${c}</button>
                `).join('');
            }
            
            // 2. สร้าง Autocomplete สำหรับช่องพิมพ์
            const datalist = document.getElementById('assistant-cmd-datalist');
            if (datalist) {
                datalist.innerHTML = cmds.map(c => `<option value="${c}">`).join('');
            }
        }

        function addCustomAssistantCommand() {
            const input = document.getElementById('custom-assistant-cmd');
            const val = input.value.trim();
            if(val !== '') {
                let cmds = JSON.parse(localStorage.getItem('assistantCmds') || '[]');
                if (!cmds.includes(val)) {
                    cmds.push(val);
                    localStorage.setItem('assistantCmds', JSON.stringify(cmds));
                }
                input.value = ''; // เคลียร์ช่องพิมพ์ (ไม่เพิ่มลง textarea ทันที)
                loadAssistantCommands();
            }
        }

        function removeCustomAssistantCommand() {
            const input = document.getElementById('custom-assistant-cmd');
            const val = input.value.trim();
            if(val !== '') {
                let cmds = JSON.parse(localStorage.getItem('assistantCmds') || '[]');
                const index = cmds.indexOf(val);
                if (index > -1) {
                    cmds.splice(index, 1);
                    localStorage.setItem('assistantCmds', JSON.stringify(cmds));
                    input.value = '';
                    loadAssistantCommands();
                    Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                } else {
                    Swal.fire({ icon: 'warning', title: 'ไม่พบข้อสั่งการนี้', text: 'กรุณาพิมพ์หรือเลือกข้อความที่ต้องการลบให้ตรงกัน', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
                }
            }
        }

        function setAssistantCommand(cmd) {
            const textarea = document.getElementById('assistantgroup-comment');
            if(!textarea.value) textarea.value = "ทราบ/ มอบ";
            textarea.value += '\n- ' + cmd; 
        }
        
        // เรียกใช้งานตอนโหลดหน้า
        window.addEventListener('DOMContentLoaded', loadAssistantCommands);
		
		function renderSubdirectorCheckboxes(roomName) {
            const container = document.getElementById('subdirector-checkboxes-container');
            if (!container) return;
            
            let groups = [];
            if (roomName.includes('วิชาการ')) groups = ['กลุ่มงานการจัดการศึกษา', 'กลุ่มงานพัฒนาโครงการพิเศษ'];
            else if (roomName.includes('งบประมาณ')) groups = ['กลุ่มงานอำนวยการ', 'กลุ่มงานแผนงาน การเงิน พัสดุและสินทรัพย์'];
            else if (roomName.includes('บุคคล')) groups = ['กลุ่มงานบุคลากร', 'กลุ่มงานกิจการนักเรียน'];
            else if (roomName.includes('ทั่วไป')) groups = ['กลุ่มงานอาคารสถานที่ฯ', 'กลุ่มงานชุมชนและภาคีเครือข่าย'];

            container.innerHTML = groups.map(g => `
                <label class="cursor-pointer">
                    <input type="checkbox" value="${g}" onchange="updateSubdirectorGroupComment()" class="subdirector-group-checkbox peer hidden">
                    <div class="px-2 py-1 rounded-md text-[9px] font-bold border border-teal-200 text-teal-600 bg-teal-50 peer-checked:bg-teal-600 peer-checked:text-white transition">${g}</div>
                </label>
            `).join('');
        }
		
		
		// ==========================================
        // ระบบปฏิทินงาน (Calendar)
        // ==========================================
        let currentCalDate = new Date();
        let googleHolidays = []; 
		
		let calendarViewMode = 'month'; // 'year', 'month', 'week', 'day', 'schedule'
        let calCurrentPage = 1;
        let calItemsPerPage = 4; // จำนวนการ์ดที่แสดงต่อหน้าไม่ให้เกินความสูง
        let currentMonthlyEvents = []; // เก็บ events ที่กรองแล้วเพื่อใช้แบ่งหน้า
		
        
        /* [ข้อ 5 + ข้อ 20] ยกเลิกการเรียก Google Calendar API ตรงจากหน้าเว็บ
           เดิมต้องใส่ GOOGLE_API_KEY เอง (ค่าเริ่มต้นเป็นข้อความตัวอย่าง จึงดึงวันหยุดไม่ได้เลย)
           ตอนนี้ดึงผ่าน Backend (action 'holidays' ใน Code.gs) ซึ่งมีแคชฝั่งเซิร์ฟเวอร์อยู่แล้ว
           ตัวจริงของ fetchThaiHolidays / ensureHolidayYear ถูกประกาศไว้ใน <script> ก้อนล่าง (PC) */
        if (typeof window.fetchThaiHolidays !== 'function') {
            window.fetchThaiHolidays = function () { /* จะถูกแทนที่โดยสคริปต์ PC ด้านล่าง */ };
        }
        if (typeof window.ensureHolidayYear !== 'function') {
            window.ensureHolidayYear = function () { /* จะถูกแทนที่โดยสคริปต์ PC ด้านล่าง */ };
        }

        window.addEventListener('DOMContentLoaded', () => {
            // ดึงข้อมูลวันหยุดของปีปัจจุบันทันทีที่โหลดหน้าเว็บ
            ensureHolidayYear(new Date().getFullYear());
            // เรียกใช้งาน Flatpickr สำหรับช่องกำหนดส่งงาน
            deadlinePicker = flatpickr("#admin-deadline", {
                locale: "th",
                dateFormat: "Y-m-d", // รูปแบบข้อมูลที่บันทึก (ปี-เดือน-วัน)
                altInput: true,
                altFormat: "j F Y", // รูปแบบที่แสดงให้ผู้ใช้เห็น (เช่น 12 สิงหาคม 2026)
                defaultDate: "today",
                onChange: function(selectedDates, dateStr, instance) {
                    // เมื่อเลือกวันที่ ให้อัปเดตข้อมูลลงเอกสารและรีเฟรชปฏิทิน
                    updateActiveDocField('deadline', dateStr);
                    if (typeof renderCalendar === 'function') {
                        renderCalendar();
                    }
                }
            });
        });

		
		
		
		// ==========================================
        // ระบบเลื่อนวันที่ (ปี, เดือน, สัปดาห์, วัน)
        // ==========================================
        function changeDateOffset(offset) {
            const previousYear = currentCalDate.getFullYear();
            
            if (calendarViewMode === 'year') {
                currentCalDate.setFullYear(currentCalDate.getFullYear() + offset);
            } else if (calendarViewMode === 'week') {
                currentCalDate.setDate(currentCalDate.getDate() + (offset * 7));
            } else if (calendarViewMode === 'day') {
                currentCalDate.setDate(currentCalDate.getDate() + offset);
            } else {
                // โหมด month และ schedule ให้เลื่อนทีละเดือน
                currentCalDate.setMonth(currentCalDate.getMonth() + offset);
            }
            
            const newYear = currentCalDate.getFullYear();
            if (previousYear !== newYear) {
                // [ข้อ 5] เปลี่ยนปี -> ดึงวันหยุดปีใหม่อัตโนมัติ (ensureHolidayYear จะกันการดึงซ้ำให้เอง)
                if (typeof ensureHolidayYear === 'function') ensureHolidayYear(newYear);
            }
            renderCalendar();
        }

        /* ============================================================================
           [ข้อ 7/8/9] ชุดสีปฏิทิน — ประกาศไว้ระดับบนสุดเพื่อให้ทุกมุมมองใช้ชุดเดียวกัน
           ============================================================================ */
        // สีประจำวันตามความเชื่อไทย + สีตัวหนังสือที่ตัดกับพื้นหลังให้อ่านง่าย (ผ่านเกณฑ์ contrast)
        const PC_DAY_COLORS = [
            { name: 'อาทิตย์', bg: '#dc2626', fg: '#ffffff', soft: '#fee2e2', softFg: '#991b1b' }, // แดง
            { name: 'จันทร์',  bg: '#facc15', fg: '#1f2937', soft: '#fef9c3', softFg: '#854d0e' }, // เหลือง (ตัวหนังสือเข้ม)
            { name: 'อังคาร',  bg: '#ec4899', fg: '#ffffff', soft: '#fce7f3', softFg: '#9d174d' }, // ชมพู
            { name: 'พุธ',     bg: '#16a34a', fg: '#ffffff', soft: '#dcfce7', softFg: '#166534' }, // เขียว
            { name: 'พฤหัสบดี', bg: '#f97316', fg: '#ffffff', soft: '#ffedd5', softFg: '#9a3412' }, // ส้ม
            { name: 'ศุกร์',   bg: '#0ea5e9', fg: '#ffffff', soft: '#e0f2fe', softFg: '#075985' }, // ฟ้า
            { name: 'เสาร์',   bg: '#7c3aed', fg: '#ffffff', soft: '#ede9fe', softFg: '#5b21b6' }  // ม่วง
        ];
        const PC_CAL = {
            monthBarBg: '#1d4ed8',      // [ข้อ 7] แถบชื่อเดือน : น้ำเงิน
            monthBarFg: '#ffffff',      // [ข้อ 7] ตัวหนังสือ : ขาว
            holidayText: '#dc2626',     // [ข้อ 1] ตัวหนังสือวันหยุด : แดง
            holidayBg: '#fee2e2',       // [ข้อ 9] พื้นหลังวันหยุดนักขัตฤกษ์
            holidayBorder: '#fca5a5',
            weekendBg: '#fff1f2',       // [ข้อ 9] พื้นหลังเสาร์-อาทิตย์
            weekendBorder: '#fecdd3'
        };
        /** แปลงวันที่เป็นข้อความ YYYY-MM-DD แบบ local (ไม่ใช้ toISOString เพราะจะเพี้ยนตาม timezone) */
        function pcDateStr(d) {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        /** [ข้อ 1/9] สรุปสถานะของวันหนึ่ง ๆ เพื่อใช้ลงสีให้เหมือนกันทุกมุมมอง */
        function pcDayInfo(dateStr, dayEvents) {
            const d = new Date(dateStr + 'T00:00:00');
            const dow = d.getDay();
            const isWeekend = (dow === 0 || dow === 6);
            const isHoliday = !!(dayEvents && dayEvents.some(e => e.isHoliday));
            return {
                dow: dow,
                isWeekend: isWeekend,
                isHoliday: isHoliday,
                isOff: isWeekend || isHoliday,
                color: PC_DAY_COLORS[dow],
                // [ข้อ 1] วันหยุดนักขัตฤกษ์ + เสาร์อาทิตย์ = ตัวหนังสือสีแดง
                textStyle: (isHoliday || isWeekend) ? ('color:' + PC_CAL.holidayText + ';font-weight:800;') : '',
                // [ข้อ 9] พื้นหลังวันหยุด (วันหยุดนักขัตฤกษ์เข้มกว่าเสาร์อาทิตย์)
                cellStyle: isHoliday
                    ? ('background:' + PC_CAL.holidayBg + ';border-color:' + PC_CAL.holidayBorder + ';')
                    : (isWeekend ? ('background:' + PC_CAL.weekendBg + ';border-color:' + PC_CAL.weekendBorder + ';') : '')
            };
        }
        window.pcDateStr = pcDateStr;
        window.pcDayInfo = pcDayInfo;

        // ==========================================
        // ระบบวาดปฏิทินแบบ Dynamic 5 มุมมอง
        // ==========================================
        function renderCalendar(forceDate = null) {
            if(forceDate) currentCalDate = forceDate;

            const year = currentCalDate.getFullYear();
            const month = currentCalDate.getMonth();
            const date = currentCalDate.getDate();
            const thYear = year + 543;
            const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
            const shortDays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
            const fullDays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
            let today = new Date();

            // [ข้อ 5] ดึงวันหยุดของช่วงเวลาที่กำลังแสดงอัตโนมัติ ครบทุกมุมมอง (ปี/เดือน/สัปดาห์/วัน/กำหนดการ)
            if (typeof ensureHolidayYear === 'function') {
                ensureHolidayYear(year);
                if (calendarViewMode === 'week') {
                    const _wS = new Date(currentCalDate); _wS.setDate(date - currentCalDate.getDay());
                    const _wE = new Date(_wS); _wE.setDate(_wS.getDate() + 6);
                    ensureHolidayYear(_wS.getFullYear());
                    ensureHolidayYear(_wE.getFullYear());
                } else if (calendarViewMode === 'month') {
                    if (month === 0) ensureHolidayYear(year - 1);
                    if (month === 11) ensureHolidayYear(year + 1);
                }
            }

            let events = typeof googleHolidays !== 'undefined' ? googleHolidays.map(h => ({
                date: h.date, title: h.title, location: h.location || 'ประเทศไทย', isHoliday: true
            })) : [];

            if (typeof state !== 'undefined' && state.documentQueue) {
                // [v24 ข้อ 9] หนังสือเรื่องเดียวที่ถูกแยกหลายฉบับ (หลายกลุ่ม/หลายผู้รับผิดชอบ) แสดงกำหนดส่งครั้งเดียว
                const seenDeadline = new Set();
                state.documentQueue.forEach(doc => {
                    if(doc.deadline) {
                        const k = (doc.rootDocId || doc.id) + '|' + doc.deadline;
                        if (seenDeadline.has(k)) return;
                        seenDeadline.add(k);
                        events.push({
                            date: doc.deadline, title: `กำหนดส่ง: ${doc.title} (เลขรับ: ${doc.receiveNo || '-'})`, location: 'ระบบรับหนังสือราชการ', isHoliday: false, docId: doc.id
                        });
                    }
                });
            }

            // กิจกรรมที่สร้างเอง (รองรับกิจกรรมหลายวัน + ปุ่มแก้ไข/ลบ ผ่าน eventId)
            if (typeof state !== 'undefined' && state.calendarEvents) {
                state.calendarEvents.forEach(evt => {
                    const expanded = (window.PC && typeof PC.expandEvent === 'function')
                        ? PC.expandEvent(evt)
                        : [{ date: evt.date || evt.startDate, title: evt.title, location: evt.location || evt.loc || 'ไม่ระบุสถานที่', isHoliday: false }];
                    expanded.forEach(x => events.push(x));
                });
            }
            // [ชุด 3 ข้อ 6] นัดหมายส่วนตัวจาก Google Calendar ของผู้ใช้ (แสดงเฉพาะในเครื่องผู้ใช้คนนั้น ไม่บันทึกลงชีต)
            if (window.PC && typeof PC.gcalVisible === 'function') PC.gcalVisible().forEach(x => events.push(x));   // [รอบ 5 ข้อ 4] เฉพาะของผู้ใช้ที่เข้าระบบอยู่

            const getEventsForDate = (dateStr) => events.filter(e => e.date === dateStr);
            const wrapper = document.getElementById('calendar-dynamic-wrapper');
            if(!wrapper) return;

            // ---------------------------------------------------------------
            // [ข้อ 7] แถบชื่อเดือน : พื้นหลังน้ำเงิน ตัวหนังสือขาว
            // [ข้อ 6] ปุ่มเลือกมุมมอง (แทน dropdown เดิม)
            // ---------------------------------------------------------------
            let headerText = '';
            if (calendarViewMode === 'year') {
                headerText = `ปี พ.ศ. ${thYear}`;
            } else if (calendarViewMode === 'week') {
                let weekStart = new Date(currentCalDate);
                weekStart.setDate(date - currentCalDate.getDay());
                let weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                if (weekStart.getMonth() === weekEnd.getMonth()) {
                    headerText = `${weekStart.getDate()} - ${weekEnd.getDate()} ${thMonths[weekStart.getMonth()]} ${thYear}`;
                } else {
                    headerText = `${weekStart.getDate()} ${thMonths[weekStart.getMonth()].substring(0,3)} - ${weekEnd.getDate()} ${thMonths[weekEnd.getMonth()].substring(0,3)} ${thYear}`;
                }
            } else if (calendarViewMode === 'day') {
                headerText = `วัน${fullDays[currentCalDate.getDay()]}ที่ ${date} ${thMonths[month]} ${thYear}`;
            } else if (calendarViewMode === 'schedule') {
                headerText = `กำหนดการ ${thMonths[month]} ${thYear}`;
            } else {
                headerText = `${thMonths[month]} ${thYear}`;
            }

            const viewBtns = [
                { id: 'year', label: 'ปี', icon: 'fa-calendar' },
                { id: 'month', label: 'เดือน', icon: 'fa-calendar-days' },
                { id: 'week', label: 'สัปดาห์', icon: 'fa-calendar-week' },
                { id: 'day', label: 'วัน', icon: 'fa-calendar-day' },
                { id: 'schedule', label: 'กำหนดการ', icon: 'fa-list-ul' }
            ].map(v => {
                const on = calendarViewMode === v.id;
                return `<button type="button" onclick="changeCalendarView('${v.id}')" aria-pressed="${on}"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${on
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'bg-white/15 text-white/90 hover:bg-white/25'}">
                    <i class="fa-solid ${v.icon} mr-1"></i>${v.label}</button>`;
            }).join('');

            let topBarHtml = `
                <div class="shrink-0" style="background:${PC_CAL.monthBarBg};color:${PC_CAL.monthBarFg};">
                    <div class="flex flex-wrap justify-between items-center gap-3 px-4 py-3">
                        <div class="flex items-center gap-2">
                            <button onclick="changeDateOffset(-1)" title="ก่อนหน้า" class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 transition flex items-center justify-center"><i class="fa-solid fa-chevron-left"></i></button>
                            <h3 class="text-lg font-bold px-1" style="color:${PC_CAL.monthBarFg};">${headerText}</h3>
                            <button onclick="changeDateOffset(1)" title="ถัดไป" class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 transition flex items-center justify-center"><i class="fa-solid fa-chevron-right"></i></button>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${viewBtns}
                            <button type="button" onclick="currentCalDate = new Date(); renderCalendar();" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 text-amber-950 hover:bg-amber-300 transition whitespace-nowrap"><i class="fa-solid fa-location-crosshairs mr-1"></i>วันนี้</button>
                        </div>
                    </div>
                </div>
            `;

            /** [ข้อ 8] แถบชื่อวัน : พื้นหลังสีประจำวัน ตัวหนังสือสีตัดพื้นหลัง */
            const dayHeaderRow = (labels, extraClass) => labels.map((d, i) => {
                const c = PC_DAY_COLORS[i];
                return `<div class="py-2 font-bold ${extraClass || 'text-[11px] sm:text-xs'}" style="background:${c.bg};color:${c.fg};" title="วัน${fullDays[i]}">${d}</div>`;
            }).join('');

            let contentHtml = '';

            // =====================================
            // มุมมอง: เดือน (MONTH)
            // =====================================
            if (calendarViewMode === 'month') {
                currentMonthlyEvents = events.filter(e => {
                    const d = new Date(e.date + 'T00:00:00');
                    return d.getFullYear() === year && d.getMonth() === month;
                }).sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const daysInPrevMonth = new Date(year, month, 0).getDate();

                let gridHtml = '';
                // วันท้ายเดือนก่อน (คลิกไม่ได้ แสดงจาง ๆ)
                for (let i = firstDay - 1; i >= 0; i--) {
                    gridHtml += `<div class="min-h-[54px] border border-slate-100 bg-slate-50/60 text-slate-300 flex items-start justify-center pt-1.5 text-xs">${daysInPrevMonth - i}</div>`;
                }

                for (let i = 1; i <= daysInMonth; i++) {
                    const cellDateStr = `${year}-${(month+1).toString().padStart(2,'0')}-${i.toString().padStart(2,'0')}`;
                    const isToday = (i === today.getDate() && month === today.getMonth() && year === today.getFullYear());
                    const dayEvents = getEventsForDate(cellDateStr);
                    const info = pcDayInfo(cellDateStr, dayEvents);
                    const holidayNames = dayEvents.filter(e => e.isHoliday).map(e => e.title).join(', ');
                    const taskCount = dayEvents.filter(e => !e.isHoliday).length;

                    // [ข้อ 2] ทุกช่องวันที่คลิกได้ -> เปิดโมดอลเพิ่มกิจกรรมทันที
                    const tip = holidayNames ? holidayNames + ' — คลิกเพื่อเพิ่มกิจกรรม' : 'คลิกเพื่อเพิ่มกิจกรรมวันที่ ' + i;
                    gridHtml += `
                        <div onclick="onCalendarDateClick('${cellDateStr}')" title="${tip.replace(/"/g,'&quot;')}"
                             class="min-h-[54px] border cursor-pointer transition hover:ring-2 hover:ring-purple-400 hover:z-10 relative flex flex-col items-center pt-1 px-0.5 ${info.isOff ? '' : 'bg-white border-slate-100'}"
                             style="${info.cellStyle}">
                            <div class="w-7 h-7 flex items-center justify-center rounded-full text-xs ${isToday ? 'bg-blue-700 text-white font-bold shadow' : ''}"
                                 style="${isToday ? '' : info.textStyle}">${i}</div>
                            ${holidayNames ? `<div class="text-[8px] leading-tight text-center line-clamp-2 px-0.5" style="color:${PC_CAL.holidayText};font-weight:700;">${holidayNames}</div>` : ''}
                            ${taskCount ? `<div class="mt-auto mb-1 flex items-center gap-0.5">
                                 <span class="text-[9px] font-bold text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-1.5">${taskCount}</span>
                               </div>` : ''}
                        </div>`;
                }

                const totalCells = firstDay + daysInMonth;
                const nextDays = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
                for (let i = 1; i <= nextDays; i++) {
                    gridHtml += `<div class="min-h-[54px] border border-slate-100 bg-slate-50/60 text-slate-300 flex items-start justify-center pt-1.5 text-xs">${i}</div>`;
                }

                contentHtml = `
                <div class="flex flex-col lg:flex-row flex-1 bg-white min-h-[450px]">
                    <div class="w-full lg:w-[58%] p-3 sm:p-4 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col">
                        <div class="grid grid-cols-7 text-center overflow-hidden rounded-t-lg">
                            ${dayHeaderRow(shortDays)}
                        </div>
                        <div class="grid grid-cols-7 text-center flex-1 content-start">
                            ${gridHtml}
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-slate-500">
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border" style="background:${PC_CAL.holidayBg};border-color:${PC_CAL.holidayBorder};"></span> วันหยุดนักขัตฤกษ์</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border" style="background:${PC_CAL.weekendBg};border-color:${PC_CAL.weekendBorder};"></span> เสาร์-อาทิตย์</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-blue-700"></span> วันนี้</span>
                            <span class="flex items-center gap-1"><i class="fa-solid fa-hand-pointer"></i> คลิกวันที่เพื่อเพิ่มกิจกรรม</span>
                        </div>
                    </div>
                    <div class="w-full lg:w-[42%] p-4 sm:p-6 bg-slate-50/50 flex flex-col max-h-[560px]">
                        <div class="flex items-center gap-2 mb-4 shrink-0">
                            <h3 class="font-bold text-slate-800">กิจกรรมในเดือนนี้</h3>
                            <span class="bg-purple-100 text-purple-700 text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">${currentMonthlyEvents.length}</span>
                        </div>
                        <div id="cal-event-list" class="flex flex-col gap-3 flex-1 overflow-y-auto no-scrollbar pr-2 pb-2"></div>
                        <div id="cal-event-pagination" class="mt-4 pt-3 border-t border-slate-200 shrink-0 flex justify-between items-center hidden">
                            <span id="cal-page-info" class="text-[11px] font-bold text-slate-500">หน้า 1 จาก 1</span>
                            <div class="flex gap-1" id="cal-page-buttons"></div>
                        </div>
                    </div>
                </div>`;
            }

            // =====================================
            // มุมมอง: ปี (YEAR)
            // =====================================
            else if (calendarViewMode === 'year') {
                let yearGrid = `<div class="pc-year-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 p-5 bg-white overflow-y-auto max-h-[640px] no-scrollbar">`;
                for (let m = 0; m < 12; m++) {
                    const fDay = new Date(year, m, 1).getDay();
                    const dInM = new Date(year, m + 1, 0).getDate();
                    // [ข้อ 7] แถบชื่อเดือนย่อย : น้ำเงิน ตัวขาว
                    let mHtml = `<div class="pc-year-card flex flex-col border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition overflow-hidden bg-white">
                        <h4 class="text-sm font-bold py-2 text-center cursor-pointer transition hover:brightness-110"
                            style="background:${PC_CAL.monthBarBg};color:${PC_CAL.monthBarFg};"
                            onclick="currentCalDate = new Date(${year}, ${m}, 1); changeCalendarView('month');">${thMonths[m]}</h4>
                        <div class="grid grid-cols-7 text-center">
                            ${shortDays.map((d, i) => `<div class="py-1 text-[9px] font-bold" style="background:${PC_DAY_COLORS[i].bg};color:${PC_DAY_COLORS[i].fg};">${d}</div>`).join('')}
                        </div>
                        <div class="grid grid-cols-7 text-center text-[10px] p-1 gap-y-0.5">`;

                    for (let i = 0; i < fDay; i++) mHtml += `<div></div>`;
                    for (let i = 1; i <= dInM; i++) {
                        const cellDateStr = `${year}-${(m+1).toString().padStart(2,'0')}-${i.toString().padStart(2,'0')}`;
                        const evts = getEventsForDate(cellDateStr);
                        const info = pcDayInfo(cellDateStr, evts);
                        const isToday = (i === today.getDate() && m === today.getMonth() && year === today.getFullYear());
                        const hasTask = evts.some(e => !e.isHoliday);
                        const holidayNames = evts.filter(e => e.isHoliday).map(e => e.title).join(', ');
                        const base = isToday ? 'background:#1d4ed8;color:#fff;font-weight:800;'
                                             : (info.cellStyle + info.textStyle);
                        mHtml += `<div onclick="onCalendarDateClick('${cellDateStr}')"
                                       title="${(holidayNames || ('คลิกเพื่อเพิ่มกิจกรรมวันที่ ' + i)).replace(/"/g,'&quot;')}"
                                       class="aspect-square flex items-center justify-center cursor-pointer rounded-full transition hover:ring-2 hover:ring-purple-400 relative"
                                       style="${base}">${i}${hasTask ? '<span class="absolute bottom-0 w-1 h-1 rounded-full bg-purple-600"></span>' : ''}</div>`;
                    }
                    mHtml += `</div></div>`;
                    yearGrid += mHtml;
                }
                yearGrid += `</div>`;
                contentHtml = yearGrid;
            }

            // =====================================
            // มุมมอง: สัปดาห์ (WEEK)
            // =====================================
            else if (calendarViewMode === 'week') {
                let weekStart = new Date(currentCalDate);
                weekStart.setDate(date - currentCalDate.getDay());

                let weekDaysHtml = '';
                let weekListHtml = '';
                for(let i=0; i<7; i++) {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() + i);
                    const isToday = (d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear());
                    const dayStr = pcDateStr(d);
                    const evts = getEventsForDate(dayStr);
                    const info = pcDayInfo(dayStr, evts);
                    const c = PC_DAY_COLORS[i];
                    const holidayNames = evts.filter(e => e.isHoliday).map(e => e.title).join(', ');

                    weekDaysHtml += `
                        <div class="flex-1 min-w-0 text-center cursor-pointer transition hover:ring-2 hover:ring-purple-400 relative"
                             onclick="onCalendarDateClick('${dayStr}')" title="คลิกเพื่อเพิ่มกิจกรรม">
                            <div class="py-1.5 text-[11px] font-bold" style="background:${c.bg};color:${c.fg};">${shortDays[i]}</div>
                            <div class="py-2" style="${info.cellStyle}">
                                <div class="text-lg mx-auto w-9 h-9 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-700 text-white shadow font-bold' : 'font-medium'}"
                                     style="${isToday ? '' : info.textStyle}">${d.getDate()}</div>
                                ${holidayNames ? `<div class="text-[8px] px-1 leading-tight line-clamp-2" style="color:${PC_CAL.holidayText};font-weight:700;">${holidayNames}</div>` : ''}
                                ${evts.filter(e=>!e.isHoliday).length ? `<div class="mt-1 flex gap-1 justify-center">${evts.filter(e=>!e.isHoliday).slice(0,3).map(()=>`<span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>`).join('')}</div>` : '<div class="mt-1 h-1.5"></div>'}
                            </div>
                        </div>`;

                    if (evts.length) {
                        weekListHtml += `<div class="mb-2">
                            <div class="text-[11px] font-bold mb-1" style="color:${info.isOff ? PC_CAL.holidayText : '#334155'};">วัน${fullDays[i]}ที่ ${d.getDate()} ${thMonths[d.getMonth()]}</div>
                            ${evts.map(e => `<div class="ml-3 mb-1 px-3 py-2 rounded-lg border text-xs ${e.isHoliday ? 'bg-rose-50 border-rose-200' : 'bg-purple-50 border-purple-200'} cursor-pointer" onclick="event.stopPropagation(); openDayEventsModal('${dayStr}')">
                                <span class="font-bold ${e.isHoliday ? 'text-rose-700' : 'text-purple-800'}">${e.title}</span>
                                <span class="text-[10px] text-slate-500 ml-1">${e.isHoliday ? 'ตลอดวัน' : (e.time || '')}</span>
                            </div>`).join('')}
                        </div>`;
                    }
                }

                contentHtml = `
                <div class="flex flex-col flex-1 bg-white">
                    <div class="flex border-b border-slate-200 shadow-sm z-10">
                        <div class="flex-1 flex">${weekDaysHtml}</div>
                    </div>
                    <div class="p-4 overflow-y-auto max-h-[460px] no-scrollbar">
                        ${weekListHtml || '<div class="p-8 text-center text-slate-400 text-sm"><i class="fa-regular fa-calendar-xmark text-3xl mb-2 block"></i>ไม่มีกิจกรรมหรือวันหยุดในสัปดาห์นี้</div>'}
                    </div>
                </div>`;
            }

            // =====================================
            // มุมมอง: วัน (DAY)
            // =====================================
            else if (calendarViewMode === 'day') {
                const dayStr = `${year}-${(month+1).toString().padStart(2,'0')}-${date.toString().padStart(2,'0')}`;
                const evts = getEventsForDate(dayStr);
                const info = pcDayInfo(dayStr, evts);
                const c = PC_DAY_COLORS[currentCalDate.getDay()];

                const evtsHtml = evts.length === 0
                    ? `<div class="p-6 text-sm text-slate-400 text-center border-2 border-dashed border-slate-200 rounded-xl">
                         ไม่มีกิจกรรมหรือกำหนดส่งงานในวันนี้<br>
                         <button type="button" onclick="onCalendarDateClick('${dayStr}')" class="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition"><i class="fa-solid fa-plus mr-1"></i> เพิ่มกิจกรรมวันนี้</button>
                       </div>`
                    : evts.map(e => `
                    <div class="mb-3 p-4 ${e.isHoliday ? 'bg-rose-50 border-rose-200' : 'bg-purple-50 border-purple-200'} border rounded-xl flex gap-4 shadow-sm hover:shadow-md transition cursor-pointer" onclick="openDayEventsModal('${dayStr}')">
                        <div class="w-2.5 rounded-full ${e.isHoliday ? 'bg-rose-500' : 'bg-purple-500'} shrink-0"></div>
                        <div class="flex-1">
                            <div class="font-bold text-base mb-1" style="${e.isHoliday ? 'color:' + PC_CAL.holidayText + ';' : 'color:#1e293b;'}">${e.title}</div>
                            <div class="text-xs text-slate-500 flex items-center gap-4 flex-wrap">
                                <span><i class="fa-regular fa-clock mr-1"></i>${e.isHoliday ? 'ตลอดทั้งวัน' : (e.time || 'กำหนดเวลาส่ง')}</span>
                                <span><i class="fa-solid fa-location-dot mr-1 text-rose-400"></i>${e.location}</span>
                            </div>
                        </div>
                    </div>
                `).join('') + `<button type="button" onclick="onCalendarDateClick('${dayStr}')" class="w-full py-2.5 rounded-xl border-2 border-dashed border-purple-300 text-purple-600 font-bold text-xs hover:bg-purple-50 transition"><i class="fa-solid fa-plus mr-1"></i> เพิ่มกิจกรรมในวันนี้</button>`;

                contentHtml = `
                <div class="flex flex-1 min-h-[480px] bg-white">
                    <div class="w-32 shrink-0 border-r border-slate-100 flex flex-col items-center" style="${info.cellStyle || 'background:#f8fafc;'}">
                        <div class="w-full text-center py-2 text-sm font-bold" style="background:${c.bg};color:${c.fg};">${fullDays[currentCalDate.getDay()]}</div>
                        <div class="text-5xl font-black mt-6" style="${info.isOff ? 'color:' + PC_CAL.holidayText + ';' : 'color:#1d4ed8;'}">${date}</div>
                        <div class="text-[11px] text-slate-500 mt-1">${thMonths[month]} ${thYear}</div>
                        ${info.isHoliday ? `<div class="text-[10px] font-bold px-2 mt-2 text-center" style="color:${PC_CAL.holidayText};">วันหยุดราชการ</div>` : ''}
                    </div>
                    <div class="flex-1 p-6 overflow-y-auto max-h-[550px] no-scrollbar">
                        <h4 class="font-bold text-slate-700 text-lg mb-5 border-b border-slate-100 pb-3"><i class="fa-solid fa-clipboard-list text-purple-500 mr-2"></i> กิจกรรมประจำวัน</h4>
                        ${evtsHtml}
                    </div>
                </div>`;
            }

            // =====================================
            // มุมมอง: กำหนดการ (SCHEDULE)
            // =====================================
            else if (calendarViewMode === 'schedule') {
                const scheduleEvents = events.filter(e => {
                    const eDate = new Date(e.date + 'T00:00:00');
                    return eDate.getFullYear() === year && eDate.getMonth() === month;
                }).sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

                let schedHtml = '';
                if (scheduleEvents.length === 0) {
                    schedHtml = `<div class="p-10 text-center text-slate-400 flex flex-col items-center"><i class="fa-regular fa-calendar-xmark text-4xl mb-3 text-slate-300"></i><p>ไม่มีกำหนดการในเดือนนี้</p></div>`;
                } else {
                    let lastDate = '';
                    scheduleEvents.forEach(e => {
                        const d = new Date(e.date + 'T00:00:00');
                        const info = pcDayInfo(e.date, getEventsForDate(e.date));
                        const c = PC_DAY_COLORS[d.getDay()];
                        if (e.date !== lastDate) {
                            schedHtml += `<div class="text-sm font-bold mt-5 mb-3 flex items-center gap-3 sticky top-0 py-2 z-10 rounded-lg px-2" style="${info.cellStyle || 'background:#f1f5f9;'}">
                                <div class="w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-sm shrink-0" style="background:${c.bg};color:${c.fg};">${d.getDate()}</div>
                                <div style="${info.isOff ? 'color:' + PC_CAL.holidayText + ';' : 'color:#1e293b;'}">
                                    <span class="mr-1">วัน${fullDays[d.getDay()]}</span> ${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear()+543}
                                </div>
                                <button type="button" onclick="onCalendarDateClick('${e.date}')" class="ml-auto text-[11px] font-bold text-purple-700 bg-white border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-50 transition"><i class="fa-solid fa-plus"></i> เพิ่ม</button>
                            </div>`;
                            lastDate = e.date;
                        }
                        schedHtml += `
                            <div class="ml-10 mb-2 p-3 ${e.isHoliday ? 'border-l-4 border-rose-500 bg-white' : 'border-l-4 border-purple-500 bg-white'} rounded-r-xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-md transition cursor-pointer border-y border-r border-slate-100" onclick="openDayEventsModal('${e.date}')">
                                <div class="text-xs font-bold ${e.isHoliday ? 'text-rose-600 bg-rose-50' : 'text-purple-600 bg-purple-50'} px-2 py-1 rounded w-fit sm:w-24 text-center shrink-0"><i class="fa-regular fa-clock"></i> ${e.isHoliday ? 'ตลอดวัน' : (e.time || 'กำหนดส่ง')}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm" style="${e.isHoliday ? 'color:' + PC_CAL.holidayText + ';' : 'color:#1e293b;'}">${e.title}</div>
                                    <div class="text-xs text-slate-500 mt-1"><i class="fa-solid fa-location-dot text-rose-400 mr-1"></i> ${e.location}</div>
                                </div>
                            </div>
                        `;
                    });
                }

                contentHtml = `
                <div class="p-5 overflow-y-auto flex-1 max-h-[620px] bg-slate-50 relative no-scrollbar">
                    ${schedHtml}
                </div>`;
            }

            // แทรกโครงสร้างที่ประกอบแล้วลงในหน้าจอ
            wrapper.innerHTML = topBarHtml + contentHtml;

            // ผูกระบบ Pagination กรณีเป็นหน้า Month
            if (calendarViewMode === 'month') {
                calCurrentPage = 1;
                if (typeof renderCalEventListPagination === 'function') {
                    renderCalEventListPagination();
                }
            }

            // แจ้งเตือน Badge ของปฏิทินที่ Navbar
            let todayDateStr = pcDateStr(today);
            let todayEventsCount = events.filter(e => e.date === todayDateStr).length;
            if (typeof updateCalendarBadges === 'function') {
                updateCalendarBadges(todayEventsCount);
            }
        }

        /* ============================================================================
           [ข้อ 2] คลิกวันที่ในปฏิทิน -> เปิดโมดอล "เพิ่มกิจกรรม" ทันที
           โดยเติมวันที่ให้อัตโนมัติ และถ้าวันนั้นมีกิจกรรมอยู่แล้ว
           จะแสดงรายการเดิมไว้บนสุดของโมดอลให้กดดู/แก้ไขได้ (ไม่เสียฟังก์ชันเดิม)
           ============================================================================ */
        window.onCalendarDateClick = function (dateStr) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return;
            if (typeof closeDayEventsModal === 'function') closeDayEventsModal();
            if (typeof openEventModal === 'function') openEventModal(dateStr);
        };

        window.openDayEventsModal = function(dateStr) {
            let selectedDate = new Date(dateStr);
            const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
            let titleDate = `${selectedDate.getDate()} ${thMonths[selectedDate.getMonth()]} ${selectedDate.getFullYear() + 543}`;
            
            let titleEl = document.getElementById('day-events-title');
            if(titleEl) titleEl.innerHTML = `<i class="fa-solid fa-calendar-day"></i> กิจกรรมวันที่ ${titleDate}`;
            
            let allEvents = typeof googleHolidays !== 'undefined' ? googleHolidays.map(h => ({
                date: h.date, title: h.title, location: h.location || 'ประเทศไทย', isHoliday: true
            })) : [];
            if (typeof state !== 'undefined' && state.documentQueue) {
                state.documentQueue.forEach(doc => {
                    if(doc.deadline) {
                        allEvents.push({
                            date: doc.deadline, title: `กำหนดส่ง: ${doc.title} (เลขรับ: ${doc.receiveNo || '-'})`, location: 'ระบบรับหนังสือราชการ', isHoliday: false
                        });
                    }
                });
            }

            // --- เริ่มส่วนที่เพิ่ม: นำกิจกรรมที่สร้างเองลงใน Modal รายวัน ---
            if (typeof state !== 'undefined' && state.calendarEvents) {
                state.calendarEvents.forEach(evt => {
                    allEvents.push({
                        date: evt.date, 
                        title: evt.title, 
                        location: evt.location || 'ไม่ระบุสถานที่', 
                        isHoliday: false
                    });
                });
            }
            // --- จบส่วนที่เพิ่ม ---

            let dayEvents = allEvents.filter(e => e.date === dateStr);
            let contentEl = document.getElementById('day-events-content');
            
            if (!contentEl) return;

            if (dayEvents.length === 0) {
                contentEl.innerHTML = `<div class="text-center text-slate-400 py-6 text-sm">ไม่มีกิจกรรมในวันนี้</div>`;
            } else {
                contentEl.innerHTML = dayEvents.map(e => {
                    let iconColor = e.isHoliday ? 'text-emerald-600 bg-emerald-100 border-emerald-200' : 'text-blue-600 bg-blue-100 border-blue-200';
                    let iconName = e.isHoliday ? 'fa-calendar-day' : 'fa-clipboard-check';
                    return `
                        <div class="mb-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-3">
                            <div class="w-10 h-10 rounded-full border ${iconColor} flex items-center justify-center shrink-0">
                                <i class="fa-solid ${iconName} text-lg"></i>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-bold text-slate-800 text-sm mb-1">${e.title}</h4>
                                <div class="text-[11px] text-slate-600 space-y-1">
                                    <div><i class="fa-regular fa-clock w-4 text-center"></i> ${e.isHoliday ? 'ตลอดวัน' : 'กำหนดส่ง / ลงเวลา'}</div>
                                    <div><i class="fa-solid fa-location-dot w-4 text-center text-rose-500"></i> ${e.location}</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            let modalEl = document.getElementById('modal-day-events');
            if(modalEl) modalEl.classList.remove('hidden');
        };

        // ดัก Event เปลี่ยนแท็บเพื่อสั่ง Render ปฏิทินเสมอเมื่อเข้าดู
        const originalSwitchTab = switchTab;
        switchTab = function(tabName) {
            if (typeof originalSwitchTab === 'function') originalSwitchTab(tabName);
            if(tabName === 'calendar') {
                renderCalendar();
            }
        };
		
		
		
		function setAssistantGroupComment(group) {
            document.getElementById('assistantgroup-comment').value = `- มอบกลุ่มงาน${group} ดำเนินการ`;
        }
		
		function setAssigneeStatus(status) {
            let textarea = document.getElementById('assignee-comment');
            let today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            
            if (status === 'รับทราบ') {
                textarea.value = 'รับทราบ';
            } else if (status === 'ดำเนินการแล้ว') {
                textarea.value = `ดำเนินการเรียบร้อย : ${today}`;
            } else if (status === 'กำลังดำเนินการ') {
                /* [ต.ค. 2569] เลือกวัน / เดือนไทย / ปี พ.ศ. แทน <input type="date"> (เดิมแสดง ค.ศ. ตามเครื่อง ผู้ใช้กรอกปีผิด) ; ค่าเริ่ม = พรุ่งนี้ */
                const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
                const t0 = new Date(Date.now() + 86400000), y0 = t0.getFullYear();
                const opt = (v, label, sel) => '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + label + '</option>';
                const selCls = 'p-2 border rounded-lg text-slate-700 bg-white" style="min-height:48px;font-size:16px;min-width:0';   // ตัวอักษร 16px : iOS ไม่ซูมจอ
                Swal.fire({
                    title: '<span class="text-lg">ระบุวันที่คาดว่าจะแล้วเสร็จ</span>',
                    html: '<div class="mt-2" style="display:grid;grid-template-columns:1fr 2fr 1.3fr;gap:8px" role="group" aria-label="วันที่คาดว่าจะแล้วเสร็จ">' +
                        '<select id="swal-d" aria-label="วันที่" class="' + selCls + '">' + Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1, i + 1 === t0.getDate())).join('') + '</select>' +
                        '<select id="swal-m" aria-label="เดือน" class="' + selCls + '">' + TH_M.map((m, i) => opt(i, m, i === t0.getMonth())).join('') + '</select>' +
                        '<select id="swal-y" aria-label="ปี พ.ศ." class="' + selCls + '">' + [y0, y0 + 1].map(y => opt(y, y + 543, y === y0)).join('') + '</select></div>',
                    showCancelButton: true,
                    confirmButtonText: 'บันทึกวันที่',
                    cancelButtonText: 'ยกเลิก',
                    preConfirm: () => {
                        const d = +document.getElementById('swal-d').value, m = +document.getElementById('swal-m').value, y = +document.getElementById('swal-y').value;
                        const dt = new Date(y, m, d);
                        if (dt.getMonth() !== m) { Swal.showValidationMessage(TH_M[m] + ' ' + (y + 543) + ' มีไม่ถึง ' + d + ' วัน เลือกวันที่ใหม่'); return false; }
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        if (dt < today) { Swal.showValidationMessage('วันที่นี้ผ่านมาแล้ว เลือกวันนี้หรือหลังจากนี้'); return false; }
                        return dt;
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        let thDate = result.value.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
                        textarea.value = `กำลังดำเนินการ : ${thDate}`;
                    }
                });
            }
        }
		
		// ==========================================
        // ฟังก์ชันลากแถบเครื่องมือ (Draggable Toolbar)
        // ==========================================
        function makeDraggable(elementId, handleId) {
            const elmnt = document.getElementById(elementId);
            const handle = document.getElementById(handleId);
            if (!elmnt || !handle) return;

            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            // รองรับทั้ง Mouse และ Touch
            handle.onmousedown = dragStart;
            handle.ontouchstart = dragStart;

            function dragStart(e) {
                e = e || window.event;
                let clientX = e.clientX || (e.touches && e.touches[0].clientX);
                let clientY = e.clientY || (e.touches && e.touches[0].clientY);
                pos3 = clientX;
                pos4 = clientY;
                
                document.onmouseup = dragEnd;
                document.onmousemove = dragAction;
                document.ontouchend = dragEnd;
                document.ontouchmove = dragAction;
            }

            function dragAction(e) {
                e = e || window.event;
                let clientX = e.clientX || (e.touches && e.touches[0].clientX);
                let clientY = e.clientY || (e.touches && e.touches[0].clientY);
                
                pos1 = pos3 - clientX;
                pos2 = pos4 - clientY;
                pos3 = clientX;
                pos4 = clientY;
                
                elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
                elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
                elmnt.style.right = "auto";
                elmnt.style.bottom = "auto";
            }

            function dragEnd() {
                document.onmouseup = null;
                document.onmousemove = null;
                document.ontouchend = null;
                document.ontouchmove = null;
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            makeDraggable("admin-toolbar", "drag-handle");
            makeDraggable("director-toolbar", "drag-handle-director");
            makeDraggable("admingroup-toolbar", "drag-handle-admingroup");
            makeDraggable("subdirectorgroup-toolbar", "drag-handle-subdirectorgroup");
            makeDraggable("assistantgroup-toolbar", "drag-handle-assistantgroup");
            makeDraggable("assignee-toolbar", "drag-handle-assignee");
        });
		
		function viewFinalAttachments(docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if(!doc || !doc.attachments || doc.attachments.length === 0) return;
            let listHtml = doc.attachments.map((a, i) => `<div class="text-sm p-3 bg-slate-50 border border-slate-200 rounded-lg mb-2 text-left font-medium text-slate-700 shadow-sm"><i class="fa-solid fa-file text-blue-500 mr-2"></i> ${a.name}</div>`).join('');
            Swal.fire({ title: 'รายการเอกสารแนบ', html: listHtml, confirmButtonColor: '#3b82f6' });
        }

        function downloadFinalDoc(docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if(!doc || !doc.currentImage) return;
            const img = pcViewImg(doc);   // [v27] ภาพพร้อมตรา (สร้างจาก canvasState)
            const link = document.createElement('a');
            link.href = img;
            link.download = `หนังสือรับ_${doc.receiveNo ? doc.receiveNo.replace('/', '-') : 'ล่าสุด'}.${/^data:image\/jpe?g/.test(String(img)) ? 'jpg' : 'png'}`;
            link.click();
        }

        function printFinalDoc(docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if(!doc || !doc.currentImage) return;
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`<html><head><title>พิมพ์เอกสาร ${doc.receiveNo || ''}</title><style>body { margin: 0; text-align: center; } img { max-width: 100%; height: auto; }</style></head><body><img src="${pcViewImg(doc)}" onload="window.print(); window.close();"></body></html>`);
            printWindow.document.close();
        }

        function exportFinalPdf(docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if(!doc || !doc.currentImage) return;
            
            showProgress('กำลังสร้างไฟล์ PDF', 'แปลงหน้าเอกสาร…');   // [ข้อ 13]
            startFakeProgress();
            
            setTimeout(async () => {
                try {
                    await PCLib.load('jspdf');   // [v46]
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const img = pcViewImg(doc);   // [v27] ภาพพร้อมตรา (สร้างจาก canvasState)
                    const fmt = /^data:image\/jpe?g/.test(String(img)) ? 'JPEG' : 'PNG';
                    const imgProps = pdf.getImageProperties(img);
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    
                    // คำนวณความสูงรวมทั้งหมดของรูปภาพเมื่อปรับให้พอดีกับความกว้าง A4
                    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                    
                    let heightLeft = pdfHeight;
                    let position = 0;

                    // วาดรูปแผ่นแรก
                    pdf.addImage(img, fmt, 0, position, pdfWidth, pdfHeight);
                    heightLeft -= pageHeight;

                    // วนลูปเพิ่มหน้าใหม่ หากรูปภาพยังยาวเหลืออยู่ (ตั้งความเผื่อไว้ที่ 15 มิลลิเมตร เพื่อตัดเศษขอบขาวที่ทำให้เกิดหน้าเปล่าทิ้ง)
                    while (heightLeft > 15) {
                        position -= pageHeight; 
                        pdf.addPage();
                        pdf.addImage(img, fmt, 0, position, pdfWidth, pdfHeight);
                        heightLeft -= pageHeight;
                    }

                    // จัดการชื่อไฟล์ตามรูปแบบ: เลขรับ_ชื่อเรื่อง
                    let safeReceiveNo = doc.receiveNo ? doc.receiveNo.replace(/\//g, '-') : 'ไม่มีเลขรับ';
                    let safeTitle = doc.title ? doc.title : 'เอกสาร';
                    let fileName = `เลขที่รับ ${safeReceiveNo}_${safeTitle}.pdf`;

                    pdf.save(fileName);
                    hideProgress();   // [ข้อ 13]
                    Swal.close();
                } catch (error) {
                    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
                }
            }, 500);
        }
		
		// ระบบเลื่อนหน้าจอไปยังจุดที่ประทับตราอัตโนมัติ
        function focusOnObject(canvas, obj) {
            if (!canvas || !obj) return;
            const wrapper = canvas.wrapperEl.parentElement;
            const center = obj.getCenterPoint();
            const zoom = canvas.getZoom();
            
            // ใช้ setTimeout เล็กน้อยเพื่อให้ Canvas เรนเดอร์เสร็จก่อนเลื่อน
            setTimeout(() => {
                wrapper.scrollTo({
                    left: (center.x * zoom) - (wrapper.clientWidth / 2),
                    top: (center.y * zoom) - (wrapper.clientHeight / 2),
                    behavior: 'smooth'
                });
            }, 100);
        }

        // รองรับการลบตรายาง/วัตถุ ด้วยปุ่ม Delete หรือ Backspace บนแป้นพิมพ์
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeEl = document.activeElement;
                if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return; // ข้ามถ้ากำลังพิมพ์ข้อความ
                
                Object.values(state.canvases).forEach(canvas => {
                    if (canvas) {
                        const activeObj = canvas.getActiveObject();
                        if (activeObj) {
                            canvas.remove(activeObj);
                            canvas.discardActiveObject();
                            canvas.renderAll();
                            e.preventDefault();
                        }
                    }
                });
            }
        });
		
		
		// ฟังก์ชันดึงเรื่องกลับ พร้อมลบตราประทับและข้อสั่งการของบทบาทนั้นออก
        function recallDocument(docId, targetStage) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if (!doc) return;

            Swal.fire({
                title: 'ยืนยันการดึงเรื่องกลับ?',
                text: 'ระบบจะยกเลิกการส่ง และลบตราประทับล่าสุดของท่านออกจากเอกสาร',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'ใช่, ดึงเรื่องกลับ',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    let rootId = doc.rootDocId || doc.id;
                    
                    // 1. ลบตราประทับล่าสุดออก โดยถอยกลับไปใช้ภาพและสถานะก่อนหน้า
                    doc.stampedImage = ""; doc.stampedCover = "";   // [v76] ภาพที่มีตราเดิมรวมตราที่เพิ่งถูกยกเลิก -> ล้าง (แจ้งเตือนใช้ภาพต้นฉบับจนกว่าจะส่งต่อครั้งถัดไป)
                    if (doc.imageHistory && doc.imageHistory.length > 0) {
                        doc.currentImage = doc.imageHistory.pop();
                    }
                    if (doc.canvasStateHistory && doc.canvasStateHistory.length > 0) {
                        doc.canvasState = doc.canvasStateHistory.pop();
                    } else {
                        doc.canvasState = null; 
                    }

                    // 2. ล้างหน้าจอ Canvas ของขั้นตอนเป้าหมาย เพื่อเตรียมรับการวาด/ประทับตราใหม่
                    let targetCanvasKey = getCanvasKey(targetStage);
                    if (state.canvases[targetCanvasKey]) {
                        state.canvases[targetCanvasKey].clear();
                    }
                    state.activeDocIds[targetStage] = null;

                    // 3. จัดการกรณีดึงกลับมาที่ ผอ. หรือ รอง ผอ. (ลบเอกสาร Clone แยกกลุ่มทิ้งทั้งหมด)
                    if (targetStage <= 4) {
                        state.documentQueue = state.documentQueue.filter(d => {
                            if (d.id === doc.id) return true;
                            let isClone = (d.rootDocId === rootId) || (d.id.startsWith(rootId + '_'));
                            return !isClone;
                        });
                        doc.assignedGroups = [];
                        doc.subGroups = [];
                        doc.directorComment = 'ทราบ/มอบ';
                    } else if (targetStage <= 6) {
                        state.documentQueue = state.documentQueue.filter(d => {
                            if (d.id === doc.id) return true;
                            let isSubClone = (d.rootDocId === rootId) && d.id.includes('_s');
                            return !isSubClone;
                        });
                        doc.subGroups = [];
                    } else if (targetStage === 7) {
                        // [v23 ข้อ 14] ดึงกลับจากผู้รับผิดชอบ -> ยกเลิกฉบับที่แยกให้ผู้รับผิดชอบคนอื่นที่ยังไม่ลงรับด้วย
                        const sg = (doc.subGroups || [])[0] || '';
                        state.documentQueue = state.documentQueue.filter(d => {
                            if (d.id === doc.id) return true;
                            return !(d.rootDocId === rootId && Number(d.stage) === 8 && ((d.subGroups || [])[0] || '') === sg);
                        });
                        doc.assigneeIds = [];
                        doc.assigneeName = '';
                        doc.assigneeAll = '';
                    }

                    // 4. ลบประวัติเวลา (Timeline) ของขั้นตอนที่ถูกดึงกลับ
                    if (doc.stepTimes) {
                        // [v23] ขั้นตอน 65 (ธุรการกลุ่มงาน) อยู่ระหว่าง 6 กับ 7 -> เทียบตามลำดับ Flow ไม่ใช่ตัวเลข
                        const rank = (s) => (Number(s) === 65 ? 6.5 : Number(s));
                        Object.keys(doc.stepTimes).forEach(stKey => {
                            if (rank(stKey) > rank(targetStage)) {
                                delete doc.stepTimes[stKey];
                            }
                        });
                    }

                    // 5. อัปเดตสถานะและขั้นตอนเอกสาร
                    doc.stage = targetStage;
                    const d = new Date();
                    doc.lastUpdated = `${getThaiDate()}, เวลา ${toThaiNum(d.getHours().toString().padStart(2, '0'))}.${toThaiNum(d.getMinutes().toString().padStart(2, '0'))} น.`;

                    // 6. อัปเดตการแสดงผลหน้าจอ
                    renderAllQueues();
                    if (typeof renderInboxList === 'function') renderInboxList();
                    if (typeof renderAllDocsList === 'function') renderAllDocsList();

                    Swal.fire({
                        icon: 'success',
                        title: 'ดึงเรื่องกลับสำเร็จ',
                        text: 'ลบตราประทับและนำเอกสารกลับมาให้ท่านแก้ไขเรียบร้อยแล้ว',
                        timer: 1800,
                        showConfirmButton: false
                    });
                }
            });
        }
        
		
		
		
		// ==========================================
        // ฟังก์ชัน Preview เอกสารแนบแบบกระดาษ A4 (รองรับ Blob URL แก้จอขาว)
        // ==========================================
        window.previewAttachments = function(docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            if(!doc || !doc.attachments || doc.attachments.length === 0) return;
            
            // ฟังก์ชันแปลง Base64 กลับเป็น Blob URL เพื่อหลบการบล็อกของเบราว์เซอร์
            const getSafeUrl = (base64Data, contentType) => {
                if (contentType.includes('pdf')) {
                    try {
                        const byteCharacters = atob(base64Data.split(',')[1]);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: contentType });
                        return URL.createObjectURL(blob);
                    } catch (error) {
                        return base64Data; // กรณีแปลงไม่สำเร็จให้ใช้ของเดิม
                    }
                }
                return base64Data;
            };
            
            let listHtml = doc.attachments.map((a, i) => {
                let previewContent = '';
                let safeUrl = getSafeUrl(a.content, a.type);

                if (a.type && a.type.includes('image')) {
                    previewContent = `<img src="${safeUrl}" class="w-full h-auto object-contain">`;
                } else if (a.type && a.type.includes('pdf')) {
                    // ใช้ URL ที่จำลองขึ้นมาแสดงใน iframe 
                    previewContent = `<iframe src="${safeUrl}#toolbar=0" class="w-full h-[800px] border-none" frameborder="0"></iframe>`;
                } else {
                    previewContent = `<div class="flex flex-col items-center justify-center h-[400px] text-slate-400"><i class="fa-solid fa-file-circle-xmark text-4xl mb-3"></i><p>ไม่สามารถแสดงตัวอย่างไฟล์ประเภทนี้ได้</p></div>`;
                }

                return `
                <div class="mb-8 border border-slate-300 rounded-xl overflow-hidden shadow-sm bg-slate-100">
                    <div class="flex items-center justify-between p-3 border-b border-slate-300 bg-white sticky top-0 z-10 shadow-sm">
                        <div class="flex items-center gap-3 overflow-hidden w-full pr-2">
                            <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <i class="fa-solid ${a.type && a.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-image'}"></i>
                            </div>
                            <div class="truncate text-sm font-bold text-slate-700" title="${a.name}">${a.name}</div>
                        </div>
                        <div class="flex gap-1.5 shrink-0 ml-2">
                            <button onclick="Swal.fire('แชร์ไฟล์', 'คัดลอกลิงก์เอกสารแนบเรียบร้อย', 'success')" class="w-8 h-8 bg-white border border-slate-200 text-slate-600 hover:text-amber-500 hover:bg-amber-50 rounded-lg flex items-center justify-center transition shadow-sm" title="แชร์">
                                <i class="fa-solid fa-share-nodes"></i>
                            </button>
                            <button onclick="printAttachment('${i}', '${docId}')" class="w-8 h-8 bg-white border border-slate-200 text-slate-600 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg flex items-center justify-center transition shadow-sm" title="พิมพ์">
                                <i class="fa-solid fa-print"></i>
                            </button>
                            <a href="${a.content}" download="${a.name}" class="w-8 h-8 bg-white border border-slate-200 text-slate-600 hover:text-blue-500 hover:bg-blue-50 rounded-lg flex items-center justify-center transition shadow-sm" title="ดาวน์โหลด">
                                <i class="fa-solid fa-download"></i>
                            </a>
                        </div>
                    </div>
                    
                    <div class="w-full bg-slate-300 flex justify-center p-3 sm:p-6">
                        <div class="w-full max-w-[650px] min-h-[600px] bg-white shadow-xl border border-slate-200">
                            ${previewContent}
                        </div>
                    </div>
                </div>
            `}).join('');

            Swal.fire({ 
                title: '<div class="text-base font-bold text-slate-800 text-left mb-1 border-b pb-3"><i class="fa-solid fa-paperclip text-blue-500 mr-2"></i> ดูตัวอย่างเอกสารแนบ</div>', 
                html: `<div class="max-h-[75vh] w-full h-auto overflow-y-auto no-scrollbar p-1 border border-slate-300 shadow-sm rounded-lg mb-4 bg-slate-100">${listHtml}</div>`, 
                showConfirmButton: false,
                showCloseButton: true,
                width: '850px',
				customClass: {
					popup: 'doc-viewer-modal' // 🌟 เพิ่มคลาสนี้เพื่อปลดล็อกความกว้าง
				}
            });		
        };

        // ==========================================
        // ฟังก์ชันสั่งพิมพ์เอกสารแนบ (แก้ปัญหาจอขาวตอนพิมพ์ PDF)
        // ==========================================
        window.printAttachment = function(index, docId) {
            let doc = state.documentQueue.find(d => d.id === docId);
            let a = doc.attachments[index];
            if (!a) return;

            if (a.type.includes('image')) {
                let printWindow = window.open('', '_blank');
                printWindow.document.write(`<html><head><title>พิมพ์เอกสารแนบ</title><style>body { margin: 0; text-align: center; } img { max-width: 100%; height: auto; }</style></head><body><img src="${a.content}" onload="window.print(); window.close();"></body></html>`);
                printWindow.document.close();
            } else if (a.type.includes('pdf')) {
                try {
                    // แปลง Base64 เป็น Blob URL
                    const byteCharacters = atob(a.content.split(',')[1]);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'application/pdf' });
                    const blobUrl = URL.createObjectURL(blob);
                    
                    // เปิดแท็บใหม่เพื่อให้ Browser จัดการหน้าสั่งพิมพ์ PDF เอง (แก้บล็อก iframe)
                    let printWindow = window.open(blobUrl, '_blank');
                    if (!printWindow) {
                        Swal.fire('แจ้งเตือน', 'กรุณาอนุญาต Pop-up (Allow Pop-ups) ของเบราว์เซอร์เพื่อเปิดหน้าต่างสั่งพิมพ์', 'warning');
                    }
                } catch (e) {
                    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสั่งพิมพ์ไฟล์ PDF นี้ได้ กรุณาดาวน์โหลดแทน', 'error');
                }
            }
        };
		

		
		function updateActiveDocCategories() {
			if(!state.activeDocIds[1]) return;
			let doc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
			if(doc) {
				let checkedBoxes = document.querySelectorAll('.admin-category-checkbox:checked');
				doc.category = Array.from(checkedBoxes).map(cb => cb.value); // เก็บเป็น Array
				renderQueueList(1, 'queue-list-1'); // สั่งวาดคิวงานซ้ายมือใหม่ทันที
			}
		}
		
		
		// ==========================================
		// ฟังก์ชันเปิดแท็บในรูปแบบ Modal ทับหน้าจอ
		// ==========================================
		function openWorkspaceModal(tabName, docId) {
			const tabEl = document.getElementById(`tab-${tabName}`);
			if (!tabEl) return;
			
			tabEl.classList.remove('hidden');
			tabEl.classList.add('fixed', 'top-0', 'left-0', 'w-full', 'h-full', 'z-[100]', 'bg-slate-100', 'p-4', 'sm:p-6', 'overflow-y-auto');

			const innerContainer = tabEl.firstElementChild;
			if (innerContainer) innerContainer.style.height = 'calc(100vh - 40px)';

			const panel = document.getElementById(`panel-${tabName}`);
			if (panel) panel.classList.remove('hidden');
			const textBtn = document.getElementById(`text-toggle-${tabName}`);
			if (textBtn) textBtn.innerText = "ฟอร์ม";

			if (!document.getElementById(`modal-close-${tabName}`)) {
				const queueHeader = tabEl.querySelector('.border-b.flex-row');
				
				if (queueHeader) {
					const btn = document.createElement('button');
					btn.id = `modal-close-${tabName}`;
					btn.className = 'ml-auto shrink-0 bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-600 hover:border-rose-500 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer';
					btn.innerHTML = '<i class="fa-solid fa-xmark text-sm"></i> ปิดหน้าต่าง';
					btn.title = "ปิดหน้าต่างลงรับ";
					btn.onclick = () => closeWorkspaceModal(tabName);
					
					queueHeader.appendChild(btn);
				} else {
					const btn = document.createElement('button');
					btn.id = `modal-close-${tabName}`;
					btn.className = 'absolute top-4 right-4 z-[110] bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-600 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer';
					btn.innerHTML = '<i class="fa-solid fa-xmark text-sm"></i> ปิด';
					btn.onclick = () => closeWorkspaceModal(tabName);
					tabEl.appendChild(btn);
				}
			}

			// เมื่อธุรการกลางกดลงทะเบียนหนังสือใหม่ (ไม่มี docId) ให้กดปุ่ม "หนังสือใหม่" หรือเปิดไฟล์อัตโนมัติ
			if (tabName === 'admin' && !docId) {
				setTimeout(() => {
					const adminTab = document.getElementById('tab-admin');
					if (adminTab) {
						// ค้นหาปุ่มที่มีข้อความว่า "หนังสือใหม่"
						const newDocBtn = Array.from(adminTab.querySelectorAll('button')).find(b => b.innerText.includes('หนังสือใหม่'));
						if (newDocBtn) {
							newDocBtn.click();
						} else {
							// หากไม่มีปุ่ม ให้คลิก input อัปโหลดไฟล์โดยตรง
							const fileInput = document.getElementById('admin-file-upload') || adminTab.querySelector('input[type="file"]');
							if (fileInput) fileInput.click();
						}
					}
				}, 300);
			}

			if (docId) {
				let stageMap = {'admin':1, 'director':4, 'admingroup':5, 'subdirectorgroup':6, 'subgroupadmin':65, 'assistantgroup':7, 'assignee':8};
				let targetStage = stageMap[tabName];
				setTimeout(() => {
					selectDoc(docId, targetStage);
					setTimeout(() => {
						resetCanvasZoom(getCanvasKey(targetStage));
					}, 200);
				}, 100);
			}
			setTimeout(() => { if (sigPads[tabName]) sigPads[tabName].resize(); }, 300);

		}


		// =========================================================================
		// ฟังก์ชันกลาง: ปิดโมดอลลงรับหนังสือทุกแท็บ และเปิดหน้ากล่องหนังสือเข้า (Inbox)
		// =========================================================================
		function closeAllWorkspaceModalsAndShowInbox() {
			// 1. กวาดล้างปิดโมดอลของทุกแท็บ ป้องกันการค้างบนหน้าจอ
			const allTabs = ['admin', 'director', 'admingroup', 'subdirectorgroup', 'subgroupadmin', 'assistantgroup', 'assignee'];
			allTabs.forEach(tabName => {
				const tabEl = document.getElementById(`tab-${tabName}`);
				if (tabEl) {
					tabEl.classList.remove('fixed', 'top-0', 'left-0', 'w-full', 'h-full', 'z-[100]', 'bg-slate-100', 'p-4', 'sm:p-6', 'overflow-y-auto');
					tabEl.classList.add('hidden');
					const innerContainer = tabEl.firstElementChild;
					if (innerContainer) innerContainer.style.height = '';
				}
			});

			// 2. สลับแท็บมาที่หน้ากล่องหนังสือเข้า (Inbox)
			switchTab('inbox');

			// 3. รีเฟรชคิวงานและรายการในกล่องหนังสือเข้าทันที
			renderAllQueues();
			if (typeof renderInboxList === 'function') {
				renderInboxList();
			}
		}

		// อัปเดต closeWorkspaceModal เดิมให้เรียกใช้ฟังก์ชันกลาง
		function closeWorkspaceModal(tabName) {
			closeAllWorkspaceModalsAndShowInbox();
		}

		// อัปเดตฟังก์ชันลงนาม ให้เรียกใช้ Modal และล็อกสิทธิ์ตามกลุ่ม
		function goToSign(docId) {
		let doc = state.documentQueue.find(d => d.id === docId);
		if(!doc) return;
		
		let role = state.user.role;
		let roomName = document.getElementById('banner-room-name').innerText;
		let targetTab = '';
		
		let userTitle = userTitleForMatch();   // [ข้อ 12] รวมทุกกลุ่มงานที่ผู้ใช้สังกัด
		let isMainMatch = doc.assignedGroups && doc.assignedGroups.some(g => userTitle.includes(g.replace(/ฯ/g, '').trim()));
		let isSubMatch = doc.subGroups && doc.subGroups.some(g => userTitle.includes(g.replace(/ฯ/g, '').trim()));
		
		if (role === 'ADMIN') {
			const map = {1:'admin', 4:'director', 5:'admingroup', 6:'subdirectorgroup', 65:'subgroupadmin', 7:'assistantgroup', 8:'assignee'};
			targetTab = map[doc.stage];
		} 
		else if (['Administrative'].includes(role) && doc.stage === 1) {
			targetTab = 'admin';
		}
		else if (['Director', 'ActingDirector'].includes(role) && doc.stage === 4) {
			targetTab = 'director';
		}
		else if (['AdminGroup'].includes(role) && doc.stage === 5 && isMainMatch) {
			targetTab = 'admingroup';
		}
		else if (['SubdirectorGroup'].includes(role) && doc.stage === 6 && isMainMatch) {
			targetTab = 'subdirectorgroup';
		}
		else if (['AdminGroup'].includes(role) && doc.stage === 65 && isSubMatch) {
			targetTab = 'subgroupadmin';
		}
		else if (['AssistantGroup'].includes(role) && doc.stage === 7 && isSubMatch) {
			targetTab = 'assistantgroup';
		}
		else if (['Assignee'].includes(role) && doc.stage === 8) {
			targetTab = 'assignee';
		}

		if(targetTab) {
			openWorkspaceModal(targetTab, docId);
		} else {
			Swal.fire('ไม่สามารถลงนามได้', 'เอกสารนี้ยังไม่ถึงขั้นตอนของคุณ หรือคุณไม่มีสิทธิ์ลงนามข้ามกลุ่มตนเองครับ', 'warning');
		}
	}
		
		
		window.viewMainDocument = function(docId) {
			let doc = state.documentQueue.find(d => d.id === docId);
			if(!doc || !doc.currentImage) {
				return Swal.fire('แจ้งเตือน', 'ไม่พบไฟล์หนังสือหรือยังไม่ได้อัปโหลด', 'warning');
			}
			
			// สร้างฟังก์ชันแชร์ (ป้องกัน Error หากยังไม่มี)
			if (typeof shareFinalDoc !== 'function') {
				window.shareFinalDoc = function() { Swal.fire('แชร์ไฟล์', 'คัดลอกลิงก์เอกสารเรียบร้อย', 'success'); }
			}

			Swal.fire({
				title: '<div class="text-base font-bold text-slate-800 text-left mb-1 border-b pb-3"><i class="fa-solid fa-file-image text-blue-500 mr-2"></i> ดูไฟล์หนังสือฉบับเต็ม</div>',
				html: `
					<div class="max-h-[60vh] overflow-y-auto no-scrollbar p-1 border border-slate-300 shadow-sm rounded-lg mb-4 bg-slate-100">
						<img src="${pcViewImg(doc)}" class="w-full h-auto">
					</div>
					<div class="flex flex-wrap sm:flex-nowrap justify-center gap-2">
						<button onclick="shareFinalDoc('${doc.id}')" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/40 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-share-nodes"></i> แชร์</button>
						<button onclick="downloadFinalDoc('${doc.id}')" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/40 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-download"></i> รูปภาพ</button>
						<button onclick="printFinalDoc('${doc.id}')" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/40 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-print"></i> พิมพ์</button>
						<button onclick="exportFinalPdf('${doc.id}')" class="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-rose-500/40 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-file-pdf"></i> ไฟล์ PDF</button>
						<button onclick="viewOriginalDocument('${doc.id}')" class="flex-1 bg-slate-700 hover:bg-slate-800 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-slate-700/40 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-file-pdf"></i> ไฟล์ต้นฉบับ</button>
					</div>
				`,
				width: '850px',
				showConfirmButton: false,
				showCloseButton: true,
				customClass: {
					popup: 'doc-viewer-modal' // 🌟 เพิ่มคลาสนี้เพื่อปลดล็อกความกว้าง
				}
			});
		}
		
		window.viewOriginalDocument = async function(docId) {
			let doc = state.documentQueue.find(d => d.id === docId);
			if(!doc || !doc.originalFile) {
				return Swal.fire('แจ้งเตือน', 'ไม่พบไฟล์ต้นฉบับ', 'warning');
			}
			
			let file = doc.originalFile;

			// เปิดหน้าต่าง Modal รอไว้ก่อน
			Swal.fire({
				html: `
					<div class="flex justify-between items-center text-base font-bold text-slate-800 text-left mb-3 border-b pb-3 pr-8 mt-2">
						<div class="truncate"><i class="fa-solid fa-file-pdf text-rose-500 mr-2"></i> ${file.name}</div>
						<div class="flex items-center gap-2 shrink-0">
							<a href="${file.content}" download="${file.name}" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-sm transition flex items-center gap-1.5">
								<i class="fa-solid fa-download"></i> ดาวน์โหลด
							</a>
							<button onclick="printOriginalDocument('${doc.id}')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-sm transition flex items-center gap-1.5">
								<i class="fa-solid fa-print"></i> พิมพ์
							</button>
						</div>
					</div>
					
					<!-- กล่อง Container สำหรับแสดงเอกสารแบบเลื่อนได้จริงบน iPad/iPhone -->
					<div id="pdf-scroll-container" class="w-full h-[75vh] bg-slate-300 rounded-lg overflow-y-auto p-2 sm:p-4 flex flex-col items-center gap-4 border border-slate-300 shadow-inner" style="-webkit-overflow-scrolling: touch;">
						<div id="pdf-loading-text" class="text-sm font-bold text-slate-600 my-auto flex items-center gap-2">
							<i class="fa-solid fa-spinner fa-spin-pulse"></i> กำลังโหลดหน้าเอกสาร...
						</div>
					</div>
				`,
				width: '900px',
				padding: '1.25rem',
				showConfirmButton: false,
				showCloseButton: true
			});

			const container = document.getElementById('pdf-scroll-container');

			// กรณีเป็นรูปภาพทั่วไป
			if (file.type && file.type.includes('image')) {
				container.innerHTML = `<img src="${file.content}" class="w-full h-auto shadow-md rounded bg-white">`;
				return;
			}

			// กรณีเป็นไฟล์ PDF: เรนเดอร์ทุกหน้าด้วย PDF.js เป็น Canvas เรียงต่อกัน
			if (file.type && file.type.includes('pdf')) {
				try {
					const byteCharacters = atob(file.content.split(',')[1]);
					const byteNumbers = new Array(byteCharacters.length);
					for (let i = 0; i < byteCharacters.length; i++) {
						byteNumbers[i] = byteCharacters.charCodeAt(i);
					}
					const byteArray = new Uint8Array(byteNumbers);

					await PCLib.load('pdfjs'); const pdf = await pdfjsLib.getDocument(byteArray).promise;
					container.innerHTML = ''; // เคลียร์ข้อความโหลด

					for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
						const page = await pdf.getPage(pageNum);
						const viewport = page.getViewport({ scale: 1.5 });

						const canvas = document.createElement('canvas');
						const ctx = canvas.getContext('2d');
						canvas.height = viewport.height;
						canvas.width = viewport.width;
						canvas.className = 'w-full max-w-[800px] h-auto shadow-lg rounded bg-white shrink-0 mb-2';

						await page.render({ canvasContext: ctx, viewport: viewport }).promise;
						container.appendChild(canvas);
					}
				} catch (error) {
					container.innerHTML = `
						<div class="my-auto text-center p-4">
							<p class="text-rose-600 font-bold mb-2">ไม่สามารถเรนเดอร์ไฟล์ PDF บนอุปกรณ์นี้ได้</p>
							<a href="${file.content}" target="_blank" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold inline-block">เปิดในแท็บใหม่แทน</a>
						</div>
					`;
				}
			}
		};		
		window.printOriginalDocument = function(docId) {
			let doc = state.documentQueue.find(d => d.id === docId);
			if (!doc || !doc.originalFile) return;
			
			let a = doc.originalFile;
			if (a.type.includes('image')) {
				let printWindow = window.open('', '_blank');
				printWindow.document.write(`<html><head><title>พิมพ์เอกสารต้นฉบับ</title><style>body { margin: 0; text-align: center; } img { max-width: 100%; height: auto; }</style></head><body><img src="${a.content}" onload="window.print(); window.close();"></body></html>`);
				printWindow.document.close();
			} else if (a.type.includes('pdf')) {
				try {
					const byteCharacters = atob(a.content.split(',')[1]);
					const byteNumbers = new Array(byteCharacters.length);
					for (let i = 0; i < byteCharacters.length; i++) {
						byteNumbers[i] = byteCharacters.charCodeAt(i);
					}
					const byteArray = new Uint8Array(byteNumbers);
					const blob = new Blob([byteArray], { type: 'application/pdf' });
					const blobUrl = URL.createObjectURL(blob);
					
					let printWindow = window.open(blobUrl, '_blank');
					if (!printWindow) {
						Swal.fire('แจ้งเตือน', 'กรุณาอนุญาต Pop-up (Allow Pop-ups) ของเบราว์เซอร์เพื่อเปิดหน้าต่างสั่งพิมพ์', 'warning');
					}
				} catch (e) {
					Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสั่งพิมพ์ไฟล์ PDF นี้ได้ กรุณาดาวน์โหลดแทน', 'error');
				}
			}
		};
		
		function navigateQueue(stage, direction) {
			let items = state.documentQueue.filter(d => d.stage === stage);
			const currentRoomName = document.getElementById('banner-room-name').innerText;
			const normalizedRoom = currentRoomName.replace(/ฯ/g, '').trim();

			if (stage === 8 && typeof window.pcStage8Visible === 'function') {
				items = items.filter(doc => window.pcStage8Visible(doc, normalizedRoom, currentRoomName));   // [v23 ข้อ 14]
			} else if (currentRoomName !== 'ห้องสารบรรณกลาง') {
				items = items.filter(doc => {
					if (stage === 5 || stage === 6) {
						if (!doc.assignedGroups || doc.assignedGroups.length === 0) return false;
						return doc.assignedGroups.some(g => normalizedRoom.includes(g.replace(/ฯ/g, '').trim()) || g.replace(/ฯ/g, '').trim().includes(normalizedRoom));
					} else if (stage === 65 || stage === 7 || stage === 8) {
						if (!doc.subGroups || doc.subGroups.length === 0) return false;
						return doc.subGroups.some(g => normalizedRoom.includes(g.replace(/ฯ/g, '').trim()) || g.replace(/ฯ/g, '').trim().includes(normalizedRoom));
					}
					return true;
				});
			}
			
			if (stage > 1) items.sort((a,b) => b.priority - a.priority);
			if (items.length === 0) return;

			let currentIndex = items.findIndex(d => d.id === state.activeDocIds[stage]);
			if (currentIndex === -1) currentIndex = 0;

			let newIndex = currentIndex + direction;
			if (newIndex < 0) newIndex = items.length - 1; // เลื่อนซ้ายสุดให้วนกลับไปขวาสุด
			if (newIndex >= items.length) newIndex = 0; // เลื่อนขวาสุดให้วนกลับมาซ้ายสุด

			selectDoc(items[newIndex].id, stage);

			// ดันการ์ดที่ถูกเลือกให้เลื่อนมาอยู่ตรงกลางจออัตโนมัติ
			setTimeout(() => {
				let activeCard = document.querySelector(`#queue-list-${stage} .ring-2`);
				if (activeCard) {
					activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
				}
			}, 50);
		}
		
		
		function toggleAdminForm() {
			const panel = document.getElementById('admin-form-panel');
			const textBtn = document.getElementById('text-toggle-form');
			if (!panel) return;

			if (panel.classList.contains('hidden')) {
				panel.classList.remove('hidden');
				if (textBtn) textBtn.innerText = "ซ่อนฟอร์ม";
			} else {
				panel.classList.add('hidden');
				if (textBtn) textBtn.innerText = "เปิดฟอร์ม";
			}

			// สั่งคำนวณขนาดกระดาษ Canvas ใหม่ให้กว้างเต็มจอ iPad ทันทีหลังซ่อนฟอร์ม
			setTimeout(() => {
				resetCanvasZoom('canvas-admin');
			}, 200);
		}
		
		
		// =========================================================================
		// 1. ระบบ Collapsible Panel กลางสำหรับทุกแท็บ (รองรับ iPad จอกว้างเต็ม 100%)
		// =========================================================================
		function toggleWorkspacePanel(tabName) {
			const panel = document.getElementById(`panel-${tabName}`);
			const textBtn = document.getElementById(`text-toggle-${tabName}`);
			if (!panel) return;

			const isHidden = panel.classList.contains('hidden');
			if (isHidden) {
				panel.classList.remove('hidden');
				if (textBtn) textBtn.innerText = "ฟอร์ม";
			} else {
				panel.classList.add('hidden');
				if (textBtn) textBtn.innerText = "เปิดฟอร์ม";
			}

			// แมปชื่อแท็บกับ Canvas เพื่อคำนวณขนาดกระดาษเต็มจอทันที
			const canvasMap = {
				'admin': 'canvas-admin',
				'director': 'canvas-director',
				'admingroup': 'canvas-admingroup',
				'subdirectorgroup': 'canvas-subdirectorgroup',
				'subgroupadmin': 'canvas-subgroupadmin',
				'assistantgroup': 'canvas-assistantgroup',
				'assignee': 'canvas-assignee'
			};
			const cKey = canvasMap[tabName];
			if (cKey) {
				setTimeout(() => {
					resetCanvasZoom(cKey);
				}, 200);
			}
		}

		// =========================================================================
		// 2. หน่วงเวลา 2 วินาที สั่งซ่อนฟอร์มอัตโนมัติเมื่อเลือกหมวดหมู่หนังสือ
		// =========================================================================
		let categoryDebounceTimer = null;
		function updateActiveDocCategories() {
			if (!state.activeDocIds[1]) return;
			let doc = state.documentQueue.find(d => d.id === state.activeDocIds[1]);
			if (doc) {
				let checkedBoxes = document.querySelectorAll('.admin-category-checkbox:checked');
				doc.category = Array.from(checkedBoxes).map(cb => cb.value);
				renderQueueList(1, 'queue-list-1');
			}

			// หน่วงเวลา 2 วินาที (2000ms) ถ้าเลือกหมวดหมู่แล้วให้สั่งซ่อนฟอร์มทันที
			if (categoryDebounceTimer) clearTimeout(categoryDebounceTimer);
			categoryDebounceTimer = setTimeout(() => {
				const panel = document.getElementById('panel-admin');
				const checkedBoxes = document.querySelectorAll('.admin-category-checkbox:checked');
				if (panel && !panel.classList.contains('hidden') && checkedBoxes.length > 0) {
					toggleWorkspacePanel('admin');
				}
			}, 1000);
		}
		
		
		// ฟังก์ชันแปลงวันที่เป็นรูปแบบไทย (เช่น 5 กันยายน 2569)
		function formatThaiDateFull(d) {
			if (!d || isNaN(new Date(d).getTime())) d = new Date();
			else d = new Date(d);
			const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
			return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
		}

		// ผูก Flatpickr ปฏิทินภาษาไทยกับช่อง admin-doc-date
		window.addEventListener('DOMContentLoaded', () => {
			window.docDatePicker = flatpickr("#admin-doc-date", {
				locale: "th",
				defaultDate: "today",
				disableMobile: true,
				altInput: true,
				altInputClass: "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer font-bold text-slate-700",
				formatDate: (date) => formatThaiDateFull(date),
				onChange: (selectedDates) => {
					if (selectedDates[0]) {
						const thaiText = formatThaiDateFull(selectedDates[0]);
						updateActiveDocField('docDate', thaiText);
					}
				}
			});
		});
		
		
		// ฟังก์ชันเลือกทุกกลุ่มสำหรับ ผอ.
        function selectAllDirectorGroups() {
            const checkboxes = document.querySelectorAll('.director-group-checkbox');
            if (checkboxes.length === 0) return;
            
            // ตรวจสอบว่าเลือกครบทุกกลุ่มอยู่แล้วหรือไม่
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            
            // ถ้ายังไม่ครบให้เลือกทั้งหมด แต่ถ้าครบอยู่แล้วให้ยกเลิกทั้งหมด
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
            });
            
            // อัปเดตข้อสั่งการใน textarea ทันที
            updateDirectorComment();
        }
		
		// ฟังก์ชันแปลงเลขเดือนเป็นชื่อเดือนภาษาไทย (ย่อ/เต็ม)
		function getThaiMonthName(monthIndex, isFull = false) {
			const shortMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
			const fullMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
			return isFull ? fullMonths[monthIndex] : shortMonths[monthIndex];
		}

		// ฟังก์ชันคัดลอกชื่อเรื่องลง Clipboard
		function copySubject() {
			const input = document.getElementById('admin-subject');
			if (!input || !input.value.trim()) return;

			navigator.clipboard.writeText(input.value.trim()).then(() => {
				input.focus();
				input.select();
				Swal.fire({
					icon: 'success',
					title: 'คัดลอกข้อความแล้ว',
					toast: true,
					position: 'top-end',
					showConfirmButton: false,
					timer: 1000
				});
			});
		}
		
		
		// =========================================================================
		//ฟังก์ชันดึงคิวหนังสือที่เหลือใน Stage นั้นๆ โดยเรียงลำดับให้ตรงกับหน้าจอ 100%
		// =========================================================================
		function getRemainingQueueDocs(stage) {
			const currentRoomName = document.getElementById('banner-room-name')?.innerText || '';
			const normalizedRoom = currentRoomName.replace(/ฯ/g, '').trim();
			
			let items = state.documentQueue.filter(d => d.stage === stage);
			
			// กรองตามสิทธิ์ห้องเหมือนใน renderQueueList
			if (currentRoomName && currentRoomName !== 'ห้องสารบรรณกลาง') {
				items = items.filter(doc => {
					if (stage === 5 || stage === 6) {
						if (!doc.assignedGroups || doc.assignedGroups.length === 0) return false;
						return doc.assignedGroups.some(g => {
							let ng = g.replace(/ฯ/g, '').trim();
							return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
						});
					} else if (stage === 65 || stage === 7 || stage === 8) {
						if (!doc.subGroups || doc.subGroups.length === 0) return false;
						return doc.subGroups.some(g => {
							let ng = g.replace(/ฯ/g, '').trim();
							return normalizedRoom.includes(ng) || ng.includes(normalizedRoom);
						});
					}
					return true;
				});
			}

			// เรียงตามความเร่งด่วนเหมือน renderQueueList
			if (stage > 1) {
				items.sort((a, b) => b.priority - a.priority);
			}
			return items;
		}
		

		function renderWorkspaceDocInfo(doc, stage) {
			// [เพิ่มบรรทัดนี้] หากเป็นธุรการกลุ่มงาน (Stage 65) ไม่ต้องสร้างกล่องซ้ำ
			if (stage === 65 || stage === 'subgroupadmin') return;
		
		
			// 1. ถ้าเป็นส่วนงานธุรการ (Stage 1) ไม่ต้องแสดงการ์ดสรุป เพราะมีฟอร์มกรอกด้านล่างอยู่แล้ว
			if (stage === 1) {
				const oldCard = document.getElementById('workspace-doc-summary-card');
				if (oldCard) oldCard.remove();
				return;
			}

			// 2. แมปชื่อแผงตามขั้นตอน
			const stagePanelMap = {
				4: 'panel-director',
				5: 'panel-admingroup',
				6: 'panel-subdirectorgroup',
				65: 'panel-subgroupadmin',
				7: 'panel-assistantgroup',
				8: 'panel-assignee'
			};

			const panelId = stagePanelMap[stage];
			if (!panelId) return;

			const panel = document.getElementById(panelId);
			if (!panel) return;

			// ลบการ์ดเดิมออกก่อนวาดใหม่
			let existingCard = document.getElementById('workspace-doc-summary-card');
			if (existingCard) existingCard.remove();

			if (!doc) return;

			// 3. สร้างการ์ดสรุปข้อมูลแบบเต็มความกว้าง (w-full)
			const card = document.createElement('div');
			card.id = 'workspace-doc-summary-card';
			card.className = 'w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5 shadow-sm';
			
			const catBadge = (doc.category && doc.category.length > 0) 
				? `<span class="bg-slate-700 text-white px-2 py-0.5 rounded text-[10px] font-bold">${Array.isArray(doc.category) ? doc.category.join(', ') : doc.category}</span>`
				: '';

			card.innerHTML = `
				<div class="flex items-center justify-between gap-1 flex-wrap">
					<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-300">
						<i class="fa-solid fa-receipt mr-1"></i> เลขรับ: ${doc.receiveNo || '-'}
					</span>
					${catBadge}
				</div>
				<div class="bg-blue-50 text-blue-800 p-1.5 rounded-lg border border-blue-200 text-[11px] font-medium">
					<i class="fa-solid fa-hashtag text-blue-600"></i> ที่: <strong>${doc.docNo || '-'}</strong> 
					<span class="text-slate-500">(ลงวันที่ ${doc.docDate || '-'})</span>
				</div>
				<div class="font-bold text-slate-800 leading-snug">
					<i class="fa-solid fa-file-lines text-indigo-500 mr-1"></i> เรื่อง: ${doc.subject || doc.title || '-'}
				</div>
				<div class="text-[10px] text-slate-500 flex flex-col gap-0.5 pt-1 border-t border-slate-200">
					<div><i class="fa-regular fa-calendar text-amber-500 mr-1"></i> รับเมื่อ: ${doc.lastUpdated || '-'}</div>
					<div><i class="fa-regular fa-user text-purple-500 mr-1"></i> ผู้รับ: ${doc.adminReceiver || 'ธุรการกลาง'}</div>
				</div>
			`;

			// 4. วางการ์ดไว้ใต้กล่อง Header (ต่อจากเส้น border-b) ไม่ยัดลงไปในแถวเดียวกัน
			const header = panel.querySelector('.border-b');
			if (header) {
				header.after(card);
			} else {
				panel.prepend(card);
			}
		}
		
	
	// ฟังก์ชันสลับโหมด Hand Pan (จำกัดการลากเลื่อนเฉพาะบนพื้นที่หน้ากระดาษ)
	function togglePanMode(btnElement, canvasKey = 'canvas-admin') {
		let canvas = state.canvases[canvasKey];
		if (!canvas) return;

		canvas.isPanMode = !canvas.isPanMode;

		// ล้างไฮไลท์ปุ่มเครื่องมือทั้งหมดก่อน
		document.querySelectorAll('.draw-tool-btn').forEach(btn => {
			btn.classList.remove('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
		});

		if (canvas.isPanMode) {
			canvas.isDrawingMode = false;
			canvas.selection = false;
			canvas.defaultCursor = 'default';
			canvas.hoverCursor = 'grab';
			
			// ไฮไลท์ปุ่มรูปมือบน Toolbar
			if (btnElement) {
				btnElement.classList.add('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
			}

			// ปิดการเลือกวัตถุชั่วคราวขณะอยู่ในโหมด Pan
			canvas.getObjects().forEach(obj => {
				obj.savedSelectable = obj.selectable;
				obj.selectable = false;
			});

			let isDragging = false;
			let lastPosX, lastPosY;

			canvas.panMouseDown = function (opt) {
				if (!canvas.isPanMode) return;

				// ตรวจสอบพิกัด: หากคลิกนอกพื้นที่หน้ากระดาษ จะไม่เริ่มการเลื่อน
				let pointer = canvas.getPointer(opt.e);
				if (!isPointerOnPaper(canvas, pointer)) {
					isDragging = false;
					return;
				}

				isDragging = true;
				canvas.setCursor('grabbing');
				let evt = opt.e;
				
				// รองรับทั้งเมาส์ และการสัมผัส (iPad)
				lastPosX = evt.touches && evt.touches.length > 0 ? evt.touches[0].clientX : evt.clientX;
				lastPosY = evt.touches && evt.touches.length > 0 ? evt.touches[0].clientY : evt.clientY;
			};

			canvas.panMouseMove = function (opt) {
				if (!canvas.isPanMode) return;

				let pointer = canvas.getPointer(opt.e);
				let onPaper = isPointerOnPaper(canvas, pointer);

				// หากแค่เลื่อนเมาส์ผ่าน (ยังไม่ได้คลิกลาก)
				if (!isDragging) {
					// บนกระดาษเป็นรูปมือ (grab) นอกกระดาษเป็นลูกศรปกติ (default)
					canvas.setCursor(onPaper ? 'grab' : 'default');
					return;
				}

				// ขณะคลิกลากเลื่อนกระดาษ
				canvas.setCursor('grabbing');
				let evt = opt.e;
				let currentX = evt.touches && evt.touches.length > 0 ? evt.touches[0].clientX : evt.clientX;
				let currentY = evt.touches && evt.touches.length > 0 ? evt.touches[0].clientY : evt.clientY;
				
				let vpt = canvas.viewportTransform;
				vpt[4] += currentX - lastPosX;
				vpt[5] += currentY - lastPosY;

				// ควบคุมขอบเขต (Boundary Clamping) ไม่ให้เลื่อนกระดาษหลุดออกนอกจอ
				if (canvas.backgroundImage) {
					const zoom = canvas.getZoom();
					const bg = canvas.backgroundImage;
					const paperW = bg.width * (bg.scaleX || 1) * zoom;
					const paperH = bg.height * (bg.scaleY || 1) * zoom;
					const minVisible = 100; // คงเหลือขอบกระดาษในจออย่างน้อย 100px

					const minX = -(paperW - minVisible);
					const maxX = canvas.width - minVisible;
					const minY = -(paperH - minVisible);
					const maxY = canvas.height - minVisible;

					if (vpt[4] < minX) vpt[4] = minX;
					if (vpt[4] > maxX) vpt[4] = maxX;
					if (vpt[5] < minY) vpt[5] = minY;
					if (vpt[5] > maxY) vpt[5] = maxY;
				}

				canvas.requestRenderAll();
				lastPosX = currentX;
				lastPosY = currentY;
			};

			canvas.panMouseUp = function (opt) {
				if (!canvas.isPanMode) return;
				isDragging = false;
				let pointer = canvas.getPointer(opt.e);
				canvas.setCursor(isPointerOnPaper(canvas, pointer) ? 'grab' : 'default');
			};

			canvas.on('mouse:down', canvas.panMouseDown);
			canvas.on('mouse:move', canvas.panMouseMove);
			canvas.on('mouse:up', canvas.panMouseUp);

		} else {
			// เมื่อกดปิดโหมดรูปมือ ให้คืนค่าระบบด้วยฟังก์ชันเดิม
			forceResetToSelectMode(canvasKey);
		}
	}
	
	
	

	// ฟังก์ชันบังคับรีเซ็ตกลับสู่โหมดเลือกวัตถุปกติ 100%
	function forceResetToSelectMode(canvasKey = 'canvas-admin') {
		let canvas = state.canvases[canvasKey];
		if (!canvas) return;

		// 1. ล้างสถานะโหมดมือจับและโหมดวาด
		canvas.isPanMode = false;
		canvas.isDrawingMode = false;
		canvas.selection = true; // เปิดการเลือกวัตถุระดับ Canvas
		canvas.defaultCursor = 'default';
		canvas.hoverCursor = 'move';

		// 2. ถอด Event ลากหน้าจอออกทั้งหมด
		if (canvas.panMouseDown) {
			canvas.off('mouse:down', canvas.panMouseDown);
			canvas.off('mouse:move', canvas.panMouseMove);
			canvas.off('mouse:up', canvas.panMouseUp);
			canvas.panMouseDown = null;
			canvas.panMouseMove = null;
			canvas.panMouseUp = null;
		}

		// 3. ปลดล็อกวัตถุทั้งหมดให้คลิกเลือก ย้าย และแก้ไขได้
		canvas.getObjects().forEach(obj => {
			// หากไม่ใช่ตรายางของขั้นตอนก่อนหน้าที่ถูกล็อกไว้ ให้เลือกได้ตามปกติ
			if (!obj.stampName || obj.isCurrentStep) {
				obj.selectable = true;
				obj.evented = true;
			}
		});

		// 4. ล้างไฮไลท์ปุ่ม Toolbar และคืนไฮไลท์ให้ปุ่มลูกศรเมาส์ (Select)
		document.querySelectorAll('.draw-tool-btn').forEach(btn => {
			btn.classList.remove('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
		});
		const selectBtn = document.querySelector(`button[onclick*="'select'"][onclick*="'${canvasKey}'"]`);
		if (selectBtn) {
			selectBtn.classList.add('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
		}
	}


	// ฟังก์ชันปิดโหมดมือจับและคืนสถานะปุ่ม Toolbar
	function disablePanMode(canvasKey = 'canvas-admin') {
		let canvas = state.canvases[canvasKey];
		if (!canvas) return;

		// 1. ถอด Event ลากหน้าจอและคืนค่าสถานะ Canvas
		if (canvas.isPanMode) {
			canvas.isPanMode = false;
			canvas.defaultCursor = 'default';
			canvas.hoverCursor = 'move';

			if (canvas.panMouseDown) {
				canvas.off('mouse:down', canvas.panMouseDown);
				canvas.off('mouse:move', canvas.panMouseMove);
				canvas.off('mouse:up', canvas.panMouseUp);
				canvas.panMouseDown = null;
				canvas.panMouseMove = null;
				canvas.panMouseUp = null;
			}

			// คืนค่าการเลือกวัตถุ (ตรายาง/เส้นวาด)
			canvas.getObjects().forEach(obj => {
				obj.selectable = obj.savedSelectable !== undefined ? obj.savedSelectable : (!obj.stampName || obj.isCurrentStep);
			});
		}

		// 2. ปลดแถบสีไฮไลท์ออกจากปุ่มรูปมือบน Toolbar
		const handBtn = document.querySelector(`button[onclick*="togglePanMode"][onclick*="'${canvasKey}'"]`);
		if (handBtn) {
			handBtn.classList.remove('ring-2', 'ring-inset', 'ring-blue-400', 'bg-slate-200');
		}
	}
	
		// ตรวจสอบว่าพิกัดเมาส์/สัมผัส อยู่บนพื้นที่หน้ากระดาษจริงหรือไม่
		function isPointerOnPaper(canvas, pointer) {
			if (!canvas || !canvas.backgroundImage) return false;
			const bg = canvas.backgroundImage;
			const left = bg.left || 0;
			const top = bg.top || 0;
			const width = bg.width * (bg.scaleX || 1);
			const height = bg.height * (bg.scaleY || 1);

			return (
				pointer.x >= left &&
				pointer.x <= (left + width) &&
				pointer.y >= top &&
				pointer.y <= (top + height)
			);
		}
		
		
		
		
		
		// ==========================================
		// การตั้งค่าปากกาไฮไลท์ (สี, ความโปร่งใส, ความสูง/ขนาด)
		// ==========================================
		let highlightSettings = {
			colorHex: '#fde047', // สีเหลืองเริ่มต้น
			opacity: 0.5,        // ความโปร่งใส 50%
			size: 26             // ปรับเพิ่มความสูงเริ่มต้นเป็น 26px (เดิม 15px ให้ครอบคลุมบรรทัดข้อความพอดี)
		};


		function getHighlightRgba() {
			let hex = highlightSettings.colorHex.replace('#', '');
			if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
			let r = parseInt(hex.substring(0, 2), 16) || 253;
			let g = parseInt(hex.substring(2, 4), 16) || 224;
			let b = parseInt(hex.substring(4, 6), 16) || 71;
			return `rgba(${r}, ${g}, ${b}, ${highlightSettings.opacity})`;
		}

		// 📌 ดักจับคลิกขวาทั้งหน้าจอ (ครอบคลุม ไฮไลต์, ปากกา, ยางลบ, กล่องข้อความ)
		document.addEventListener('contextmenu', function(e) {
			const btnHighlight = e.target.closest('button[onclick*="highlight"]');
			const btnRedline = e.target.closest('button[onclick*="redline"]');
			const btnEraser = e.target.closest('button[onclick*="eraser"]');
			const btnText = e.target.closest('button[onclick*="text"]');

			if (btnHighlight) {
				e.preventDefault(); 
				const match = (btnHighlight.getAttribute('onclick') || '').match(/canvas-[a-zA-Z0-9\-]+/);
				openHighlightSettings(e, match ? match[0] : 'canvas-admin', btnHighlight);
			} else if (btnRedline) {
				e.preventDefault();
				const match = (btnRedline.getAttribute('onclick') || '').match(/canvas-[a-zA-Z0-9\-]+/);
				openRedlineSettings(e, match ? match[0] : 'canvas-admin', btnRedline);
			} else if (btnEraser) {
				e.preventDefault();
				const match = (btnEraser.getAttribute('onclick') || '').match(/canvas-[a-zA-Z0-9\-]+/);
				openEraserSettings(e, match ? match[0] : 'canvas-admin', btnEraser);
			} else if (btnText) {
				e.preventDefault();
				const match = (btnText.getAttribute('onclick') || '').match(/canvas-[a-zA-Z0-9\-]+/);
				openTextSettings(e, match ? match[0] : 'canvas-admin', btnText);
			}
		});

		function openHighlightSettings(e, canvasKey, btnElement) {
			let oldPopup = document.getElementById('highlight-settings-popup');
			if (oldPopup) oldPopup.remove();

			const popup = document.createElement('div');
			popup.id = 'highlight-settings-popup';
			popup.className = 'fixed z-[200] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200 text-slate-800 w-64 text-xs select-none';
			
			// คำนวณพิกัดให้ป๊อปอัปแสดงอยู่ใต้ปุ่ม
			const rect = btnElement.getBoundingClientRect();
			let top = rect.bottom + 8;
			let left = rect.left - 100;
			if (left < 10) left = 10;
			if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;

			const presetColors = ['#fde047', '#86efac', '#93c5fd', '#f472b6', '#fdba74', '#c084fc'];

			popup.innerHTML = `
				<div class="flex justify-between items-center mb-3 pb-1 border-b border-slate-200">
					<span class="font-bold text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-sliders text-amber-500"></i> ตั้งค่าปากกาไฮไลท์</span>
					<button onclick="document.getElementById('highlight-settings-popup').remove()" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-xmark"></i></button>
				</div>
				
				<div class="mb-3 p-2 bg-slate-100 rounded-lg border flex flex-col items-center justify-center">
					<span class="text-[10px] text-slate-400 mb-1">ตัวอย่างเส้นไฮไลท์</span>
					<div id="hl-preview-box" class="w-full flex items-center justify-center h-10 overflow-hidden relative bg-white rounded border border-slate-200">
						<span class="text-slate-800 font-bold text-xs relative z-10">ข้อความตัวอย่างราชการ</span>
						<div id="hl-preview-line" class="absolute w-4/5 rounded pointer-events-none"></div>
					</div>
				</div>

				<div class="mb-3">
					<label class="block text-[11px] font-bold text-slate-600 mb-1.5">โทนสี</label>
					<div class="flex items-center gap-1.5 flex-wrap mb-2">
						${presetColors.map(c => `
							<button type="button" onclick="setHlColor('${c}', '${canvasKey}')" class="w-6 h-6 rounded-full border-2 transition shadow-xs ${highlightSettings.colorHex === c ? 'border-slate-800 scale-110' : 'border-white'}" style="background-color: ${c};"></button>
						`).join('')}
						<input type="color" id="hl-custom-color" value="${highlightSettings.colorHex}" onchange="setHlColor(this.value, '${canvasKey}')" class="w-6 h-6 rounded-full cursor-pointer border-0 p-0 bg-transparent" title="เลือกสีอื่นๆ">
					</div>
				</div>

				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ความเข้ม-จาง</span>
						<span id="hl-opacity-val" class="text-amber-600 font-mono">${Math.round(highlightSettings.opacity * 100)}%</span>
					</div>
					<input type="range" min="0.1" max="0.9" step="0.05" value="${highlightSettings.opacity}" oninput="updateHlOpacity(this.value, '${canvasKey}')" class="w-full accent-amber-500 cursor-pointer">
				</div>

				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ความหนาปากกา</span>
						<span id="hl-size-val" class="text-amber-600 font-mono">${highlightSettings.size}px</span>
					</div>
					<input type="range" min="15" max="50" step="1" value="${highlightSettings.size}" oninput="updateHlSize(this.value, '${canvasKey}')" class="w-full accent-amber-500 cursor-pointer">
				</div>

				<button onclick="document.getElementById('highlight-settings-popup').remove()" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow transition">เสร็จสิ้น</button>
			`;

			document.body.appendChild(popup);
			updateHlPreview();

			// ปิดป๊อปอัปเมื่อคลิกนอกกรอบ
			setTimeout(() => {
				const closeOnClickOutside = (evt) => {
					if (!popup.contains(evt.target) && evt.target !== btnElement) {
						popup.remove();
						document.removeEventListener('mousedown', closeOnClickOutside);
					}
				};
				document.addEventListener('mousedown', closeOnClickOutside);
			}, 100);
		}

		function updateHlPreview() {
			const line = document.getElementById('hl-preview-line');
			if (line) {
				line.style.backgroundColor = getHighlightRgba();
				line.style.height = `${Math.min(highlightSettings.size, 32)}px`;
			}
		}

		function syncCurrentBrush(canvasKey) {
			let canvas = state.canvases[canvasKey];
			if (canvas && canvas.isDrawingMode && canvas.currentDrawMode === 'highlight') {
				canvas.freeDrawingBrush.color = getHighlightRgba();
				canvas.freeDrawingBrush.width = highlightSettings.size;
			}
		}

		function setHlColor(hex, canvasKey) {
			highlightSettings.colorHex = hex;
			updateHlPreview();
			syncCurrentBrush(canvasKey);
			let popup = document.getElementById('highlight-settings-popup');
			if (popup) {
				popup.querySelectorAll('button[onclick*="setHlColor"]').forEach(b => {
					b.classList.remove('border-slate-800', 'scale-110');
					if (b.style.backgroundColor.includes(hex) || b.getAttribute('onclick').includes(hex)) {
						b.classList.add('border-slate-800', 'scale-110');
					}
				});
			}
		}

		function updateHlOpacity(val, canvasKey) {
			highlightSettings.opacity = parseFloat(val);
			const txt = document.getElementById('hl-opacity-val');
			if (txt) txt.innerText = `${Math.round(highlightSettings.opacity * 100)}%`;
			updateHlPreview();
			syncCurrentBrush(canvasKey);
		}

		function updateHlSize(val, canvasKey) {
			highlightSettings.size = parseInt(val, 10);
			const txt = document.getElementById('hl-size-val');
			if (txt) txt.innerText = `${highlightSettings.size}px`;
			updateHlPreview();
			syncCurrentBrush(canvasKey);
		}	
		
		
		
		// ==========================================
		// การตั้งค่าและป๊อปอัปปากกา (ขีดเส้น/เขียน)
		// ==========================================
		let redlineSettings = {
			colorHex: '#dc2626', // สีแดงเริ่มต้น
			opacity: 1.0,        // ความโปร่งใส 100% (ทึบแสง)
			size: 4              // ความหนา 4px
		};

		function getRedlineRgba() {
			let hex = redlineSettings.colorHex.replace('#', '');
			if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
			let r = parseInt(hex.substring(0, 2), 16) || 220;
			let g = parseInt(hex.substring(2, 4), 16) || 38;
			let b = parseInt(hex.substring(4, 6), 16) || 38;
			return `rgba(${r}, ${g}, ${b}, ${redlineSettings.opacity})`;
		}

		function openRedlineSettings(e, canvasKey, btnElement) {
			let oldPopup = document.getElementById('redline-settings-popup');
			if (oldPopup) oldPopup.remove();

			const popup = document.createElement('div');
			popup.id = 'redline-settings-popup';
			popup.className = 'fixed z-[200] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200 text-slate-800 w-64 text-xs select-none';
			
			// คำนวณพิกัดให้ป๊อปอัปแสดงอยู่ใต้ปุ่ม
			const rect = btnElement.getBoundingClientRect();
			let top = rect.bottom + 8;
			let left = rect.left - 100;
			if (left < 10) left = 10;
			if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;

			// ชุดสี Preset สำหรับปากกา (แดง, น้ำเงิน, ดำ, เขียว, ส้ม, ม่วง)
			const presetColors = ['#dc2626', '#2563eb', '#000000', '#16a34a', '#d97706', '#9333ea'];

			popup.innerHTML = `
				<div class="flex justify-between items-center mb-3 pb-1 border-b border-slate-200">
					<span class="font-bold text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-pen-nib text-rose-500"></i> ตั้งค่าปากกาขีดเขียน</span>
					<button onclick="document.getElementById('redline-settings-popup').remove()" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-xmark"></i></button>
				</div>
				
				<div class="mb-3 p-2 bg-slate-100 rounded-lg border flex flex-col items-center justify-center">
					<span class="text-[10px] text-slate-400 mb-1">ตัวอย่างเส้นปากกา</span>
					<div id="rl-preview-box" class="w-full flex items-center justify-center h-10 overflow-hidden relative bg-white rounded border border-slate-200">
						<span class="text-slate-800 font-bold text-xs relative z-10 opacity-30">ข้อความราชการ</span>
						<div id="rl-preview-line" class="absolute w-4/5 rounded-full pointer-events-none z-20"></div>
					</div>
				</div>

				<div class="mb-3">
					<label class="block text-[11px] font-bold text-slate-600 mb-1.5">โทนสี</label>
					<div class="flex items-center gap-1.5 flex-wrap mb-2">
						${presetColors.map(c => `
							<button type="button" onclick="setRlColor('${c}', '${canvasKey}')" class="w-6 h-6 rounded-full border-2 transition shadow-xs ${redlineSettings.colorHex === c ? 'border-slate-800 scale-110' : 'border-white'}" style="background-color: ${c};"></button>
						`).join('')}
						<input type="color" id="rl-custom-color" value="${redlineSettings.colorHex}" onchange="setRlColor(this.value, '${canvasKey}')" class="w-6 h-6 rounded-full cursor-pointer border-0 p-0 bg-transparent" title="เลือกสีอื่นๆ">
					</div>
				</div>

				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ความเข้ม-จาง</span>
						<span id="rl-opacity-val" class="text-rose-600 font-mono">${Math.round(redlineSettings.opacity * 100)}%</span>
					</div>
					<input type="range" min="0.1" max="1.0" step="0.05" value="${redlineSettings.opacity}" oninput="updateRlOpacity(this.value, '${canvasKey}')" class="w-full accent-rose-500 cursor-pointer">
				</div>

				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ความหนาปากกา</span>
						<span id="rl-size-val" class="text-rose-600 font-mono">${redlineSettings.size}px</span>
					</div>
					<input type="range" min="1" max="20" step="1" value="${redlineSettings.size}" oninput="updateRlSize(this.value, '${canvasKey}')" class="w-full accent-rose-500 cursor-pointer">
				</div>

				<button onclick="document.getElementById('redline-settings-popup').remove()" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow transition">เสร็จสิ้น</button>
			`;

			document.body.appendChild(popup);
			updateRlPreview();

			// ปิดป๊อปอัปเมื่อคลิกนอกกรอบ
			setTimeout(() => {
				const closeOnClickOutside = (evt) => {
					if (!popup.contains(evt.target) && evt.target !== btnElement) {
						popup.remove();
						document.removeEventListener('mousedown', closeOnClickOutside);
					}
				};
				document.addEventListener('mousedown', closeOnClickOutside);
			}, 100);
		}

		function updateRlPreview() {
			const line = document.getElementById('rl-preview-line');
			if (line) {
				line.style.backgroundColor = getRedlineRgba();
				line.style.height = `${Math.min(redlineSettings.size, 32)}px`;
			}
		}

		function syncCurrentRedlineBrush(canvasKey) {
			let canvas = state.canvases[canvasKey];
			if (canvas && canvas.isDrawingMode && canvas.currentDrawMode === 'redline') {
				canvas.freeDrawingBrush.color = getRedlineRgba();
				canvas.freeDrawingBrush.width = redlineSettings.size;
			}
		}

		function setRlColor(hex, canvasKey) {
			redlineSettings.colorHex = hex;
			updateRlPreview();
			syncCurrentRedlineBrush(canvasKey);
			let popup = document.getElementById('redline-settings-popup');
			if (popup) {
				popup.querySelectorAll('button[onclick*="setRlColor"]').forEach(b => {
					b.classList.remove('border-slate-800', 'scale-110');
					if (b.style.backgroundColor.includes(hex) || b.getAttribute('onclick').includes(hex)) {
						b.classList.add('border-slate-800', 'scale-110');
					}
				});
			}
		}

		function updateRlOpacity(val, canvasKey) {
			redlineSettings.opacity = parseFloat(val);
			const txt = document.getElementById('rl-opacity-val');
			if (txt) txt.innerText = `${Math.round(redlineSettings.opacity * 100)}%`;
			updateRlPreview();
			syncCurrentRedlineBrush(canvasKey);
		}

		function updateRlSize(val, canvasKey) {
			redlineSettings.size = parseInt(val, 10);
			const txt = document.getElementById('rl-size-val');
			if (txt) txt.innerText = `${redlineSettings.size}px`;
			updateRlPreview();
			syncCurrentRedlineBrush(canvasKey);
		}
		
		
		// ==========================================
		// การตั้งค่าและป๊อปอัปยางลบ (เสมือนลิควิดลบคำผิด)
		// ==========================================
		let eraserSettings = {
			colorHex: '#ffffff', // สีขาวเริ่มต้น
			opacity: 1.0,        // ทึบแสง 100%
			size: 20             // ความหนา 20px
		};

		function getEraserRgba() {
			let hex = eraserSettings.colorHex.replace('#', '');
			if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
			let r = parseInt(hex.substring(0, 2), 16) || 255;
			let g = parseInt(hex.substring(2, 4), 16) || 255;
			let b = parseInt(hex.substring(4, 6), 16) || 255;
			return `rgba(${r}, ${g}, ${b}, ${eraserSettings.opacity})`;
		}

		function openEraserSettings(e, canvasKey, btnElement) {
			let oldPopup = document.getElementById('eraser-settings-popup');
			if (oldPopup) oldPopup.remove();

			const popup = document.createElement('div');
			popup.id = 'eraser-settings-popup';
			popup.className = 'fixed z-[200] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200 text-slate-800 w-64 text-xs select-none';
			
			// คำนวณพิกัดให้ป๊อปอัปแสดงอยู่ใต้ปุ่ม
			const rect = btnElement.getBoundingClientRect();
			let top = rect.bottom + 8;
			let left = rect.left - 100;
			if (left < 10) left = 10;
			if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;

			// ชุดสีเนื้อกระดาษ (ขาว, ขาวหม่น, ครีม, เทาอ่อน) เผื่อสีกระดาษสแกนไม่ขาว 100%
			const presetColors = ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#fefce8', '#ffedd5'];

			popup.innerHTML = `
				<div class="flex justify-between items-center mb-3 pb-1 border-b border-slate-200">
					<span class="font-bold text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-eraser text-slate-500"></i> ตั้งค่ายางลบ (ลบคำผิด)</span>
					<button onclick="document.getElementById('eraser-settings-popup').remove()" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-xmark"></i></button>
				</div>
				
				<div class="mb-3 p-2 bg-slate-200 rounded-lg border border-slate-300 flex flex-col items-center justify-center" style="background-image: repeating-linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0), repeating-linear-gradient(45deg, #e2e8f0 25%, #f1f5f9 25%, #f1f5f9 75%, #e2e8f0 75%, #e2e8f0); background-size: 10px 10px;">
					<span class="text-[10px] text-slate-500 mb-1 bg-white/80 px-1 rounded">ตัวอย่างหัวยางลบ</span>
					<div id="er-preview-box" class="w-full flex items-center justify-center h-10 overflow-hidden relative rounded border border-slate-300 shadow-inner">
						<div id="er-preview-line" class="absolute w-4/5 rounded-full pointer-events-none z-20 shadow-sm border border-slate-200/50"></div>
					</div>
				</div>

				<div class="mb-3">
					<label class="block text-[11px] font-bold text-slate-600 mb-1.5">เทียบสีเนื้อกระดาษ</label>
					<div class="flex items-center gap-1.5 flex-wrap mb-2">
						${presetColors.map(c => `
							<button type="button" onclick="setErColor('${c}', '${canvasKey}')" class="w-6 h-6 rounded-full border-2 transition shadow-xs ${eraserSettings.colorHex === c ? 'border-slate-800 scale-110' : 'border-slate-300'}" style="background-color: ${c};"></button>
						`).join('')}
						<input type="color" id="er-custom-color" value="${eraserSettings.colorHex}" onchange="setErColor(this.value, '${canvasKey}')" class="w-6 h-6 rounded-full cursor-pointer border-0 p-0 bg-transparent" title="เลือกสีอื่นๆ">
					</div>
				</div>

				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ขนาดหัวยางลบ</span>
						<span id="er-size-val" class="text-slate-600 font-mono">${eraserSettings.size}px</span>
					</div>
					<input type="range" min="5" max="60" step="1" value="${eraserSettings.size}" oninput="updateErSize(this.value, '${canvasKey}')" class="w-full accent-slate-500 cursor-pointer">
				</div>

				<button onclick="document.getElementById('eraser-settings-popup').remove()" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow transition">เสร็จสิ้น</button>
			`;

			document.body.appendChild(popup);
			updateErPreview();

			setTimeout(() => {
				const closeOnClickOutside = (evt) => {
					if (!popup.contains(evt.target) && evt.target !== btnElement) {
						popup.remove();
						document.removeEventListener('mousedown', closeOnClickOutside);
					}
				};
				document.addEventListener('mousedown', closeOnClickOutside);
			}, 100);
		}

		function updateErPreview() {
			const line = document.getElementById('er-preview-line');
			if (line) {
				line.style.backgroundColor = getEraserRgba();
				line.style.height = `${Math.min(eraserSettings.size, 32)}px`;
			}
		}

		function syncCurrentEraserBrush(canvasKey) {
			let canvas = state.canvases[canvasKey];
			if (canvas && canvas.isDrawingMode && canvas.currentDrawMode === 'eraser') {
				canvas.freeDrawingBrush.color = getEraserRgba();
				canvas.freeDrawingBrush.width = eraserSettings.size;
			}
		}

		function setErColor(hex, canvasKey) {
			eraserSettings.colorHex = hex;
			updateErPreview();
			syncCurrentEraserBrush(canvasKey);
			let popup = document.getElementById('eraser-settings-popup');
			if (popup) {
				popup.querySelectorAll('button[onclick*="setErColor"]').forEach(b => {
					b.classList.remove('border-slate-800', 'scale-110');
					if (b.style.backgroundColor.includes(hex) || b.getAttribute('onclick').includes(hex)) {
						b.classList.add('border-slate-800', 'scale-110');
					}
				});
			}
		}

		function updateErSize(val, canvasKey) {
			eraserSettings.size = parseInt(val, 10);
			const txt = document.getElementById('er-size-val');
			if (txt) txt.innerText = `${eraserSettings.size}px`;
			updateErPreview();
			syncCurrentEraserBrush(canvasKey);
		}
		
		// ==========================================
		// การตั้งค่าและป๊อปอัป กล่องข้อความ (Text)
		// ==========================================
		let textSettings = {
			colorHex: '#1e293b', // สีเริ่มต้น (เทาเข้มเกือบดำ)
			fontSize: 16,        // ขนาดฟอนต์ 16px
			fontFamily: 'Sarabun',
			isBold: false
		};

		function openTextSettings(e, canvasKey, btnElement) {
			let oldPopup = document.getElementById('text-settings-popup');
			if (oldPopup) oldPopup.remove();

			const popup = document.createElement('div');
			popup.id = 'text-settings-popup';
			popup.className = 'fixed z-[200] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200 text-slate-800 w-64 text-xs select-none';
			
			const rect = btnElement.getBoundingClientRect();
			let top = rect.bottom + 8;
			let left = rect.left - 100;
			if (left < 10) left = 10;
			if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
			popup.style.top = `${top}px`;
			popup.style.left = `${left}px`;

			const presetColors = ['#1e293b', '#dc2626', '#2563eb', '#16a34a', '#d97706'];

			popup.innerHTML = `
				<div class="flex justify-between items-center mb-3 pb-1 border-b border-slate-200">
					<span class="font-bold text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-font text-blue-500"></i> ตั้งค่าข้อความ</span>
					<button onclick="document.getElementById('text-settings-popup').remove()" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-xmark"></i></button>
				</div>
				
				<div class="mb-3 p-2 bg-slate-50 rounded-lg border flex flex-col items-center justify-center">
					<span class="text-[10px] text-slate-400 mb-1">ตัวอย่าง</span>
					<div class="w-full flex items-center justify-center h-10 overflow-hidden bg-white rounded border border-slate-200">
						<span id="text-preview-sample" style="color: ${textSettings.colorHex}; font-size: ${textSettings.fontSize}px; font-family: ${textSettings.fontFamily}; font-weight: ${textSettings.isBold ? 'bold' : 'normal'};">สวัสดี</span>
					</div>
				</div>

				<div class="mb-3">
					<label class="block text-[11px] font-bold text-slate-600 mb-1.5">สีข้อความ</label>
					<div class="flex items-center gap-1.5 flex-wrap mb-2">
						${presetColors.map(c => `
							<button type="button" onclick="setTextProp('colorHex', '${c}', '${canvasKey}')" class="w-6 h-6 rounded-full border-2 transition shadow-xs ${textSettings.colorHex === c ? 'border-slate-800 scale-110' : 'border-white'}" style="background-color: ${c};"></button>
						`).join('')}
						<input type="color" id="text-custom-color" value="${textSettings.colorHex}" onchange="setTextProp('colorHex', this.value, '${canvasKey}')" class="w-6 h-6 rounded-full cursor-pointer border-0 p-0 bg-transparent">
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2 mb-3">
					<div>
						<label class="block text-[11px] font-bold text-slate-600 mb-1">ฟอนต์</label>
						<select onchange="setTextProp('fontFamily', this.value, '${canvasKey}')" class="w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-[11px]">
							<option value="Sarabun" ${textSettings.fontFamily === 'Sarabun' ? 'selected' : ''}>Sarabun</option>
							<option value="sans-serif" ${textSettings.fontFamily === 'sans-serif' ? 'selected' : ''}>Sans-serif</option>
							<option value="serif" ${textSettings.fontFamily === 'serif' ? 'selected' : ''}>Serif</option>
						</select>
					</div>
					<div>
						<label class="block text-[11px] font-bold text-slate-600 mb-1">สไตล์</label>
						<button onclick="setTextProp('isBold', ${!textSettings.isBold}, '${canvasKey}')" class="w-full p-1.5 rounded border transition text-[11px] font-bold ${textSettings.isBold ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}">
							ตัวหนา (B)
						</button>
					</div>
				</div>

				<div class="mb-3">
					<div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
						<span>ขนาดตัวอักษร</span>
						<span id="text-size-val" class="text-blue-600 font-mono">${textSettings.fontSize}px</span>
					</div>
					<input type="range" min="10" max="60" step="1" value="${textSettings.fontSize}" oninput="setTextProp('fontSize', this.value, '${canvasKey}')" class="w-full accent-blue-500 cursor-pointer">
				</div>

				<button onclick="document.getElementById('text-settings-popup').remove()" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow transition">เสร็จสิ้น</button>
			`;

			document.body.appendChild(popup);

			setTimeout(() => {
				const closeOnClickOutside = (evt) => {
					if (!popup.contains(evt.target) && evt.target !== btnElement) {
						popup.remove();
						document.removeEventListener('mousedown', closeOnClickOutside);
					}
				};
				document.addEventListener('mousedown', closeOnClickOutside);
			}, 100);
		}

		function setTextProp(propKey, value, canvasKey) {
			if (propKey === 'fontSize') value = parseInt(value, 10);
			textSettings[propKey] = value;
			
			// อัปเดตพรีวิว
			const preview = document.getElementById('text-preview-sample');
			if (preview) {
				if (propKey === 'colorHex') preview.style.color = value;
				if (propKey === 'fontSize') {
					preview.style.fontSize = `${value}px`;
					document.getElementById('text-size-val').innerText = `${value}px`;
				}
				if (propKey === 'fontFamily') preview.style.fontFamily = value;
				if (propKey === 'isBold') preview.style.fontWeight = value ? 'bold' : 'normal';
			}

			// อัปเดตเมนูป๊อปอัปให้แสดงสถานะล่าสุด (ถ้ากดเปลี่ยนตัวหนา)
			if (propKey === 'isBold' || propKey === 'colorHex') {
				let btnElement = document.querySelector(`button[onclick*="text"][onclick*="${canvasKey}"]`);
				if(btnElement) openTextSettings({preventDefault:()=>{}}, canvasKey, btnElement);
			}

			// อัปเดตกล่องข้อความบน Canvas อัตโนมัติ หากกำลัง Select อยู่
			let canvas = state.canvases[canvasKey];
			if (canvas) {
				let activeObj = canvas.getActiveObject();
				if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
					if (propKey === 'colorHex') activeObj.set('fill', value);
					if (propKey === 'fontSize') activeObj.set('fontSize', value);
					if (propKey === 'fontFamily') activeObj.set('fontFamily', value);
					if (propKey === 'isBold') activeObj.set('fontWeight', value ? 'bold' : 'normal');
					canvas.requestRenderAll();
					saveCanvasState(canvas);
				}
			}
		}
		
		
		// ==========================================
		// ป๊อปอัปแนะนำการใช้งาน Snipping Tool
		// ==========================================
		function showSnippingToolGuide() {
			Swal.fire({
				title: '<div class="flex items-center justify-center gap-2 text-base font-bold text-slate-800"><i class="fa-solid fa-scissors text-amber-500"></i> คีย์ลัดถ่ายภาพหน้าจอ (Snipping Tool)</div>',
				html: `
					<div class="text-left text-xs text-slate-600 space-y-3 p-1">
						<div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
							<p class="text-amber-800 font-bold mb-1.5">กด 3 ปุ่มนี้พร้อมกันบนแป้นพิมพ์:</p>
							<div class="inline-flex items-center gap-1.5 font-mono text-xs">
								<kbd class="px-2 py-1 bg-white border border-amber-300 rounded-lg shadow-sm font-bold text-slate-700"><i class="fa-brands fa-windows text-blue-600 mr-1"></i>Windows</kbd>
								<span class="text-amber-500 font-bold">+</span>
								<kbd class="px-2 py-1 bg-white border border-amber-300 rounded-lg shadow-sm font-bold text-slate-700">Shift</kbd>
								<span class="text-amber-500 font-bold">+</span>
								<kbd class="px-2 py-1 bg-white border border-amber-300 rounded-lg shadow-sm font-bold text-slate-700">S</kbd>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex items-start gap-2">
								<span class="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
								<span>หน้าจอจะมืดลง ให้ใช้เมาส์<strong>ลากคลุมเฉพาะส่วนเอกสาร</strong>ที่ต้องการ</span>
							</div>
							<div class="flex items-start gap-2">
								<span class="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
								<span>ระบบจะคัดลอกภาพเข้า Clipboard ให้อัตโนมัติ</span>
							</div>
							<div class="flex items-start gap-2">
								<span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-[11px]"><i class="fa-solid fa-check"></i></span>
								<span>คลิกที่หน้าต่างระบบแล้วกด <kbd class="px-1.5 py-0.5 bg-slate-100 border rounded font-mono font-bold">Ctrl</kbd> + <kbd class="px-1.5 py-0.5 bg-slate-100 border rounded font-mono font-bold">V</kbd> เพื่อวางภาพลงระบบได้ทันที</span>
							</div>
						</div>
					</div>
				`,
				confirmButtonText: 'เข้าใจแล้ว',
				confirmButtonColor: '#0f172a',
				customClass: {
					popup: 'rounded-2xl',
					confirmButton: 'rounded-xl text-xs px-4 py-2 font-bold'
				}
			});
		}
		
		
		// ฟังก์ชันวางข้อความทับในช่อง "4. เรื่อง" อัตโนมัติ
		async function pasteSubject() {
			const input = document.getElementById('admin-subject');
			if (!input) return;

			try {
				// 1. อ่านข้อความจาก Clipboard ของเครื่อง
				const text = await navigator.clipboard.readText();
				
				if (text) {
					// 2. โฟกัส คลุมดำ (Select) และวางทับข้อความเดิมทั้งหมด
					input.focus();
					input.select();
					input.value = text.trim();

					// 3. ซิงค์ข้อมูลเข้า State ของระบบ และอัปเดต Popover แสดงผล
					updateActiveDocField('subject', input.value, 1);
					const popover = document.getElementById('admin-subject-popover');
					if (popover) popover.innerText = input.value;

					// 4. รีเฟรชคิวงานธุรการเพื่อให้ชื่อเรื่องบนการ์ดคิวอัปเดตตามทันที
					if (typeof renderQueueList === 'function') {
						renderQueueList(1, 'queue-list-1');
					}

					// ครอบดำข้อความใหม่อีกครั้งเพื่อให้ผู้ใช้ตรวจทานได้ชัดเจน
					input.select();

					// แจ้งเตือนสัญลักษณ์แจ้งเตือนมุมขวาบน
					Swal.fire({
						icon: 'success',
						title: 'วางทับข้อความเรียบร้อย',
						toast: true,
						position: 'top-end',
						showConfirmButton: false,
						timer: 1000
					});
				}
			} catch (err) {
				// กรณีเบราว์เซอร์ติดสิทธิ์ความปลอดภัย (Permission Denied) ให้ครอบดำรอเพื่อให้กด Ctrl+V แทนได้ทันที
				input.focus();
				input.select();
				Swal.fire({
					icon: 'info',
					title: 'คลุมดำแล้ว กด Ctrl + V เพื่อวางทับได้เลย',
					toast: true,
					position: 'top-end',
					showConfirmButton: false,
					timer: 1500
				});
			}
		}
	
		// ==========================================
		// ฟังก์ชันแสดง Timeline เมื่อกดปุ่ม "ลงนามครบ"
		// ==========================================
		function showSignatureTimeline(docId) {
			let doc = state.documentQueue.find(d => d.id === docId);
			if (!doc) return;

			// สร้างโครงสร้างข้อมูลจำลอง (ให้คุณปรับ Property ให้ตรงกับที่เก็บในฐานข้อมูลจริง)
			// ตัวอย่างสมมติว่าคุณเก็บไว้ในรูปแบบ doc.signatures = { admin: '...', director: '...' }
			const timelineData = [
				{ role: 'ธุรการกลาง', name: doc.adminReceiver || 'เจ้าหน้าที่ธุรการ', comment: doc.adminComment || 'เสนอเพื่อโปรดพิจารณา', date: doc.stepTimes ? doc.stepTimes[1] : '-', sig: doc.signatures ? doc.signatures.admin : null },
				{ role: 'รองผู้อำนวยการ', name: 'รองฯ กลุ่มบริหาร', comment: doc.subdirectorComment || '-', date: doc.stepTimes ? doc.stepTimes[3] : '-', sig: doc.signatures ? doc.signatures.subdirector : null },
				{ role: 'ผู้อำนวยการ', name: 'ผู้อำนวยการสถานศึกษา', comment: doc.directorComment || '-', date: doc.stepTimes ? doc.stepTimes[4] : '-', sig: doc.signatures ? doc.signatures.director : null }
			];

			let htmlContent = `<div class="relative pl-4 space-y-6 text-left border-l-2 border-slate-200 mt-2 mb-2">`;
			
			timelineData.forEach(item => {
				// กรองเฉพาะคนที่มีการลงความเห็นหรือมีลายเซ็น
				if(item.comment !== '-' || item.sig) {
					htmlContent += `
						<div class="relative">
							<div class="absolute -left-[23px] bg-emerald-500 w-3 h-3 rounded-full border-2 border-white ring-2 ring-emerald-200"></div>
							<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-sm ml-2">
								<div class="flex justify-between items-start mb-1">
									<span class="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">${item.role}</span>
									<span class="text-[10px] text-slate-400"><i class="fa-regular fa-clock"></i> ${item.date}</span>
								</div>
								<p class="text-xs text-slate-700 font-medium leading-relaxed my-2 whitespace-pre-wrap"><i class="fa-solid fa-quote-left text-slate-300 mr-1"></i>${item.comment}</p>
								${item.sig ? `<img src="${item.sig}" class="h-10 object-contain border-t border-slate-200 pt-2 w-full" alt="ลายเซ็น">` : ''}
								<div class="text-[10px] text-slate-500 text-right mt-1">- ${item.name}</div>
							</div>
						</div>
					`;
				}
			});
			
			htmlContent += `</div>`;

			Swal.fire({
				title: '<div class="text-base font-bold text-slate-800"><i class="fa-solid fa-list-check text-emerald-500 mr-2"></i> สรุปการลงนาม</div>',
				html: htmlContent,
				width: 450,
				showConfirmButton: true,
				confirmButtonText: 'ปิดหน้าต่าง',
				confirmButtonColor: '#0f172a',
				customClass: { popup: 'rounded-2xl text-sm' }
			});
		}

		
		// =========================================================================
        // ระบบนาฬิกาภาษาไทยเรียลไทม์ และข้อความวิ่ง (Marquee)
        // =========================================================================
        function updateRealtimeClock() {
            const clockEl = document.getElementById('clock-home-text');
            if (!clockEl) return;

            const now = new Date();
            const thaiYear = now.getFullYear() + 543;
            const optsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const optsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

            const thaiDate = now.toLocaleDateString('th-TH', optsDate).replace(String(now.getFullYear()), String(thaiYear));
            const thaiTime = now.toLocaleTimeString('th-TH', optsTime);

            clockEl.innerHTML = `${thaiDate} เวลา ${thaiTime} น.`;
        }

        function initializeMarquee() {
            const container = document.getElementById('customMarqueeContainer');
            const text = document.getElementById('customMarqueeText');
            if (!container || !text) return;

            let containerWidth = container.offsetWidth;
            let textWidth = text.offsetWidth;
            let currentX = containerWidth;
            let animationId;

            function animate() {
                currentX -= 1.2; // ปรับความเร็วการวิ่ง
                if (currentX < -text.offsetWidth) {          // [v30] อ่านความกว้างสด (ข้อความเปลี่ยนเมื่อเข้าสู่ระบบ)
                    currentX = container.offsetWidth;
                }
                text.style.transform = `translateX(${currentX}px)`;
                animationId = requestAnimationFrame(animate);
            }

            // หยุดวิ่งเมื่อนำเมาส์ไปชี้ และวิ่งต่อเมื่อนำเมาส์ออก
            container.addEventListener('mouseenter', () => cancelAnimationFrame(animationId));
            container.addEventListener('mouseleave', () => { animationId = requestAnimationFrame(animate); });

            animationId = requestAnimationFrame(animate);
        }

        // เรียกให้เริ่มทำงานทันทีเมื่อเปิดหน้าเว็บ
        window.addEventListener('DOMContentLoaded', () => {
            updateRealtimeClock();
            setInterval(updateRealtimeClock, 1000);
            setTimeout(initializeMarquee, 300);
        });
		
		
		// ==========================================
        // ระบบ Captcha, จำรหัสผ่าน และแจ้งลืมรหัส
        // ==========================================
        let captchaCorrectAnswer = 0;

        function generateCaptcha() {
            const num1 = Math.floor(Math.random() * 9) + 1;
            const num2 = Math.floor(Math.random() * 9) + 1;
            captchaCorrectAnswer = num1 + num2;
            const qEl = document.getElementById('captchaQuestion');
            const aEl = document.getElementById('captchaAnswer');
            if (qEl) qEl.textContent = `${num1} + ${num2} =`;
            if (aEl) aEl.value = '';
        }

        // ปุ่มแสดง/ซ่อนรหัสผ่าน (ลืมรหัสผ่านย้ายไปที่ pcForgot ท้ายไฟล์แล้ว — ลบโค้ด OTP เดิมที่ไม่มีหน้าต่างให้เรียก ต.ค. 2569)
        (function pcLoginMask() {
            const pw = document.getElementById('login-password');
            if (!pw) return;
            let ok = false;
            try { ok = !!(window.CSS && CSS.supports && (CSS.supports('-webkit-text-security', 'disc') || CSS.supports('text-security', 'disc'))); } catch (e) { ok = false; }
            if (ok) pw.classList.add('pc-masked');
            else { pw.type = 'password'; pw.removeAttribute('data-pc-mask'); }   // ไม่รองรับ : ซ่อนด้วย type=password ตามเดิม
        })();
        function togglePasswordVisibility(inputId, iconId) {
            const input = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            if (!input || !icon) return;
            
            if (input.dataset && input.dataset.pcMask) {   // [v98] ช่อง type=tel : สลับซ่อน/แสดงด้วย CSS
                const masked = input.classList.toggle('pc-masked');
                icon.classList.toggle('fa-eye', masked);
                icon.classList.toggle('fa-eye-slash', !masked);
                return;
            }
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
		

		// ==========================================
        // ระบบ Notification & Indicator
        // ==========================================
        let bellSettings = { soundOn: true, loop: true, volume: 0.5 };
        let lastInboxCount = 0;
        let _lastRoomTracker = '';
        let _lastUserTracker = '';

        function loadBellSettings() {
            const saved = localStorage.getItem('bellSettings');
            if (saved) {
                bellSettings = JSON.parse(saved);
                // ป้องกันบั๊กค่า volume เป็น String
                bellSettings.volume = parseFloat(bellSettings.volume) || 0.5;
            }
            
            const audio = document.getElementById('notification-audio');
            if (audio) { 
                audio.volume = bellSettings.volume; 
                audio.loop = bellSettings.loop; 
            }
            
            if(document.getElementById('setting-sound-on')) document.getElementById('setting-sound-on').checked = bellSettings.soundOn;
            if(document.getElementById('setting-sound-loop')) document.getElementById('setting-sound-loop').checked = bellSettings.loop;
            if(document.getElementById('setting-sound-volume')) document.getElementById('setting-sound-volume').value = bellSettings.volume;
            if(document.getElementById('volume-label')) document.getElementById('volume-label').innerText = Math.round(bellSettings.volume * 100) + '%';
        }

        function saveBellSettings() {
            bellSettings.soundOn = document.getElementById('setting-sound-on').checked;
            bellSettings.loop = document.getElementById('setting-sound-loop').checked;
            // บังคับแปลงค่าจาก Slider ให้เป็นตัวเลขทศนิยม (Float) เบราว์เซอร์ถึงจะยอมรับ
            bellSettings.volume = parseFloat(document.getElementById('setting-sound-volume').value);
            document.getElementById('volume-label').innerText = Math.round(bellSettings.volume * 100) + '%';
            
            const audio = document.getElementById('notification-audio');
            if(audio) { 
                audio.volume = bellSettings.volume; 
                audio.loop = bellSettings.loop; 
            }
            localStorage.setItem('bellSettings', JSON.stringify(bellSettings));
        }

        function openBellSettings(e) {
            e.preventDefault(); 
            loadBellSettings();
            const modal = document.getElementById('bell-settings-modal');
            modal.classList.remove('hidden'); modal.classList.add('flex');
        }

        function closeBellSettings(e) {
            if (e) e.stopPropagation();
            const modal = document.getElementById('bell-settings-modal');
            modal.classList.remove('flex'); modal.classList.add('hidden');
        }

        function testNotificationSound() {
            const audio = document.getElementById('notification-audio');
            if (audio) {
                // ดึงค่า volume ปัจจุบันจากหลอดเลื่อนมาเทสทันที
                audio.volume = parseFloat(document.getElementById('setting-sound-volume').value) || 0.5;
                audio.currentTime = 0;
                audio.play().catch(e => {
                    Swal.fire('ข้อผิดพลาด', 'เบราว์เซอร์บล็อกเสียง กรุณาคลิกพื้นที่ว่าง 1 ครั้งเพื่ออนุญาตระบบเสียง', 'error');
                });
            }
        }

        function handleBellClick() {
            stopNotificationSound();
            switchTab('inbox'); 
        }

        function stopNotificationSound() {
            const audio = document.getElementById('notification-audio');
            if(audio) { audio.pause(); audio.currentTime = 0; }
            const bellIcon = document.querySelector('#nav-bell-container i');
            // ลบคลาสสั่นออก เพื่อให้หยุดสั่น
            if(bellIcon) bellIcon.classList.remove('fa-shake', 'text-amber-500');
        }

        const _inboxSeen = new Set();                 // [v33 ข้อ 1] หนังสือในกล่องเข้าที่แจ้งเตือนไปแล้วในรอบการใช้งานนี้
        function updateNotificationBadges(count, ids) {
            const tabBadge = document.getElementById('inbox-tab-badge');
            const bellBadge = document.getElementById('nav-bell-badge');

            const currentRoomEl = document.getElementById('banner-room-name');
            const roomName = currentRoomEl ? currentRoomEl.innerText.trim() : '';
            const currentUser = state.user ? state.user.id : '';

            // 1. รีเซ็ตตัวนับ หากมีการเปลี่ยน User ล็อกอิน หรือสลับห้อง
            if (_lastUserTracker !== currentUser) _inboxSeen.clear();
            if (_lastRoomTracker !== roomName || _lastUserTracker !== currentUser) {
                lastInboxCount = 0;
                _lastRoomTracker = roomName;
                _lastUserTracker = currentUser;
            }
            // [v33 ข้อ 1] มีรายชื่อหนังสือ -> ดังเฉพาะเมื่อมีฉบับที่ยังไม่เคยแจ้ง (สลับห้องแล้วเจอฉบับเดิมไม่ดังซ้ำ)
            let hasNew = count > lastInboxCount;
            if (Array.isArray(ids)) {
                hasNew = ids.some(id => !_inboxSeen.has(id));
                ids.forEach(id => _inboxSeen.add(id));
            }

            // 2. ปิดเสียงเตือนอัตโนมัติสำหรับ "ธุรการกลาง" (ไม่ให้รำคาญตัวเองเวลาอัปงาน)
            const isAdministrative = (state.user.role === 'Administrative');

            if (count > 0) {
                if (tabBadge) { tabBadge.innerText = count; tabBadge.classList.remove('hidden'); }
                if (bellBadge) { bellBadge.innerText = count; bellBadge.classList.remove('hidden'); }
                
                // 3. เงื่อนไขกระดิ่งดัง: ยอดใหม่ > ยอดเดิม + เปิดเสียงไว้ + ไม่ใช่ธุรการกลาง
                if (hasNew && bellSettings.soundOn && !isAdministrative) {
                    const audio = document.getElementById('notification-audio');
                    if (audio) {
                        audio.currentTime = 0;
                        audio.play().catch(e => console.warn('Auto-play blocked:', e));
                    }
                    const bellIcon = document.querySelector('#nav-bell-container i');
                    // เพิ่มคลาสให้กระดิ่งสั่น
                    if (bellIcon) bellIcon.classList.add('fa-shake', 'text-amber-500');
                }
            } else {
                if (tabBadge) tabBadge.classList.add('hidden');
                if (bellBadge) bellBadge.classList.add('hidden');
                stopNotificationSound();
            }
            lastInboxCount = count;
        }

        // ปลดล็อคเสียงอัตโนมัติเมื่อมีการคลิกเมาส์ครั้งแรกบนหน้าจอ (เลี่ยงข้อห้าม Autoplay ของ Chrome/Safari)
        document.body.addEventListener('click', function unlockAudioContext() {
            const audio = document.getElementById('notification-audio');
            if (audio) {
                audio.muted = true;                        // [v33 ข้อ 1] ปลดล็อกแบบไม่มีเสียง
                audio.play().then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.muted = false;
                }).catch(e => { audio.muted = false; });
            }
            document.body.removeEventListener('click', unlockAudioContext);
        }, { once: true });

        // เริ่มต้นการโหลดค่าเมื่อเปิดระบบ
        window.addEventListener('DOMContentLoaded', loadBellSettings);
		
		
		// ==========================================
        // ระบบ Notification & Indicator ปฏิทิน
        // ==========================================
        let calSettings = { soundOn: true, loop: true, volume: 0.5 };
        let lastCalCount = 0;

        function loadCalendarSettings() {
            const saved = localStorage.getItem('calSettings');
            if (saved) {
                calSettings = JSON.parse(saved);
                calSettings.volume = parseFloat(calSettings.volume) || 0.5;
            }
            const audio = document.getElementById('calendar-audio');
            if (audio) { 
                audio.volume = calSettings.volume; 
                audio.loop = calSettings.loop; 
            }
            if(document.getElementById('setting-cal-sound-on')) document.getElementById('setting-cal-sound-on').checked = calSettings.soundOn;
            if(document.getElementById('setting-cal-sound-loop')) document.getElementById('setting-cal-sound-loop').checked = calSettings.loop;
            if(document.getElementById('setting-cal-sound-volume')) document.getElementById('setting-cal-sound-volume').value = calSettings.volume;
            if(document.getElementById('cal-volume-label')) document.getElementById('cal-volume-label').innerText = Math.round(calSettings.volume * 100) + '%';
        }

        function saveCalendarSettings() {
            calSettings.soundOn = document.getElementById('setting-cal-sound-on').checked;
            calSettings.loop = document.getElementById('setting-cal-sound-loop').checked;
            calSettings.volume = parseFloat(document.getElementById('setting-cal-sound-volume').value);
            document.getElementById('cal-volume-label').innerText = Math.round(calSettings.volume * 100) + '%';
            
            const audio = document.getElementById('calendar-audio');
            if(audio) { 
                audio.volume = calSettings.volume; 
                audio.loop = calSettings.loop; 
            }
            localStorage.setItem('calSettings', JSON.stringify(calSettings));
        }

        function openCalendarSettings(e) {
            e.preventDefault(); 
            loadCalendarSettings();
            const modal = document.getElementById('calendar-settings-modal');
            modal.classList.remove('hidden'); modal.classList.add('flex');
        }

        function closeCalendarSettings(e) {
            if (e) e.stopPropagation();
            const modal = document.getElementById('calendar-settings-modal');
            modal.classList.remove('flex'); modal.classList.add('hidden');
        }

        function testCalendarSound() {
            const audio = document.getElementById('calendar-audio');
            if (audio) {
                audio.volume = parseFloat(document.getElementById('setting-cal-sound-volume').value) || 0.5;
                audio.currentTime = 0;
                audio.play().catch(e => {
                    Swal.fire('ข้อผิดพลาด', 'เบราว์เซอร์บล็อกเสียงปฏิทิน กรุณาคลิกพื้นที่ว่าง 1 ครั้ง', 'error');
                });
            }
        }

        function handleCalendarClick() {
            stopCalendarSound();
            switchTab('calendar'); 
        }

        function stopCalendarSound() {
            const audio = document.getElementById('calendar-audio');
            if(audio) { audio.pause(); audio.currentTime = 0; }
            
            // รีเซ็ตคลาสกลับเป็นรูปแบบปกติ (เอาสีเขียวและ fade ออก)
            const calIcon = document.querySelector('#nav-calendar-container i');
            if(calIcon) {
                calIcon.className = 'fa-solid fa-calendar-days text-xl text-slate-500 hover:text-emerald-500 transition';
                calIcon.style.color = '';
            }
        }

        function updateCalendarBadges(count) {
            const tabBadge = document.getElementById('calendar-tab-badge');
            const navBadge = document.getElementById('nav-calendar-badge');
            
            if (count > 0) {
                if (tabBadge) { tabBadge.innerText = count; tabBadge.classList.remove('hidden'); }
                if (navBadge) { navBadge.innerText = count; navBadge.classList.remove('hidden'); }
                
                // หากมียอดแจ้งเตือนวันนี้ (และยอดใหม่) + เปิดเสียงไว้
                if (count > lastCalCount && calSettings.soundOn) {
                    const audio = document.getElementById('calendar-audio');
                    if (audio) {
                        audio.currentTime = 0;
                        audio.play().catch(e => console.warn('Auto-play blocked:', e));
                    }
                    const calIcon = document.querySelector('#nav-calendar-container i');
                    if (calIcon) {
                        // เปลี่ยนเป็นไอคอน fade พร้อมสี rgb(99, 230, 190) ตามต้องการ
                        calIcon.className = 'fa-solid fa-calendar-days fa-fade text-xl';
                        calIcon.style.color = 'rgb(99, 230, 190)';
                    }
                }
            } else {
                if (tabBadge) tabBadge.classList.add('hidden');
                if (navBadge) navBadge.classList.add('hidden');
                stopCalendarSound();
            }
            lastCalCount = count;
        }

        // ปลดล็อคเสียงอัตโนมัติ (คลุมดำแก้ของเดิม ให้รองรับเสียงทั้ง 2 ตัวพร้อมกัน)
        document.body.addEventListener('click', function unlockAudioContext() {
            const audioBell = document.getElementById('notification-audio');
            const audioCal = document.getElementById('calendar-audio');
            
            // [v33 ข้อ 1] เดิมเล่นเสียงจริงแล้วค่อยหยุด -> คลิกแรก (มักเป็นปุ่ม "เข้าสู่ระบบ") มีเสียงกระดิ่ง/ปฏิทินดังแวบหนึ่ง
            //             แก้ : ปลดล็อกแบบปิดเสียง (muted) ผู้ใช้ไม่ได้ยิน แต่เบราว์เซอร์ยังอนุญาตให้เสียงแจ้งเตือนดังได้ภายหลัง
            [audioBell, audioCal].forEach(a => {
                if (!a) return;
                a.muted = true;
                a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
            });
            document.body.removeEventListener('click', unlockAudioContext);
        }, { once: true });

        // เริ่มต้นการโหลดค่าเมื่อเปิดระบบ (เพิ่ม loadCalendarSettings ต่อท้าย loadBellSettings)
        window.addEventListener('DOMContentLoaded', () => {
            if(typeof loadBellSettings === 'function') loadBellSettings();
            loadCalendarSettings();
        });
		
		// ==========================================
        // ฟังก์ชันระบบประกาศและกิจกรรม (คัดลอกจาก Schoolwork)
        // ==========================================
        function formatThaiDate(sqlDateStr) {
            if (!sqlDateStr) return '';
            const d = new Date(sqlDateStr);
            if (isNaN(d.getTime())) return sqlDateStr;
            const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
        }

        function openCreateAnnouncement() {
            const formEl = document.getElementById('form-create-announcement');
            formEl.reset();
            delete formEl.dataset.editId;
            const toggle = document.getElementById('toggle-announce-media');
            if (toggle) { toggle.checked = false; toggleAnnounceMediaView(); }
            // [ข้อ 14] เติมกลุ่มงาน + ชื่อผู้แจ้ง จากบัญชีผู้ใช้ปัจจุบันให้อัตโนมัติ (แก้ไขทับได้)
            const gEl = document.getElementById('announce-group');
            const rEl = document.getElementById('announce-reporter');
            if (gEl) gEl.value = (state.user.groups && state.user.groups[0]) || state.user.group || (document.getElementById('banner-room-name')?.innerText || '');
            if (rEl) rEl.value = state.user.name || state.user.id || '';
            document.getElementById('modal-announcement').classList.remove('hidden');
        }

        function toggleAnnounceMediaView() {
            const isFileMode = document.getElementById('toggle-announce-media').checked;
            document.getElementById('announce-link-mode').classList.toggle('hidden', isFileMode);
            document.getElementById('announce-file-mode').classList.toggle('hidden', !isFileMode);
            document.getElementById('icon-ann-link').className = isFileMode ? "fa-solid fa-link text-slate-400 mr-2 text-sm transition-colors" : "fa-solid fa-link text-blue-600 mr-2 text-sm transition-colors";
            document.getElementById('icon-ann-file').className = isFileMode ? "fa-solid fa-file-arrow-up text-blue-600 ml-2 text-sm transition-colors" : "fa-solid fa-file-arrow-up text-slate-400 ml-2 text-sm transition-colors";
        }

        async function handleCreateAnnouncement(e) {
            e.preventDefault();
            const formEl = document.getElementById('form-create-announcement');
            const editId = formEl.dataset.editId;
            const isEdit = !!editId;

            const title = document.getElementById('announce-title').value.trim();
            const desc = document.getElementById('announce-desc').value.trim();
            let imgUrl = document.getElementById('announce-img-url').value.trim();
            let videoUrl = document.getElementById('announce-video-url').value.trim();
            let fileUrl = document.getElementById('announce-file-url').value.trim();
            let linkUrl = document.getElementById('announce-link-url').value.trim();
            
            const mediaData = { desc, imgUrl, videoUrl, fileUrl, linkUrl };

            // อัปเดต State จำลอง (ระบบจริงต้องยิง API)
            if (isEdit) {
                const target = state.assignments.find(a => a.AssignmentID === editId);
                if (target) {
                    target.Title = title;
                    target.Instructions = JSON.stringify(mediaData);
                }
                Swal.fire({ icon: 'success', title: 'อัปเดตประกาศแล้ว', showConfirmButton: false, timer: 1500 });
            } else {
                const newAnnounce = {
                    AssignmentID: 'ANN_' + Date.now(),
                    Category: '📌 ประกาศสำคัญ',
                    Title: title,
                    Instructions: JSON.stringify(mediaData),
                    isNotified: true,
                    isHidden: false,
                    comments: [],
                    CreatedAt: new Date().toISOString()
                };
                state.assignments.unshift(newAnnounce);
                Swal.fire({ icon: 'success', title: 'เผยแพร่ประกาศแล้ว', showConfirmButton: false, timer: 1500 });
            }
            
            document.getElementById('modal-announcement').classList.add('hidden');
            renderAssignmentsList();
        }

        function editAnnouncement(id) {
            const target = state.assignments.find(a => a.AssignmentID === id);
            if (!target) return;
            let media = { desc: '', imgUrl: '', videoUrl: '', fileUrl: '', linkUrl: '' };
            try { media = JSON.parse(target.Instructions); } catch(e) { media.desc = target.Instructions; }

            const toggle = document.getElementById('toggle-announce-media');
            if (toggle) { toggle.checked = false; toggleAnnounceMediaView(); }

            document.getElementById('announce-title').value = target.Title || '';
            document.getElementById('announce-desc').value = media.desc || '';
            document.getElementById('announce-img-url').value = media.imgUrl || '';
            document.getElementById('announce-video-url').value = media.videoUrl || '';
            document.getElementById('announce-file-url').value = media.fileUrl || '';
            document.getElementById('announce-link-url').value = media.linkUrl || '';

            // [ข้อ 14] เติมกลุ่มงาน + ชื่อผู้แจ้ง (รองรับประกาศเก่าที่ยังไม่มีข้อมูลนี้)
            const gEl2 = document.getElementById('announce-group');
            const rEl2 = document.getElementById('announce-reporter');
            if (gEl2) gEl2.value = target.Group || media.group || '';
            if (rEl2) rEl2.value = target.Reporter || media.reporter || target.CreatedByName || '';

            document.getElementById('form-create-announcement').dataset.editId = id;
            document.getElementById('modal-announcement').classList.remove('hidden');
        }

        function deleteAnnouncement(id) {
            Swal.fire({
                title: 'ยืนยันการลบ?',
                text: "ประกาศนี้จะถูกลบออก",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#e11d48',
                confirmButtonText: 'ใช่, ลบเลย'
            }).then((result) => {
                if (result.isConfirmed) {
                    state.assignments = state.assignments.filter(a => a.AssignmentID !== id);
                    renderAssignmentsList();
                    Swal.fire({ icon: 'success', title: "ลบสำเร็จ", showConfirmButton: false, timer: 1000 });
                }
            });
        }
		
		
		// ฟังก์ชันสำหรับปักหมุดประกาศ
        function togglePinAssignment(assignId) { 
            const target = state.assignments.find(a => a.AssignmentID === assignId);
            if (!target) return;
            
            target.isPinned = !target.isPinned;
            renderAssignmentsList(); // อัปเดตหน้าจอทันทีเพื่อดันขึ้นบนสุด
            
            // สั่งยิง API บันทึกข้อมูลปักหมุดลงระบบเบื้องหลัง
            apiPost({
                action: 'updateAssignmentStatus',
                assignmentId: assignId,
                options: JSON.stringify({ isPinned: target.isPinned, isHidden: target.isHidden || false })
            });

            Toast.fire({ icon: 'success', title: target.isPinned ? '📌 ปักหมุดประกาศไว้บนสุดแล้ว' : 'ยกเลิกการปักหมุดแล้ว' });
        }
		
		

        function toggleHideAnnouncement(id) {
            const target = state.assignments.find(a => a.AssignmentID === id);
            if (!target) return;
            target.isHidden = !target.isHidden;
            renderAssignmentsList();
        }

        function viewAnnouncementImage(imgUrl) {
            Swal.fire({ imageUrl: imgUrl, imageAlt: 'รูปภาพประกอบประกาศ', showConfirmButton: true, confirmButtonText: 'ปิดหน้าต่าง', confirmButtonColor: '#007AFF', customClass: { popup: 'announcement-image-modal' } });
        }
// ฟังก์ชันเปิดโมดอลเล่นคลิป YouTube ขนาดใหญ่พร้อมปุ่มดาวน์โหลดข้อมูลวิดีโอ
function openYouTubeModal(videoId) {
    /* [v50] ข้อผิดพลาด 153 ของ YouTube : ตัวเล่นฝังต้องได้รับ Referer ของหน้าที่ฝัง ซึ่งกรอบฝังของ Google Sites / Apps Script ไม่ให้
       -> ถ้าแอปอยู่ใน iframe แสดงภาพปกพร้อมปุ่มเปิดใน YouTube (แท็บใหม่/แอป YouTube) ก่อน และมีปุ่มลองเล่นในหน้านี้
       -> ถ้าเปิดตรง ๆ ในแท็บ เล่นในหน้าเหมือนเดิม */
    const id = encodeURIComponent(videoId);
    const org = (location.origin && location.origin !== 'null') ? location.origin : '';
    const embedSrc = 'https:/\/www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0'
        + (org ? '&origin=' + encodeURIComponent(org) + '&widget_referrer=' + encodeURIComponent(location.href.split('#')[0]) : '');
    const watchUrl = 'https:/\/www.youtube.com/watch?v=' + id;
    const player = () => '<div class="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-inner"><iframe class="w-full h-full" src="' + embedSrc + '" referrerpolicy="strict-origin-when-cross-origin" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
    const embedded = window.self !== window.top;
    window.pcYtTry = function () {
        const box = document.getElementById('pc-yt-box');
        if (box) box.innerHTML = player() + '<div style="margin-top:8px;font-size:11.5px;color:#64748b">ถ้าขึ้นข้อผิดพลาด กดปุ่ม "เล่นใน YouTube" ด้านล่าง</div>';
    };
    const cover = '<div class="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-inner" style="position:relative">'
        + '<img src="https:/\/i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="" style="width:100%;height:100%;object-fit:cover;opacity:.85">'
        + '<a href="' + watchUrl + '" target="_blank" rel="noopener" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-decoration:none">'
        + '<span style="display:flex;align-items:center;gap:10px;background:#ef4444;color:#fff;padding:12px 22px;border-radius:999px;font-weight:800;font-size:16px;box-shadow:0 8px 24px rgba(0,0,0,.4)"><i class="fa-brands fa-youtube" style="font-size:24px"></i> เล่นใน YouTube</span></a></div>'
        + '<div style="margin-top:8px;font-size:11.5px;color:#64748b">แตะปุ่มสีแดงเพื่อเปิดวิดีโอใน YouTube · <a href="javascript:void(0)" onclick="pcYtTry()" style="color:#2563eb;font-weight:700">ลองเล่นในหน้านี้</a></div>';
    Swal.fire({
        html: '<div id="pc-yt-box">' + (embedded ? cover : player()) + '</div>',
        showConfirmButton: true,
        confirmButtonText: '<i class="fa-solid fa-up-right-from-square mr-1"></i> ดูใน YouTube',
        confirmButtonColor: '#007AFF',
        showCancelButton: true,
        cancelButtonText: 'ปิดหน้าต่าง',
        customClass: {
            popup: 'youtube-fullscreen-modal',     // เรียกใช้ CSS ขยายเต็มจอ
            htmlContainer: 'youtube-html-content'  // เรียกใช้ CSS ลดขอบ
        }
    }).then((result) => {
        if (result.isConfirmed) window.open(watchUrl, '_blank');
    });
}

// ==========================================
        // ระบบเรนเดอร์หน้ากิจกรรมและประกาศ
        // ==========================================
        function renderAssignmentsList() {
            const list = document.getElementById('assignments-list');
            if(!list) return;
            list.innerHTML = '';
            
            // ถ้าไม่มีประกาศในระบบเลย ให้แสดงหน้าต้อนรับ
            if (state.assignments.length === 0) {
                const roomName = document.getElementById('banner-room-name').innerText || 'ชื่อห้อง';
                list.innerHTML = `
                    <div class="bg-white rounded-3xl p-8 sm:p-12 text-center border border-slate-200/80 shadow-sm flex flex-col items-center justify-center mt-4">
                        <div class="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center text-4xl mb-5 shadow-inner">
                            <i class="fa-solid fa-chalkboard-user"></i>
                        </div>
                        <h3 class="text-xl sm:text-2xl font-bold text-slate-800 mb-3">ยินดีต้อนรับเข้าสู่ห้อง</h3>
                        <div class="text-sm sm:text-base text-slate-600 bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100">
                            <span class="font-bold text-blue-600">${roomName}</span>
                        </div>
                        <p class="text-xs text-slate-400 mt-6 font-medium"><i class="fa-solid fa-circle-info mr-1"></i> ขณะนี้ยังไม่มีรายการประกาศหรือกิจกรรม</p>
                    </div>`;
                return;
            }

            let visibleAssigns = state.assignments.filter(a => {
                if (a.isHidden && !state.showHiddenAnnouncements) return false;
                return true;
            });

            // 🌟 1. ระบบเรียงลำดับ: ดันประกาศที่ "ปักหมุด" ขึ้นบนสุดเสมอ ตามด้วยเวลาล่าสุด
            visibleAssigns.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return new Date(b.CreatedAt) < new Date(a.CreatedAt) ? 1 : -1;
            });

            let assignsHTML = '';
            let visibleCount = 0;

            visibleAssigns.forEach(a => {
                visibleCount++;
                
                let displayDesc = (a.Instructions || '').trim();
                let mediaHTML = '';
                
                // ตรวจสอบและแปลงโครงสร้างสื่อ (รูปภาพ/วิดีโอ/ลิงก์)
                if (displayDesc.startsWith('{')) {
                    try {
                        let safeJson = displayDesc.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
                        const media = JSON.parse(safeJson);
                        displayDesc = media.desc || ''; 
                        
                        let imgUrl = media.imgUrl || '';
                        if (imgUrl.includes('drive.google.com/file/d/')) {
                            const match = imgUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                            if (match && match[1]) imgUrl = `https:/\/lh3.googleusercontent.com/d/${match[1]}`;
                        }

                        if (imgUrl) {
                            mediaHTML += `<div class="mt-3 max-w-md rounded-xl overflow-hidden border border-slate-100 shadow-sm bg-black flex justify-center items-center"><img src="${imgUrl}" class="max-h-60 w-full object-contain cursor-pointer transition hover:scale-105" onclick="viewAnnouncementImage('${imgUrl}')"></div>`;
                        }
                        if (media.videoUrl) {
                            const ytMatch = media.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
                            if (ytMatch && ytMatch[1]) {
                                mediaHTML += `<div onclick="openYouTubeModal('${ytMatch[1]}')" class="mt-3 max-w-md aspect-video rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-black relative cursor-pointer group"><img src="https:/\/img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg" class="w-full h-full object-cover opacity-80 group-hover:opacity-100"><div class="absolute inset-0 flex items-center justify-center"><div class="w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition"><i class="fa-solid fa-play ml-1"></i></div></div></div>`;
                            } else {
                                mediaHTML += `<a href="${media.videoUrl}" target="_blank" class="mt-3 inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm"><i class="fa-brands fa-youtube text-sm"></i> เปิดดูวิดีโอ</a>`;
                            }
                        }
                        if (media.fileUrl || media.linkUrl) {
                            mediaHTML += `<div class="mt-3 flex flex-wrap gap-2">`;
                            if (media.fileUrl) mediaHTML += `<a href="${media.fileUrl}" target="_blank" class="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm"><i class="fa-solid fa-file-pdf text-red-500 text-sm"></i> เปิดไฟล์แนบ</a>`;
                            if (media.linkUrl) mediaHTML += `<a href="${media.linkUrl}" target="_blank" class="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm"><i class="fa-solid fa-link text-sm"></i> เปิดลิงก์ภายนอก</a>`;
                            mediaHTML += `</div>`;
                        }
                    } catch (e) { console.error("Media parsing error:", e); }
                }

                // [ข้อ 14] อ่านกลุ่มงาน/ผู้แจ้ง (รองรับทั้งคอลัมน์ใหม่ และประกาศเก่าที่เก็บไว้ใน Instructions)
                let annGroup = a.Group || '';
                let annReporter = a.Reporter || '';
                if ((!annGroup || !annReporter) && (a.Instructions || '').trim().startsWith('{')) {
                    try {
                        const _m = JSON.parse((a.Instructions || '').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"));
                        annGroup = annGroup || _m.group || '';
                        annReporter = annReporter || _m.reporter || '';
                    } catch (e) { /* ข้าม */ }
                }
                if (!annReporter) annReporter = a.CreatedByName || '';

                const isAdmin = ['ADMIN', 'Director', 'SubdirectorGroup', 'AdminGroup', 'AssistantGroup'].includes(state.user.role);
                
                // ปุ่มแก้ไข และ ลบ
                const announceActionBtns = isAdmin ? `
                    <div class="flex items-center gap-1.5 ml-2">
                        <button onclick="editAnnouncement('${a.AssignmentID}')" class="text-[10px] bg-amber-50 text-amber-600 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 shadow-sm transition"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteAnnouncement('${a.AssignmentID}')" class="text-[10px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 shadow-sm transition"><i class="fa-solid fa-trash"></i></button>
                    </div>
                ` : '';

                // 🌟 ปุ่มปักหมุดประกาศ
                const pinBtnStyle = a.isPinned ? 'text-amber-700 bg-amber-100 border-amber-300 hover:bg-amber-200' : 'text-slate-500 bg-white border-slate-200 hover:bg-slate-50';
                const btnPinHTML = isAdmin ? `<button onclick="togglePinAssignment('${a.AssignmentID}')" class="text-[10px] ${pinBtnStyle} font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition shadow-sm"><i class="fa-solid fa-thumbtack ${a.isPinned ? 'text-amber-600 rotate-45' : ''}"></i><span class="hidden sm:inline">${a.isPinned ? 'ปักหมุดแล้ว' : 'ปักหมุด'}</span></button>` : '';

                // ปุ่มซ่อนประกาศ
                const hideBtnStyle = a.isHidden ? 'text-slate-500 bg-slate-100 border-slate-300' : 'text-slate-500 bg-white border-slate-200 hover:bg-slate-50';
                const btnHideHTML = isAdmin ? `<button onclick="toggleHideAnnouncement('${a.AssignmentID}')" class="text-[10px] ${hideBtnStyle} font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition shadow-sm"><i class="fa-solid ${a.isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i><span class="hidden sm:inline">${a.isHidden ? 'ยกเลิกซ่อน' : 'ซ่อน'}</span></button>` : '';

                // ===============================================
                // จัดการโครงสร้างคอมเมนต์ (แยกล่าสุด 1 รายการไว้ข้างนอก ที่เหลือพับเก็บ)
                // ===============================================
                const comments = a.comments || [];
                const uniqueUID = `${a.AssignmentID}_announcement`;
                const mainComments = comments.filter(c => !c.ParentCommentID);
                const replyComments = comments.filter(c => c.ParentCommentID);
                
                let visibleMain = [];
                let collapsedMain = [];

                // 🌟 ดึงคอมเมนต์ล่าสุด 1 รายการมาแสดงด้านนอก ส่วนที่เก่ากว่าจับยัดลงปุ่ม Dropdown
                if (mainComments.length > 1) {
                    collapsedMain = mainComments.slice(0, mainComments.length - 1);
                    visibleMain = [mainComments[mainComments.length - 1]];
                } else {
                    visibleMain = mainComments;
                }

                const myEmail = state.user.email || '';
                const visibleHTML = visibleMain.map(mc => buildCommentTree(mc, replyComments, myEmail, a.AssignmentID)).join('');
                const collapsedHTML = collapsedMain.map(mc => buildCommentTree(mc, replyComments, myEmail, a.AssignmentID)).join('');

                // 🌟 สร้างปุ่ม Dropdown แบบโค้งมนตามรูปภาพแนบ
                let collapsedCommentsBlock = '';
                if (collapsedMain.length > 0) {
                    collapsedCommentsBlock = `
                        <details class="group/other-comments mb-3">
                            <summary class="cursor-pointer text-[11px] font-bold text-slate-500 hover:text-slate-700 list-none flex items-center gap-1.5 transition select-none bg-slate-50 hover:bg-slate-100 px-3.5 py-1.5 rounded-full w-max border border-slate-200 shadow-sm">
                                <i class="fa-regular fa-comments"></i> ดูความคิดเห็นอื่นๆ (${collapsedMain.length} รายการ)
                                <i class="fa-solid fa-chevron-down text-[9px] group-open/other-comments:rotate-180 transition-transform ml-1"></i>
                            </summary>
                            <div class="pt-3 border-l-2 border-slate-200 ml-4 pl-4 space-y-3 mt-3">
                                ${collapsedHTML}
                            </div>
                        </details>
                    `;
                }

                // สร้างหน้าตาการ์ดกิจกรรม
                assignsHTML += `
                <div class="rounded-2xl border border-slate-200 transition mb-3 bg-white shadow-sm hover:shadow-md mx-1">
                    <div class="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100/60">
                        <div class="flex items-start gap-3 w-full overflow-hidden">
                            <div class="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0 mt-0.5 shadow-sm">
                                <i class="fa-solid fa-bullhorn"></i>
                            </div>
                            <div class="w-full overflow-hidden">
                                <div class="flex flex-wrap items-center gap-2 mb-1">
                                    <h4 class="text-sm sm:text-base font-bold text-slate-900">${a.Title}</h4>
                                    ${announceActionBtns}
                                </div>
                                <!-- [ข้อ 14] แสดงกลุ่มงาน + ชื่อผู้แจ้ง -->
                                ${(annGroup || annReporter) ? `<div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    ${annGroup ? `<span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full"><i class="fa-solid fa-sitemap mr-1"></i>${annGroup}</span>` : ''}
                                    ${annReporter ? `<span class="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-user-pen mr-1"></i>ผู้แจ้ง: ${annReporter}</span>` : ''}
                                </div>` : ''}
                                <div class="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">${displayDesc}</div>
                                ${mediaHTML} 
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1.5 flex-shrink-0 mt-2 sm:mt-0">
                            <div class="flex items-center gap-1.5">
                                ${btnPinHTML}
                                ${btnHideHTML}
                            </div>
                            <span class="text-[10px] text-slate-400 font-medium mt-1">ประกาศเมื่อ ${formatThaiDate(a.CreatedAt).split('เวลา')[0].trim()}</span>
                        </div>
                    </div>
                    
                    <div class="p-4 sm:p-5 bg-slate-50/50 rounded-b-2xl">
                        ${collapsedCommentsBlock}
                        ${visibleHTML ? `<div class="max-h-[400px] overflow-y-auto no-scrollbar mb-4">${visibleHTML}</div>` : ''}
                        
                        <div class="relative mt-2 pt-4 border-t border-slate-200/60">
                            <div id="mention-list-${uniqueUID}" class="hidden absolute bottom-full left-10 mb-2 w-56 max-h-40 overflow-y-auto bg-white border border-slate-200 shadow-xl rounded-xl z-50 divide-y divide-slate-50 text-left"></div>
                            
                            <form onsubmit="handleAddComment(event, '${a.AssignmentID}', '${uniqueUID}')" class="flex gap-2 relative items-center">
                                <img src="${state.user.image || 'https:/\/cdn-icons-png.flaticon.com/512/3135/3135715.png'}" class="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-sm shrink-0">
                                <div class="relative flex-1">
                                    <input type="text" id="comment-input-${uniqueUID}" required placeholder="เพิ่มความคิดเห็นในชั้นเรียน (พิมพ์ @ เพื่อกล่าวถึง)..." autocomplete="off"
                                        oninput="handleMentionInput(event, '${uniqueUID}')"
                                        class="w-full bg-white border border-slate-200 rounded-full pl-4 pr-16 py-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition shadow-sm">
                                    <button type="button" onclick="cancelReply('${uniqueUID}')" id="cancel-reply-${uniqueUID}" class="hidden absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-red-500 bg-slate-100 px-2.5 py-1 rounded-full font-bold">ยกเลิก</button>
                                </div>
                                <button type="submit" class="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition active:scale-95 shrink-0"><i class="fa-regular fa-paper-plane text-sm"></i></button>
                            </form>
                        </div>
                    </div>
                </div>`;
            });

            let toggleHiddenBtnHTML = '';
            if (['ADMIN', 'Director', 'SubdirectorGroup', 'AdminGroup', 'AssistantGroup'].includes(state.user.role)) {
                toggleHiddenBtnHTML = `
                    <button onclick="state.showHiddenAnnouncements = !state.showHiddenAnnouncements; renderAssignmentsList();" class="mr-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-full text-[11px] font-bold shadow-sm transition flex items-center gap-1.5">
                        <i class="fa-solid ${state.showHiddenAnnouncements ? 'fa-eye-slash' : 'fa-eye'} text-slate-500"></i>
                        ${state.showHiddenAnnouncements ? 'ซ่อนประกาศ' : 'ดูประกาศ'}
                    </button>
                `;
            }

            list.innerHTML = `
                <details class="group/cat mb-1.5" open>
                    <summary class="cursor-pointer list-none flex items-center justify-between bg-[#fff8e1] text-amber-900 border border-amber-200 px-4 py-3 rounded-2xl font-bold text-sm hover:brightness-95 transition mb-3 shadow-sm select-none">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-bullhorn text-amber-600 text-lg"></i>
                            <i class="fa-solid fa-thumbtack text-rose-500 rotate-45 text-xs"></i> 
                            ประกาศสำคัญ
                        </div>
                        <div class="flex items-center gap-2 opacity-95 text-xs">
                            ${toggleHiddenBtnHTML}
                            <span class="bg-white px-3 py-1 rounded-full font-bold text-slate-600 shadow-sm border border-slate-100">${visibleCount} รายการ</span>
                            <i class="fa-solid fa-chevron-down text-slate-500 ml-1 group-open/cat:rotate-180 transition-transform"></i>
                        </div>
                    </summary>
                    
                    <div class="pl-0 space-y-3">
                        ${assignsHTML}
                    </div>
                </details>
            `;
        }
		
		
		
		
		
	
        // ==========================================
        // ระบบความคิดเห็น (Comment, Mention, Reaction & Reply)
        // ==========================================
        
        function buildCommentTree(c, allReplies, userEmail, assignmentId) {
            const replies = allReplies.filter(r => r.ParentCommentID === c.CommentID);
            let repliesHTML = '';
            if (replies.length > 0) {
                // เส้นกิ่งสาขาย่อย (Branch Line)
                repliesHTML = `<div class="ml-9 mt-1 border-l-2 border-slate-300 pl-4 space-y-3 relative">` + 
                    replies.map(r => buildSingleComment(r, userEmail, assignmentId, true)).join('') + 
                    `</div>`;
            }
            return `<div class="mb-4">` + buildSingleComment(c, userEmail, assignmentId, false) + repliesHTML + `</div>`;
        }

        function buildSingleComment(c, userEmail, assignmentId, isReply) {
            let rx = {};
            try { rx = typeof c.Reactions === 'string' ? JSON.parse(c.Reactions) : (c.Reactions || {}); } catch(e) {}
            
            let rxCountHTML = '';
            let totalRx = 0;
            let uniqueTypes = [];
            
            for (let k in rx) { 
                if (Array.isArray(rx[k]) && rx[k].length > 0) { 
                    totalRx += rx[k].length; 
                    uniqueTypes.push(k); 
                } 
            }
            
            if (totalRx > 0) {
                const icons = uniqueTypes.slice(0,3).map(k => `<span class="-ml-1 text-[12px] drop-shadow-sm">${REACTION_EMOJIS[k]}</span>`).join('');
                rxCountHTML = `<div class="flex items-center ml-2 px-1.5 py-0.5 bg-slate-100 rounded-full text-[10px] border border-slate-200"><div class="flex pl-1">${icons}</div> <span class="text-slate-500 ml-1.5 font-bold">${totalRx}</span></div>`;
            }

            let msg = c.Message || "";
            // แปลงการกล่าวถึง (@) ให้เป็นตัวอักษรสีน้ำเงินพื้นหลังหนา
            msg = msg.replace(/(@All|@\S+)/g, '<span class="text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-md">$1</span>');

            return `
            <div id="comment-box-${c.CommentID}" class="flex items-start gap-3 ${isReply ? 'reply-branch-line' : ''}">
                <img src="${c.UserImage || 'https:/\/cdn-icons-png.flaticon.com/512/3135/3135715.png'}" class="w-8 h-8 rounded-full object-cover border border-slate-200 flex-shrink-0 z-10 mt-1 shadow-sm bg-white">
                <div class="relative max-w-[85%] w-full">
                    <div class="bg-slate-100/80 px-4 py-3 rounded-2xl rounded-tl-none relative border border-slate-100">
                        <div class="flex items-baseline gap-2 mb-1">
                            <span class="text-[12px] font-bold text-slate-800">${c.UserName}</span>
                            <span class="text-[10px] text-slate-400">${formatThaiDate(c.CreatedAt)}</span>
                        </div>
                        <div class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">${msg}</div>
                    </div>
                    
                    <div class="flex items-center mt-1.5 ml-1 text-[11px] font-bold text-slate-500">
                        <div class="relative reaction-container group flex items-center gap-3">
                            <button onclick="handleReaction('${assignmentId}', '${c.CommentID}', 'like')" class="hover:text-blue-600 transition">ถูกใจ</button>
                            <div class="reaction-menu absolute bg-white shadow-xl rounded-full px-2.5 py-1.5 flex gap-2 border border-slate-100 z-50">
                                ${Object.keys(REACTION_EMOJIS).map(k => 
                                    `<button type="button" onclick="handleReaction('${assignmentId}', '${c.CommentID}', '${k}')" class="hover:-translate-y-1 hover:scale-125 transition-all text-lg" title="${k}">${REACTION_EMOJIS[k]}</button>`
                                ).join('')}
                            </div>
                        </div>
                        ${!isReply ? `<button onclick="setReplyTo('${assignmentId}', '${c.CommentID}', '${c.UserName}')" class="ml-3 hover:text-blue-600 transition">ตอบกลับ</button>` : ''}
                        
                        ${rxCountHTML}
                    </div>
                </div>
            </div>
            `;
        }

        function handleReaction(assignmentId, commentId, reactionType) {
            const assign = state.assignments.find(a => a.AssignmentID === assignmentId);
            if (!assign) return;
            const comment = assign.comments.find(c => c.CommentID === commentId);
            if (!comment) return;

            let rx = {};
            try { rx = typeof comment.Reactions === 'string' ? JSON.parse(comment.Reactions) : (comment.Reactions || {}); } catch(e){} 

            const uEmail = state.user.email || 'user';
            if (!rx[reactionType]) rx[reactionType] = [];

            const idx = rx[reactionType].indexOf(uEmail);
            if (idx > -1) { 
                rx[reactionType].splice(idx, 1); 
            } else {
                for (let k in rx) {
                    const exIdx = rx[k].indexOf(uEmail);
                    if (exIdx > -1) rx[k].splice(exIdx, 1);
                }
                rx[reactionType].push(uEmail); 
            }

            comment.Reactions = JSON.stringify(rx);
            
            // รีเรนเดอร์เฉพาะกล่องข้อความที่มีการกด
            const box = document.getElementById(`comment-box-${commentId}`);
            if (box) {
                const isReply = !!comment.ParentCommentID;
                box.outerHTML = buildSingleComment(comment, state.user.email, assignmentId, isReply);
            }
        }

        function handleMentionInput(e, uniqueUID) {
            const val = e.target.value;
            const textBeforeCursor = val.substring(0, e.target.selectionStart);
            const mentionMatch = textBeforeCursor.match(/@(\S*)$/); 
            const listEl = document.getElementById(`mention-list-${uniqueUID}`);

            if (mentionMatch) {
                const searchTxt = mentionMatch[1].toLowerCase();
                
                let membersList = [{name: 'All', role: 'ทุกคนในชั้นเรียน', icon: 'fa-users text-blue-600'}];
                const members = state.activeClassMembers || [];
                members.forEach(m => membersList.push({name: m.Name, role: 'สมาชิก', icon: 'fa-user text-slate-400'}));

                const filtered = membersList.filter(m => m.name.toLowerCase().includes(searchTxt));

                if (filtered.length > 0) {
                    listEl.innerHTML = filtered.map(m => `
                        <div onclick="insertMention('${uniqueUID}', '${m.name}')" class="px-3 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center gap-3 transition shadow-sm">
                            <i class="fa-solid ${m.icon} bg-slate-100 w-7 h-7 flex items-center justify-center rounded-full text-[10px]"></i>
                            <div>
                                <div class="text-xs font-bold text-slate-800">${m.name}</div>
                                <div class="text-[9px] text-slate-400">${m.role}</div>
                            </div>
                        </div>
                    `).join('');
                    listEl.classList.remove('hidden');
                } else { listEl.classList.add('hidden'); }
            } else { listEl.classList.add('hidden'); }
        }

        function insertMention(uniqueUID, name) {
            const inputEl = document.getElementById(`comment-input-${uniqueUID}`);
            const textBeforeCursor = inputEl.value.substring(0, inputEl.selectionStart);
            const textAfterCursor = inputEl.value.substring(inputEl.selectionStart);
            const newTextBefore = textBeforeCursor.replace(/@\S*$/, `@${name} `);
            inputEl.value = newTextBefore + textAfterCursor;
            inputEl.focus();
            document.getElementById(`mention-list-${uniqueUID}`).classList.add('hidden');
        }

        function setReplyTo(assignmentId, commentId, userName) {
            state.replyingTo = { assignmentId, commentId };
            const uid = `${assignmentId}_announcement`;
            const input = document.getElementById(`comment-input-${uid}`);
            const cancelBtn = document.getElementById(`cancel-reply-${uid}`);
            
            if (input) {
                input.placeholder = `ตอบกลับ ${userName} (พิมพ์ @ชื่อ เพื่อกล่าวถึง)...`;
                input.value = `@${userName} `;
                input.focus();
            }
            if (cancelBtn) cancelBtn.classList.remove('hidden');
        }

        function cancelReply(uniqueUID) {
            state.replyingTo = {};
            const input = document.getElementById(`comment-input-${uniqueUID}`);
            const cancelBtn = document.getElementById(`cancel-reply-${uniqueUID}`);
            
            if (input) {
                input.placeholder = `เพิ่มความคิดเห็นในชั้นเรียน (พิมพ์ @ เพื่อกล่าวถึง)...`;
                input.value = '';
            }
            if (cancelBtn) cancelBtn.classList.add('hidden');
        }

        function handleAddComment(e, assignmentId, uniqueUID) {
            e.preventDefault();
            const uid = uniqueUID || `${assignmentId}_announcement`; 
            const inputEl = document.getElementById(`comment-input-${uid}`);
            const message = inputEl.value.trim();
            if (!message) return;

            const parentId = (state.replyingTo && state.replyingTo.assignmentId === assignmentId) ? state.replyingTo.commentId : "";

            const tempComment = {
                CommentID: "CMT_" + Date.now(),
                AssignmentID: assignmentId,
                ParentCommentID: parentId,
                UserEmail: state.user.email || '',
                UserName: state.user.name || state.user.title || 'ผู้ใช้งาน',
                UserImage: state.user.image || '',
                Message: message,
                CreatedAt: new Date().toISOString(),
                Reactions: "{}"
            };

            const assign = state.assignments.find(a => a.AssignmentID === assignmentId);
            if (!assign.comments) assign.comments = [];
            assign.comments.push(tempComment);

            inputEl.value = '';
            cancelReply(uid);
            renderAssignmentsList(); 
        }
		
		
		// ==========================================
        // [ข้อ 4] ลบฟังก์ชันซ้ำที่ไม่ได้บันทึกอะไรจริง (เดิมแค่ console.log)
        //        ตัวจริงที่บันทึกลง userForm.rooms / userForm.tabs อยู่ในสคริปต์ PC ด้านล่าง
        //        (window.openRoomAccessModal / window.openTabAccessModal)
        // ==========================================
		
		
		// ==========================================
        // ระบบจัดการผู้ใช้งาน (Edit / Delete)
        // ==========================================
        
        // 1. ฟังก์ชันแก้ไข (โยนข้อมูลเข้าฟอร์ม)
        function editUser(fname, lname, position, group, id, role, email) {
            // เติมข้อมูลลงช่อง Input
            document.getElementById('user-firstname').value = fname;
            document.getElementById('user-lastname').value = lname;
            document.getElementById('user-position').value = position;
            document.getElementById('user-group').value = group;
            document.getElementById('user-id').value = id;
            document.getElementById('user-role').value = role;
            document.getElementById('user-email').value = email;

            // เน้นสีฟอร์มให้ผู้ใช้รู้ว่ากำลังเข้าสู่โหมดแก้ไข
            const formContainer = document.getElementById('user-form-container');
            if (formContainer) {
                formContainer.classList.add('bg-blue-50', 'ring-2', 'ring-blue-300');
                
                // เลื่อนหน้าจอไปที่ฟอร์ม (มีประโยชน์มากเวลาเปิดผ่านมือถือ/แท็บเล็ต)
                formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // ถอดสีเน้นออกหลังจากผ่านไป 1.5 วินาที
                setTimeout(() => {
                    formContainer.classList.remove('bg-blue-50', 'ring-2', 'ring-blue-300');
                }, 1500);
            }
        }

        // 2. ฟังก์ชันลบข้อมูลผู้ใช้งาน
        function deleteUser(btnElement, userId) {
            Swal.fire({
                title: 'ยืนยันการลบผู้ใช้งาน?',
                text: `คุณต้องการลบผู้ใช้งานรหัส "${userId}" ออกจากระบบใช่หรือไม่ ข้อมูลทั้งหมดจะไม่สามารถกู้คืนได้`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444', // สีแดง
                cancelButtonColor: '#64748b',  // สีเทา
                confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> ใช่, ลบเลย',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    // หากกดตกลง ให้ค้นหา <tr> (แถวของตาราง) ที่ปุ่มนี้อาศัยอยู่ แล้วลบทิ้ง
                    const row = btnElement.closest('tr');
                    if (row) {
                        row.remove();
                    }
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'ลบผู้ใช้งานเรียบร้อย',
                        showConfirmButton: false,
                        timer: 1500
                    });
                }
            });
        }
		
		
		// ==========================================
        // ระบบแจ้งเตือนกิจกรรมของ "วันนี้"
        // ==========================================
        function updateCalendarBadge() {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth();
            const date = today.getDate();

            // ค้นหากิจกรรมที่ตรงกับวันที่ของวันนี้
            const todayEvents = state.calendarEvents.filter(e => {
                const eDate = new Date(e.startDate);
                return eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === date;
            });

            const count = todayEvents.length;
            const navBadge = document.getElementById('nav-calendar-badge');
            const tabBadge = document.getElementById('calendar-tab-badge');

            // อัปเดตตัวเลขและแสดง/ซ่อน Badge
            if (count > 0) {
                if (navBadge) { navBadge.innerText = count; navBadge.classList.remove('hidden'); }
                if (tabBadge) { tabBadge.innerText = count; tabBadge.classList.remove('hidden'); }
            } else {
                if (navBadge) navBadge.classList.add('hidden');
                if (tabBadge) tabBadge.classList.add('hidden');
            }
            
            return count; // คืนค่าจำนวนเพื่อนำไปใช้เช็คเงื่อนไขเปิดเสียง
        }

        function playCalendarAlert() {
            const audio = document.getElementById('calendar-audio');
            // เช็คว่าผู้ใช้เปิดเสียงเตือนไว้หรือไม่ (ค่าเริ่มต้นคือ true)
            const soundSettingCb = document.getElementById('setting-cal-sound-on');
            const isSoundOn = soundSettingCb ? soundSettingCb.checked : true;
            const volumeSetting = document.getElementById('setting-cal-sound-volume');
            
            if (audio && isSoundOn) {
                audio.volume = volumeSetting ? volumeSetting.value : 0.5;
                // ป้องกัน Error จาก Browser Autoplay Policy
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => console.log("รอการตอบสนองจากผู้ใช้ก่อนเล่นเสียง"));
                }
            }
        }

        function handleCalendarClick() {
            // เมื่อคลิกไอคอนปฏิทินบนแถบ Navbar ให้สลับแท็บอัตโนมัติ
            if (!document.getElementById('view-room').classList.contains('hidden')) {
                switchTab('calendar');
            }
        }
		
		
		
		// ==========================================
        // ระบบปฏิทินงาน (Calendar Events)
        // ==========================================
        let currentDate = new Date();
        let flatpickrInstances = {};

        // จำลองข้อมูลกิจกรรมเริ่มต้น
        state.calendarEvents = [
            {
                id: 'evt_001', title: 'ประชุมประจำเดือน', desc: 'สรุปผลการดำเนินงาน',
                dept: 'บริหารทั่วไป', loc: 'ห้องโสตฯ', 
                startDate: '2026-09-16', endDate: '2026-09-16',
                startTime: '08:30', endTime: '16:30',
                recorder: 'admin_01', responsible: 'นายธนสาร สีรักษ์'
            }
        ];


        /* [ข้อ 2] ฟังก์ชันเดิมที่อ้าง #cal-grid และตัวแปร event แบบ implicit
           ปฏิทินรุ่นใหม่ไม่ได้ใช้ #cal-grid แล้ว จึงเปลี่ยนมาเรียก onCalendarDateClick แทน
           (คงชื่อฟังก์ชันไว้เผื่อมีโค้ดเก่าเรียกใช้) */
        function selectCalendarDate(year, month, date) {
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
            if (typeof window.onCalendarDateClick === 'function') return window.onCalendarDateClick(ds);
            if (typeof openDayEventsModal === 'function') return openDayEventsModal(ds);
        }
		
		
		function changeCalendarView(mode) {
            calendarViewMode = mode;
            calCurrentPage = 1;
            // ในเวอร์ชันนี้รองรับโครงสร้างแบบเดือน (Month) เป็นหลักตามดีไซน์เดิม 
            // สำหรับสัปดาห์/วัน/ปี จะปรับหัวข้อและการแสดงผลรายการกิจกรรมให้สัมพันธ์กัน
            renderCalendar();
        }

        function changeCalPage(page) {
            calCurrentPage = page;
            renderCalEventListPagination();
        }

        function renderCalEventListPagination() {
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

            // คำนวณขอบเขตข้อมูล
            const startIdx = (calCurrentPage - 1) * calItemsPerPage;
            const displayEvents = currentMonthlyEvents.slice(startIdx, startIdx + calItemsPerPage);
            const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

            let listHtml = displayEvents.map(e => {
                let eDate = new Date(e.date);
                let iconColor = e.isHoliday ? 'text-emerald-600 bg-emerald-100' : 'text-blue-600 bg-blue-100';
                let iconName = e.isHoliday ? 'fa-calendar-day' : 'fa-clipboard-check';

                return `
                    <div class="flex gap-3 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition">
                        <div class="flex flex-col items-center justify-start min-w-[45px]">
                            <div class="text-[11px] font-bold text-slate-500">${eDate.getDate()} ${thMonths[eDate.getMonth()].substring(0,3)}.</div>
                            <div class="text-[9px] text-slate-400 mb-1">${eDate.getFullYear() + 543}</div>
                            <div class="w-7 h-7 rounded-full ${iconColor} flex items-center justify-center text-[10px]"><i class="fa-solid ${iconName}"></i></div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-slate-800 text-xs mb-1 leading-snug truncate" title="${e.title}">${e.title}</div>
                            <div class="text-[10px] text-slate-500 flex flex-col gap-0.5">
                                <span class="truncate"><i class="fa-regular fa-clock text-slate-400 w-3"></i> ${e.isHoliday ? 'ทั้งวัน' : 'กำหนดส่ง'}</span>
                                <span class="truncate"><i class="fa-solid fa-location-dot text-slate-400 w-3"></i> ${e.location}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            listEl.innerHTML = listHtml;

            // จัดการปุ่ม Pagination
            if (totalPages > 1) {
                paginationEl.classList.remove('hidden');
                pageInfo.innerText = `หน้า ${calCurrentPage} จาก ${totalPages}`;
                
                let btnHtml = '';
                btnHtml += `<button onclick="changeCalPage(${Math.max(1, calCurrentPage - 1)})" class="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center shadow-xs hover:bg-slate-100 transition disabled:opacity-50" ${calCurrentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left text-[9px]"></i></button>`;
                
                for (let i = 1; i <= totalPages; i++) {
                    let activeClass = i === calCurrentPage ? 'bg-purple-600 text-white' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200';
                    btnHtml += `<button onclick="changeCalPage(${i})" class="w-6 h-6 rounded-md ${activeClass} font-bold flex items-center justify-center shadow-xs text-[10px] transition">${i}</button>`;
                }
                
                btnHtml += `<button onclick="changeCalPage(${Math.min(totalPages, calCurrentPage + 1)})" class="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-600 flex items-center justify-center shadow-xs hover:bg-slate-100 transition disabled:opacity-50" ${calCurrentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right text-[9px]"></i></button>`;
                
                pageBtns.innerHTML = btnHtml;
            } else {
                paginationEl.classList.add('hidden');
            }
        }

        window.openDayEventsModal = function(dateStr) {
            let selectedDate = new Date(dateStr);
            const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
            let titleDate = `${selectedDate.getDate()} ${thMonths[selectedDate.getMonth()]} ${selectedDate.getFullYear() + 543}`;
            
            document.getElementById('day-events-title').innerHTML = `<i class="fa-solid fa-calendar-day"></i> กิจกรรมวันที่ ${titleDate}`;
            
            // ดึงกิจกรรมของวันนั้นทั้งหมด
            let dayEvents = currentMonthlyEvents.filter(e => e.date === dateStr);
            let contentEl = document.getElementById('day-events-content');
            
            if (dayEvents.length === 0) {
                contentEl.innerHTML = `<div class="text-center text-slate-400 py-6 text-sm">ไม่มีกิจกรรมในวันนี้</div>`;
            } else {
                contentEl.innerHTML = dayEvents.map(e => {
                    let iconColor = e.isHoliday ? 'text-emerald-600 bg-emerald-100 border-emerald-200' : 'text-blue-600 bg-blue-100 border-blue-200';
                    let iconName = e.isHoliday ? 'fa-calendar-day' : 'fa-clipboard-check';
                    return `
                        <div class="mb-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-3">
                            <div class="w-10 h-10 rounded-full border ${iconColor} flex items-center justify-center shrink-0">
                                <i class="fa-solid ${iconName} text-lg"></i>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-bold text-slate-800 text-sm mb-1">${e.title}</h4>
                                <div class="text-[11px] text-slate-600 space-y-1">
                                    <div><i class="fa-regular fa-clock w-4 text-center"></i> ${e.isHoliday ? 'ตลอดวัน' : 'กำหนดส่ง / ลงเวลา'}</div>
                                    <div><i class="fa-solid fa-location-dot w-4 text-center text-rose-500"></i> ${e.location}</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            document.getElementById('modal-day-events').classList.remove('hidden');
        };

        window.closeDayEventsModal = function() {
            document.getElementById('modal-day-events').classList.add('hidden');
        };
		
		
		
	

        // [FULL-STACK] ลบโค้ดคำนวณปฏิทินที่หลุดออกนอกฟังก์ชัน (เดิมทำให้สคริปต์หยุดทำงานด้วย ReferenceError: year is not defined)

        function renderEventList(events, titleSuffix = "เดือนนี้") {
            const listEl = document.getElementById('cal-event-list');
            const countEl = document.getElementById('cal-event-count');
            
            // [แก้ไขตรงนี้] อัปเดตข้อความหัวข้อให้ตรงกับบริบท (โดยชี้ไปที่แท็กที่อยู่ติดกับตัวเลขกล่องนับจำนวน)
            if (countEl && countEl.previousElementSibling) {
                countEl.previousElementSibling.innerText = `กิจกรรมใน${titleSuffix}`;
            }
            
            countEl.innerText = events.length;

            if (events.length === 0) {
                // อัปเดตหน้าตาตอนไม่มีกิจกรรม ให้มีไอคอนตรงตามรูปภาพ
                listEl.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                        <i class="fa-regular fa-calendar-xmark text-4xl mb-3 text-slate-300"></i>
                        <div class="text-xs font-bold">ไม่มีกิจกรรมใน${titleSuffix}</div>
                    </div>`;
                return;
            }

            // เรียงตามวันที่
            events.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

            listEl.innerHTML = events.map(e => {
                let eDateStr = typeof formatThaiDateFull === 'function' 
                    ? formatThaiDateFull(new Date(e.startDate)) 
                    : new Date(e.startDate).toLocaleDateString('th-TH', {day:'numeric', month:'short', year:'numeric'});
                
                return `
                    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative group cursor-pointer hover:border-purple-300 transition-colors">
                        <div class="absolute top-3 right-3 flex opacity-0 group-hover:opacity-100 transition-opacity gap-1.5">
                            <button onclick="editEvent('${e.id}')" class="w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center transition border border-amber-200"><i class="fa-solid fa-pen text-[10px]"></i></button>
                            <button onclick="deleteEvent('${e.id}')" class="w-7 h-7 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition border border-rose-200"><i class="fa-solid fa-trash text-[10px]"></i></button>
                        </div>
                        <div class="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 inline-block mb-1.5">${e.dept}</div>
                        <h4 class="font-bold text-slate-800 text-sm mb-1 pr-16">${e.title}</h4>
                        <div class="text-[11px] text-slate-500 mb-2 leading-relaxed">${e.desc || '-'}</div>
                        <div class="space-y-1 mt-2 pt-2 border-t border-slate-100">
                            <div class="text-[11px] text-slate-600 flex items-center gap-1.5"><i class="fa-regular fa-calendar text-emerald-500 w-3 text-center"></i> ${eDateStr} (${e.startTime} - ${e.endTime} น.)</div>
                            <div class="text-[11px] text-slate-600 flex items-center gap-1.5"><i class="fa-solid fa-location-dot text-amber-500 w-3 text-center"></i> ${e.loc}</div>
                            <div class="text-[11px] text-slate-600 flex items-center gap-1.5"><i class="fa-solid fa-user-tie text-blue-500 w-3 text-center"></i> ผรช. ${e.responsible}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ==========================================
        // เปิด/ปิด/บันทึก ข้อมูลใน Modal
        // ==========================================
        function openEventModal() {
            document.getElementById('form-event').reset();
            document.getElementById('event-id').value = '';
            document.getElementById('modal-event-title').innerHTML = '<i class="fa-solid fa-calendar-plus"></i> เพิ่มกิจกรรมใหม่';
            
            // ตั้งค่าเริ่มต้นของรหัสผู้บันทึก และ ผู้รับผิดชอบ (ดึงจากผู้ใช้ปัจจุบัน)
            document.getElementById('event-recorder').value = state.user.id || 'admin';
            document.getElementById('event-responsible').value = state.user.name || 'นายธนสาร สีรักษ์';

            initFlatpickrForEvents();
            document.getElementById('modal-event').classList.remove('hidden');
        }

        function closeEventModal() {
            document.getElementById('modal-event').classList.add('hidden');
        }

        function editEvent(id) {
            const evt = state.calendarEvents.find(e => e.id === id);
            if (!evt) return;

            document.getElementById('modal-event-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขกิจกรรม';
            document.getElementById('event-id').value = evt.id;
            document.getElementById('event-title').value = evt.title;
            document.getElementById('event-desc').value = evt.desc;
            document.getElementById('event-dept').value = evt.dept;
            document.getElementById('event-location').value = evt.loc;
            document.getElementById('event-start-time').value = evt.startTime;
            document.getElementById('event-end-time').value = evt.endTime;
            document.getElementById('event-recorder').value = evt.recorder;
            document.getElementById('event-responsible').value = evt.responsible;

            initFlatpickrForEvents();
            flatpickrInstances['start'].setDate(evt.startDate);
            flatpickrInstances['end'].setDate(evt.endDate);

            document.getElementById('modal-event').classList.remove('hidden');
        }

        function saveEvent() {
            const id = document.getElementById('event-id').value;
            const newEvent = {
                id: id || 'evt_' + Date.now(),
                title: document.getElementById('event-title').value,
                desc: document.getElementById('event-desc').value,
                dept: document.getElementById('event-dept').value,
                loc: document.getElementById('event-location').value,
                startDate: document.getElementById('event-start-date').value,
                endDate: document.getElementById('event-end-date').value,
                startTime: document.getElementById('event-start-time').value,
                endTime: document.getElementById('event-end-time').value,
                recorder: document.getElementById('event-recorder').value,
                responsible: document.getElementById('event-responsible').value
            };

            if (id) {
                const idx = state.calendarEvents.findIndex(e => e.id === id);
                if (idx > -1) state.calendarEvents[idx] = newEvent;
            } else {
                state.calendarEvents.push(newEvent);
            }

            closeEventModal();
            renderCalendar();
			updateCalendarBadge(); // <-- เพิ่มบรรทัดนี้
            Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', showConfirmButton: false, timer: 1500 });
        }

        function deleteEvent(id) {
            Swal.fire({
                title: 'ยืนยันการลบกิจกรรม?',
                text: "หากลบแล้วจะไม่สามารถกู้คืนได้",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'ใช่, ลบเลย',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    state.calendarEvents = state.calendarEvents.filter(e => e.id !== id);
                    renderCalendar();
					updateCalendarBadge(); // <-- เพิ่มบรรทัดนี้
                    Swal.fire({ icon: 'success', title: 'ลบกิจกรรมเรียบร้อย', showConfirmButton: false, timer: 1500 });
                }
            });
        }

        // เชื่อม Flatpickr ให้ช่องเลือกวันที่
        function initFlatpickrForEvents() {
            flatpickrInstances['start'] = flatpickr("#event-start-date", {
                locale: "th",
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d M. Y"
            });
            flatpickrInstances['end'] = flatpickr("#event-end-date", {
                locale: "th",
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d M. Y"
            });
            flatpickr("#event-start-time, #event-end-time", {
                enableTime: true,
                noCalendar: true,
                dateFormat: "H:i",
                time_24hr: true
            });
        }

        // สั่งวาดปฏิทินครั้งแรกเมื่อโหลดหน้าเว็บ
        document.addEventListener('DOMContentLoaded', () => {
            renderCalendar();
			updateCalendarBadge(); // <-- เพิ่มบรรทัดนี้
        });
		
		
		
		// ==========================================
        // ฟังก์ชันบันทึกกิจกรรมและสั่งรีเฟรชปฏิทินทันที
        // ==========================================
        function saveEvent() {
            const title = document.getElementById('event-title').value;
            const startDate = document.getElementById('event-start-date').value;
            const location = document.getElementById('event-location').value;

            // ป้องกันการบันทึกข้อมูลว่างเปล่า
            if (!title || !startDate) {
                Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อกิจกรรมและวันที่เริ่ม', 'warning');
                return;
            }

            if (!state.calendarEvents) state.calendarEvents = [];
            
            // บันทึกกิจกรรมลง Array
            state.calendarEvents.push({
                id: Date.now().toString(),
                title: title,
                date: startDate,
                location: location || 'ไม่ระบุสถานที่'
            });

            // แจ้งเตือนความสำเร็จ
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลสำเร็จ',
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                // ปิด Modal
                closeEventModal();
                
                // ล้างข้อมูลในฟอร์ม
                document.getElementById('form-event').reset();

                // *** คำสั่งสำคัญที่สุดที่แก้ปัญหา: บังคับวาดปฏิทินใหม่ทันที ***
                renderCalendar(); 
            });
        }

        // ฟังก์ชันควบคุม Modal
        function closeEventModal() {
            document.getElementById('modal-event').classList.add('hidden');
        }
        
        function openEventModal() {
            document.getElementById('form-event').reset();
            document.getElementById('modal-event').classList.remove('hidden');
        }
		
    