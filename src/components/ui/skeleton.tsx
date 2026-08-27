import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200",
        className
      )}
    />
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}

export function OrderTableRowSkeleton() {
  return (
    <tr className="border-b border-slate-100">
      <td className="p-3"><Skeleton className="size-4 rounded" /></td>
      <td className="p-3"><Skeleton className="h-4 w-16" /></td>
      <td className="p-3"><Skeleton className="h-4 w-28" /></td>
      <td className="p-3"><Skeleton className="h-4 w-20" /></td>
      <td className="p-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
      <td className="p-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
      <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
      <td className="p-3"><Skeleton className="h-8 w-20 rounded-lg" /></td>
    </tr>
  );
}

export function OrderListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2 md:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}
