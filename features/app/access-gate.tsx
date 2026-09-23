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
          <DialogTitle>Verify before you continue</DialogTitle>
          <DialogDescription>Phone and identity verification are required to ask the landlord about this home. It keeps every conversation safe and relevant.</DialogDescription>
        </DialogHeader>
        <p><Check size={14} /> Ask Property AI and landlords <Check size={14} /> Apply and pay securely</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={() => { onOpenChange(false); go("kyc"); }}>Verify now <ArrowRight size={14} /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
