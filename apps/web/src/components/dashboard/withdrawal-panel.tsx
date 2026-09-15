'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { withdrawFromContract } from '@/lib/api/actions';
import type { WithdrawalResult, WithdrawalState } from '@/lib/api/types';

/**
 * The statutory withdrawal function — ZZP čl. 81.a / CRD Art 11a. Rules a
 * well-meaning UX change would break (reasoning in .claude/CLAUDE.md):
 *
 * - The labelled entry control stays on the page (st. 2); the statement may live
 *   in a dialog.
 * - One screen, one button, no draft stage — and nothing between the two: no
 *   survey, no retention offer, no discount.
 * - The confirm button carries the statutory words and nothing else: no icon, no
 *   spinner, no second verb.
 * - Labels are English by choice; no article prescribes a language. ⚠️ Do not
 *   extend that to the /refunds disclosure naming this control — čl. 60 st. 9
 *   does bind it.
 * - The contract is shown in labelled fields so there is something to confirm;
 *   the consumer's name is never asked for again.
 */

/**
 * Exported so no caller invents its own rule. Nothing renders once the contract
 * has been withdrawn from: the durable medium is the email, not this page.
 */
export function shouldOfferWithdrawal(withdrawal: WithdrawalState | null): boolean {
  if (!withdrawal) return false;
  if (withdrawal.confirmedAt) return false;
  return withdrawal.eligible;
}

function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Deliberately weaker than the server's `z.email()` — it only gates the Art
 * 11a(3) "enable", so it must never reject an address the server would accept.
 */
function looksComplete(address: string): boolean {
  const at = address.indexOf('@');
  return at > 0 && at < address.length - 1;
}

export function WithdrawalPanel({
  guildId,
  withdrawal,
}: {
  guildId: string;
  withdrawal: WithdrawalState;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WithdrawalResult | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    const outcome = await withdrawFromContract(guildId, address.trim());
    setBusy(false);
    if (!outcome.ok) {
      setError(errorMessage(outcome.code));
      return;
    }
    setResult(outcome.result);
  };

  return (
    <>
      {/* st. 2 attaches "istaknuta … lako uočljiv" and "tijekom trajanja roka" to
          this control, so it is a plain block on the page for the whole period —
          never behind a menu, and never a dialog on its own. */}
      <section className="space-y-2.5 rounded-xl border border-slate-700/70 p-4">
        {/* At the contrast floor already: 12px needs 4.5:1 on slate-950 for the
            st. 2 "lako uočljiv", and slate-500 is 4.2:1. Do not darken. */}
        <h2 className="text-sm font-semibold text-slate-300">Right of withdrawal</h2>
        <p className="text-xs leading-relaxed text-slate-400/80">
          You can withdraw from this contract
          {withdrawal.windowEndsAt && (
            <>
              {' '}
              until <span className="text-slate-400">{formatInstant(withdrawal.windowEndsAt)}</span>
            </>
          )}{' '}
          and get a full refund, no reason needed.
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Withdraw from contract
        </Button>
      </section>

      <Dialog
        open={open}
        onOpenChange={next => {
          // Never dismiss mid-request, and reload on leaving the outcome view —
          // the subscription has just been cancelled, so the page behind is stale.
          if (!next && !busy) {
            setOpen(false);
            if (result) window.location.reload();
          }
        }}
      >
        <DialogContent className="max-w-md">
          {result ? (
            <WithdrawalReceipt result={result} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Withdraw from contract</DialogTitle>
                {withdrawal.windowEndsAt && (
                  <DialogDescription>
                    You are within the 14-day withdrawal period that ends{' '}
                    {formatInstant(withdrawal.windowEndsAt)}.
                  </DialogDescription>
                )}
              </DialogHeader>

              {/* Art 11a(2)(b) lets the consumer "provide or confirm" the
                  contract — confirming something never shown is not confirming. */}
              <dl className="overflow-hidden rounded-lg border border-slate-800 text-sm">
                <div className="flex gap-2.5 border-slate-800/70 border-b px-3 py-2.5">
                  <dt className="w-18 shrink-0 text-[11px] uppercase tracking-wider text-slate-400">
                    Server
                  </dt>
                  <dd className="text-slate-200">{withdrawal.contractDisplay.server}</dd>
                </div>
                <div className="flex gap-2.5 px-3 py-2.5">
                  <dt className="w-18 shrink-0 text-[11px] uppercase tracking-wider text-slate-400">
                    Plan
                  </dt>
                  <dd className="text-slate-200">{withdrawal.contractDisplay.plan}</dd>
                </div>
              </dl>

              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
                  {error}
                </p>
              )}

              {/* st. 3 t. 3 — the only element the consumer supplies. */}
              <div className="space-y-1.5">
                <Label htmlFor="withdrawal-address" className="text-xs text-slate-400">
                  Email for the confirmation
                </Label>
                <Input
                  id="withdrawal-address"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={address}
                  onChange={event => setAddress(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5 text-xs leading-relaxed">
                {/* čl. 84 — full refund, nothing deducted. */}
                <p className="text-slate-300">You are refunded in full. Nothing is deducted.</p>
                <p className="text-red-300">
                  This cannot be undone. Premium ends immediately and any channels over the Free
                  limit pause — their setup is kept.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                {/* No icon, no spinner: Art 11a(3) allows the label and nothing
                    to compete with it. `looksComplete` is the 11a(3) "enable". */}
                <Button onClick={handleConfirm} disabled={busy || !looksComplete(address.trim())}>
                  Confirm withdrawal
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The window closing mid-dialog and a double-confirm are both real, and differ. */
function errorMessage(code: string | undefined): string {
  if (code === 'WITHDRAWAL_WINDOW_CLOSED') return 'The 14-day withdrawal period has ended.';
  if (code === 'ALREADY_WITHDRAWN') {
    return 'This contract has already been withdrawn from. Check your email for the confirmation.';
  }
  return 'Could not record your withdrawal. Please try again, or email support.';
}

/**
 * Shown once, in the dialog. Reports what actually happened rather than a
 * blanket success — a refund queued for manual review has moved no money, and an
 * unsent acknowledgement is an outstanding statutory duty. The control then
 * disappears permanently.
 */
function WithdrawalReceipt({ result }: { result: WithdrawalResult }) {
  const rows: { key: string; value: string; tone?: string }[] = [
    { key: 'Submitted', value: formatInstant(result.submittedAt) },
    {
      key: 'Confirmation',
      value: result.acknowledged
        ? `Sent to ${result.notificationAddress}`
        : `Not sent to ${result.notificationAddress} yet — we are retrying. Your withdrawal stands.`,
      tone: result.acknowledged ? undefined : 'text-amber-300',
    },
    { key: 'Refund', value: refundSentence(result.refundStatus) },
    {
      key: 'Channels',
      value:
        'The bot stays in this server on the Free plan. Channels over the free limit and channels using rules are paused, kept exactly as configured, and resume if you subscribe again.',
    },
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Withdrawal confirmed</DialogTitle>
      </DialogHeader>
      <dl className="overflow-hidden rounded-lg border border-slate-800">
        {rows.map(row => (
          <div
            key={row.key}
            className="flex gap-2.5 border-slate-800/70 border-b px-3 py-2.5 last:border-b-0"
          >
            <dt className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-slate-400">
              {row.key}
            </dt>
            <dd className={`flex-1 text-xs leading-relaxed ${row.tone ?? 'text-slate-200'}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * Paddle's `approved` means the money is moving; anything else does not.
 * `'none'` is the trial case and carries no Paddle sentence — naming the
 * merchant of record reads as "money is coming back" when nothing was charged.
 */
function refundSentence(status: string | null): string {
  const paidBy = ' Issued by Paddle, the merchant of record, to the payment method you used.';
  if (status === 'none') {
    return 'No payment was taken during your free trial, so there is nothing to refund.';
  }
  if (status === 'approved') return `Refunded in full.${paidBy}`;
  if (status === 'pending_approval') return `Raised and being processed.${paidBy}`;
  if (status === null) return `We are arranging your refund.${paidBy}`;
  return `Raised.${paidBy}`;
}
