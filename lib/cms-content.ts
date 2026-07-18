// Draft content for the platform's static/legal pages. Seeded into the CmsPage
// table (admins can edit or replace the copy at /admin/pages). This is DRAFT
// text meant for the operator's legal review before launch — not legal advice.
export type CmsSeed = {
  slug: string;
  title: { en: string; ar: string };
  body: { en: string; ar: string };
};

// Footer navigation order for the seeded pages.
export const FOOTER_PAGE_SLUGS = [
  "about",
  "terms",
  "privacy",
  "returns",
  "faq",
  "contact",
];

export const CMS_SEEDS: CmsSeed[] = [
  {
    slug: "about",
    title: { en: "About Hezalli", ar: "عن هزلي" },
    body: {
      en: `<h2>Our marketplace</h2>
<p>Hezalli is an online marketplace that connects buyers with independent
sellers across Yemen and the region. We give local shops and entrepreneurs a
simple way to reach customers, and give shoppers a trusted place to discover
products and pay the way that suits them.</p>
<h2>How it works</h2>
<p>Products on Hezalli are listed and shipped by third-party sellers. Hezalli
provides the platform, order management, buyer protection, and payment
coordination. Sellers are responsible for their own listings, stock, and
fulfilment.</p>
<h2>Payments</h2>
<p>We support cash on delivery, bank transfer, USDT, and wallet balance. All
prices are shown in US dollars. USDT is treated one-to-one with the US dollar.</p>`,
      ar: `<h2>سوقنا الإلكتروني</h2>
<p>هزلي هو سوق إلكتروني يربط المشترين بالبائعين المستقلين في اليمن والمنطقة.
نمنح المتاجر المحلية وروّاد الأعمال طريقة بسيطة للوصول إلى العملاء، ونمنح
المتسوقين مكاناً موثوقاً لاكتشاف المنتجات والدفع بالطريقة التي تناسبهم.</p>
<h2>كيف يعمل</h2>
<p>تُعرض المنتجات على هزلي وتُشحن من قِبل بائعين مستقلين. توفّر هزلي المنصة
وإدارة الطلبات وحماية المشتري وتنسيق الدفع. البائعون مسؤولون عن قوائمهم
ومخزونهم وتسليم طلباتهم.</p>
<h2>الدفع</h2>
<p>ندعم الدفع عند الاستلام والتحويل البنكي وUSDT ورصيد المحفظة. تُعرض جميع
الأسعار بالدولار الأمريكي، ويُعامل USDT بنسبة واحد إلى واحد مع الدولار.</p>`,
    },
  },
  {
    slug: "terms",
    title: { en: "Terms of Service", ar: "شروط الخدمة" },
    body: {
      en: `<p><em>Draft — pending legal review.</em></p>
<h2>1. Acceptance</h2>
<p>By creating an account or placing an order on Hezalli, you agree to these
Terms. If you do not agree, please do not use the platform.</p>
<h2>2. Accounts</h2>
<p>You are responsible for keeping your account credentials secure and for all
activity under your account. You must provide accurate information and be old
enough to enter into a binding contract.</p>
<h2>3. Marketplace role</h2>
<p>Hezalli is a marketplace. Contracts of sale are between the buyer and the
seller. Hezalli facilitates the transaction, holds prepaid funds in escrow
until an order completes, and charges sellers a commission on completed orders.</p>
<h2>4. Orders and payment</h2>
<p>Prices and availability are set by sellers and may change. Prepaid orders are
confirmed once payment is verified. Cash-on-delivery orders are confirmed at
checkout and paid on delivery.</p>
<h2>5. Prohibited conduct</h2>
<p>You may not list illegal items, misrepresent products, manipulate reviews, or
use the platform to defraud others. We may suspend accounts or stores that
breach these Terms.</p>
<h2>6. Limitation of liability</h2>
<p>The platform is provided “as is”. To the extent permitted by law, Hezalli is
not liable for indirect or consequential losses arising from your use of the
service.</p>`,
      ar: `<p><em>مسودة — بانتظار المراجعة القانونية.</em></p>
<h2>١. القبول</h2>
<p>بإنشائك حساباً أو تقديمك طلباً على هزلي، فإنك توافق على هذه الشروط. إذا لم
توافق، فيرجى عدم استخدام المنصة.</p>
<h2>٢. الحسابات</h2>
<p>أنت مسؤول عن الحفاظ على سرية بيانات دخولك وعن كل نشاط يتم عبر حسابك. يجب
تقديم معلومات دقيقة وأن تكون في السن القانونية لإبرام عقد ملزم.</p>
<h2>٣. دور السوق</h2>
<p>هزلي سوق إلكتروني. تكون عقود البيع بين المشتري والبائع. تسهّل هزلي المعاملة،
وتحتفظ بالمبالغ المدفوعة مسبقاً في ضمان حتى اكتمال الطلب، وتتقاضى من البائعين
عمولة على الطلبات المكتملة.</p>
<h2>٤. الطلبات والدفع</h2>
<p>يحدد البائعون الأسعار والتوفر وقد تتغير. تُؤكَّد الطلبات المدفوعة مسبقاً بعد
التحقق من الدفع. تُؤكَّد طلبات الدفع عند الاستلام عند إتمام الطلب وتُدفع عند
التسليم.</p>
<h2>٥. السلوكيات المحظورة</h2>
<p>لا يجوز عرض منتجات غير قانونية أو تضليل الوصف أو التلاعب بالتقييمات أو استخدام
المنصة للاحتيال. قد نوقف الحسابات أو المتاجر المخالفة لهذه الشروط.</p>
<h2>٦. حدود المسؤولية</h2>
<p>تُقدَّم المنصة «كما هي». إلى الحد الذي يسمح به القانون، لا تتحمل هزلي مسؤولية
الأضرار غير المباشرة أو التبعية الناشئة عن استخدامك للخدمة.</p>`,
    },
  },
  {
    slug: "privacy",
    title: { en: "Privacy Policy", ar: "سياسة الخصوصية" },
    body: {
      en: `<p><em>Draft — pending legal review.</em></p>
<h2>What we collect</h2>
<p>We collect the information you provide when you register, place an order, or
contact support — such as your name, email, phone, and shipping addresses — as
well as order history and basic device information.</p>
<h2>How we use it</h2>
<p>We use your data to process orders, coordinate delivery and payment, provide
support, prevent fraud, and improve the service. Sellers receive only the
information needed to fulfil your orders.</p>
<h2>Sharing</h2>
<p>We share data with the sellers you buy from and with delivery and payment
partners as needed to complete your orders. We do not sell your personal data.</p>
<h2>Your choices</h2>
<p>You can review and update your profile and addresses at any time, and request
deletion of your account. Some records may be retained where required for legal
or accounting reasons.</p>`,
      ar: `<p><em>مسودة — بانتظار المراجعة القانونية.</em></p>
<h2>ما الذي نجمعه</h2>
<p>نجمع المعلومات التي تقدّمها عند التسجيل أو تقديم طلب أو التواصل مع الدعم —
مثل اسمك وبريدك وهاتفك وعناوين الشحن — بالإضافة إلى سجل الطلبات ومعلومات
أساسية عن جهازك.</p>
<h2>كيف نستخدمها</h2>
<p>نستخدم بياناتك لمعالجة الطلبات وتنسيق التوصيل والدفع وتقديم الدعم ومنع
الاحتيال وتحسين الخدمة. يتلقى البائعون فقط المعلومات اللازمة لتنفيذ طلباتك.</p>
<h2>المشاركة</h2>
<p>نشارك البيانات مع البائعين الذين تشتري منهم ومع شركاء التوصيل والدفع بالقدر
اللازم لإتمام طلباتك. نحن لا نبيع بياناتك الشخصية.</p>
<h2>خياراتك</h2>
<p>يمكنك مراجعة ملفك وعناوينك وتحديثها في أي وقت وطلب حذف حسابك. قد يُحتفظ ببعض
السجلات عند الاقتضاء لأسباب قانونية أو محاسبية.</p>`,
    },
  },
  {
    slug: "returns",
    title: { en: "Return & Refund Policy", ar: "سياسة الإرجاع والاسترداد" },
    body: {
      en: `<p><em>Draft — pending legal review.</em></p>
<h2>Return window</h2>
<p>You may request a return within the return window shown on your order after
delivery, provided the item is unused, in its original condition, and in its
original packaging. Some items (such as perishables or personal-care goods) may
not be eligible.</p>
<h2>How to return</h2>
<p>Open the order in your account and choose “Request return”. The seller
reviews the request; if approved, you will receive return instructions. If the
seller does not respond within the response window, the request is
auto-approved.</p>
<h2>Refunds</h2>
<p>Once the returned item is received and checked, your refund is issued to your
original payment method or wallet balance. Prepaid orders are refunded from
escrow; cash-on-delivery refunds are settled to your wallet.</p>
<h2>Disputes</h2>
<p>If you and the seller cannot agree, open a dispute and our team will review
the evidence and decide fairly.</p>`,
      ar: `<p><em>مسودة — بانتظار المراجعة القانونية.</em></p>
<h2>مدة الإرجاع</h2>
<p>يمكنك طلب الإرجاع خلال مدة الإرجاع الموضّحة في طلبك بعد التسليم، شريطة أن يكون
المنتج غير مستخدم وبحالته الأصلية وفي عبوته الأصلية. قد لا تكون بعض المنتجات
(كالمواد القابلة للتلف أو منتجات العناية الشخصية) قابلة للإرجاع.</p>
<h2>كيفية الإرجاع</h2>
<p>افتح الطلب في حسابك واختر «طلب إرجاع». يراجع البائع الطلب؛ وعند الموافقة
ستصلك تعليمات الإرجاع. إذا لم يستجب البائع خلال مدة الرد، تُعتمد الموافقة
تلقائياً.</p>
<h2>الاسترداد</h2>
<p>بعد استلام المنتج المُرجَع وفحصه، يُصرف الاسترداد إلى طريقة الدفع الأصلية أو
رصيد المحفظة. تُسترد الطلبات المدفوعة مسبقاً من الضمان، بينما تُسوّى مبالغ الدفع
عند الاستلام إلى محفظتك.</p>
<h2>النزاعات</h2>
<p>إذا لم تتفق مع البائع، افتح نزاعاً وسيراجع فريقنا الأدلة ويتخذ قراراً عادلاً.</p>`,
    },
  },
  {
    slug: "faq",
    title: { en: "Frequently Asked Questions", ar: "الأسئلة الشائعة" },
    body: {
      en: `<h2>How do I pay?</h2>
<p>You can pay with cash on delivery, bank transfer, USDT, or your wallet
balance. For bank transfer and USDT you upload proof of payment, which an admin
verifies before the order is confirmed.</p>
<h2>When is my order confirmed?</h2>
<p>Cash-on-delivery orders are confirmed immediately. Prepaid orders are
confirmed once your payment proof is verified.</p>
<h2>How does delivery work?</h2>
<p>Sellers ship your order and update its status. You can track each order from
your account, and confirm receipt when it arrives.</p>
<h2>How do I become a seller?</h2>
<p>Open a store from your account. Approval is automatic, and you can publish
products right away — our team moderates listings after they go live.</p>`,
      ar: `<h2>كيف أدفع؟</h2>
<p>يمكنك الدفع عند الاستلام أو بالتحويل البنكي أو USDT أو رصيد محفظتك. في
التحويل البنكي وUSDT ترفع إثبات الدفع الذي يتحقق منه المشرف قبل تأكيد الطلب.</p>
<h2>متى يُؤكَّد طلبي؟</h2>
<p>تُؤكَّد طلبات الدفع عند الاستلام فوراً. أما الطلبات المدفوعة مسبقاً فتُؤكَّد بعد
التحقق من إثبات الدفع.</p>
<h2>كيف يعمل التوصيل؟</h2>
<p>يشحن البائعون طلبك ويحدّثون حالته. يمكنك تتبع كل طلب من حسابك وتأكيد الاستلام
عند وصوله.</p>
<h2>كيف أصبح بائعاً؟</h2>
<p>افتح متجراً من حسابك. الموافقة تلقائية، ويمكنك نشر المنتجات فوراً — يراجع
فريقنا القوائم بعد نشرها.</p>`,
    },
  },
  {
    slug: "contact",
    title: { en: "Contact Us", ar: "اتصل بنا" },
    body: {
      en: `<h2>Get in touch</h2>
<p>Have a question about an order, your store, or the platform? We're here to
help.</p>
<ul>
<li>Support email: <strong>support@hezalli.com</strong></li>
<li>For sellers: <strong>sellers@hezalli.com</strong></li>
</ul>
<p>You can also message a seller directly from any product or order page. For
order problems, opening a dispute from the order is the fastest way to reach
our team.</p>`,
      ar: `<h2>تواصل معنا</h2>
<p>لديك سؤال عن طلب أو متجرك أو المنصة؟ نحن هنا للمساعدة.</p>
<ul>
<li>بريد الدعم: <strong>support@hezalli.com</strong></li>
<li>للبائعين: <strong>sellers@hezalli.com</strong></li>
</ul>
<p>يمكنك أيضاً مراسلة البائع مباشرة من أي صفحة منتج أو طلب. لمشكلات الطلبات،
يُعدّ فتح نزاع من الطلب أسرع وسيلة للوصول إلى فريقنا.</p>`,
    },
  },
];
