"use client";

import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { View } from "@/lib/routes";

export function AccessGate({ open, onOpenChange, go }: { open: boolean; onOpenChange: (open: boolean) => void; go: (view: View) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gate">
        <DialogHeader>
          <i><ShieldCheck size={22} /></i>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>Sign in to ask questions, contact a landlord, save homes, or apply. NIN verification is only requested when you make your first rent payment or withdraw a payout.</DialogDescription>
        </DialogHeader>
        <p><Check size={14} /> No KYC for property questions or messages <Check size={14} /> KYC is only needed for payment or payout</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={() => { onOpenChange(false); go("sign-in"); }}>Sign in <ArrowRight size={14} /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
