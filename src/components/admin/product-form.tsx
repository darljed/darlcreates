"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { centavosToPesos } from "@/lib/money";
import {
  createProductAction,
  updateProductAction,
} from "@/app/(admin)/admin/products/actions";

export type ProductFormValues = {
  id?: string;
  name: string;
  description: string;
  category: string;
  basePriceCents: number;
  status: "draft" | "published" | "archived";
  stlKey: string | null;
};

export function ProductForm({ initial }: { initial?: ProductFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "general",
    basePrice: initial ? String(centavosToPesos(initial.basePriceCents)) : "",
    status: initial?.status ?? "draft",
    stlKey: initial?.stlKey ?? "",
  });

  function submit() {
    startTransition(async () => {
      const payload = { ...v, stlKey: v.stlKey || undefined };
      const res = initial?.id
        ? await updateProductAction({ ...payload, id: initial.id })
        : await createProductAction(payload);
      if (res.ok) {
        toast.success(initial?.id ? "Product saved" : "Product created");
        if (!initial?.id && "id" in res && res.id) {
          router.push(`/admin/products/${res.id}`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.error ?? "Save failed");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={4}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="basePrice">Base price (₱)</Label>
          <Input
            id="basePrice"
            inputMode="decimal"
            placeholder="180"
            value={v.basePrice}
            onChange={(e) => setV({ ...v, basePrice: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={v.status}
            onValueChange={(status) =>
              setV({ ...v, status: status as typeof v.status })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="stlKey">STL file key (S3)</Label>
        <Input
          id="stlKey"
          placeholder="stl/xxxx-model.stl"
          value={v.stlKey}
          onChange={(e) => setV({ ...v, stlKey: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          The print-ready STL shown in the 3D viewer. Direct upload arrives with
          S3; for now paste the object key.
        </p>
      </div>
      <Button
        onClick={submit}
        disabled={pending}
        className="bg-primary text-primary-foreground"
      >
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {initial?.id ? "Save changes" : "Create product"}
      </Button>
    </div>
  );
}
