import { useState, useEffect, useRef, useMemo } from "react";

const GREEN = "#1D9E75";
const GREEN_L = "#25C896";
const CAR_TYPES = { mine: "سيارتي", trust: "أمانة" };
const CAR_STATUSES = { new: "جديدة", preparing: "قيد التجهيز", ready: "جاهزة للبيع", reserved: "محجوزة" };
const PAY_METHODS = { cash: "كاش", bank: "بنك" };
const STORE_KEY = "unicars_data_v2";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => { if (n === undefined || n === null || isNaN(Number(n))) return "0"; return Number(n).toLocaleString("en-US"); };
const fmtDate = (d) => { if (!d) return "-"; const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
const daysDiff = (d1, d2) => { if (!d1) return 0; return Math.max(1, Math.ceil(((d2 ? new Date(d2) : new Date()) - new Date(d1)) / 86400000)); };
const today = () => new Date().toISOString().split("T")[0];

const newCar = () => ({
  id: uid(), name: "", model: "", year: 2025, color: "", mileage: "", source: "",
  purchasePrice: "", purchaseDate: today(), receiveDate: today(),
  type: "mine", status: "new", notes: "", image: null, owner: "",
  expenses: [], capitalPayments: [], offers: [],
  sold: false, salePrice: "", saleDate: null, saleMethod: "cash",
  suggestedSalePrice: "", createdAt: Date.now(),
  initialCapital: "", initialCapitalSource: "",
  settled: false,
});

const totalCost = (c) => Number(c.purchasePrice || 0) + c.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
const expensesOnly = (c) => c.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
const totalCapital = (c) => Number(c.initialCapital || 0) + c.capitalPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
const deficitCalc = (c) => totalCost(c) - totalCapital(c);
const profitCalc = (c) => Number(c.salePrice || 0) - totalCost(c);
const profitPct = (c) => { const t = totalCost(c); return t === 0 ? 0 : ((profitCalc(c) / t) * 100).toFixed(1); };
const daysHeld = (c) => c.sold && c.saleDate ? daysDiff(c.receiveDate, c.saleDate) : daysDiff(c.receiveDate);

const buildTimeline = (c) => {
  const ev = [];
  if (c.purchaseDate) ev.push({ date: c.purchaseDate, type: "شراء", detail: `سعر الشراء: ${fmt(c.purchasePrice)}`, color: GREEN });
  if (c.receiveDate && c.receiveDate !== c.purchaseDate) ev.push({ date: c.receiveDate, type: "استلام", detail: "تم استلام السيارة", color: "#3498db" });
  if (Number(c.initialCapital || 0) > 0) ev.push({ date: c.purchaseDate, type: "دفعة مستلمة", detail: `${fmt(c.initialCapital)} - ${c.initialCapitalSource || "أولية"}`, color: "#2ecc71" });
  c.expenses.forEach(e => ev.push({ date: e.date, type: "مصروف", detail: `${fmt(e.amount)} - ${e.reason}`, color: "#e74c3c" }));
  c.capitalPayments.forEach(p => ev.push({ date: p.date, type: "دفعة مستلمة", detail: `${fmt(p.amount)} - ${p.source}`, color: "#2ecc71" }));
  c.offers.forEach(o => ev.push({ date: o.date, type: "عرض سعر", detail: `${fmt(o.amount)} - ${o.person}`, color: "#f39c12" }));
  if (c.sold && c.saleDate) ev.push({ date: c.saleDate, type: "بيع", detail: `سعر البيع: ${fmt(c.salePrice)} (${PAY_METHODS[c.saleMethod]})`, color: "#9b59b6" });
  return ev.sort((a, b) => new Date(a.date) - new Date(b.date));
};

const shareText = (c, sold = false) => {
  const lines = [`🚗 ${c.name} ${c.model} ${c.year}`, `اللون: ${c.color}`, `المسافة: ${c.mileage || "-"}`,
    `المصدر: ${c.source || "-"}`];
  if (c.owner) lines.push(`المالك: ${c.owner}`);
  lines.push(`سعر الشراء: ${fmt(c.purchasePrice)}`, `المصاريف: ${fmt(expensesOnly(c))}`,
    `التكلفة الإجمالية: ${fmt(totalCost(c))}`, `رأس المال المستلم: ${fmt(totalCapital(c))}`);
  const d = deficitCalc(c);
  lines.push(d > 0 ? `العجز: ${fmt(d)}` : d < 0 ? `فائض: ${fmt(Math.abs(d))}` : `مغطّاة بالكامل`);
  if (sold) {
    lines.push("", "--- تم البيع ---", `سعر البيع: ${fmt(c.salePrice)}`, `طريقة الدفع: ${PAY_METHODS[c.saleMethod]}`,
      `تاريخ البيع: ${fmtDate(c.saleDate)}`, `مدة بالمخزون: ${daysHeld(c)} يوم`,
      `${profitCalc(c) >= 0 ? "الربح" : "الخسارة"}: ${fmt(Math.abs(profitCalc(c)))} (${profitPct(c)}%)`);
  }
  lines.push("", "UNICARS");
  return lines.join("\n");
};

// ===== DUAL STORAGE: localStorage + IndexedDB =====
const IDB_NAME = "unicars_db";
const IDB_STORE = "data";
const IDB_KEY = "main";

const openIDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbGet = async () => {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
};

const idbSet = async (d) => {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(d, IDB_KEY);
  } catch {}
};

const loadData = () => {
  try {
    const r = localStorage.getItem(STORE_KEY);
    if (r) return JSON.parse(r);
  } catch {}
  return { cars: [], lastBackup: null };
};

const saveData = (d) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
  idbSet(d);
};

const S = {
  bg: "#f7f8fa", card: "#ffffff", input: "#f2f3f5", border: "#e4e6ea", borderLight: "#eef0f2",
  textPrimary: "#1a1a2e", textSecondary: "#6b7280", shadow: "0 2px 12px rgba(0,0,0,0.06)",
};

function Modal({ open, onClose, title, children, wide, zIndex = 1000 }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)", zIndex }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", zIndex: zIndex + 1, background: "#fff", borderRadius: 20, padding: "28px 24px",
        width: "100%", maxWidth: wide ? 680 : 480, maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)", border: `1px solid ${S.borderLight}`
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${S.border}` }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: S.textPrimary }}>{title}</h2>
          <button onClick={onClose} style={{ background: S.input, border: "none", cursor: "pointer", color: S.textSecondary, padding: 8, borderRadius: 10, display: "flex" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, message, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title || "تأكيد"} zIndex={1300}>
      <p style={{ color: S.textSecondary, marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>{message}</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "11px 28px", borderRadius: 10, border: `1px solid ${S.border}`, background: "#fff", color: S.textPrimary, cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "'Cairo'" }}>إلغاء</button>
        <button onClick={onConfirm} style={{ padding: "11px 28px", borderRadius: 10, border: "none", background: "#e74c3c", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "'Cairo'" }}>تأكيد</button>
      </div>
    </Modal>
  );
}

function Toast({ msg, show }) {
  if (!show) return null;
  return (<div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 3000, background: GREEN, color: "#fff", padding: "13px 32px", borderRadius: 14, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 30px rgba(29,158,117,0.35)", animation: "fadeUp .3s ease" }}>{msg}</div>);
}

function Field({ label, value, onChange, type = "text", placeholder, options, half, readOnly }) {
  const isNum = type === "number" || type === "date";
  const base = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${S.border}`, background: readOnly ? S.borderLight : S.input, color: S.textPrimary, fontSize: 14, outline: "none", boxSizing: "border-box", direction: isNum ? "ltr" : "rtl", textAlign: isNum ? "left" : "right", fontFamily: "'Cairo', sans-serif" };
  return (
    <div style={{ marginBottom: 14, flex: half ? "1 1 48%" : "1 1 100%", minWidth: half ? 160 : "auto" }}>
      {label && <label style={{ display: "block", marginBottom: 7, fontSize: 13, color: S.textSecondary, fontWeight: 600 }}>{label}</label>}
      {options ? <select value={value} onChange={e => onChange(e.target.value)} style={{ ...base, cursor: "pointer" }}>{Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
       : type === "textarea" ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...base, resize: "vertical" }} readOnly={readOnly} />
       : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} readOnly={readOnly} />}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (<div style={{ background: "#fff", borderRadius: 16, padding: "18px 16px", border: `1px solid ${S.border}`, boxShadow: S.shadow }}>
    <div style={{ fontSize: 13, color: S.textSecondary, marginBottom: 8, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: color || S.textPrimary, fontFamily: "'Cairo'" }}>{value}</div>
  </div>);
}

const BtnC = ({ children, bg, onClick, full, small }) => (
  <button onClick={onClick} style={{ padding: small ? "8px 14px" : "11px 16px", borderRadius: 10, border: "none", background: bg || GREEN, color: "#fff", fontSize: small ? 12 : 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Cairo'", width: full ? "100%" : "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{children}</button>
);

export default function App() {
  const [data, setData] = useState(() => loadData());
  const [page, setPage] = useState("inventory");
  const [showCarForm, setShowCarForm] = useState(false);
  const [editCar, setEditCar] = useState(null);
  const [selCar, setSelCar] = useState(null);
  const [expForm, setExpForm] = useState(null);
  const [capForm, setCapForm] = useState(null);
  const [offForm, setOffForm] = useState(null);
  const [saleForm, setSaleForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tlCar, setTlCar] = useState(null);
  const [backupPrompt, setBackupPrompt] = useState(false);
  const fileRef = useRef(null);

  // On mount: if localStorage was empty, try IndexedDB recovery
  useEffect(() => {
    if (data.cars.length === 0) {
      idbGet().then(idbData => {
        if (idbData && idbData.cars && idbData.cars.length > 0) {
          setData(idbData);
          try { localStorage.setItem(STORE_KEY, JSON.stringify(idbData)); } catch {}
          setToast("تم استرجاع البيانات تلقائياً");
          setTimeout(() => setToast(null), 3000);
        }
      });
    }
  }, []);

  useEffect(() => { saveData(data); }, [data]);
  useEffect(() => { if (data.cars.length > 0 && (!data.lastBackup || Date.now() - data.lastBackup > 86400000)) setBackupPrompt(true); }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const updCars = (fn) => setData(d => ({ ...d, cars: fn(d.cars) }));
  const updCar = (id, u) => updCars(cs => cs.map(c => c.id === id ? { ...c, ...u } : c));

  const inv = data.cars.filter(c => !c.sold);
  const soldCars = data.cars.filter(c => c.sold);

  const filtered = useMemo(() => {
    let l = inv;
    if (search) l = l.filter(c => `${c.name} ${c.model}`.includes(search));
    if (filter === "deficit") l = l.filter(c => deficitCalc(c) > 0);
    if (filter === "ready") l = l.filter(c => c.status === "ready");
    if (filter === "trust") l = l.filter(c => c.type === "trust");
    return l.sort((a, b) => b.createdAt - a.createdAt);
  }, [inv, search, filter]);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `UNICARS_Backup_spending_${today()}.json`; a.click();
    setData(d => ({ ...d, lastBackup: Date.now() })); flash("تم تصدير النسخة الاحتياطية");
  };
  const doImport = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); if (d.cars) { setData(d); flash("تم استيراد البيانات"); } } catch { flash("خطأ في الملف"); } };
    r.readAsText(f);
  };
  const copyTxt = (t) => navigator.clipboard.writeText(t).then(() => flash("تم النسخ")).catch(() => flash("فشل النسخ"));

  const saveCar = (car) => {
    if (editCar) { updCar(car.id, car); flash("تم تحديث السيارة"); }
    else { updCars(cs => [car, ...cs]); flash("تم إضافة السيارة"); }
    setShowCarForm(false); setEditCar(null);
  };
  const delCar = (id) => setConfirm({ title: "حذف السيارة", message: "هل أنت متأكد من حذف هذه السيارة؟", onConfirm: () => { updCars(cs => cs.filter(c => c.id !== id)); setSelCar(null); setConfirm(null); flash("تم الحذف"); } });
  const sellCar = (id, price, method, date) => { updCar(id, { sold: true, salePrice: Number(price), saleMethod: method, saleDate: date }); setSaleForm(null); flash("تم تسجيل البيع"); };
  const addExp = (cid, exp) => { updCars(cs => cs.map(c => c.id === cid ? { ...c, expenses: [...c.expenses, { id: uid(), ...exp }] } : c)); setExpForm(null); flash("تم إضافة المصروف"); };
  const addCap = (cid, p) => { updCars(cs => cs.map(c => c.id === cid ? { ...c, capitalPayments: [...c.capitalPayments, { id: uid(), ...p }] } : c)); setCapForm(null); flash("تم إضافة الدفعة"); };
  const addOff = (cid, o) => { updCars(cs => cs.map(c => c.id === cid ? { ...c, offers: [...c.offers, { id: uid(), ...o }] } : c)); setOffForm(null); flash("تم تسجيل العرض"); };
  const delSub = (cid, field, iid) => { updCars(cs => cs.map(c => c.id === cid ? { ...c, [field]: c[field].filter(i => i.id !== iid) } : c)); flash("تم الحذف"); };
  const toggleSettled = (id) => { const car = data.cars.find(c => c.id === id); updCar(id, { settled: !car.settled }); flash(car.settled ? "تم إلغاء التسوية" : "تم تسوية الحساب"); };

  const cardBorder = (c) => {
    if (c.type === "trust") return `2px solid #f39c12`;
    const d = deficitCalc(c);
    if (d > 0) return `2px solid #e74c3c`;
    if (d < 0) return `2px solid ${GREEN_L}`;
    return `2px solid ${GREEN}`;
  };

  const bestDeal = useMemo(() => { if (!soldCars.length) return null; return soldCars.reduce((b, c) => profitCalc(c) > profitCalc(b) ? c : b, soldCars[0]); }, [soldCars]);

  // Dashboard stats
  const totalInv = inv.reduce((s, c) => s + totalCost(c), 0);
  const invDeficit = inv.reduce((s, c) => { const d = deficitCalc(c); return d > 0 ? s + d : s; }, 0);
  const invSurplus = inv.reduce((s, c) => { const d = deficitCalc(c); return d < 0 ? s + Math.abs(d) : s; }, 0);
  const soldDeficit = soldCars.filter(c => !c.settled).reduce((s, c) => { const d = deficitCalc(c); return d > 0 ? s + d : s; }, 0);
  const soldSurplus = soldCars.filter(c => !c.settled).reduce((s, c) => { const d = deficitCalc(c); return d < 0 ? s + Math.abs(d) : s; }, 0);

  // ===== CAR FORM =====
  const CarForm = () => {
    const [f, setF] = useState(editCar || newCar());
    const imgR = useRef(null);
    const handleImg = (e) => { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = ev => setF(p => ({ ...p, image: ev.target.result })); r.readAsDataURL(file); };
    return (
      <Modal open={showCarForm} onClose={() => { setShowCarForm(false); setEditCar(null); }} title={editCar ? "تعديل السيارة" : "إضافة سيارة جديدة"} wide>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
          <Field half label="اسم السيارة" value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="مرسيدس بنز" />
          <Field half label="الموديل" value={f.model} onChange={v => setF({ ...f, model: v })} placeholder="CLS" />
          <Field half label="سنة الصنع" value={f.year} onChange={v => setF({ ...f, year: v })} type="number" />
          <Field half label="اللون" value={f.color} onChange={v => setF({ ...f, color: v })} placeholder="أبيض" />
          <Field half label="المسافة (كم)" value={f.mileage} onChange={v => setF({ ...f, mileage: v })} placeholder="45000" />
          <Field half label="المصدر" value={f.source} onChange={v => setF({ ...f, source: v })} placeholder="المزاد" />
          <Field half label="سعر الشراء" value={f.purchasePrice} onChange={v => setF({ ...f, purchasePrice: v })} type="number" />
          <Field half label="سعر البيع المقترح" value={f.suggestedSalePrice} onChange={v => setF({ ...f, suggestedSalePrice: v })} type="number" placeholder="اختياري" />
          <Field half label="تاريخ الشراء" value={f.purchaseDate} onChange={v => setF({ ...f, purchaseDate: v })} type="date" />
          <Field half label="تاريخ الاستلام" value={f.receiveDate} onChange={v => setF({ ...f, receiveDate: v })} type="date" />
          <Field half label="نوع السيارة" value={f.type} onChange={v => setF({ ...f, type: v })} options={CAR_TYPES} />
          <Field half label="الحالة" value={f.status} onChange={v => setF({ ...f, status: v })} options={CAR_STATUSES} />
          <Field half label="مالك السيارة (اختياري)" value={f.owner} onChange={v => setF({ ...f, owner: v })} placeholder="اختياري" />
        </div>
        <div style={{ background: `${GREEN}0a`, border: `1px solid ${GREEN}30`, borderRadius: 14, padding: "18px 16px", margin: "8px 0 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: GREEN, marginBottom: 14 }}>💰 رأس المال المستلم (أولي)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
            <Field half label="المبلغ المستلم" value={f.initialCapital} onChange={v => setF({ ...f, initialCapital: v })} type="number" placeholder="0" />
            <Field half label="المصدر" value={f.initialCapitalSource} onChange={v => setF({ ...f, initialCapitalSource: v })} placeholder="الشريك أحمد" />
          </div>
        </div>
        <Field label="ملاحظات" value={f.notes} onChange={v => setF({ ...f, notes: v })} type="textarea" placeholder="أي ملاحظات..." />
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 13, color: S.textSecondary, fontWeight: 600, display: "block", marginBottom: 8 }}>صورة (اختياري)</label>
          <div onClick={() => imgR.current?.click()} style={{ width: "100%", height: 100, borderRadius: 14, border: `2px dashed ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: f.image ? "none" : S.input }}>
            {f.image ? <img src={f.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: S.textSecondary, fontSize: 13 }}>اضغط لإضافة صورة</span>}
          </div>
          <input ref={imgR} type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} />
          {f.image && <button onClick={() => setF({ ...f, image: null })} style={{ marginTop: 6, background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 12, fontFamily: "'Cairo'" }}>إزالة</button>}
        </div>
        <BtnC bg={GREEN} onClick={() => saveCar(f)} full>{editCar ? "حفظ التعديلات" : "إضافة السيارة"}</BtnC>
      </Modal>
    );
  };

  // ===== SUB MODALS (z1100) =====
  const ExpFormM = () => { const [f, setF] = useState({ amount: "", reason: "", date: today() }); return (<Modal open={!!expForm} onClose={() => setExpForm(null)} title="إضافة مصروف" zIndex={1100}><Field label="المبلغ" value={f.amount} onChange={v => setF({ ...f, amount: v })} type="number" /><Field label="السبب" value={f.reason} onChange={v => setF({ ...f, reason: v })} placeholder="تسجيل / صيانة" /><Field label="التاريخ" value={f.date} onChange={v => setF({ ...f, date: v })} type="date" /><BtnC bg={GREEN} onClick={() => { if (f.amount && f.reason) addExp(expForm, f); }} full>إضافة</BtnC></Modal>); };
  const CapFormM = () => { const [f, setF] = useState({ amount: "", source: "", date: today() }); return (<Modal open={!!capForm} onClose={() => setCapForm(null)} title="إضافة دفعة رأس مال" zIndex={1100}><Field label="المبلغ" value={f.amount} onChange={v => setF({ ...f, amount: v })} type="number" /><Field label="المصدر" value={f.source} onChange={v => setF({ ...f, source: v })} placeholder="الشريك أحمد" /><Field label="التاريخ" value={f.date} onChange={v => setF({ ...f, date: v })} type="date" /><BtnC bg={GREEN} onClick={() => { if (f.amount && f.source) addCap(capForm, f); }} full>إضافة</BtnC></Modal>); };
  const OffFormM = () => { const [f, setF] = useState({ amount: "", person: "", date: today() }); return (<Modal open={!!offForm} onClose={() => setOffForm(null)} title="تسجيل عرض سعر" zIndex={1100}><Field label="المبلغ" value={f.amount} onChange={v => setF({ ...f, amount: v })} type="number" /><Field label="الشخص" value={f.person} onChange={v => setF({ ...f, person: v })} placeholder="محمد" /><Field label="التاريخ" value={f.date} onChange={v => setF({ ...f, date: v })} type="date" /><BtnC bg="#f39c12" onClick={() => { if (f.amount && f.person) addOff(offForm, f); }} full>تسجيل</BtnC></Modal>); };

  const SaleFormM = () => {
    const [f, setF] = useState({ price: "", method: "cash", date: today() });
    const car = data.cars.find(c => c.id === saleForm);
    const ep = car ? Number(f.price || 0) - totalCost(car) : 0;
    return (<Modal open={!!saleForm} onClose={() => setSaleForm(null)} title="تسجيل البيع" zIndex={1100}>
      <Field label="سعر البيع" value={f.price} onChange={v => setF({ ...f, price: v })} type="number" />
      <Field label="طريقة الدفع" value={f.method} onChange={v => setF({ ...f, method: v })} options={PAY_METHODS} />
      <Field label="التاريخ" value={f.date} onChange={v => setF({ ...f, date: v })} type="date" />
      {f.price && car && (<div style={{ padding: 16, borderRadius: 12, background: S.input, marginBottom: 18, textAlign: "center" }}>
        <span style={{ color: S.textSecondary, fontSize: 13 }}>الربح المتوقع: </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: ep >= 0 ? GREEN : "#e74c3c" }}>{fmt(ep)}</span>
      </div>)}
      <BtnC bg={GREEN} onClick={() => { if (f.price) setConfirm({ title: "تأكيد البيع", message: `تسجيل بيع السيارة بمبلغ ${fmt(f.price)}؟`, onConfirm: () => { sellCar(saleForm, f.price, f.method, f.date); setConfirm(null); } }); }} full>تسجيل البيع</BtnC>
    </Modal>);
  };

  const TimelineM = () => {
    const car = data.cars.find(c => c.id === tlCar); if (!car) return null;
    const events = buildTimeline(car);
    return (<Modal open={!!tlCar} onClose={() => setTlCar(null)} title={`سجل: ${car.name} ${car.model}`} zIndex={1100}>
      {events.length === 0 ? <p style={{ color: S.textSecondary, textAlign: "center", padding: 30 }}>لا توجد أحداث</p> : (
        <div style={{ paddingRight: 24, position: "relative" }}>
          <div style={{ position: "absolute", right: 9, top: 4, bottom: 4, width: 2, background: S.border, borderRadius: 2 }} />
          {events.map((ev, i) => (<div key={i} style={{ display: "flex", gap: 18, marginBottom: 22, position: "relative" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: ev.color, flexShrink: 0, marginTop: 2, zIndex: 1, border: "3px solid #fff" }} />
            <div><div style={{ fontSize: 12, color: S.textSecondary }}>{fmtDate(ev.date)}</div><div style={{ fontSize: 14, fontWeight: 700, color: ev.color, marginTop: 3 }}>{ev.type}</div><div style={{ fontSize: 13, color: S.textSecondary, marginTop: 3 }}>{ev.detail}</div></div>
          </div>))}
        </div>
      )}
    </Modal>);
  };

  // ===== TABLE with total =====
  const TableWithTotal = ({ title, items, field, cols, render, totalAmount, carId }) => (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>{title} ({items.length})</h4>
      {items.length > 0 && (
        <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${S.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr) 36px`, padding: "10px 14px", background: S.input, fontSize: 12, color: S.textSecondary, fontWeight: 600 }}>
            {cols.map(c => <div key={c}>{c}</div>)}<div></div>
          </div>
          {items.map(item => (<div key={item.id} style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr) 36px`, padding: "10px 14px", fontSize: 13, borderTop: `1px solid ${S.borderLight}`, alignItems: "center" }}>
            {render(item).map((v, i) => <div key={i}>{v}</div>)}
            <button onClick={() => delSub(carId, field, item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74c3c", padding: 4 }}>✕</button>
          </div>))}
          {totalAmount !== undefined && (
            <div style={{ padding: "10px 14px", borderTop: `2px solid ${S.border}`, background: S.input, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
              المجموع: {fmt(totalAmount)}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ===== CAR DETAIL =====
  const CarDetail = () => {
    const car = data.cars.find(c => c.id === selCar); if (!car) return null;
    const tc = totalCost(car); const cap = totalCapital(car); const def = deficitCalc(car);
    const days = daysHeld(car); const expTotal = expensesOnly(car);
    const isSold = car.sold;

    return (
      <Modal open={!!selCar} onClose={() => setSelCar(null)} title={`${car.name} ${car.model} ${car.year}`} wide>
        {car.image && <img src={car.image} style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 14, marginBottom: 20 }} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 22 }}>
          {[
            { l: "التكلفة الإجمالية", v: fmt(tc), c: S.textPrimary },
            { l: "رأس المال", v: fmt(cap), c: GREEN },
            { l: def > 0 ? "العجز" : def < 0 ? "الفائض" : "مغطّاة", v: def === 0 ? "✓" : fmt(Math.abs(def)), c: def > 0 ? "#e74c3c" : GREEN },
          ].map((s, i) => (<div key={i} style={{ padding: 16, borderRadius: 12, background: S.input, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
          </div>))}
        </div>

        {/* Sold info OR suggested price */}
        {isSold ? (
          <div style={{ padding: 14, borderRadius: 12, background: "#f0faf6", border: `1px solid ${GREEN}25`, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: S.textSecondary }}>سعر البيع</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{fmt(car.salePrice)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: S.textSecondary }}>{profitCalc(car) >= 0 ? "الربح" : "الخسارة"}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: profitCalc(car) >= 0 ? GREEN : "#e74c3c" }}>{fmt(Math.abs(profitCalc(car)))} ({profitPct(car)}%)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: S.textSecondary }}>مدة بالمخزون</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: S.textPrimary }}>{days} يوم</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: S.textSecondary }}>إجمالي المصاريف</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e74c3c" }}>{fmt(expTotal)}</span>
            </div>
          </div>
        ) : car.suggestedSalePrice ? (
          <div style={{ padding: 14, borderRadius: 12, background: `${GREEN}0a`, border: `1px solid ${GREEN}25`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: GREEN }}>💲 سعر البيع المقترح</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>{fmt(car.suggestedSalePrice)}</span>
          </div>
        ) : null}

        {/* Info grid */}
        <div style={{ background: S.input, borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 13 }}>
            {[
              ["اللون", car.color || "-"], ["المسافة", `${car.mileage || "-"} كم`],
              ["المصدر", car.source || "-"], ["الحالة", CAR_STATUSES[car.status]],
              ["النوع", CAR_TYPES[car.type]], ["أيام بالمخزون", `${days} يوم`],
              ["تاريخ الشراء", fmtDate(car.purchaseDate)], ["تاريخ الاستلام", fmtDate(car.receiveDate)],
              ...(car.owner ? [["المالك", car.owner]] : []),
              ...(isSold ? [["تاريخ البيع", fmtDate(car.saleDate)], ["طريقة الدفع", PAY_METHODS[car.saleMethod]]] : []),
            ].map(([k, v], i) => (<div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ color: S.textSecondary, fontSize: 12 }}>{k}</span>
              <span style={{ color: S.textPrimary, fontWeight: 600 }}>{v}</span>
            </div>))}
          </div>
        </div>

        {car.notes && <div style={{ padding: 14, borderRadius: 12, background: S.input, fontSize: 13, color: S.textSecondary, marginBottom: 20, lineHeight: 1.6 }}>📝 {car.notes}</div>}

        <TableWithTotal title="المصاريف" items={car.expenses} field="expenses" cols={["المبلغ", "السبب", "التاريخ"]} render={e => [fmt(e.amount), e.reason, fmtDate(e.date)]} totalAmount={expTotal} carId={car.id} />

        {/* Capital table with initial */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>دفعات رأس المال ({car.capitalPayments.length + (Number(car.initialCapital || 0) > 0 ? 1 : 0)})</h4>
          <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${S.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 36px", padding: "10px 14px", background: S.input, fontSize: 12, color: S.textSecondary, fontWeight: 600 }}>
              <div>المبلغ</div><div>المصدر</div><div>التاريخ</div><div></div>
            </div>
            {Number(car.initialCapital || 0) > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 36px", padding: "10px 14px", fontSize: 13, borderTop: `1px solid ${S.borderLight}`, background: `${GREEN}06` }}>
                <div style={{ color: GREEN, fontWeight: 600 }}>{fmt(car.initialCapital)}</div>
                <div style={{ color: GREEN }}>{car.initialCapitalSource || "دفعة أولية"}</div>
                <div style={{ color: GREEN }}>{fmtDate(car.purchaseDate)}</div><div></div>
              </div>
            )}
            {car.capitalPayments.map(item => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 36px", padding: "10px 14px", fontSize: 13, borderTop: `1px solid ${S.borderLight}`, alignItems: "center" }}>
                <div>{fmt(item.amount)}</div><div>{item.source}</div><div>{fmtDate(item.date)}</div>
                <button onClick={() => delSub(car.id, "capitalPayments", item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74c3c", padding: 4 }}>✕</button>
              </div>
            ))}
            <div style={{ padding: "10px 14px", borderTop: `2px solid ${S.border}`, background: S.input, fontSize: 13, fontWeight: 700, color: GREEN }}>
              المجموع: {fmt(cap)}
            </div>
          </div>
        </div>

        <TableWithTotal title="عروض الأسعار" items={car.offers} field="offers" cols={["المبلغ", "الشخص", "التاريخ"]} render={o => [fmt(o.amount), o.person, fmtDate(o.date)]} carId={car.id} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
          <BtnC bg="#e74c3c" onClick={() => setExpForm(car.id)}>+ مصروف</BtnC>
          <BtnC bg={GREEN} onClick={() => setCapForm(car.id)}>+ دفعة</BtnC>
          <BtnC bg="#f39c12" onClick={() => setOffForm(car.id)}>+ عرض سعر</BtnC>
          <BtnC bg="#3498db" onClick={() => setTlCar(car.id)}>السجل الزمني</BtnC>
          <BtnC bg="#8e44ad" onClick={() => copyTxt(shareText(car, car.sold))}>نسخ ملخّص</BtnC>
          {!car.sold && <BtnC bg="#27ae60" onClick={() => setSaleForm(car.id)}>تم البيع</BtnC>}
          {car.sold && <BtnC bg={car.settled ? "#95a5a6" : "#e67e22"} onClick={() => toggleSettled(car.id)}>{car.settled ? "إلغاء التسوية" : "تم الحساب"}</BtnC>}
          <BtnC bg="#34495e" onClick={() => { setEditCar(car); setShowCarForm(true); }}>تعديل</BtnC>
          <BtnC bg="#c0392b" onClick={() => delCar(car.id)}>حذف</BtnC>
        </div>
      </Modal>
    );
  };

  // ===== CAR CARD =====
  const CarCard = ({ car }) => {
    const tc = totalCost(car); const def = deficitCalc(car); const days = daysHeld(car);
    return (
      <div onClick={() => setSelCar(car.id)} style={{ background: "#fff", borderRadius: 16, border: cardBorder(car), cursor: "pointer", overflow: "hidden", boxShadow: S.shadow }}>
        <div style={{ height: 130, background: S.input, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
          {car.image ? <img src={car.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 40, opacity: 0.15 }}>🚗</span>}
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 5 }}>
            <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: car.type === "trust" ? "#fef3e2" : "#e8f8f2", color: car.type === "trust" ? "#e67e22" : GREEN }}>{CAR_TYPES[car.type]}</span>
            <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#f0f1f3", color: S.textSecondary }}>{CAR_STATUSES[car.status]}</span>
          </div>
          <span style={{ position: "absolute", top: 10, right: 10, padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "rgba(0,0,0,0.55)", color: "#fff" }}>{days} يوم</span>
        </div>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: S.textPrimary, marginBottom: 4 }}>{car.name} {car.model}</div>
          <div style={{ fontSize: 13, color: S.textSecondary, marginBottom: 6 }}>{car.year} • {car.color}{car.mileage ? ` • ${car.mileage} كم` : ""}</div>
          {car.owner && <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 10 }}>👤 {car.owner}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, color: S.textSecondary, marginBottom: 3 }}>التكلفة</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: S.textPrimary }}>{fmt(tc)}</div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 11, color: S.textSecondary, marginBottom: 3 }}>{def > 0 ? "عجز" : def < 0 ? "فائض" : "مغطّاة"}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: def > 0 ? "#e74c3c" : GREEN }}>{def === 0 ? "✓" : fmt(Math.abs(def))}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ===== SOLD CARD =====
  const SoldCard = ({ car }) => {
    const p = profitCalc(car); const def = deficitCalc(car);
    return (
      <div onClick={() => setSelCar(car.id)} style={{
        background: "#fff", borderRadius: 16, cursor: "pointer", padding: "20px 22px", boxShadow: S.shadow,
        border: car.settled ? `2px solid ${GREEN}` : def > 0 ? `2px solid #e74c3c` : `1px solid ${S.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{car.name} {car.model} {car.year}</span>
              {car.settled && <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#e8f8f2", color: GREEN }}>تم الحساب</span>}
              {!car.settled && def > 0 && <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#fef0f0", color: "#e74c3c" }}>عجز {fmt(def)}</span>}
            </div>
            <div style={{ fontSize: 13, color: S.textSecondary, marginTop: 6 }}>{fmtDate(car.saleDate)} • {PAY_METHODS[car.saleMethod]}</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 11, color: S.textSecondary }}>{p >= 0 ? "ربح" : "خسارة"}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: p >= 0 ? GREEN : "#e74c3c" }}>{fmt(Math.abs(p))}</div>
            <div style={{ fontSize: 12, color: p >= 0 ? GREEN : "#e74c3c", fontWeight: 600 }}>{profitPct(car)}%</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 13, color: S.textSecondary, marginBottom: 14 }}>
          <span>التكلفة: <b style={{ color: S.textPrimary }}>{fmt(totalCost(car))}</b></span>
          <span>البيع: <b style={{ color: S.textPrimary }}>{fmt(car.salePrice)}</b></span>
        </div>
        <BtnC bg="#8e44ad" small onClick={e => { e.stopPropagation(); copyTxt(shareText(car, true)); }}>نسخ ملخّص</BtnC>
      </div>
    );
  };

  const NavBtn = ({ id, label, count }) => (
    <button onClick={() => setPage(id)} style={{ padding: "8px 14px", borderRadius: 10, border: page === id ? `2px solid ${GREEN}` : `1px solid ${S.border}`, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Cairo'", background: page === id ? `${GREEN}0d` : "#fff", color: page === id ? GREEN : S.textSecondary, display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }}>
      {label}{count !== undefined && <span style={{ background: page === id ? GREEN : S.input, color: page === id ? "#fff" : S.textSecondary, padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{count}</span>}
    </button>
  );

  return (
    <div dir="rtl" style={{ background: S.bg, minHeight: "100vh", fontFamily: "'Cairo', sans-serif", color: S.textPrimary }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}body{background:${S.bg}}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px}
        @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        select,input,textarea,button{font-family:'Cairo',sans-serif}
      `}</style>

      <nav style={{ background: "#fff", borderBottom: `1px solid ${S.border}`, position: "sticky", top: 0, zIndex: 900, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>UNICARS</span>
              <span style={{ fontSize: 11, color: S.textSecondary, borderRight: `2px solid ${GREEN}`, paddingRight: 10 }}>حسابات السيارات</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={doExport} title="تصدير" style={{ background: S.input, border: `1px solid ${S.border}`, cursor: "pointer", color: S.textSecondary, padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              </button>
              <button onClick={() => fileRef.current?.click()} title="استيراد" style={{ background: S.input, border: `1px solid ${S.border}`, cursor: "pointer", color: S.textSecondary, padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              </button>
              <input ref={fileRef} type="file" accept=".json" onChange={doImport} style={{ display: "none" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <NavBtn id="inventory" label="المخزون" count={inv.length} />
            <NavBtn id="sold" label="المبيعات" count={soldCars.length} />
            <NavBtn id="dashboard" label="Dashboard" />
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {page === "inventory" && (<>
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: S.textSecondary, display: "flex" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." style={{ width: "100%", padding: "11px 42px 11px 14px", borderRadius: 12, border: `1px solid ${S.border}`, background: "#fff", color: S.textPrimary, fontSize: 14, outline: "none", fontFamily: "'Cairo'" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ id: "all", l: "الكل" }, { id: "deficit", l: "عجز" }, { id: "ready", l: "جاهزة" }, { id: "trust", l: "أمانة" }].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${filter === f.id ? GREEN : S.border}`, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Cairo'", background: filter === f.id ? `${GREEN}0d` : "#fff", color: filter === f.id ? GREEN : S.textSecondary }}>{f.l}</button>
              ))}
            </div>
            <BtnC bg={GREEN} onClick={() => { setEditCar(null); setShowCarForm(true); }}>+ إضافة سيارة</BtnC>
          </div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: S.textSecondary }}>
              <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.3 }}>🚗</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>لا توجد سيارات</div>
              <div style={{ fontSize: 14 }}>اضغط "إضافة سيارة" للبدء</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>{filtered.map(c => <CarCard key={c.id} car={c} />)}</div>
          )}
        </>)}

        {page === "sold" && (<>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>السيارات المباعة</h2>
          {soldCars.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: S.textSecondary }}>
              <div style={{ fontSize: 52, opacity: 0.3 }}>📊</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 16 }}>لا توجد مبيعات بعد</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>{soldCars.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate)).map(c => <SoldCard key={c.id} car={c} />)}</div>
          )}
        </>)}

        {page === "dashboard" && (<>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>لوحة التحكم</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <StatCard label="سيارات بالمخزون" value={inv.length} color={GREEN} />
            <StatCard label="عدد المبيعات" value={soldCars.length} color="#3498db" />
            <StatCard label="إجمالي المستثمر" value={fmt(totalInv)} />
            <StatCard label="عجز المخزون" value={fmt(invDeficit)} color={invDeficit > 0 ? "#e74c3c" : GREEN} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: S.textSecondary }}>حسابات غير مسوّاة (مبيعات)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <StatCard label="عجز مبيعات (غير مسوّى)" value={fmt(soldDeficit)} color={soldDeficit > 0 ? "#e74c3c" : GREEN} />
            <StatCard label="فائض مبيعات (غير مسوّى)" value={fmt(soldSurplus)} color={soldSurplus > 0 ? GREEN : S.textSecondary} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <StatCard label="فائض المخزون" value={fmt(invSurplus)} color={invSurplus > 0 ? GREEN : S.textSecondary} />
          </div>
          {bestDeal && (
            <div style={{ background: "#fff", borderRadius: 16, border: `2px solid ${GREEN}`, padding: 24, boxShadow: S.shadow }}>
              <div style={{ fontSize: 14, color: GREEN, fontWeight: 700, marginBottom: 8 }}>🏆 أفضل صفقة</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{bestDeal.name} {bestDeal.model} {bestDeal.year}</div>
              <div style={{ fontSize: 15, color: S.textSecondary, marginTop: 6 }}>ربح: <b style={{ color: GREEN }}>{fmt(profitCalc(bestDeal))}</b> ({profitPct(bestDeal)}%)</div>
            </div>
          )}
        </>)}
      </main>

      <CarForm /><CarDetail /><ExpFormM /><CapFormM /><OffFormM /><SaleFormM /><TimelineM />
      <ConfirmModal open={!!confirm} title={confirm?.title} message={confirm?.message} onConfirm={confirm?.onConfirm} onCancel={() => setConfirm(null)} />
      <Toast msg={toast} show={!!toast} />
      <Modal open={backupPrompt} onClose={() => { setBackupPrompt(false); setData(d => ({ ...d, lastBackup: Date.now() })); }} title="نسخة احتياطية">
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>💾</div>
          <p style={{ color: S.textSecondary, marginBottom: 24, lineHeight: 1.7, fontSize: 15 }}>يُنصح بتصدير نسخة احتياطية بشكل دوري</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={() => { setBackupPrompt(false); setData(d => ({ ...d, lastBackup: Date.now() })); }} style={{ padding: "11px 28px", borderRadius: 10, border: `1px solid ${S.border}`, background: "#fff", color: S.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "'Cairo'" }}>لاحقاً</button>
            <BtnC bg={GREEN} onClick={() => { doExport(); setBackupPrompt(false); }}>تصدير الآن</BtnC>
          </div>
        </div>
      </Modal>
    </div>
  );
}
