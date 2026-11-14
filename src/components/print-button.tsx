"use client";

/**
 * Button that opens the browser print dialog (hidden when printing).
 */

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="mr-2 size-4" /> Print / Save as PDF
    </Button>
  );
}
