import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import {
  Alert, Button, Card, Field, Icon, icons, Loading, num, Progress,
  readinessColor, readinessTone, sar, Tag,
} from "../components/ui";
import PhotoGallery from "../components/PhotoGallery";

/**
 * بطاقة الأصل — the asset card, and the human-in-the-loop gate on pricing.
 *
 * Two things happen here that the rest of the platform depends on: an agent
 * completes the documents until the readiness score clears the threshold, and
 * an appraiser either approves the AI's opening-price range or overrides it
 * with a recorded reason. Neither is automatic, and both are audited.
 */
export default function PropertyDetail({ refCode, go, user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");

  const load = useCallback(
    () => api.property(refCode).then(setData).catch((e) => setError(e.message)),
    [refCode]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert tone="error" title="تعذّر تحميل الأصل">{error}</Alert>;
  if (!data) return <Loading />;

  const { property: p, recommendation, threshold, auctionCode } = data;
  const blocked = p.readinessScore < threshold;
  const isAgent = user.role === "agent" || user.role === "compliance";
  const isAppraiser = user.role === "appraiser";

  async function toggleDoc(doc) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await api.toggleDocument(p.ref, doc.id);
      setData((d) => ({ ...d, property: res.property, recommendation: res.recommendation }));
      setFlash({
        tone: res.property.readinessScore >= threshold ? "success" : "warning",
        text: `تم تحديث «${doc.label}» — درجة الجاهزية الآن ${res.property.readinessScore}/100`,
      });
    } catch (e) {
      setFlash({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision) {
    setBusy(true);
    setFlash(null);
    try {
      await api.priceDecision(p.ref, {
        decision,
        reason: decision === "override" ? reason : undefined,
        low: decision === "override" && low ? Number(low) : undefined,
        high: decision === "override" && high ? Number(high) : undefined,
      });
      setShowOverride(false);
      setReason("");
      setLow("");
      setHigh("");
      await load();
      setFlash({
        tone: decision === "approve" ? "success" : "warning",
        text:
          decision === "approve"
            ? "اعتُمدت التوصية وسُجّلت في سجل التدقيق"
            : "سُجّل التعديل مع السبب في سجل التدقيق",
      });
    } catch (e) {
      setFlash({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const priceStatusTag = {
    approved: <Tag tone="success">معتمدة</Tag>,
    overridden: <Tag tone="warning">معدّلة بشرياً</Tag>,
    pending: <Tag tone="info">بانتظار المُقيّم</Tag>,
    unavailable: <Tag tone="neutral">غير متاحة</Tag>,
  }[p.price.status];

  return (
    <div className="stack">
      <div className="breadcrumb">
        <button onClick={() => go("properties")}>العقارات والأصول</button>
        <span>/</span>
        <span className="tnum">{p.ref}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
            <h1>{p.title}</h1>
            <Tag tone={readinessTone(p.readinessScore)}>{p.readinessScore} / 100</Tag>
          </div>
          <p className="pagehead__sub">
            {p.city}
            {p.district && p.district !== "—" && ` · ${p.district}`} · {p.assetType}
            {p.deedNumber && ` · صك ${p.deedNumber}`}
          </p>
        </div>
        <div className="row" style={{ gap: "var(--dga-space-md)" }}>
          <Button size="sm" onClick={() => go("disclosure", p.ref)}>
            <Icon path={icons.shield} size={14} />
            كشف الأصل
          </Button>
          <Button size="sm" variant="secondary" onClick={() => go("compare", p.ref)}>
            <Icon path={icons.grid} size={14} />
            المتشابهات
          </Button>
          {auctionCode && (
            <Button variant="secondary" size="sm" onClick={() => go("auction", auctionCode)}>
              فتح المزاد
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => go("properties")}>
            <Icon path={icons.back} size={14} />
            رجوع
          </Button>
        </div>
      </div>

      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      {blocked && (
        <Alert tone="error" title={`محجوب عن الطرح — الحد المطلوب ${threshold} نقطة`}>
          أكمل البنود الناقصة أدناه. كل بند مذكور صراحةً مع وزنه في الدرجة، فلا حجب بلا سبب معلن.
        </Alert>
      )}

      <div className="grid grid--split">
        <div className="stack">
          <Card>
            <div className="card__head">
              <h3>صور الأصل</h3>
              <Tag tone="neutral"><span className="tnum">{(p.photos || []).length}</span> صورة</Tag>
            </div>
            <div className="card__body">
              <PhotoGallery property={p} canEdit={isAgent}
                onChange={(photos) => setData((d) => ({ ...d, property: { ...d.property, photos } }))} />
            </div>
          </Card>
          <Card>
            <div className="card__head">
              <h3>بطاقة الأصل الموحّدة</h3>
              <span className="aichip">مولّدة آلياً من مستندات المعاينة</span>
            </div>
            <div className="card__body stack stack--sm">
              <Progress value={p.readinessScore} color={readinessColor(p.readinessScore)} />
              <dl className="kv">
                <dt>نوع الأصل</dt>
                <dd>{p.assetType}</dd>
                <dt>المدينة / الحي</dt>
                <dd>
                  {p.city}
                  {p.district && p.district !== "—" ? ` · ${p.district}` : ""}
                </dd>
                {p.areaSqm && (
                  <>
                    <dt>المساحة</dt>
                    <dd className="tnum">{num(p.areaSqm)} م²</dd>
                  </>
                )}
                <dt>الحالة الفنية</dt>
                <dd>{p.conditionNote || <span style={{ color: "var(--dga-color-error-600)" }}>غير مسجّلة</span>}</dd>
                <dt>آخر معاينة</dt>
                <dd className="tnum">{p.lastInspection || <span style={{ color: "var(--dga-color-error-600)" }}>—</span>}</dd>
                <dt>القيمة التقديرية</dt>
                <dd className="tnum">{sar(p.estimatedValue)}</dd>
              </dl>
            </div>
          </Card>

          <Card>
            <div className="card__head">
              <h3>المستندات</h3>
              {isAgent && <span className="stat__label">اضغط على أي بند لتبديل حالته</span>}
            </div>
            <div className="card__body">
              {p.documents.map((doc) => (
                <div className="docrow" key={doc.id}>
                  <span className="docrow__name">
                    <span
                      className="docrow__dot"
                      style={{
                        background: doc.present
                          ? "var(--dga-color-success-500)"
                          : doc.required
                          ? "var(--dga-color-error-500)"
                          : "var(--dga-color-gray-400)",
                      }}
                    />
                    {doc.label}
                    {!doc.required && <Tag tone="neutral">اختياري</Tag>}
                  </span>
                  <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                    <Tag tone={doc.present ? "success" : doc.required ? "error" : "neutral"}>
                      {doc.present ? "مكتمل" : "ناقص"}
                    </Tag>
                    {isAgent && (
                      <Button
                        size="sm"
                        variant={doc.present ? "secondary" : "primary"}
                        disabled={busy}
                        onClick={() => toggleDoc(doc)}
                      >
                        {doc.present ? "إزالة" : "رفع"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {p.readinessFlags.length > 0 && (
            <Card>
              <div className="card__head">
                <h3>أسباب خصم الدرجة</h3>
                <Tag tone="warning">{p.readinessFlags.length} بنود</Tag>
              </div>
              <div className="card__body">
                {p.readinessFlags.map((f) => (
                  <div className="docrow" key={f.field + f.message}>
                    <span>{f.message}</span>
                    <Tag tone="neutral">−{f.weight} نقطة</Tag>
                  </div>
                ))}
              </div>
              <div className="card__foot">
                <p className="note">
                  كل نقطة مخصومة مرتبطة بحقل مُسمّى. نموذج لا يستطيع أن يقول لماذا حجب أصلاً لا
                  يصلح لحجب إدراج قضائي.
                </p>
              </div>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card>
            <div className="card__head">
              <h3>توصية سعر الافتتاح</h3>
              <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                <span className="aichip">ذكاء اصطناعي</span>
                {priceStatusTag}
              </div>
            </div>
            <div className="card__body stack stack--sm">
              {!recommendation ? (
                <Alert tone="warning" title="التسعير متوقّف">
                  لا تُولَّد توصية سعر قبل اكتمال المستندات الإلزامية. سعرٌ مبنيٌّ على صك ملكية
                  مفقود مسؤولية، لا ميزة.
                </Alert>
              ) : (
                <>
                  <div>
                    <div className="stat__label">النطاق الموصى به</div>
                    <div className="auction__price">
                      {num(p.price.low)} – {num(p.price.high)}
                    </div>
                    <div className="auction__code">ريال سعودي</div>
                  </div>

                  <div>
                    <div className="row row--between" style={{ marginBottom: 6 }}>
                      <span className="stat__label">احتمالية الترسية في الجولة الأولى</span>
                      <span className="tnum" style={{ fontWeight: 600 }}>
                        {p.price.hammerProbability}%
                      </span>
                    </div>
                    <Progress value={p.price.hammerProbability} color="var(--dga-color-info-500)" />
                  </div>

                  <div>
                    <div className="stat__label" style={{ marginBottom: "var(--dga-space-md)" }}>
                      المقارنات المستخدمة
                    </div>
                    <div className="stack" style={{ gap: "var(--dga-space-md)" }}>
                      {recommendation.comparables.map((c) => (
                        <div key={c.label} className="comparable">
                          <span>{c.label}</span>
                          <span className="comparable__value">
                            {num(c.price)} ر.س{c.basis ? ` · ${c.basis}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="stat__label" style={{ marginBottom: "var(--dga-space-md)" }}>
                      كيف بُنيت التوصية
                    </div>
                    <div className="stack" style={{ gap: "var(--dga-space-md)" }}>
                      {recommendation.factors.map((f) => (
                        <div key={f.label} className="comparable">
                          <span>{f.label}</span>
                          <span style={{ color: "var(--text-tertiary)" }}>{f.effect}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {p.price.reason && (
                    <Alert tone="warning" title="سبب التعديل المسجّل">{p.price.reason}</Alert>
                  )}

                  {isAppraiser ? (
                    <>
                      <Alert tone="info">
                        القرار قرارك: التوصية لا تصبح سعر افتتاح إلا باعتمادك أو تعديلك، ويُسجَّل
                        باسمك في سجل التدقيق.
                      </Alert>
                      <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                        <Button style={{ flex: 1 }} disabled={busy} onClick={() => decide("approve")}>
                          اعتماد التوصية
                        </Button>
                        <Button
                          style={{ flex: 1 }}
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setShowOverride((v) => !v)}
                        >
                          تعديل
                        </Button>
                      </div>

                      {showOverride && (
                        <div className="stack stack--sm">
                          <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                            <Field label="الحد الأدنى" htmlFor="ov-low">
                              <input
                                id="ov-low"
                                className="input tnum"
                                inputMode="numeric"
                                placeholder={num(p.price.low)}
                                value={low}
                                onChange={(e) => setLow(e.target.value.replace(/\D/g, ""))}
                              />
                            </Field>
                            <Field label="الحد الأعلى" htmlFor="ov-high">
                              <input
                                id="ov-high"
                                className="input tnum"
                                inputMode="numeric"
                                placeholder={num(p.price.high)}
                                value={high}
                                onChange={(e) => setHigh(e.target.value.replace(/\D/g, ""))}
                              />
                            </Field>
                          </div>
                          <Field
                            label="سبب التعديل"
                            htmlFor="ov-reason"
                            hint="إلزامي — لا يُقبل التعديل بدون سبب مسجّل"
                          >
                            <textarea
                              id="ov-reason"
                              className="input"
                              rows={3}
                              value={reason}
                              placeholder="مثال: مقارنة إضافية من خارج المنطقة تدعم رفع النطاق…"
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </Field>
                          <Button block disabled={!reason.trim() || busy} onClick={() => decide("override")}>
                            تسجيل التعديل
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Alert tone="info">
                      اعتماد التوصية أو تعديلها صلاحية المُقيّم المعتمد. ادخل بهوية{" "}
                      <span className="tnum">1098765432</span> لتجربة هذا المسار.
                    </Alert>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
