'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Landmark, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type RentalCheckout, formatNaira } from '@/lib/pricing';

export function PaymentBreakdown({
  checkout,
  onViewEscrow,
}: {
  checkout: RentalCheckout;
  onViewEscrow: () => void;
}) {
  const isAgentManaged = checkout.listingSource === 'agent';

  return (
    <motion.aside
      layout
      className="rounded-2xl border border-emerald-100 bg-[#f4faf5] p-5 shadow-[0_16px_40px_rgba(20,63,55,0.07)]"
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Checkout summary
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-[#163f37]">
            What the tenant pays
          </h3>
        </div>
        {isAgentManaged && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            <UserRound size={13} /> Agent listed
          </span>
        )}
      </div>

      <div className="space-y-3 text-sm text-[#51675e]">
        <PaymentLine
          label="Annual rent"
          value={formatNaira(checkout.annualRent)}
        />
        <PaymentLine
          label="SingleRent platform fee"
          rate="5%"
          value={formatNaira(checkout.platformFee)}
        />
        <AnimatePresence initial={false}>
          {isAgentManaged && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              className="overflow-hidden"
            >
              <PaymentLine
                label="Agent fee"
                rate="5%"
                value={formatNaira(checkout.agentFee)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {checkout.cautionFee > 0 && (
          <PaymentLine
            label="Refundable caution fee"
            value={formatNaira(checkout.cautionFee)}
          />
        )}
      </div>

      <div className="mt-5 flex items-end justify-between border-t border-emerald-200 pt-4">
        <span className="text-sm font-semibold text-[#3d5d51]">
          Total due today
        </span>
        <strong className="text-2xl font-extrabold tracking-tight text-[#163f37]">
          {formatNaira(checkout.total)}
        </strong>
      </div>

      <div className="mt-5 rounded-xl border border-emerald-100 bg-white p-3 text-sm leading-5 text-[#526b61]">
        <div className="flex gap-2">
          <Landmark className="mt-0.5 shrink-0 text-emerald-700" size={17} />
          <p>
            <b className="text-[#1f5545]">Where each amount goes:</b> the
            landlord receives the full listed rent; SingleRent receives the 5%
            platform fee; the agent receives 5% only when the listing is
            agent-posted. The caution fee remains protected in escrow.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#557267]">
        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={15} />
        <span>
          Every amount is shown before payment. No fee is deducted from the
          landlord&apos;s listed rent.
        </span>
      </div>
      <Button className="mt-5 w-full" onClick={onViewEscrow}>
        View escrow terms <ArrowRight size={15} />
      </Button>
    </motion.aside>
  );
}

function PaymentLine({
  label,
  value,
  rate,
}: {
  label: string;
  value: string;
  rate?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2">
        {label}
        {rate && (
          <em className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold not-italic text-amber-800">
            {rate}
          </em>
        )}
      </span>
      <b className="shrink-0 font-semibold text-[#294c40]">{value}</b>
    </div>
  );
}
