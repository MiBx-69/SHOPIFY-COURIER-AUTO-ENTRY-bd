import React from "react";
import { Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type LineItem = {
  id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  product_snapshot?: {
    variant?: {
      image?: {
        url?: string;
        altText?: string;
      } | null;
    } | null;
  } | null;
};

export function ProductPreview({ 
  items, 
  maxVisible = 1,
  className
}: { 
  items: LineItem[];
  maxVisible?: number;
  className?: string;
}) {
  if (!items || items.length === 0) return null;

  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {visibleItems.map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 min-w-0">
          {/* Thumbnail */}
          <div className="relative w-8 h-8 rounded border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
            {item.product_snapshot?.variant?.image?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.product_snapshot.variant.image.url}
                alt={item.product_snapshot.variant.image.altText || item.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="text-slate-300" size={14} />
            )}
            
            {/* Quantity Badge */}
            {item.quantity > 1 && (
              <div className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[9px] font-bold px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full shadow-sm z-10">
                {item.quantity}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col min-w-0 pt-0.5">
            <span className="text-[13px] font-medium text-slate-900 truncate leading-tight" title={item.title}>
              {item.title}
            </span>
            {item.variant_title && item.variant_title !== "Default Title" && (
              <span className="text-[11px] text-slate-500 truncate leading-tight mt-0.5" title={item.variant_title}>
                {item.variant_title}
              </span>
            )}
          </div>
        </div>
      ))}

      {hiddenCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button 
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 self-start bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors border border-transparent cursor-pointer"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              + {hiddenCount} more {hiddenCount === 1 ? 'item' : 'items'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
              <h4 className="text-[13px] font-semibold text-slate-900">All Items</h4>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-2 flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2.5 p-1.5 rounded-md hover:bg-slate-50">
                  <div className="relative w-9 h-9 rounded border border-slate-200 bg-white flex items-center justify-center shrink-0 overflow-hidden">
                    {item.product_snapshot?.variant?.image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.product_snapshot.variant.image.url}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="text-slate-300" size={14} />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1 justify-center">
                    <span className="text-[13px] font-medium text-slate-900 leading-tight">
                      {item.quantity}x {item.title}
                    </span>
                    {item.variant_title && item.variant_title !== "Default Title" && (
                      <span className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                        {item.variant_title} {item.sku ? ` • ${item.sku}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
