// Ganti URL di bawah ini dengan URL Web App dari Google Apps Script Anda (yang berakhiran /exec)
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwtDPzKpCzjZVeC1c0fWnueVcHokGF2-mQA2CkmQNxu-fYu8PkZjtwf58xCfuFAc4ytwA/exec";

let siswaList = JSON.parse(localStorage.getItem('siswaList')) || ["Kori", "Aisyah", "Budi", "Siti", "Rizki"];
let ekskulList = JSON.parse(localStorage.getItem('ekskulList')) || ["Tari Tradisional", "Musik Modern", "Lukis", "Teater", "Tari Kreasi"];
let absensi = JSON.parse(localStorage.getItem('absensiSeni')) || [];
let dokumentasiList = JSON.parse(localStorage.getItem('dokumentasiSeni')) || [];
let adminPinHash = localStorage.getItem('adminPinHash') || hashPin("1234");
let isAdminLoggedIn = false;
let jamBatas = JSON.parse(localStorage.getItem('jamBatas')) || { aktif: false, buka: "07:00", tutup: "16:00" };
let gpsConfig = JSON.parse(localStorage.getItem('gpsConfig')) || { aktif: false, lat: 0, lng: 0, radius: 100 };
let bgUrlConfig = localStorage.getItem('bgUrlConfig') || "";
let currentLocation = null;
let isProcessing = false;
let deferredPrompt = null;

function hashPin(pin) {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) - h) + pin.charCodeAt(i);
    h |= 0;
  }
  return h.toString();
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});
document.getElementById('installBtn')?.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBtn').classList.add('hidden');
  }
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
let db;
function initDB() {
  const req = indexedDB.open("AbsensiSeniDB", 4);
  req.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("data")) db.createObjectStore("data", { keyPath: "id" });
  };
  req.onsuccess = e => {
    db = e.target.result;
    loadFromDB();
  };
}
function saveToDB() {
  if (!db) return;
  const tx = db.transaction("data", "readwrite");
  const st = tx.objectStore("data");
  st.put({ id: "siswaList", value: siswaList });
  st.put({ id: "ekskulList", value: ekskulList });
  st.put({ id: "absensiSeni", value: absensi });
  st.put({ id: "dokumentasiSeni", value: dokumentasiList });
  st.put({ id: "adminPinHash", value: adminPinHash });
  st.put({ id: "jamBatas", value: jamBatas });
  st.put({ id: "gpsConfig", value: gpsConfig });
  st.put({ id: "bgUrlConfig", value: bgUrlConfig });
}
function loadFromDB() {
  if (!db) return;
  const tx = db.transaction("data", "readonly");
  const st = tx.objectStore("data");
  ["siswaList", "ekskulList", "jamBatas", "adminPinHash", "gpsConfig", "dokumentasiSeni", "bgUrlConfig"].forEach(k => {
    const r = st.get(k);
    r.onsuccess = () => {
      if (r.result && r.result.value) {
        if (k === "siswaList") {
          siswaList = r.result.value;
          localStorage.setItem('siswaList', JSON.stringify(siswaList));
          updateDropdownSiswa();
        }
        if (k === "ekskulList") {
          ekskulList = r.result.value;
          localStorage.setItem('ekskulList', JSON.stringify(ekskulList));
          updateDropdownEkskul();
        }
        if (k === "jamBatas") jamBatas = r.result.value;
        if (k === "gpsConfig") gpsConfig = r.result.value;
        if (k === "dokumentasiSeni") {
          dokumentasiList = r.result.value;
          localStorage.setItem('dokumentasiSeni', JSON.stringify(dokumentasiList));
        }
        if (k === "adminPinHash") adminPinHash = r.result.value;
        if (k === "bgUrlConfig") {
          bgUrlConfig = r.result.value;
          localStorage.setItem('bgUrlConfig', bgUrlConfig);
          applyBackground(bgUrlConfig);
        }
        renderAll();
      }
    };
  });
}
initDB();
function applyBackground(urlData) {
  const container = document.getElementById('appContainer');
  if (!container) return;
  if (urlData && urlData.trim() !== "") {
    container.style.backgroundImage = `url('${urlData.trim()}')`;
  } else {
    container.style.backgroundImage = "none";
  }
}
function simpanBackgroundGaleri(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    bgUrlConfig = ev.target.result;
    try {
      localStorage.setItem('bgUrlConfig', bgUrlConfig);
    } catch (err) {
      console.warn("Ukuran gambar terlalu besar untuk localStorage, menggunakan simpanan DB saja.");
    }
    applyBackground(bgUrlConfig);
    saveToDB();
    alertMessage('Background galeri berhasil diterapkan!', 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
function hapusBackgroundUrl() {
  bgUrlConfig = "";
  localStorage.removeItem('bgUrlConfig');
  applyBackground("");
  saveToDB();
  alertMessage('Background berhasil direset.', 'success');
}
async function loadFromCloud() {
  if (!WEB_APP_URL || WEB_APP_URL.includes("MASUKKAN_URL")) return;
  try {
    const res = await fetch(WEB_APP_URL);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      absensi = data;
      localStorage.setItem('absensiSeni', JSON.stringify(absensi));
      renderAll();
    }
  } catch (err) {
    console.log("Menggunakan data cache lokal (Offline Mode)", err);
  }
}
function initGPS() {
  const el = document.getElementById('gpsStatus');
  if (!el) return;
  if (!navigator.geolocation) {
    el.innerHTML = "📍 GPS tidak support";
    return;
  }
  navigator.geolocation.watchPosition(pos => {
    currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    el.innerHTML = `<i class="fa-solid fa-location-dot"></i> GPS Akurat ${Math.round(pos.coords.accuracy)}m`;
    el.className = "bg-emerald-400/20 px-2 py-0.5 rounded-full text-[10px]";
  }, () => {
    el.innerHTML = "📍 GPS: Mencari sinyal...";
    el.className = "bg-amber-400/20 px-2 py-0.5 rounded-full text-[10px]";
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}
initGPS();
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function playTing(status) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    if (status === 'Hadir') {
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      setTimeout(() => { try { o.frequency.value = 1200; } catch (e) { } }, 120);
      o.stop(ctx.currentTime + 0.5);
    } else {
      o.frequency.value = 350;
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      o.start();
      o.stop(ctx.currentTime + 0.3);
    }
  } catch (e) { }
}
function alertMessage(msg, type = 'warning') {
  const box = document.getElementById('customAlert');
  const txt = document.getElementById('customAlertMsg');
  const prog = document.getElementById('alertProgress');
  if (!box || !txt) return;
  txt.innerText = msg;
  box.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'border-red-200', 'bg-green-50', 'text-green-700', 'border-green-200', 'bg-amber-50', 'text-amber-700', 'border-amber-200');
  prog.className = "h-1 w-full transition-all ease-linear";
  if (type === 'error') {
    box.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
    prog.classList.add('bg-red-500');
  } else if (type === 'success') {
    box.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
    prog.classList.add('bg-green-500');
  } else {
    box.classList.add('bg-amber-50', 'text-amber-700', 'border-amber-200');
    prog.classList.add('bg-amber-500');
  }
  prog.style.width = '100%';
  box.classList.remove('hidden');
  setTimeout(() => { prog.style.width = '0%'; prog.style.transitionDuration = '4000ms'; }, 50);
  setTimeout(() => closeAlert(), 4000);
}
function closeAlert() {
  const b = document.getElementById('customAlert');
  if (b) b.classList.add('hidden');
}
let confirmCallback = null;
function showConfirm(title, msg, okText = "Ya") {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMsg').innerText = msg;
    document.getElementById('confirmOkBtn').innerText = okText;
    document.getElementById('modalConfirm').classList.remove('hidden');
    confirmCallback = resolve;
  });
}
function closeConfirm(result) {
  document.getElementById('modalConfirm').classList.add('hidden');
  if (confirmCallback) confirmCallback(result);
}
function init() {
  updateDropdownSiswa();
  updateDropdownEkskul();
  const f = document.getElementById('filterTgl');
  if (f) f.valueAsDate = new Date();
  const b = document.getElementById('jamBuka');
  const t = document.getElementById('jamTutup');
  const a = document.getElementById('aktifkanBatas');
  if (b) b.value = jamBatas.buka;
  if (t) t.value = jamBatas.tutup;
  if (a) a.checked = jamBatas.aktif;
  const latEl = document.getElementById('inputLat');
  const lngEl = document.getElementById('inputLng');
  const radEl = document.getElementById('inputRadius');
  const gpsAktifEl = document.getElementById('aktifkanGps');
  if (latEl) latEl.value = gpsConfig.lat;
  if (lngEl) lngEl.value = gpsConfig.lng;
  if (radEl) radEl.value = gpsConfig.radius;
  if (gpsAktifEl) gpsAktifEl.checked = gpsConfig.aktif;
  applyBackground(bgUrlConfig);
  loadFromCloud();
  renderAll();
}
function updateDropdownSiswa() {
  const s = document.getElementById('pilihSiswa');
  if (s) s.innerHTML = siswaList.length ? siswaList.map(n => `<option value="${n}">${n}</option>`).join('') : '<option value="">(Belum ada siswa)</option>';
}
function updateDropdownEkskul() {
  const e = document.getElementById('pilihEkskul');
  if (e) e.innerHTML = ekskulList.length ? ekskulList.map(item => `<option value="${item}">${item}</option>`).join('') : '<option value="">(Belum ada ekskul)</option>';
}
function setLoading(state) {
  isProcessing = state;
  document.querySelectorAll('.absen-btn').forEach(btn => { btn.disabled = state; });
}
async function absen(status) {
  if (isProcessing) return;
  const nama = document.getElementById('pilihSiswa').value;
  const kelas = document.getElementById('inputKelas').value.trim();
  const ekskul = document.getElementById('pilihEkskul').value;
  const now = new Date();
  const tgl = now.toISOString().split('T')[0];
  if (!nama) { alertMessage('Pilih nama siswa terlebih dahulu!', 'warning'); return; }
  if (!kelas) { alertMessage('Masukkan kelas kamu terlebih dahulu!', 'warning'); document.getElementById('inputKelas').focus(); return; }
  if (jamBatas.aktif) {
    const jamSekarang = now.getHours() * 60 + now.getMinutes();
    const [bH, bM] = jamBatas.buka.split(":").map(Number);
    const [tH, tM] = jamBatas.tutup.split(":").map(Number);
    if (jamSekarang < bH * 60 + bM || jamSekarang > tH * 60 + tM) {
      alertMessage(`Absen hanya dibuka pukul ${jamBatas.buka} - ${jamBatas.tutup}`, 'error');
      playTing('Alfa');
      return;
    }
  }
  if (gpsConfig.aktif) {
    if (!currentLocation) {
      alertMessage('GPS belum terdeteksi. Izinkan akses lokasi pada browser Anda!', 'error');
      playTing('Alfa');
      return;
    }
    const jarak = calculateDistance(currentLocation.lat, currentLocation.lng, gpsConfig.lat, gpsConfig.lng);
    if (jarak > gpsConfig.radius) {
      alertMessage(`Anda berada di luar area presensi! Jarak Anda ${Math.round(jarak)}m dari titik pusat (Maksimal ${gpsConfig.radius}m).`, 'error');
      playTing('Alfa');
      return;
    }
  }
  const existing = absensi.find(a => a.nama == nama && a.tgl == tgl);
  if (existing) { alertMessage(nama + ' sudah absen hari ini sebagai ' + existing.status, 'warning'); return; }
  setLoading(true);
  const dataAbsen = {
    nama, kelas, ekskul, status, tgl,
    jam: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    lat: currentLocation?.lat || null, 
    lng: currentLocation?.lng || null, 
    acc: currentLocation?.acc || null
  };
  try {
    if (!WEB_APP_URL.includes("MASUKKAN_URL")) {
      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataAbsen)
      });
    }
    absensi.push(dataAbsen);
    localStorage.setItem('absensiSeni', JSON.stringify(absensi));
    playTing(status);
    renderAll();
    alertMessage('Berhasil absen ' + status + ' untuk ' + nama, 'success');
  } catch (e) {
    alertMessage('Gagal menyimpan ke server cloud!', 'error');
  }
  setLoading(false);
}
function renderPribadi() {
  const sel = document.getElementById('pilihSiswa');
  if (!sel) return;
  const nama = sel.value;
  if (!nama) {
    document.getElementById('countHadir').innerText = '0';
    document.getElementById('countIzin').innerText = '0';
    document.getElementById('countAlfa').innerText = '0';
    document.getElementById('riwayatPribadi').innerHTML = '<div class="py-8 text-center"><div class="text-4xl mb-2">🎨</div><p class="text-xs text-slate-800">Pilih nama untuk melihat riwayat</p></div>';
    return;
  }
  const data = absensi.filter(a => a.nama == nama);
  document.getElementById('countHadir').innerText = data.filter(a => a.status == 'Hadir').length;
  document.getElementById('countIzin').innerText = data.filter(a => a.status == 'Izin' || a.status == 'Sakit').length;
  document.getElementById('countAlfa').innerText = data.filter(a => a.status == 'Alfa').length;
  let html = `<h3 class="font-bold text-xs text-slate-800 uppercase tracking-wider mb-2">Riwayat ${nama}</h3>`;
  if (data.length == 0) {
    html += `<div class="py-6 text-center border rounded-xl border-dashed bg-white/50"><div class="text-3xl">📭</div><p class="text-xs text-slate-800 mt-1">Belum ada riwayat absen</p><p class="text-[10px] text-slate-600">Absen pertama kamu akan muncul di sini</p></div>`;
  } else {
    html += '<div class="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">';
    html += data.slice(-10).reverse().map(a => {
      let colorClass = a.status == 'Hadir' ? 'text-emerald-600 bg-emerald-50' : a.status == 'Alfa' ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50';
      let gpsIcon = a.lat ? `<a href="https://www.google.com/maps?q=${a.lat},${a.lng}" target="_blank" class="text-[10px] text-blue-500 underline">📍 Lihat Lokasi</a>` : '';
      let kelasInfo = a.kelas ? `[${a.kelas}]` : '';
      return `<div class="flex justify-between items-center text-xs p-2.5 rounded-xl border border-slate-100 bg-white/90 shadow-sm"><span class="font-medium text-slate-700">${a.tgl} - ${a.ekskul} ${kelasInfo}<br><span class="text-[10px] text-slate-400">${gpsIcon} ${a.jam}</span></span><span class="font-bold px-2 py-0.5 rounded-lg ${colorClass}">${a.status}</span></div>`;
    }).join('');
    html += '</div>';
  }
  document.getElementById('riwayatPribadi').innerHTML = html;
}
function renderAdmin() {
  const tglInput = document.getElementById('filterTgl');
  if (!tglInput) return;
  const tgl = tglInput.value;
  const data = absensi.filter(a => a.tgl == tgl);
  document.getElementById('totalHadirAll').innerText = data.filter(a => a.status == 'Hadir').length;
  document.getElementById('totalIzinAll').innerText = data.filter(a => a.status == 'Izin' || a.status == 'Sakit').length;
  document.getElementById('totalAlfaAll').innerText = data.filter(a => a.status == 'Alfa').length;
  const dokContainer = document.getElementById('galeriDokumentasi');
  if (dokContainer) {
    const fotoTgl = dokumentasiList.filter(d => d.tgl === tgl);
    if (fotoTgl.length === 0) {
      dokContainer.innerHTML = `<div class="col-span-2 py-4 text-center border border-dashed rounded-xl text-slate-800 text-[11px]">Belum ada foto dokumentasi pada tanggal ${tgl}</div>`;
    } else {
      dokContainer.innerHTML = fotoTgl.map((f, idx) => `
        <div class="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm group">
          <img src="${f.image}" class="w-full h-28 object-cover">
          <div class="p-2 flex items-center justify-between bg-slate-50">
            <span class="text-[10px] text-slate-600 truncate">${f.jam || ''}</span>
            <button onclick="hapusDokumentasi('${f.id}')" class="text-rose-600 hover:text-rose-800 text-[10px] font-bold px-1.5 py-0.5 bg-rose-50 rounded"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `).join('');
    }
  }
  let html = `<h3 class="font-bold text-xs text-slate-800 uppercase tracking-wider mb-2">1. Presensi Setiap Pertemuan (${tgl || '-'})</h3><div class="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">`;
  if (data.length == 0) {
    html += '<div class="py-6 text-center border rounded-xl border-dashed bg-white/50"><div class="text-3xl">📊</div><p class="text-xs text-slate-800 mt-1">Belum ada absen di tanggal ini</p></div>';
  } else {
    data.forEach(a => {
      const warna = a.status == 'Hadir' ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800' : a.status == 'Alfa' ? 'bg-rose-50/90 border-rose-200 text-rose-800' : 'bg-amber-50/90 border-amber-200 text-amber-800';
      const gps = a.lat ? `📍 ${Number(a.lat).toFixed(4)}, ${Number(a.lng).toFixed(4)}` : 'GPS tidak aktif';
      const kelasStr = a.kelas ? ` (${a.kelas})` : '';
      html += `<div class="flex justify-between items-center p-3 rounded-xl border ${warna} shadow-sm"><div><div class="font-bold text-xs">${a.nama}${kelasStr}</div><div class="text-[10px] opacity-75">${a.ekskul} | ${a.jam} | ${gps}</div></div><div class="text-xs font-black uppercase px-2.5 py-1 rounded-lg bg-white/80 border border-black/5">${a.status}</div></div>`;
    });
  }
  html += '</div>';
  html += `
  <h3 class="font-bold text-xs text-slate-800 uppercase tracking-wider mt-5 mb-2">2. Total Keseluruhan Kehadiran Siswa</h3>
  <div class="bg-white/90 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
    <div class="overflow-x-auto custom-scrollbar max-h-60">
      <table class="w-full text-left text-[11px]">
        <thead class="bg-slate-900 text-white font-bold sticky top-0 z-10">
          <tr>
            <th class="p-2.5">Siswa</th>
            <th class="p-2.5 text-center">H</th>
            <th class="p-2.5 text-center">I/S</th>
            <th class="p-2.5 text-center">A</th>
            <th class="p-2.5 text-center">Rasio</th>
            <th class="p-2.5 text-right">%</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">`;
  if (siswaList.length == 0) {
    html += `<tr><td colspan="6" class="text-center text-slate-800 py-4">Belum ada data siswa</td></tr>`;
  } else {
    siswaList.forEach(n => {
      const d = absensi.filter(a => a.nama == n);
      const h = d.filter(a => a.status == 'Hadir').length;
      const izinSakit = d.filter(a => a.status == 'Izin' || a.status == 'Sakit').length;
      const alfa = d.filter(a => a.status == 'Alfa').length;
      const dPertemuan = d.length;
      const persen = dPertemuan ? Math.round((h / dPertemuan) * 100) : 0;
      const sampleKelas = d.length && d[d.length - 1].kelas ? `<div class="text-[9px] text-slate-500 font-normal">${d[d.length - 1].kelas}</div>` : '';
      html += `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-2.5 font-semibold text-slate-800">${n}${sampleKelas}</td>
          <td class="p-2.5 text-center font-bold text-emerald-600 bg-emerald-50/50">${h}</td>
          <td class="p-2.5 text-center font-bold text-amber-600 bg-amber-50/50">${izinSakit}</td>
          <td class="p-2.5 text-center font-bold text-rose-600 bg-rose-50/50">${alfa}</td>
          <td class="p-2.5 text-center font-medium text-slate-600">${h}/${dPertemuan}</td>
          <td class="p-2.5 text-right font-black ${persen >= 75 ? 'text-emerald-600' : 'text-slate-700'}">${persen}%</td>
        </tr>`;
    });
  }
  html += `
        </tbody>
      </table>
    </div>
  </div>`;
  const todayStr = new Date().toISOString().split('T')[0];
  const activeDailyData = absensi.filter(a => a.tgl === (tgl || todayStr));
  const activeHadir = activeDailyData.filter(a => a.status === 'Hadir').length;
  const activeIzin = activeDailyData.filter(a => a.status === 'Izin' || a.status === 'Sakit').length;
  const activeAlfa = activeDailyData.filter(a => a.status === 'Alfa').length;
  html += `<h3 class="font-bold text-xs text-slate-800 uppercase tracking-wider mt-5 mb-2">3. Rekap Harian Aktif (${tgl || todayStr})</h3>
  <div class="bg-indigo-50/90 border border-indigo-200 p-3.5 rounded-xl space-y-1 text-xs text-slate-700">
    <div>📅 Tanggal: <span class="font-bold">${tgl || todayStr}</span></div>
    <div>✅ Hadir: <span class="font-bold text-emerald-600">${activeHadir} siswa</span></div>
    <div>📝 Izin/Sakit: <span class="font-bold text-amber-600">${activeIzin} siswa</span></div>
    <div>❌ Alfa: <span class="font-bold text-rose-600">${activeAlfa} siswa</span></div>
    <div class="text-[10px] text-slate-500 italic mt-1">*Data harian ini otomatis diperbarui sesuai tanggal aktif dan siap dikirim ke WhatsApp pembina.</div>
  </div>`;
  document.getElementById('tabelAdmin').innerHTML = html;
  let kelolaHtml = '';
  if (siswaList.length == 0) {
    kelolaHtml = '<p class="text-xs text-slate-800 text-center py-2">Belum ada siswa.</p>';
  } else {
    siswaList.forEach(n => {
      kelolaHtml += `<div class="flex justify-between items-center text-xs bg-white p-2 rounded-lg border border-slate-200"><span class="font-medium text-slate-700">${n}</span><button onclick="hapusSiswa('${n}')" class="text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 transition"><i class="fa-solid fa-trash"></i> Hapus</button></div>`;
    });
  }
  document.getElementById('listKelolaSiswa').innerHTML = kelolaHtml;
  let kelolaEkskulHtml = '';
  if (ekskulList.length == 0) {
    kelolaEkskulHtml = '<p class="text-xs text-slate-800 text-center py-2">Belum ada ekskul.</p>';
  } else {
    ekskulList.forEach(item => {
      kelolaEkskulHtml += `<div class="flex justify-between items-center text-xs bg-white p-2 rounded-lg border border-slate-200"><span class="font-medium text-slate-700">${item}</span><button onclick="hapusEkskul('${item}')" class="text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 transition"><i class="fa-solid fa-trash"></i> Hapus</button></div>`;
    });
  }
  document.getElementById('listKelolaEkskul').innerHTML = kelolaEkskulHtml;
}
function renderAll() {
  renderPribadi();
  if (isAdminLoggedIn) renderAdmin();
}
function showPage(p) {
  if (p === 'admin' && !isAdminLoggedIn) { openLoginModal(); return; }
  document.getElementById('pageSiswa').classList.toggle('hidden', p != 'siswa');
  document.getElementById('pageAdmin').classList.toggle('hidden', p != 'admin');
  document.getElementById('btnSiswa').className = p == 'siswa' ? 'flex-1 bg-white text-slate-900 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 shadow-md flex items-center justify-center gap-1.5' : 'flex-1 bg-transparent text-white/90 hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 flex items-center justify-center gap-1.5';
  document.getElementById('btnAdmin').className = p == 'admin' ? 'flex-1 bg-white text-slate-900 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 shadow-md flex items-center justify-center gap-1.5' : 'flex-1 bg-transparent text-white/90 hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 flex items-center justify-center gap-1.5';
  closeAlert();
  if (p == 'admin') {
    switchAdminTab('rekap');
    renderAdmin();
  }
}
function switchAdminTab(tabName) {
  const tabs = ['rekap', 'siswa', 'ekskul', 'jam', 'pengaturan'];
  tabs.forEach(t => {
    const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
    const content = document.getElementById('tabContent' + t.charAt(0).toUpperCase() + t.slice(1));
    if (t === tabName) {
      if (content) content.classList.remove('hidden');
      if (btn) btn.className = "flex-1 py-2 px-3 rounded-lg bg-white text-slate-900 shadow-sm transition-all whitespace-nowrap flex items-center justify-center gap-1 font-bold";
    } else {
      if (content) content.classList.add('hidden');
      if (btn) btn.className = "flex-1 py-2 px-3 rounded-lg bg-transparent text-slate-600 hover:text-slate-900 transition-all whitespace-nowrap flex items-center justify-center gap-1 font-semibold";
    }
  });
}
function checkAdminAccess() { if (isAdminLoggedIn) showPage('admin'); else openLoginModal(); }
function openLoginModal() { document.getElementById('modalLoginAdmin').classList.remove('hidden'); document.getElementById('inputPin').value = ''; document.getElementById('inputPin').focus(); }
function closeLoginModal() { document.getElementById('modalLoginAdmin').classList.add('hidden'); }
function verifyAdminLogin() {
  const pin = document.getElementById('inputPin').value.trim();
  if (hashPin(pin) === adminPinHash) {
    isAdminLoggedIn = true;
    closeLoginModal();
    showPage('admin');
    alertMessage('Berhasil masuk sebagai Admin Pembina!', 'success');
  } else {
    alertMessage('Sandi salah! Silakan coba lagi.', 'error');
    playTing('Alfa');
    document.getElementById('inputPin').value = '';
  }
}
function adminLogout() {
  isAdminLoggedIn = false;
  showPage('siswa');
  alertMessage('Berhasil keluar dari mode Admin.', 'success');
}
function ambilLokasiAdmin() {
  if (!navigator.geolocation) {
    alertMessage('GPS tidak didukung oleh browser Anda.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('inputLat').value = pos.coords.latitude;
    document.getElementById('inputLng').value = pos.coords.longitude;
    alertMessage('Berhasil mengambil koordinat GPS saat ini!', 'success');
  }, () => {
    alertMessage('Gagal mendeteksi lokasi GPS. Pastikan izin lokasi aktif.', 'error');
  }, { enableHighAccuracy: true });
}
function simpanGpsConfig() {
  const lat = parseFloat(document.getElementById('inputLat').value);
  const lng = parseFloat(document.getElementById('inputLng').value);
  const radius = parseFloat(document.getElementById('inputRadius').value);
  const aktif = document.getElementById('aktifkanGps').checked;
  if (isNaN(lat) || isNaN(lng)) {
    alertMessage('Latitude dan Longitude harus berupa angka yang valid!', 'warning');
    return;
  }
  if (isNaN(radius) || radius <= 0) {
    alertMessage('Radius maksimal harus lebih dari 0 meter!', 'warning');
    return;
  }
  gpsConfig = { aktif, lat, lng, radius };
  localStorage.setItem('gpsConfig', JSON.stringify(gpsConfig));
  saveToDB();
  alertMessage(`Pengaturan GPS berhasil disimpan (${radius}m dari titik pusat).`, 'success');
}
function uploadDokumentasi(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const tgl = document.getElementById('filterTgl').value || new Date().toISOString().split('T')[0];
    const now = new Date();
    const newDoc = {
      id: 'doc_' + Date.now(),
      tgl: tgl,
      image: ev.target.result,
      jam: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };
    dokumentasiList.push(newDoc);
    localStorage.setItem('dokumentasiSeni', JSON.stringify(dokumentasiList));
    saveToDB();
    renderAdmin();
    alertMessage('Foto dokumentasi berhasil diupload untuk tanggal ' + tgl, 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
async function hapusDokumentasi(id) {
  const ok = await showConfirm("Hapus Foto?", "Foto dokumentasi ini akan dihapus.");
  if (ok) {
    dokumentasiList = dokumentasiList.filter(d => d.id !== id);
    localStorage.setItem('dokumentasiSeni', JSON.stringify(dokumentasiList));
    saveToDB();
    renderAdmin();
    alertMessage('Foto dokumentasi berhasil dihapus.', 'success');
  }
}
function exportExcel() {
  const tgl = document.getElementById('filterTgl').value;
  const data = absensi.filter(a => a.tgl === tgl);
  if (data.length === 0) {
    alertMessage('Tidak ada data absensi pada tanggal tersebut.', 'warning');
    return;
  }
  let csv = 'Nama,Kelas,Ekskul,Status,Tanggal,Jam,Latitude,Longitude,Akurasi\n';
  data.forEach(d => {
    csv += `"${d.nama}","${d.kelas || ''}","${d.ekskul}","${d.status}","${d.tgl}","${d.jam}","${d.lat || ''}","${d.lng || ''}","${d.acc || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rekap-ekskul-seni-${tgl}.csv`;
  a.click();
  alertMessage('Data berhasil diexport ke CSV/Excel!', 'success');
}
function kirimRekapWA() {
  const tgl = document.getElementById('filterTgl').value || new Date().toISOString().split('T')[0];
  const noWA = document.getElementById('waAdmin').value.trim();
  if (!noWA) { alertMessage('Isi No WA Pembina terlebih dahulu!', 'warning'); return; }
  const data = absensi.filter(a => a.tgl === tgl);
  if (data.length === 0) { alertMessage('Belum ada data absen di tanggal ' + tgl, 'warning'); return; }
  const hadir = data.filter(a => a.status === 'Hadir');
  const izin = data.filter(a => a.status === 'Izin' || a.status === 'Sakit');
  const alfa = data.filter(a => a.status === 'Alfa');
  let pesan = `*REKAP HARIAN ABSENSI EKSKUL SENI*%0ATanggal: ${tgl}%0A%0A*RINGKASAN:*%0A✅ Hadir: ${hadir.length} siswa%0A📝 Izin/Sakit: ${izin.length} siswa%0A❌ Alfa: ${alfa.length} siswa%0ATotal: ${data.length} siswa%0A%0A*DAFTAR HADIR:*%0A`;
  if (hadir.length === 0) pesan += `_(Tidak ada)_%0A`;
  else hadir.forEach((a, i) => {
    const gps = a.lat ? ` (📍${Number(a.lat).toFixed(3)},${Number(a.lng).toFixed(3)})` : '';
    const kelasStr = a.kelas ? ` - ${a.kelas}` : '';
    pesan += `${i + 1}. ${a.nama}${kelasStr} (${a.ekskul}) - ${a.jam}${gps}%0A`;
  });
  if (izin.length) {
    pesan += `%0A*IZIN/SAKIT:*%0A`;
    izin.forEach((a, i) => { 
      const kelasStr = a.kelas ? ` - ${a.kelas}` : '';
      pesan += `${i + 1}. ${a.nama}${kelasStr} - ${a.status}%0A`; 
    });
  }
  if (alfa.length) {
    pesan += `%0A*ALFA:*%0A`;
    alfa.forEach((a, i) => { 
      const kelasStr = a.kelas ? ` - ${a.kelas}` : '';
      pesan += `${i + 1}. ${a.nama}${kelasStr}%0A`; 
    });
  }
  pesan += `%0A_Terkirim otomatis dari Web Absensi Ekskul Seni_`;
  window.open(`https://wa.me/${noWA}?text=${pesan}`, '_blank');
}
function simpanJamBatas() {
  jamBatas.buka = document.getElementById('jamBuka').value;
  jamBatas.tutup = document.getElementById('jamTutup').value;
  jamBatas.aktif = document.getElementById('aktifkanBatas').checked;
  localStorage.setItem('jamBatas', JSON.stringify(jamBatas));
  saveToDB();
  alertMessage(`Jam absen disimpan: ${jamBatas.buka} - ${jamBatas.tutup}`, 'success');
}
function backupData() {
  const data = { siswaList, ekskulList, absensi, dokumentasiList, jamBatas, gpsConfig, bgUrlConfig, adminPinHash, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-absensi-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  alertMessage('Backup berhasil di-download!', 'success');
}
function restoreData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.siswaList || !data.absensi) throw new Error();
      showConfirm("Restore Data?", "Semua data sekarang akan diganti dengan file backup. Lanjutkan?").then(ok => {
        if (ok) {
          siswaList = data.siswaList;
          ekskulList = data.ekskulList || ekskulList;
          absensi = data.absensi;
          dokumentasiList = data.dokumentasiList || [];
          jamBatas = data.jamBatas || jamBatas;
          gpsConfig = data.gpsConfig || gpsConfig;
          bgUrlConfig = data.bgUrlConfig || "";
          adminPinHash = data.adminPinHash || adminPinHash;
          localStorage.setItem('siswaList', JSON.stringify(siswaList));
          localStorage.setItem('ekskulList', JSON.stringify(ekskulList));
          localStorage.setItem('absensiSeni', JSON.stringify(absensi));
          localStorage.setItem('dokumentasiSeni', JSON.stringify(dokumentasiList));
          localStorage.setItem('jamBatas', JSON.stringify(jamBatas));
          localStorage.setItem('gpsConfig', JSON.stringify(gpsConfig));
          localStorage.setItem('bgUrlConfig', bgUrlConfig);
          localStorage.setItem('adminPinHash', adminPinHash);
          saveToDB();
          init();
          alertMessage('Restore berhasil!', 'success');
        }
      });
    } catch {
      alertMessage('File backup rusak atau format tidak sesuai!', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
async function confirmReset() {
  const ok = await showConfirm("Reset Semua Data?", "Tindakan ini akan menghapus SEMUA absensi dan data siswa. Tidak bisa dibatalkan!");
  if (ok) {
    localStorage.clear();
    if (db) {
      const tx = db.transaction("data", "readwrite");
      tx.objectStore("data").clear();
    }
    siswaList = ["Kori", "Aisyah", "Budi", "Siti", "Rizki"];
    ekskulList = ["Tari Tradisional", "Musik Modern", "Lukis", "Teater", "Tari Kreasi"];
    absensi = [];
    dokumentasiList = [];
    adminPinHash = hashPin("1234");
    location.reload();
  }
}
function tambahSiswa() {
  const input = document.getElementById('newNama');
  const n = input.value.trim();
  if (!n) { alertMessage('Nama tidak boleh kosong!', 'warning'); return; }
  if (siswaList.includes(n)) { alertMessage('Nama "' + n + '" sudah ada!', 'warning'); return; }
  siswaList.push(n);
  localStorage.setItem('siswaList', JSON.stringify(siswaList));
  saveToDB();
  input.value = '';
  updateDropdownSiswa();
  document.getElementById('pilihSiswa').value = n;
  renderAll();
  alertMessage('Siswa "' + n + '" berhasil ditambahkan!', 'success');
}
async function hapusSiswa(nama) {
  const ok = await showConfirm(`Hapus ${nama}?`, "Siswa akan dihapus dari daftar.");
  if (ok) {
    siswaList = siswaList.filter(s => s !== nama);
    localStorage.setItem('siswaList', JSON.stringify(siswaList));
    saveToDB();
    updateDropdownSiswa();
    renderAll();
    alertMessage('Siswa "' + nama + '" berhasil dihapus.', 'success');
  }
}
function tambahEkskul() {
  const input = document.getElementById('newEkskul');
  const n = input.value.trim();
  if (!n) { alertMessage('Nama ekskul tidak boleh kosong!', 'warning'); return; }
  if (ekskulList.includes(n)) { alertMessage('Ekskul "' + n + '" sudah ada!', 'warning'); return; }
  ekskulList.push(n);
  localStorage.setItem('ekskulList', JSON.stringify(ekskulList));
  saveToDB();
  input.value = '';
  updateDropdownEkskul();
  renderAll();
  alertMessage('Ekskul "' + n + '" berhasil ditambahkan!', 'success');
}
async function hapusEkskul(item) {
  const ok = await showConfirm(`Hapus ekskul ${item}?`, "Ekskul akan dihapus dari pilihan.");
  if (ok) {
    ekskulList = ekskulList.filter(e => e !== item);
    localStorage.setItem('ekskulList', JSON.stringify(ekskulList));
    saveToDB();
    updateDropdownEkskul();
    renderAll();
    alertMessage('Ekskul "' + item + '" berhasil dihapus.', 'success');
  }
}
function ubahSandiAdmin() {
  const oldP = document.getElementById('oldPin').value.trim();
  const newP = document.getElementById('newPin').value.trim();
  if (!oldP || !newP) { alertMessage('Semua kolom sandi harus diisi!', 'warning'); return; }
  if (hashPin(oldP) !== adminPinHash) { alertMessage('Sandi lama salah!', 'error'); return; }
  if (newP.length < 4) { alertMessage('Sandi baru minimal 4 karakter!', 'warning'); return; }
  adminPinHash = hashPin(newP);
  localStorage.setItem('adminPinHash', adminPinHash);
  saveToDB();
  document.getElementById('oldPin').value = '';
  document.getElementById('newPin').value = '';
  alertMessage('Sandi admin berhasil diperbarui!', 'success');
}
setInterval(() => {
  const now = new Date();
  const jamEl = document.getElementById('jamReal');
  const tglEl = document.getElementById('tglReal');
  if (jamEl) jamEl.innerText = now.toLocaleTimeString('ID-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (tglEl) tglEl.innerText = now.toLocaleDateString('ID-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}, 1000);
document.getElementById('pilihSiswa')?.addEventListener('change', renderPribadi);
document.getElementById('filterTgl')?.addEventListener('change', renderAdmin);
document.getElementById('inputPin')?.addEventListener('keypress', e => { if (e.key === 'Enter') verifyAdminLogin(); });
init();