'use client';

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext, type AuthValue } from './auth';
import { DEFAULT_COSTING_SETTINGS } from './costing';
import { browserClient } from './supabase-browser';
import { AppDataContext, type ActionResult, type AppDataValue } from './store';
import type { AppState } from './engine';
import type { Merchant, User } from './types';

interface Scoped {
  state: AppState;
  merchants: Merchant[];
}

const EMPTY: AppState = {
  items: [],
  products: [],
  orders: [],
  receipts: [],
  reversals: [],
  remittances: [],
  packageSales: [],
  users: [],
  outbox: [],
  costing: { settings: { ...DEFAULT_COSTING_SETTINGS }, rows: [], log: [], programMerchantIds: [] },
  poSeq: 0,
};

const POLL_MS = 20_000;
const OFFLINE = 'Could not reach the server. Check your connection and try again.';

/** Live mode: real sign-in, and every read and change goes through the server. */
export function RemoteProviders({ children }: { children: ReactNode }) {
  // Read the link hash before the sign-in client consumes it: invitations and resets carry type=invite / recovery.
  const [invitedLink] = useState(() => typeof window !== 'undefined' && /type=(invite|recovery)/.test(window.location.hash));
  const supabase = useMemo(() => browserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [needPassword, setNeedPassword] = useState(invitedLink);
  const [me, setMe] = useState<User | null>(null);
  const [data, setData] = useState<Scoped | null>(null);
  const [accountProblem, setAccountProblem] = useState<string | null>(null);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data: result }) => {
      if (!alive) return;
      sessionRef.current = result.session;
      setSession(result.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      sessionRef.current = next;
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setNeedPassword(true);
      if (event === 'SIGNED_OUT') {
        setMe(null);
        setData(null);
        setAccountProblem(null);
        setServerProblem(null);
        setLoaded(false);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const token = session?.access_token ?? null;

  const load = useCallback(async () => {
    try {
      if (token) {
        const response = await fetch('/api/state', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await response.json().catch(() => null);
        if (json?.ok) {
          setMe(json.me);
          setData(json.data);
          setAccountProblem(null);
          setServerProblem(null);
        } else if (response.status === 403) {
          setMe(null);
          setServerProblem(null);
          setAccountProblem(json?.error ?? 'This sign-in has no account in the app yet.');
        } else {
          setAccountProblem(null);
          setServerProblem(json?.error ?? 'The server did not answer. Check your connection and try again.');
        }
      } else {
        const response = await fetch('/api/public/catalog', { cache: 'no-store' });
        const json = await response.json().catch(() => null);
        if (json?.ok) setData(json.data);
      }
    } catch {
      // Offline: keep what is on screen and try again at the next poll.
      if (token) setServerProblem((current) => current ?? OFFLINE);
    }
    setLoaded(true);
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready, load]);

  // Once someone is in with their own password (not on an invitation link that still waits for one), tell the server, so the admin stops seeing "send invitation again" for them.
  const joinedSent = useRef(false);

  const call = useCallback(
    async <T,>(action: string, args: Record<string, unknown>): Promise<ActionResult<T>> => {
      try {
        const fresh = (await supabase.auth.getSession()).data.session ?? sessionRef.current;
        const response = await fetch('/api/act', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(fresh ? { authorization: `Bearer ${fresh.access_token}` } : {}) },
          body: JSON.stringify({ action, args }),
        });
        const json = await response.json().catch(() => null);
        if (!json?.ok) return { ok: false, error: json?.error ?? OFFLINE };
        if (json.data) {
          setData(json.data);
          if (json.me) setMe(json.me);
        }
        return { ok: true, value: json.value as T, ...(Array.isArray(json.warnings) && json.warnings.length > 0 ? { warnings: json.warnings as string[] } : {}) };
      } catch {
        return { ok: false, error: OFFLINE };
      }
    },
    [supabase],
  );

  const state = data?.state ?? EMPTY;

  useEffect(() => {
    if (!me || !session || needPassword || joinedSent.current) return;
    joinedSent.current = true;
    void call('finishSetup', {});
  }, [me, session, needPassword, call]);

  const dataValue = useMemo<AppDataValue>(() => {
    return {
      merchants: data?.merchants ?? [],
      users: state.users,
      items: state.items,
      products: state.products ?? [],
      orders: state.orders,
      receipts: state.receipts,
      reversals: state.reversals,
      remittances: state.remittances,
      packageSales: state.packageSales,
      outbox: state.outbox,
      costing: state.costing,
      hydrated: loaded,
      remote: true,
      team: {
        addMerchant: (input) => call('addMerchant', { ...input }),
        updateMerchant: (input) => call('updateMerchant', { ...input }),
        deleteMerchant: (id) => call('deleteMerchant', { id }),
        addUser: (input) => call('addUser', input),
        resendInvite: (userId) => call('resendInvite', { userId }),
        deleteUser: (userId) => call('deleteUser', { userId }),
        inviteLink: (userId) => call('inviteLink', { userId }),
      },
      resetDemo: () => undefined,
      applyForReseller: (input) => call('applyForReseller', { input }),
      changeCredentials: async () => ({ ok: false, error: 'Change your password from the sign-in screen.' }),
      placeOrder: (_a, input) => call('placeOrder', { input }),
      placeResellerOrder: (_a, input) => call('placeResellerOrder', { input }),
      checkoutWalkIn: (_a, input) => call('checkoutWalkIn', { input }),
      markPacked: (_a, orderId) => call('markPacked', { orderId }),
      shipOrder: (_a, orderId, waybill) => call('shipOrder', { orderId, waybill }),
      markDelivered: (_a, orderId, paymentMethod) => call('markDelivered', { orderId, paymentMethod }),
      markRts: (_a, orderId, reason) => call('markRts', { orderId, reason }),
      cancelOrder: (_a, orderId, reason) => call('cancelOrder', { orderId, reason }),
      receiveStock: (_a, input) => call('receiveStock', { input }),
      receiveReturn: (_a, input) => call('receiveReturn', { input }),
      approveReceipt: (_a, receiptId) => call('approveReceipt', { receiptId }),
      rejectReceipt: (_a, receiptId, reason) => call('rejectReceipt', { receiptId, reason }),
      setPickupPrices: (_a, changes) => call('setPickupPrices', { changes }),
      setCostingSettings: (_a, patch) => call('setCostingSettings', { patch }),
      removeCostingRow: (_a, rowId) => call('removeCostingRow', { rowId }),
      requestReversal: (_a, orderId, note) => call('requestReversal', { orderId, note }),
      approveReversal: (_a, requestId) => call('approveReversal', { requestId }),
      rejectReversal: (_a, requestId, reason) => call('rejectReversal', { requestId, reason }),
      closeWeek: (_a, weekStart) => call('closeWeek', { weekStart }),
      approveRelease: (_a, remittanceId) => call('approveRelease', { remittanceId }),
      rejectRelease: (_a, remittanceId, reason) => call('rejectRelease', { remittanceId, reason }),
      submitRelease: (_a, remittanceId, input) => call('submitRelease', { remittanceId, input }),
      approveCostingRow: (_a, rowId) => call('approveCostingRow', { rowId }),
      revokeApproval: (_a, rowId) => call('revokeApproval', { rowId }),
      goLiveCostingRow: (_a, rowId) => call('goLiveCostingRow', { rowId }),
      setSkuDisabled: (_a, itemId, disabled) => call('setSkuDisabled', { itemId, disabled }),
      setProgramMerchant: (_a, merchantId, on) => call('setProgramMerchant', { merchantId, on }),
      setSkuReseller: (_a, itemId, inProgram) => call('setSkuReseller', { itemId, inProgram }),
      addSku: (_a, input) => call('addSku', { input }),
      setSkuSrp: (_a, itemId, srp) => call('setSkuSrp', { itemId, srp }),
      addProduct: (_a, input) => call('addProduct', { input }),
      updateProduct: (_a, id, patch) => call('updateProduct', { id, patch }),
      deleteProduct: (_a, id) => call('deleteProduct', { id }),
      importProducts: (_a, merchantId, rows) => call('importProducts', { merchantId, rows }),
      importSkus: (_a, rows, defaultCategory) => call('importSkus', { rows, defaultCategory }),
      setSkuPackage: (_a, itemId, on) => call('setSkuPackage', { itemId, on }),
      setSkuCategory: (_a, itemIds, category) => call('setSkuCategory', { itemIds, category }),
    };
  }, [data, state, loaded, call]);

  const authValue = useMemo<AuthValue>(
    () => ({
      user: me,
      users: [],
      ready: ready && (loaded || !session),
      remote: true,
      signedInEmail: session?.user.email ?? null,
      accountProblem,
      serverProblem,
      retry: () => void load(),
      needPassword: needPassword && !!session,
      login: () => undefined,
      loginWithPassword: () => false,
      logout: () => {
        void supabase.auth.signOut();
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (!error) return null;
        if (/api key|apikey|jwt/i.test(error.message)) return 'The app cannot reach its sign-in service: check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.';
        if (/not confirmed/i.test(error.message)) return 'This email is not confirmed yet. In Supabase, open the user and confirm it.';
        return /invalid/i.test(error.message) ? 'Wrong email or password.' : error.message;
      },
      sendReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
        return error ? error.message : null;
      },
      setNewPassword: async (password) => {
        if (password.length < 8) return 'Use at least 8 characters.';
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return error.message;
        setNeedPassword(false);
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch {
          // Ignore.
        }
        return null;
      },
    }),
    [me, ready, loaded, session, accountProblem, serverProblem, needPassword, supabase, load],
  );

  return (
    <AppDataContext.Provider value={dataValue}>
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    </AppDataContext.Provider>
  );
}
