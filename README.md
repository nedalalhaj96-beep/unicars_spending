# UNICARS - حسابات السيارات 🚗

أول معرض سيارات بلا جدران

## المميزات
- إدارة مخزون السيارات مع تتبع التكاليف والمصاريف
- نظام رأس المال والعجز/الفائض
- تسجيل عروض الأسعار والمبيعات
- لوحة تحكم بالإحصائيات
- تصدير واستيراد البيانات (JSON)
- نسخ ملخص السيارة للواتساب
- سجل أحداث زمني لكل سيارة
- عدّاد أيام بالمخزون وتكلفة يومية

## التشغيل
التطبيق يعمل كصفحة HTML ثابتة بدون سيرفر. البيانات تُخزّن في localStorage.

### GitHub Pages
1. ارفع الملفات على GitHub
2. فعّل GitHub Pages من Settings > Pages > Source: main branch
3. التطبيق سيكون متاح على: `https://username.github.io/repo-name`

## الملفات
- `index.html` - الصفحة الرئيسية
- `app.jsx` - كود التطبيق (React)

## التقنيات
- React 18 (via CDN)
- Babel Standalone (for JSX)
- Cairo Font
- localStorage for data persistence
