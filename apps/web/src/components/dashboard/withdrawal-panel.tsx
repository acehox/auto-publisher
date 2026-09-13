'use client';

import { AlertCircle, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
 * - The labelled entry control stays on the page (st. 2); the statement may live in
 *   a dialog.
 * - One screen, one button, no draft stage — and nothing between the two: no
 *   survey, no retention offer, no discount.
 * - The confirm button carries the statutory words and nothing else: no icon, no
 *   spinner, no second verb.
 * - Labels are English by choice; no article prescribes a language. ⚠️ Do not extend
 *   that to the /refunds disclosure naming this control — čl. 60 st. 9 does bind it.
 * - The contract is shown in labelled fields so there is something to confirm; the
 *   consumer's name is never asked for again.
 */

/**
 * Exported so no caller invents its own rule. Nothing renders once the contract has
 * been withdrawn from: the durable medium is the email, not this page.
 */
export function shouldOfferWithdrawal(withdrawal: WithdrawalState | null): boolean {
  if (!withdrawal) return false;
  if (withdrawal.confirmedAt) return false;
  return withdrawal.eligible;
}

function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
}

/**
 * Deliberately weaker than the server's `z.email()` — it only gates the Art 11a(3)
 * "enable", so it must never reject an address the server would accept.
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
      <Card className="bg-slate-900/50 border-slate-800 p-6">
        <h3 className="text-white text-lg mb-1">Right of withdrawal</h3>
        <p className="text-slate-400 text-sm">
          You can withdraw from this contract within 14 days of it being concluded, without giving a
          reason. Any payment you have made is refunded in full.{' '}
          {withdrawal.windowEndsAt && (
            <>
              Your period ends on{' '}
              <span className="text-slate-300">{formatInstant(withdrawal.windowEndsAt)}</span>.
            </>
          )}
        </p>
        <Button
          className="mt-5 bg-slate-800 text-slate-100 hover:bg-slate-700"
          onClick={() => setOpen(true)}
        >
          Withdraw from contract
        </Button>
      </Card>

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
                <DialogDescription>No reason needed, and no questions asked.</DialogDescription>
              </DialogHeader>

              {/* Art 11a(2)(b) — shown so the consumer confirms something they saw. */}
              <dl className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                <dt className="text-slate-400">Server</dt>
                <dd className="text-slate-200">{withdrawal.contractDisplay.server}</dd>
                <dt className="text-slate-400 pt-2">Plan</dt>
                <dd className="text-slate-200">{withdrawal.contractDisplay.plan}</dd>
              </dl>

              {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* st. 3 t. 3 — the only element the consumer supplies. */}
              <div className="space-y-2">
                <Label htmlFor="withdrawal-address" className="text-slate-300">
                  Email address for your confirmation
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
                <p className="text-slate-500 text-sm">
                  We send your confirmation of receipt here, and nowhere else. It is not added to
                  any mailing list.
                </p>
              </div>

              {/* čl. 84 — full refund, and 14 days is the statutory outer limit. Conditional
                  because the window sits inside the free trial, where nothing has been
                  charged: "the full amount you paid" is $0 there, true but reading as a
                  promise of money. The no-deduction statement is the part the statute cares
                  about and it stays either way. */}
              <p className="text-slate-400 text-sm">
                Any payment you have made comes back in full, with nothing deducted for the time you
                have used the service. Paddle, our merchant of record, refunds it to the payment
                method you used, within 14 days.
              </p>

              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <p className="text-sm text-red-300">
                  This action is irreversible. Your Premium subscription ends immediately and a
                  withdrawal cannot be reversed — you can subscribe again at any time.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* No icon, no spinner: Art 11a(3) allows the label and nothing to
                    compete with it. `looksComplete` is the 11a(3) "enable". */}
                <Button
                  className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                  onClick={handleConfirm}
                  disabled={busy || !looksComplete(address.trim())}
                >
                  Confirm withdrawal
                </Button>
                <button
                  type="button"
                  className="text-slate-500 text-sm hover:text-slate-400"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
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
 * Shown once, in the dialog. Reports what actually happened rather than a blanket
 * success — a refund queued for manual review has moved no money, and an unsent
 * acknowledgement is an outstanding statutory duty.
 */
function WithdrawalReceipt({ result }: { result: WithdrawalResult }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>You have withdrawn from this contract</DialogTitle>
        <DialogDescription>Submitted {formatInstant(result.submittedAt)}</DialogDescription>
      </DialogHeader>

      <div className="space-y-2 text-sm">
        <p className={result.acknowledged ? 'text-slate-300' : 'text-amber-300'}>
          {result.acknowledged
            ? `Your confirmation of receipt has been sent to ${result.notificationAddress}. Keep it — it is your record.`
            : `We could not send your confirmation to ${result.notificationAddress} yet. We are retrying, and it does not affect your withdrawal.`}
        </p>
        <p className="text-slate-300">{refundSentence(result.refundStatus)}</p>
        <p className="text-slate-400">
          The bot stays in this server. It returns to the free plan, so channels beyond the free
          limit and channels using publishing rules are paused — they are kept exactly as configured
          and resume if you subscribe again. Nothing is deleted.
        </p>
      </div>
    </>
  );
}

/**
 * Paddle's `approved` means the money is moving; anything else does not. `'none'` is the
 * trial case and carries no Paddle sentence — naming the merchant of record and the payment
 * method reads as "money is coming back" when nothing was ever charged.
 */
function refundSentence(status: string | null): string {
  const paidBy =
    ' Refunds are issued by Paddle, the merchant of record, to the payment method you used.';
  if (status === 'none') {
    return 'No payment was taken during your free trial, so there is nothing to refund.';
  }
  if (status === 'approved') return `Your refund has been issued.${paidBy}`;
  if (status === 'pending_approval') {
    return `Your refund has been raised and is being processed.${paidBy}`;
  }
  if (status === null) return `We are arranging your refund.${paidBy}`;
  return `Your refund has been raised.${paidBy}`;
}
