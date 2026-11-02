'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { BRAND } from '@/lib/brand';
import { isSellable } from '@/lib/costing';
import { formatCurrency, formatHkd } from '@/lib/format';
import { availableAt, reservedByItem } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import { BRANCHES, DEFAULT_BRANCH, type BranchId, type Order } from '@/lib/types';

const STEPS = [
  { title: 'Choose your package', text: 'Pick the starter package that fits you and tell us who you are.' },
  { title: 'Pay and pick up', text: 'Visit the branch you chose. Our cashier confirms your payment and hands you your package.' },
  { title: 'Sign in and start saving', text: 'We email your sign-in details right after. Set your own password and order with your reseller discount.' },
];

/** Public page: no sign-in. Someone who wants to become a reseller picks a package and leaves their details. */
export function BecomeReseller() {
  const { items, costing, orders, applyForReseller } = useAppData();
  const { resellerDiscountPct, tierL1Pct, tierL2Pct, tierL3Pct } = costing.settings;
  const packages = useMemo(() => items.filter((item) => item.package && isSellable(item, costing)), [items, costing]);

  const [itemId, setItemId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [refCode, setRefCode] = useState('');
  const [branch, setBranch] = useState<BranchId>(DEFAULT_BRANCH);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Order | null>(null);

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) setRefCode(ref.toUpperCase());
    } catch {
      // No query string: leave it empty.
    }
  }, []);
  const chosen = itemId || packages[0]?.id || '';
  const chosenItem = packages.find((item) => item.id === chosen);
  const left = (id: BranchId) => (chosenItem ? availableAt(chosenItem, reservedByItem(orders, id), id) : 0);

  useEffect(() => {
    if (!chosenItem) return;
    if (left(branch) > 0) return;
    const alternative = BRANCHES.find((option) => left(option.id) > 0);
    if (alternative) setBranch(alternative.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, orders, items]);

  const benefits = [
    { icon: 'check' as const, title: `${resellerDiscountPct}% off, every time`, text: 'Your discount applies to every reseller product you order after you join.' },
    { icon: 'wallet' as const, title: 'Earn when your team buys', text: `Share your code. You earn ${tierL1Pct}% on your direct referrals, ${tierL2Pct}% one level down and ${tierL3Pct}% on the third level.` },
    { icon: 'box' as const, title: 'A starter package with products', text: 'Your first package comes with products you can use or sell right away.' },
    { icon: 'pos' as const, title: 'Pick up at your branch', text: 'Choose SDSI Sheung Wan or Central. Pay at the counter when you collect.' },
    { icon: 'dashboard' as const, title: 'Your own dashboard', text: 'Track your orders and your tier income in one place.' },
    { icon: 'user' as const, title: 'Your own referral link', text: 'Every reseller gets a personal code and link to invite people under them.' },
  ];

  function submit() {
    const result = applyForReseller({ name, email, mobile, refCode, branch, itemId: chosen });
    if (!result.ok) return setError(result.error);
    setError(null);
    setDone(result.value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-300 to-teal-400 text-emerald-950">
              <Icon name="cart" className="h-4 w-4" />
            </span>
            {BRAND.name}
          </span>
          <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <section className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-300">Reseller program</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Want to become a reseller and enjoy a discount?
          </h1>
          <p className="mt-4 max-w-xl text-lg text-emerald-100/90">
            Join with a starter package, save {resellerDiscountPct}% on every reseller product, and earn when the people you bring in buy too.
          </p>
          <a href="#apply" className="mt-8 inline-flex rounded-xl bg-emerald-400 px-6 py-3 text-base font-semibold text-emerald-950 shadow hover:bg-emerald-300">
            Click here to get started
          </a>
        </div>
      </section>

      {done ? (
        <section className="mx-auto max-w-3xl px-4 py-12">
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <div className="flex items-center gap-3">
              <Icon name="check" className="h-6 w-6 text-emerald-600" />
              <h2 className="text-xl font-semibold text-emerald-950">You are all set, {done.customerName?.split(' ')[0]}!</h2>
            </div>
            <p className="mt-3 text-emerald-900">
              Your package is reserved as <span className="font-mono font-semibold">{done.id}</span>. Pay{' '}
              <span className="font-semibold">{formatHkd(done.amountHkd ?? 0)}</span> at{' '}
              <span className="font-semibold">{BRANCHES.find((candidate) => candidate.id === done.branch)?.name}</span> when you pick it up.
            </p>
            <p className="mt-1 text-sm text-emerald-900">{BRANCHES.find((candidate) => candidate.id === done.branch)?.address}</p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-emerald-900">
              <li>Show this reference to the cashier and pay.</li>
              <li>Once the cashier confirms, we email your temporary username and password to {done.applicant?.email}.</li>
              <li>Sign in, choose your own username and password, and start ordering with your discount.</li>
            </ol>
          </div>
        </section>
      ) : (
        <>
          <section className="mx-auto max-w-5xl px-4 py-12">
            <h2 className="text-2xl font-semibold tracking-tight">Why become a reseller</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Icon name={benefit.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 font-semibold">{benefit.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{benefit.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-50">
            <div className="mx-auto max-w-5xl px-4 py-12">
              <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
              <ol className="mt-6 grid gap-4 sm:grid-cols-3">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="rounded-2xl bg-white p-5 shadow-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-emerald-950">{index + 1}</span>
                    <h3 className="mt-3 font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="apply" className="mx-auto max-w-3xl scroll-mt-6 px-4 py-12">
            <h2 className="text-2xl font-semibold tracking-tight">Start your reseller journey</h2>
            <p className="mt-1 text-sm text-slate-600">Pickup only. You pay at the counter when you collect your package.</p>

            <form
              className="mt-6 space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">1. Choose your package</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {packages.map((item) => {
                    const selected = chosen === item.id;
                    return (
                      <label
                        key={item.id}
                        className={`cursor-pointer rounded-2xl border p-4 ${selected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300'}`}
                      >
                        <input type="radio" name="package" value={item.id} checked={selected} onChange={() => setItemId(item.id)} className="sr-only" />
                        <span className="block font-semibold">{item.name}</span>
                        <span className="mt-1 block text-2xl font-semibold text-emerald-700">{formatHkd(item.package!.priceHkd)}</span>
                        <span className="mt-2 block text-sm text-slate-600">Includes {item.package!.inclusions}</span>
                        <span className="mt-1 block text-xs text-slate-500">Worth {formatCurrency(item.unitPrice)} at suggested retail</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <p className="text-sm font-medium text-slate-700">2. Your details</p>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="applyName">
                    <input id="applyName" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={inputClass(false)} />
                  </Field>
                  <Field label="Email (your sign-in details are sent here)" htmlFor="applyEmail">
                    <input id="applyEmail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass(false)} />
                  </Field>
                  <Field label="Mobile number" htmlFor="applyMobile">
                    <input id="applyMobile" type="tel" autoComplete="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} className={inputClass(false)} />
                  </Field>
                  <Field label="Referral code (if someone invited you)" htmlFor="applyRef">
                    <input id="applyRef" value={refCode} onChange={(event) => setRefCode(event.target.value.toUpperCase())} className={inputClass(false)} placeholder="Optional" />
                  </Field>
                </div>
              </div>

              <fieldset>
                <legend className="text-sm font-medium text-slate-700">3. Where will you pick it up?</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {BRANCHES.map((option) => {
                    const none = left(option.id) <= 0;
                    return (
                      <label
                        key={option.id}
                        className={`rounded-2xl border p-4 ${none ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70' : 'cursor-pointer'} ${!none && branch === option.id ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : !none ? 'border-slate-200 hover:border-emerald-300' : ''}`}
                      >
                        <input type="radio" name="branch" value={option.id} checked={branch === option.id} disabled={none} onChange={() => setBranch(option.id)} className="sr-only" />
                        <span className="block font-semibold">{option.name}</span>
                        <span className="mt-1 block text-sm text-slate-600">{option.address}</span>
                        <span className={`mt-2 block text-xs font-medium ${none ? 'text-rose-600' : 'text-emerald-800'}`}>
                          {none ? 'No stocks left on this branch. Please pick the other branch.' : 'Package in stock'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {error ? (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={packages.length === 0}
                className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-emerald-950 shadow hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
              >
                Reserve my package
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
