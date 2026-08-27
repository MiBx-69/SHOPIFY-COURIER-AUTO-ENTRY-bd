"use client";

import React, { useEffect, useState } from "react";
import { Package, X } from "lucide-react";
import { cn } from "@/lib/utils";

type LineItem = {
  id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  unit_price_minor?: number;
  total_price_minor?: number;
  product_snapshot?: {
    variant?: {
      image?: {
        url?: string;
        altText?: string;
      } | null;
    } | null;
  } | null;
};

function formatPrice(minor?: number) {
  if (minor == null || Number.isNaN(Number(minor))) return null;
  return `BDT ${new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100)}`;
}

function ItemImage({ item, size = "sm" }: { item: LineItem; size?: "sm" | "lg" }) {
  const dimension = size === "lg" ? "h-14 w-14" : "h-10 w-10";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50",
        dimension,
      )}
    >
      {item.product_snapshot?.variant?.image?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.product_snapshot.variant.image.url}
          alt={item.product_snapshot.variant.image.altText || item.title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Package className="text-slate-300" size={size === "lg" ? 20 : 15} />
        </div>
      )}
    </div>
  );
}

export function ProductPreview({
  items,
  maxVisible = 1,
  className,
}: {
  items: LineItem[];
  maxVisible?: number;
  className?: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  if (!items || items.length === 0) return null;

  const visibleItems = items.slice(0, Math.max(1, maxVisible));
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <>
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        {visibleItems.map((item) => {
          const price = formatPrice(item.total_price_minor ?? item.unit_price_minor);

          return (
            <div key={item.id} className="flex min-w-0 items-start gap-2.5">
              <ItemImage item={item} />

              <div className="min-w-0 flex-1 pt-0.5">
                <div
                  className="line-clamp-2 text-[13px] font-semibold leading-[1.25] text-slate-900"
                  title={item.title}
                >
                  {item.title}
                </div>

                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-slate-500">
                  {item.variant_title && item.variant_title !== "Default Title" && (
                    <span className="max-w-[180px] truncate" title={item.variant_title}>
                      {item.variant_title}
                    </span>
                  )}
                  <span className="font-medium text-slate-600">Qty {item.quantity || 1}</span>
                  {price && <span className="font-semibold text-slate-700">{price}</span>}
                </div>
              </div>
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            className="self-start rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDrawerOpen(true);
            }}
            aria-label={`View all ${items.length} items`}
          >
            + {hiddenCount} more {hiddenCount === 1 ? "item" : "items"}
          </button>
        )}
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-[100]"
          role="dialog"
          aria-modal="true"
          aria-label="Order items"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />

          <aside
            className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Order items
                </p>
                <h3 className="mt-0.5 text-base font-bold text-slate-900">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Close order items"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {items.map((item) => {
                  const price = formatPrice(item.total_price_minor ?? item.unit_price_minor);

                  return (
                    <div
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50/70"
                    >
                      <ItemImage item={item} size="lg" />

                      <div className="min-w-0 flex-1 py-0.5">
                        <div className="text-sm font-semibold leading-snug text-slate-900">
                          {item.title}
                        </div>

                        {item.variant_title && item.variant_title !== "Default Title" && (
                          <div className="mt-1 text-xs text-slate-500">
                            Variant: {item.variant_title}
                          </div>
                        )}

                        {item.sku && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            SKU: {item.sku}
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="font-semibold text-slate-700">
                            Qty {item.quantity || 1}
                          </span>
                          {price && <span className="font-semibold text-slate-900">{price}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
              Product, variant and quantity information is taken from the synchronized Shopify order data.
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
