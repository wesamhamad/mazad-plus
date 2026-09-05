import { useCallback, useEffect, useRef, useState } from "react";

import { api, subscribeToAuction } from "../api";
import {
  Alert, AUCTION_STATUS, Button, Card, Countdown, Field, Icon, icons, Loading,
  num, Progress, readinessColor, readinessTone, sar, Tag,
} from "../components/ui";
import PhotoGallery from "../components/PhotoGallery";

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "الآن";
  if (seconds < 3600) return `قبل ${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `قبل ${Math.round(seconds / 3600)} ساعة`;
  return `قبل ${Math.round(seconds / 86400)} يوم`;
}

export default function AuctionDetail({ code, go, user, refreshBadges }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [bids, setBids] = useState([]);
  const [freshId, setFreshId] = useState(null);
  const [amount, setAmount] = useState("");
  const [bidError, setBidError] = useState("");
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const currentPriceRef = useRef(0);

  const load = useCallback(
    () =>
      api.auction(code)
        .then((d) => {
          setData(d);
          setBids(d.auction.bids || []);
          currentPriceRef.current = d.auction.currentPrice;
        })
        .catch((e) => setError(e.message)),
    [code]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live bids arrive over Server-Sent Events; the list updates without a poll.
  useEffect(() => {
    if (!data || data.auction.status !== "live") return undefined;
    return subscribeToAuction(code, {
      onBid: (payload) => {
        if (payload.auction !== code) return;
        setBids((prev) => [payload.bid, ...prev].slice(0, 25));
        setFreshId(payload.bid.id);
        currentPriceRef.current = payload.currentPrice;
        setData((d) =>
          d ? { ...d, auction: { ...d.auction, currentPrice: payload.currentPrice } } : d
        );
      },
      onClosed: (payload) => {
        if (payload.auction === code) load();
      },
    });
  }, [code, data?.auction.status, load]);

  if (error) return <Alert tone="error" title="تعذّر تحميل المزاد">{error}</Alert>;
  if (!data) return <Loading />;

  const { auction, recommendation, alerts, settings } = data;
  const p = auction.property;
  const status = AUCTION_STATUS[auction.status] || AUCTION_STATUS.draft;
  const threshold = settings.readiness_threshold ?? 70;
  const blocked = p.readinessScore < threshold;
  const minNext =
    (auction.currentPrice || auction.openingPrice || 0) *
      (1 + (settings.min_increment_pct ?? 1) / 100);

  async function submitBid(event) {
    event.preventDefault();
    setBidError("");
    setBusy(true);
    try {
      await api.placeBid(code, Number(amount));
      setAmount("");
      setFlash({ tone: "success", text: "سُجّلت مزايدتك" });
      await load();
    } catch (err) {
      if (err.code === "deposit_required") {
        setBidError(err.message);
      } else {
        setBidError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function issueClosing() {
    setBusy(true);
    try {
      const res = await api.issueClosing(code);
      go("report", res.report.code);
    } catch (err) {
      setFlash({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function acceptDeposit() {
    setBusy(true);
    try {
      await api.acceptDeposit(code);
      setFlash({ tone: "success", text: "سُجّل إقرارك بشروط العربون في سجل التدقيق" });
      setBidError("");
    } catch (err) {
      setBidError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="breadcrumb">
        <button onClick={() => go("auctions")}>المزادات</button>
        <span>/</span>
        <span className="tnum">{auction.code}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="row row--wrap" style={{ gap: "var(--dga-space-md)" }}>
            <h1>{p.title}</h1>
            <Tag tone={status.tone} dot={auction.status === "live"}>
              {status.label}
            </Tag>
          </div>
          <p className="pagehead__sub">
            {p.city} · {p.assetType} · مرجع الأصل{" "}
            <button
              onClick={() => go("property", p.ref)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--dga-color-primary)", fontWeight: 600 }}
            >
              {p.ref}
            </button>
            {auction.platform && auction.platform !== "—" && ` · تُدار عبر منصة ${auction.platform}`}
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
          {auction.status === "closed" && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={issueClosing}>
              <Icon path={icons.seal} size={14} />
              تقرير الإقفال
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => go("auctions")}>
            <Icon path={icons.back} size={14} />
            رجوع
          </Button>
        </div>
      </div>

      {blocked && (
        <Alert
          tone="error"
          title={`محجوب عن الطرح — درجة الجاهزية ${p.readinessScore}/100 دون الحد (${threshold})`}
        >
          الحجب آلي على مستوى البيانات، ورفعه قرار بشري: أكمل المستندات الناقصة من{" "}
          <button
            onClick={() => go("property", p.ref)}
            style={{ background: "none", border: "none", padding: 0, color: "inherit", textDecoration: "underline", fontWeight: 700 }}
          >
            بطاقة الأصل
          </button>{" "}
          ثم أعد الاحتساب.
        </Alert>
      )}

      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      <div className="grid grid--split">
        <div className="stack">
          {/* ------------------------------------------------ live bidding */}
          {auction.status === "live" ? (
            <Card>
              <div className="card__head">
                <h3 className="row" style={{ gap: "var(--dga-space-md)" }}>
                  <span className="livedot" />
                  المزايدة الحية
                </h3>
                <span className="stat__label">بث لحظي عبر SSE</span>
              </div>

              <div className="card__body stack stack--sm">
                <div className="row row--between row--wrap">
                  <div>
                    <div className="stat__label">أعلى مزايدة</div>
                    <div className="auction__price">{sar(auction.currentPrice)}</div>
                  </div>
                  <Countdown endsAt={auction.endsAt} />
                </div>

                <form onSubmit={submitBid}>
                  <Field
                    label="مزايدتك"
                    htmlFor="bid-amount"
                    error={bidError}
                    hint={`الحد الأدنى للمزايدة التالية ${num(minNext)} ر.س`}
                  >
                    <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                      <input
                        id="bid-amount"
                        className={`input tnum${bidError ? " input--error" : ""}`}
                        inputMode="numeric"
                        placeholder={num(Math.ceil(minNext / 1000) * 1000)}
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value.replace(/\D/g, ""));
                          setBidError("");
                        }}
                      />
                      <Button type="submit" disabled={!amount || busy}>
                        زايد
                      </Button>
                    </div>
                  </Field>
                </form>

                {bidError.includes("العربون") && (
                  <Alert tone="warning" title="إقرار العربون مطلوب قبل أول مزايدة">
                    مبلغ العربون {sar(auction.depositAmount)} — وهو{" "}
                    {settings.deposit_cap_pct}% من القيمة التقديرية. يسقط العربون عند التراجع بعد
                    الترسية، ولا تُفرض أي رسوم تأخير على الثمن.
                    <div style={{ marginTop: "var(--dga-space-lg)" }}>
                      <Button size="sm" onClick={acceptDeposit} disabled={busy}>
                        أقر بشروط العربون
                      </Button>
                    </div>
                  </Alert>
                )}
              </div>

              <div className="bidlist">
                {bids.map((b, i) => (
                  <div
                    key={b.id}
                    className={`bidrow${b.id === freshId && i === 0 ? " bidrow--fresh" : ""}`}
                  >
                    <div className="bidrow__who">
                      <span className="bidrow__avatar">{b.alias.slice(-2)}</span>
                      <div>
                        <div style={{ fontWeight: "var(--dga-font-weight-medium)" }}>
                          مزايد {b.alias}
                        </div>
                        <div className="bidrow__time">{timeAgo(b.createdAt)}</div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                      {i === 0 && <Tag tone="success">الأعلى</Tag>}
                      <span className="bidrow__amount">{sar(b.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card__foot">
                <p className="note">
                  هوية المزايدين مستعارة في كل واجهة عرض. المعرّفات الحقيقية تبقى خلف الواجهة
                  البرمجية، والتحليل السلوكي يعمل على معرّفات مستعارة — تقليلاً للبيانات وفق نظام
                  حماية البيانات الشخصية.
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="card__head">
                <h3>سجل المزايدات</h3>
                <Tag tone="neutral">{auction.bidCount} مزايدة</Tag>
              </div>
              {bids.length === 0 ? (
                <div className="empty">لم تبدأ المزايدة على هذا الأصل بعد</div>
              ) : (
                <div className="bidlist">
                  {bids.map((b, i) => (
                    <div key={b.id} className="bidrow">
                      <div className="bidrow__who">
                        <span className="bidrow__avatar">{b.alias.slice(-2)}</span>
                        <div>
                          <div style={{ fontWeight: "var(--dga-font-weight-medium)" }}>
                            مزايد {b.alias}
                          </div>
                          <div className="bidrow__time">{timeAgo(b.createdAt)}</div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                        {i === 0 && auction.status === "closed" && <Tag tone="primary">الترسية</Tag>}
                        <span className="bidrow__amount">{sar(b.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {alerts.length > 0 && (
            <Card>
              <div className="card__head">
                <h3>تنبيهات النزاهة على هذا المزاد</h3>
                <Button variant="ghost" size="sm" onClick={() => go("fraud")}>
                  إدارة التنبيهات
                </Button>
              </div>
              <div>
                {alerts.map((a) => (
                  <div key={a.code} className="bidrow" style={{ alignItems: "flex-start" }}>
                    <div>
                      <div className="row" style={{ gap: "var(--dga-space-md)" }}>
                        <Tag tone={a.severity === "عالٍ" ? "error" : "warning"} dot>
                          {a.severity}
                        </Tag>
                        <b>{a.title}</b>
                      </div>
                      <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }} className="bidrow__time">
                        {a.signals.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <Tag tone="neutral">{a.state}</Tag>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* -------------------------------------------------- side column */}
        <div className="stack">
          <Card>
            <div className="card__body">
              <PhotoGallery property={p} canEdit={user.role === "agent" || user.role === "compliance"}
                onChange={(photos) => setData((d) => ({ ...d, auction: { ...d.auction, property: { ...d.auction.property, photos } } }))} />
            </div>
          </Card>
          <Card>
            <div className="card__head">
              <h3>بطاقة الأصل</h3>
              <Tag tone={readinessTone(p.readinessScore)}>{p.readinessScore} / 100</Tag>
            </div>
            <div className="card__body stack stack--sm">
              <Progress value={p.readinessScore} color={readinessColor(p.readinessScore)} />
              <dl className="kv">
                <dt>المدينة</dt>
                <dd>{p.city}</dd>
                {p.areaSqm && (
                  <>
                    <dt>المساحة</dt>
                    <dd className="tnum">{num(p.areaSqm)} م²</dd>
                  </>
                )}
                <dt>الحالة الفنية</dt>
                <dd>{p.conditionNote || "—"}</dd>
                <dt>آخر معاينة</dt>
                <dd className="tnum">{p.lastInspection || "—"}</dd>
                <dt>القيمة التقديرية</dt>
                <dd className="tnum">{sar(p.estimatedValue)}</dd>
                <dt>العربون</dt>
                <dd className="tnum">{sar(auction.depositAmount)}</dd>
              </dl>
              <Button variant="secondary" size="sm" onClick={() => go("property", p.ref)}>
                فتح بطاقة الأصل الكاملة
              </Button>
            </div>
          </Card>

          <Card>
            <div className="card__head">
              <h3>توصية سعر الافتتاح</h3>
              <span className="aichip">ذكاء اصطناعي</span>
            </div>
            <div className="card__body stack stack--sm">
              {!recommendation ? (
                <Alert tone="warning">
                  لا يمكن توليد توصية سعر قبل اكتمال المستندات الإلزامية — التسعير على أصل ناقص
                  المستندات مسؤولية لا ميزة.
                </Alert>
              ) : (
                <>
                  <div>
                    {/* The decided range governs, not a freshly recomputed one:
                        once an appraiser has overridden the suggestion, the
                        stored value is the price this auction actually runs on. */}
                    <div className="stat__label">
                      {p.price.status === "overridden" ? "النطاق المعتمد بعد التعديل" : "النطاق الموصى به"}
                    </div>
                    <div className="auction__price">
                      {num(p.price.low ?? recommendation.low)} – {num(p.price.high ?? recommendation.high)}
                    </div>
                    <div className="auction__code">ريال سعودي</div>
                    {p.price.status === "overridden" && (
                      <div className="auction__code">
                        اقتراح النظام كان {num(recommendation.low)} – {num(recommendation.high)}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="row row--between" style={{ marginBottom: 6 }}>
                      <span className="stat__label">احتمالية الترسية في الجولة الأولى</span>
                      <span className="tnum" style={{ fontWeight: 600 }}>
                        {recommendation.hammerProbability}%
                      </span>
                    </div>
                    <Progress
                      value={recommendation.hammerProbability}
                      color="var(--dga-color-info-500)"
                    />
                  </div>

                  {p.price.reason && (
                    <Alert tone="warning" title="سبب التعديل المسجّل">{p.price.reason}</Alert>
                  )}

                  <div>
                    <div className="stat__label" style={{ marginBottom: "var(--dga-space-md)" }}>
                      المقارنات
                    </div>
                    <div className="stack" style={{ gap: "var(--dga-space-md)" }}>
                      {recommendation.comparables.map((c) => (
                        <div key={c.label} className="comparable">
                          <span>{c.label}</span>
                          <span className="comparable__value">{num(c.price)} ر.س</span>
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

                  <Alert tone="info">
                    مساعِد قرار لا متخذ قرار — لا يُعتمد سعر افتتاح دون موافقة بشرية مسجّلة.
                    {p.price.status === "approved" && " (اعتُمدت هذه التوصية)"}
                    {p.price.status === "overridden" && " (عُدّلت هذه التوصية)"}
                  </Alert>
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className="card__head">
              <h3>الشروط النظامية</h3>
            </div>
            <div className="card__body stack stack--sm">
              <dl className="kv">
                <dt>مدة الإعلان</dt>
                <dd className="tnum">{settings.notice_days} أيام (حد أدنى)</dd>
                <dt>مهلة السداد بعد الترسية</dt>
                <dd className="tnum">{settings.payment_days} أيام</dd>
                <dt>الحد الأدنى للزيادة</dt>
                <dd className="tnum">{settings.min_increment_pct}%</dd>
                <dt>سقف العربون</dt>
                <dd className="tnum">{settings.deposit_cap_pct}%</dd>
              </dl>
              <Alert tone="warning" title="لا توجد رسوم تأخير في هذا النظام">
                أثر النكول يتحقق بثلاثة مسارات فقط: مصادرة العربون المتفق عليه مسبقاً، وإلغاء
                الترسية، والحظر المؤقت أو الدائم. أي زيادة على دين نقدي مستحق مقابل الإمهال ربا —
                ولا حقل لها في قاعدة البيانات أصلاً.
              </Alert>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
